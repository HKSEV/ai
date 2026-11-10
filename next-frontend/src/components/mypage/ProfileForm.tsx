"use client";

import { useState, type FormEvent } from "react";
import { useDispatch } from "react-redux";
import { api, errorMessage, json } from "@/app/lib/api";
import type { User } from "@/app/types/Service";
import { setUser } from "@/store/authSlice";
import { useToast } from "@/components/ui/ToastProvider";

const categories = ["한식", "일식", "중식", "양식", "분식", "고기", "해산물", "카페", "채식"];

export default function ProfileForm({ user }: { user: User }) {
  const [nickname, setNickname] = useState(user.nickname);
  const [preferences, setPreferences] = useState(user.preferences);
  const [min, setMin] = useState(user.budget_min?.toString() || "");
  const [max, setMax] = useState(user.budget_max?.toString() || "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const dispatch = useDispatch();
  const toast = useToast();
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true); setError("");
    try {
      const response = await api<User>("/api/me", json("PUT", { nickname, preferences, budget_min: min ? Number(min) : null, budget_max: max ? Number(max) : null }));
      dispatch(setUser(response)); toast("취향과 닉네임을 저장했어요.");
    } catch (error) { setError(errorMessage(error)); }
    finally { setPending(false); }
  };
  return (
    <form className="surface form-stack" onSubmit={save}><div className="section-heading"><h2>나의 취향</h2><span className="badge">산책 프로필</span></div>
      <label>산책 닉네임<input required minLength={2} maxLength={20} pattern="[가-힣a-zA-Z0-9_]+" value={nickname} onChange={(event) => setNickname(event.target.value)} /><span className="helper">한글·영문·숫자·밑줄 2~20자 · 중복된 닉네임은 사용할 수 없어요.</span></label>
      <fieldset><legend>좋아하는 음식</legend><div className="preference-options">{categories.map((category) => <button type="button" aria-pressed={preferences.includes(category)} className={preferences.includes(category) ? "selected" : ""} key={category} onClick={() => setPreferences(preferences.includes(category) ? preferences.filter((item) => item !== category) : [...preferences, category])}>{category}</button>)}</div></fieldset>
      <fieldset><legend>편안한 가격대 <small>(1인 기준)</small></legend><div className="two-fields"><label><span className="sr-only">최소 가격</span><div className="amount-input"><input type="number" min={0} max={1000000} step={1000} value={min} onChange={(event) => setMin(event.target.value)} placeholder="최소 금액" /><span>원부터</span></div></label><label><span className="sr-only">최대 가격</span><div className="amount-input"><input type="number" min={1000} max={1000000} step={1000} value={max} onChange={(event) => setMax(event.target.value)} placeholder="최대 금액" /><span>원까지</span></div></label></div><p className="helper">인원수가 정해지면 추천 기본 예산에 반영합니다.</p></fieldset>
      {error && <p className="inline-error" role="alert">{error}</p>}<button className="button primary" type="submit" disabled={pending}>{pending ? "저장 중…" : "취향 저장하기"}</button>
    </form>
  );
}
