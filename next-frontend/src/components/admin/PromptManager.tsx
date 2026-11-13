"use client";

import { useState, type FormEvent } from "react";
import { LuHistory, LuRotateCcw, LuSave } from "react-icons/lu";
import { api, errorMessage, json } from "@/app/lib/api";
import { checkedTime } from "@/app/lib/format";
import useApiQuery from "@/app/lib/useApiQuery";
import type { PromptDetails, PromptName } from "@/app/types/Admin";
import Modal from "@/components/ui/Modal";
import { ErrorState, Loading } from "@/components/ui/States";
import { useToast } from "@/components/ui/ToastProvider";

const names = [
  { id: "conditions", label: "검색 조건 추출" },
  { id: "ranking", label: "음식점 추천" }
] as const;

function PromptEditor({
  prompt,
  reload
}: {
  prompt: PromptDetails;
  reload: () => void;
}) {
  const [content, setContent] = useState(prompt.content);
  const [selected, setSelected] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [restoreError, setRestoreError] = useState("");
  const path = "/api/admin/prompts/" + prompt.name;
  const version = useApiQuery<{ content: string }>(
    selected === null ? null : path + "/versions/" + selected
  );
  const toast = useToast();
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      await api(path, json("PUT", { content, expected_version: prompt.version }));
      toast("프롬프트를 저장했어요.");
      reload();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  };
  const restore = async () => {
    setPending(true);
    setRestoreError("");
    try {
      await api(
        path + "/restore",
        json("POST", { version: selected, expected_version: prompt.version })
      );
      toast("선택한 버전을 복원했어요.");
      reload();
    } catch (error) {
      setRestoreError(errorMessage(error));
    } finally {
      setPending(false);
    }
  };
  return (
    <div
      className="grid min-w-0 grid-cols-[minmax(0,1.7fr)_minmax(16rem,1fr)]
    items-start gap-5 tablet:grid-cols-1">
      <form className="surface min-w-0" onSubmit={save}>
        <div className="section-heading flex-wrap">
          <h2 className="section-title">{prompt.label}</h2>
          <span className="badge">적용 중 · v{prompt.version}</span>
        </div>
        <label>
          시스템 프롬프트
          <textarea
            className="field min-h-[20rem] font-mono text-sm leading-relaxed"
            rows={15}
            maxLength={12000}
            required
            value={content}
            disabled={pending}
            onChange={(event) => setContent(event.target.value)}
          />
        </label>
        <details className="mt-4 rounded-lg border border-line px-3 py-2 text-sm">
          <summary className="cursor-pointer text-forest">
            필수 변수와 JSON 응답 형식
          </summary>
          <p className="mt-2 text-muted">
            입력 변수 · {prompt.required_inputs.join(", ")}
          </p>
          <p className="mt-2 text-muted">
            응답 필드 · {prompt.required_outputs.join(", ")}
          </p>
          <pre className="mt-3 max-h-60 overflow-auto rounded-lg bg-cream p-3 text-xs">
            {JSON.stringify(prompt.response_schema, null, 2)}
          </pre>
        </details>
        {error && (
          <p className="inline-error mt-3" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions mt-4 flex-wrap">
          <button
            type="button"
            className="button button-secondary"
            disabled={pending}
            onClick={reload}>
            다시 불러오기
          </button>
          <button
            type="submit"
            className="button admin-primary"
            disabled={pending || content.trim() === prompt.content}>
            <LuSave/>
            {pending ? "저장 중…" : "프롬프트 저장"}
          </button>
        </div>
      </form>
      <section className="surface min-w-0">
        <h2 className="mb-3 flex items-center gap-2">
          <LuHistory className="text-forest"/>
          변경 이력
        </h2>
        <ol className="divide-y divide-line">
          {prompt.history.map((item) => (
            <li
              className="flex flex-wrap items-center justify-between gap-2 py-3"
              key={item.version}>
              <div>
                <p className="text-sm font-semibold">
                  v{item.version}
                  {item.restored_from !== null && (
                    <span className="ml-2 text-xs font-normal text-muted">
                      v{item.restored_from}에서 복원
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted">
                  {item.created_at
                    ? item.editor_name + " · " + checkedTime(item.created_at)
                    : "기본 프롬프트"}
                </p>
              </div>
              <button
                type="button"
                className="button button-secondary button-small"
                disabled={pending}
                onClick={() => {
                  setRestoreError("");
                  setSelected(item.version);
                }}>
                v{item.version} 보기
              </button>
            </li>
          ))}
        </ol>
      </section>
      {selected !== null && (
        <Modal
          title={prompt.label + " v" + selected}
          busy={pending}
          wide
          onClose={() => setSelected(null)}>
          {(close) => (
            <>
              {version.loading && <Loading/>}
              {version.error && (
                <ErrorState message={version.error} retry={version.reload}/>
              )}
              {version.data && (
                <pre
                  className="max-h-[55dvh] overflow-auto rounded-lg border
                border-line bg-cream p-4 font-mono text-sm leading-relaxed break-normal
                wrap-anywhere whitespace-pre-wrap">
                  {version.data.content}
                </pre>
              )}
              {restoreError && (
                <p className="inline-error mt-3" role="alert">
                  {restoreError}
                </p>
              )}
              {selected !== prompt.version && (
                <p className="mt-3 text-sm text-muted">
                  이 내용을 새 버전으로 저장해 다음 AI 탐색부터 적용합니다.
                </p>
              )}
              <div className="form-actions mt-4">
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={pending}
                  onClick={close}>
                  닫기
                </button>
                {selected !== prompt.version && (
                  <button
                    type="button"
                    className="button admin-primary"
                    disabled={pending || !version.data}
                    onClick={restore}>
                    <LuRotateCcw/>이 버전으로 복원
                  </button>
                )}
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

export default function PromptManager() {
  const [name, setName] = useState<PromptName>("conditions");
  const query = useApiQuery<PromptDetails>("/api/admin/prompts/" + name);
  return (
    <>
      <h1>AI 관리</h1>
      <p className="mt-1 text-sm text-muted">
        저장한 프롬프트는 다음 AI 탐색 요청부터 적용됩니다.
      </p>
      <div className="my-5 flex flex-wrap gap-2" aria-label="프롬프트 선택">
        {names.map(({ id, label }) => (
          <button
            type="button"
            key={id}
            className="button button-secondary button-small aria-pressed:bg-forest-soft
            aria-pressed:text-forest"
            aria-pressed={name === id}
            onClick={() => setName(id)}>
            {label}
          </button>
        ))}
      </div>
      {query.loading && <Loading text="프롬프트를 불러오고 있어요."/>}
      {query.error && <ErrorState message={query.error} retry={query.reload}/>}
      {query.data && (
        <PromptEditor
          key={query.data.name + "-" + query.data.version}
          prompt={query.data}
          reload={query.reload}
        />
      )}
    </>
  );
}
