"use client";

import { useState, type FormEvent } from "react";
import { useDispatch } from "react-redux";
import { api, errorMessage, json } from "@/app/lib/api";
import type { User } from "@/app/types/Service";
import { setUser } from "@/store/authSlice";
import { useToast } from "@/components/ui/ToastProvider";
import ProfileFields, { readProfileFields } from "./ProfileFields";

export default function ProfileForm({ user }: { user: User }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const dispatch = useDispatch();
  const toast = useToast();
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = readProfileFields(event.currentTarget);
    setPending(true); setError("");
    try {
      const response = await api<User>("/api/me", json("PUT", data));
      dispatch(setUser(response)); toast("취향과 닉네임을 저장했어요.");
    } catch (error) { setError(errorMessage(error)); }
    finally { setPending(false); }
  };
  return (
    <form className="surface form-stack" onSubmit={save}>
      <div className="section-heading"><h2 className="section-title">나의 취향</h2><span className="badge">산책 프로필</span></div>
      <ProfileFields user={user} />
      {error && <p className="inline-error" role="alert">{error}</p>}
      <button className="button button-primary" type="submit" disabled={pending}>{pending ? "저장 중…" : "취향 저장하기"}</button>
    </form>
  );
}
