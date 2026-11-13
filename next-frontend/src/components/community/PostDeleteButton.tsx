"use client";

import { useState } from "react";
import { LuTrash2 } from "react-icons/lu";
import { api, errorMessage } from "@/app/lib/api";
import type { Post } from "@/app/types/Service";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/ToastProvider";

export default function PostDeleteButton({ post, onDeleted, label }: {
  post: Post;
  onDeleted: () => void;
  label?: string;
}) {
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const toast = useToast();
  const remove = async () => {
    setPending(true);
    try {
      await api("/api/posts/" + post.id, { method: "DELETE" });
      setConfirm(false); toast("이야기를 삭제했어요."); onDeleted();
    } catch (error) { toast(errorMessage(error)); }
    finally { setPending(false); }
  };
  return <>
    <button type="button" className="button button-danger button-small" aria-label={label} onClick={() => setConfirm(true)}><LuTrash2 />삭제</button>
    {confirm && <Modal title="이야기를 삭제할까요?" busy={pending} onClose={() => setConfirm(false)}>{(close) => <>
      <p className="my-4 text-[.9rem] text-muted"><strong className="text-navy">{post.title}</strong> 글과 첨부 사진을 영구 삭제해요.</p>
      <div className="form-actions mt-6">
        <button type="button" className="button button-secondary" disabled={pending} onClick={close}>취소</button>
        <button type="button" className="button button-danger" disabled={pending} onClick={remove}>{pending ? "삭제 중…" : "삭제하기"}</button>
      </div>
    </>}</Modal>}
  </>;
}
