"use client";

import { useState } from "react";
import type { User } from "@/app/types/Service";

const categories = [
  "한식",
  "일식",
  "중식",
  "양식",
  "분식",
  "고기",
  "해산물",
  "카페",
  "채식"
];
const amountInput =
  "flex items-center gap-2 rounded-[.7rem] border border-line pr-[.8rem]";
const amountUnit = "text-[.7rem] font-normal whitespace-nowrap text-muted";

export function readProfileFields(form: HTMLFormElement) {
  const fields = new FormData(form);
  const min = fields.get("budget_min");
  const max = fields.get("budget_max");
  return {
    nickname: fields.get("nickname"),
    preferences: fields.getAll("preferences"),
    budget_min: min ? Number(min) : null,
    budget_max: max ? Number(max) : null
  };
}

export default function ProfileFields({
  user,
  admin = false
}: {
  user: User;
  admin?: boolean;
}) {
  const [preferences, setPreferences] = useState(user.preferences);
  return (
    <>
      <label>
        카카오계정 이메일
        <input className="field" type="text" readOnly value={user.email || "미제공"}/>
      </label>
      <label>
        계정 역할
        <input className="field" readOnly value={user.role}/>
      </label>
      <label>
        산책 닉네임
        <input
          className="field"
          name="nickname"
          required
          minLength={2}
          maxLength={20}
          pattern="[가-힣a-zA-Z0-9_]+"
          defaultValue={user.nickname}
        />
        <span className="helper">
          한글·영문·숫자·밑줄 2~20자 · 중복된 닉네임은 사용할 수 없어요.
        </span>
      </label>
      <fieldset>
        <legend>좋아하는 음식</legend>
        <div className="flex flex-wrap gap-2">
          {preferences.map((value) => (
            <input key={value} type="hidden" name="preferences" value={value}/>
          ))}
          {categories.map((category) => (
            <button
              type="button"
              aria-pressed={preferences.includes(category)}
              className={`
                min-h-[38px] rounded-full border border-line px-[.9rem] py-[.4rem]
                text-[.78rem]
                ${admin
                  ? `aria-pressed:border-forest aria-pressed:bg-forest-soft
                    aria-pressed:text-forest`
                  : `aria-pressed:border-[#dcb3a2] aria-pressed:bg-coral-soft
                    aria-pressed:text-[#a8583d]`}
              `}
              key={category}
              onClick={() =>
                setPreferences((current) =>
                  current.includes(category)
                    ? current.filter((item) => item !== category)
                    : [...current, category]
                )
              }>
              {category}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>
          편안한 가격대 <small>(1인 기준)</small>
        </legend>
        <div className="two-fields">
          <label>
            <span className="sr-only">최소 가격</span>
            <div className={amountInput}>
              <input
                className="field border-0 bg-transparent"
                name="budget_min"
                type="number"
                min={0}
                max={1000000}
                step={1000}
                defaultValue={user.budget_min ?? ""}
                placeholder="최소 금액"
              />
              <span className={amountUnit}>원부터</span>
            </div>
          </label>
          <label>
            <span className="sr-only">최대 가격</span>
            <div className={amountInput}>
              <input
                className="field border-0 bg-transparent"
                name="budget_max"
                type="number"
                min={1000}
                max={1000000}
                step={1000}
                defaultValue={user.budget_max ?? ""}
                placeholder="최대 금액"
              />
              <span className={amountUnit}>원까지</span>
            </div>
          </label>
        </div>
        <p className="helper">인원수가 정해지면 추천 기본 예산에 반영합니다.</p>
      </fieldset>
    </>
  );
}
