"use client";

import { useState, type FormEvent } from "react";
import { useDispatch, useSelector } from "react-redux";
import { LuPenLine, LuTrash2 } from "react-icons/lu";
import { api, errorMessage, json } from "@/app/lib/api";
import { checkedTime } from "@/app/lib/format";
import type { User } from "@/app/types/Service";
import ProfileFields, { readProfileFields } from "@/components/mypage/ProfileFields";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/ToastProvider";
import { setUser } from "@/store/authSlice";
import type { RootState } from "@/store/store";
import ManagementList, { type ListActions } from "./ManagementList";

function UserRow({ user, actions }: { user: User; actions: ListActions }) {
  const [dialog, setDialog] = useState<"edit" | "remove" | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const currentId = useSelector((state: RootState) => state.auth.user?.id);
  const dispatch = useDispatch();
  const toast = useToast();
  const path = "/api/admin/users/" + user.id;
  const open = (mode: "edit" | "remove") => { setError(""); setDialog(mode); };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = readProfileFields(event.currentTarget);
    setPending(true); setError("");
    try {
      const saved = await api<User>(path, json("PUT", data));
      if (currentId === saved.id) dispatch(setUser(saved));
      setDialog(null); toast("사용자 정보를 저장했어요."); actions.refresh();
    } catch (error) { setError(errorMessage(error)); }
    finally { setPending(false); }
  };
  const remove = async () => {
    setPending(true); setError("");
    try {
      await api(path, { method: "DELETE" });
      setDialog(null); toast("사용자 계정을 삭제했어요."); actions.removed();
    } catch (error) { setError(errorMessage(error)); }
    finally { setPending(false); }
  };
  return (
    <article className="surface flex flex-wrap items-center justify-between gap-4 p-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><h2 className="text-base">{user.nickname}</h2><span className="badge">{user.role}</span></div>
        <p className="mt-1 text-sm text-muted">{user.email || "이메일 미제공"}</p>
        <p className="mt-1 text-xs text-muted">가입 {checkedTime(user.created_at)}</p>
      </div>
      <div className="flex gap-2">
        <button className="button button-secondary button-small" type="button" onClick={() => open("edit")}><LuPenLine />수정</button>
        {user.role === "USER" && <button className="button button-danger button-small" type="button" onClick={() => open("remove")}><LuTrash2 />삭제</button>}
      </div>
      {dialog === "edit" && <Modal title="사용자 정보 수정" busy={pending} onClose={() => setDialog(null)}>{(close) => (
        <form className="form-stack" onSubmit={save}>
          <ProfileFields user={user} admin />
          {error && <p className="inline-error" role="alert">{error}</p>}
          <div className="form-actions">
            <button className="button button-secondary" type="button" disabled={pending} onClick={close}>취소</button>
            <button className="button admin-primary" type="submit" disabled={pending}>{pending ? "저장 중…" : "저장"}</button>
          </div>
        </form>
      )}</Modal>}
      {dialog === "remove" && <Modal title="사용자 계정을 삭제할까요?" busy={pending} onClose={() => setDialog(null)}>{(close) => <>
        <p className="my-4 text-sm text-muted"><strong className="text-navy">{user.nickname}</strong> 계정의 주소, 대화, 방문 기록, 게시물과 첨부 파일을 함께 삭제합니다.</p>
        {error && <p className="inline-error" role="alert">{error}</p>}
        <div className="form-actions mt-6">
          <button className="button button-secondary" type="button" disabled={pending} onClick={close}>취소</button>
          <button className="button button-danger" type="button" disabled={pending} onClick={remove}>{pending ? "삭제 중…" : "계정 삭제"}</button>
        </div>
      </>}</Modal>}
    </article>
  );
}

export default function UserManager() {
  return <ManagementList<User> resource="users" title="유저 관리" searchLabel="닉네임 또는 이메일 검색"
    render={(user, actions) => <UserRow user={user} actions={actions} />} />;
}
