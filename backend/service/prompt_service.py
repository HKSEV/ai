import re

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from config.gemini import CONDITION_PROMPT, RANKING_PROMPT
from dto.chat import RecommendationResult, SearchConditions
from entity.models import PromptRevision, utcnow
from service.admin_audit import record_admin_action
from service.common import timestamp


PROMPTS = {
  "conditions": ("검색 조건 추출", CONDITION_PROMPT.strip(), SearchConditions,
                 ("message", "history", "previous", "profile", "origin", "coordinates_provided", "now"),
                 ("new_search", "clear_fields", "area", "cuisine", "budget_total", "party_size", "visit_at",
                  "atmosphere", "purpose", "radius_metres", "clarification")),
  "ranking": ("음식점 추천", RANKING_PROMPT.strip(), RecommendationResult,
              ("candidates", "conditions", "reason_options", "display_category", "menus"),
              ("items", "restaurant_id", "evidence_keys", "reason", "explanation", "order", "name", "quantity", "estimated_total")),
}


def revisions(db, name):
  return select(PromptRevision).where(PromptRevision.name == name).order_by(PromptRevision.version.desc())


def active_prompts(db):
  return {name: current.content if (current := db.scalar(revisions(db, name).limit(1))) else definition[1]
          for name, definition in PROMPTS.items()}


def serialize_revision(revision):
  return {
    "version": revision.version, "editor_name": revision.editor_name, "restored_from": revision.restored_from,
    "created_at": timestamp(revision.created_at),
  }


def prompt_details(db, name):
  label, default, schema, inputs, outputs = PROMPTS[name]
  versions = db.scalars(revisions(db, name)).all()
  default_version = {"version": 1, "editor_name": None, "restored_from": None, "created_at": None}
  return {
    "name": name, "label": label, "content": versions[0].content if versions else default,
    "version": versions[0].version if versions else 1, "required_inputs": inputs, "required_outputs": outputs,
    "response_schema": schema.model_json_schema(),
    "history": [serialize_revision(item) for item in versions] + ([default_version] if not versions else []),
  }


def revision_content(db, name, version):
  revision = db.scalar(select(PromptRevision).where(PromptRevision.name == name, PromptRevision.version == version))
  if revision is None and version == 1:
    return PROMPTS[name][1]
  if revision is None:
    raise HTTPException(404, "프롬프트 버전을 찾을 수 없습니다.")
  return revision.content


def validate_prompt(name, content):
  _, _, _, inputs, outputs = PROMPTS[name]
  missing = [word for word in (*inputs, *outputs) if not re.search(rf"(?<![A-Za-z0-9_]){word}(?![A-Za-z0-9_])", content)]
  if missing:
    raise HTTPException(422, "필수 입력 변수와 응답 필드를 확인해 주세요. " + ", ".join(missing))
  if not re.search(r"\bJSON\s*(?:객체|object)", content, re.IGNORECASE):
    raise HTTPException(422, "응답을 JSON 객체로 반환하도록 지정해 주세요.")


def save_revision(db, admin, name, expected_version, *, content=None, restored_from=None):
  if restored_from is not None:
    content = revision_content(db, name, restored_from)
  validate_prompt(name, content)
  current = db.scalar(revisions(db, name).limit(1))
  version = current.version if current else 1
  if version != expected_version:
    raise HTTPException(409, "프롬프트가 변경되었습니다. 최신 버전을 다시 불러와 주세요.")
  if restored_from is None and content == (current.content if current else PROMPTS[name][1]):
    raise HTTPException(422, "변경된 내용이 없습니다.")
  if current is None:
    db.add(PromptRevision(name=name, version=1, content=PROMPTS[name][1]))
  next_version = version + 1
  db.add(PromptRevision(name=name, version=next_version, content=content,
                        editor_name=admin.nickname, restored_from=restored_from, created_at=utcnow()))
  record_admin_action(db, admin, "prompt_restore" if restored_from is not None else "prompt_update",
                      name, f"{PROMPTS[name][0]} v{next_version}")
  try:
    db.commit()
  except IntegrityError:
    db.rollback()
    raise HTTPException(409, "프롬프트가 변경되었습니다. 최신 버전을 다시 불러와 주세요.") from None
  return prompt_details(db, name)
