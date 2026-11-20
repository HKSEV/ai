"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { LuPenLine } from "react-icons/lu";
import { api, errorMessage, json } from "@/app/lib/api";
import { checkedTime } from "@/app/lib/format";
import { postPath } from "@/app/lib/paths";
import type { Post } from "@/app/types/Service";
import PostDeleteButton from "@/components/community/PostDeleteButton";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/ToastProvider";
import ManagementList, { type ListActions } from "./ManagementList";

function PostRow({ post, actions }: { post: Post; actions: ListActions }) {
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  const path = "/api/admin/posts/" + post.id;
  const review = post.kind === "review";
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const data = {
      title: fields.get("title"),
      content: fields.get("content"),
      ...(review && { rating: Number(fields.get("rating")) })
    };
    setPending(true);
    setError("");
    try {
      await api(path, json("PUT", data));
      setEditing(false);
      actions.refresh();
      toast("게시물을 저장했어요.");
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  };
  return (
    <article className="surface flex flex-wrap items-start justify-between gap-4 p-5">
      <div className="min-w-0 flex-1 basis-60">
        <span className="badge">{review ? "음식점 리뷰" : "서비스 사용 후기"}</span>
        <h2 className="mt-2 text-base wrap-anywhere">
          <Link href={postPath(post.id)} className="hover:underline">{post.title}</Link>
        </h2>
        <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted">
          <span>{post.author} · {checkedTime(post.created_at)}</span>
          {review && <span>{post.restaurant_name} · ★ {post.rating}</span>}
        </p>
        <p className="mt-2 line-clamp-2 text-sm wrap-anywhere text-muted">{post.content}</p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className="button button-secondary button-small"
          aria-label={post.title + " 수정"}
          onClick={() => {
            setError("");
            setEditing(true);
          }}>
          <LuPenLine/>
          수정
        </button>
        <PostDeleteButton
          post={post}
          path={path}
          label={post.title + " 삭제"}
          onDeleted={actions.removed}
        />
      </div>
      {editing && (
        <Modal title="게시물 수정" wide busy={pending} onClose={() => setEditing(false)}>
          {(close) => (
            <form className="form-stack" onSubmit={save}>
              <p className="helper">
                작성자 {post.author}{review && ` · ${post.restaurant_name} · 방문일 ${post.visited_on}`}
              </p>
              <label>
                제목
                <input className="field" name="title" defaultValue={post.title} required minLength={2} maxLength={100}/>
              </label>
              <label>
                본문
                <textarea className="field" name="content" defaultValue={post.content} required minLength={10} maxLength={10000} rows={7}/>
              </label>
              {review && (
                <label>
                  별점
                  <select className="field" name="rating" required defaultValue={post.rating ?? ""}>
                    <option value="" disabled>별점 선택</option>
                    {[5, 4, 3, 2, 1].map((value) => (
                      <option key={value} value={value}>{"★".repeat(value)} ({value}점)</option>
                    ))}
                  </select>
                </label>
              )}
              {error && <p className="inline-error" role="alert">{error}</p>}
              <div className="form-actions">
                <button className="button button-secondary" type="button" onClick={close} disabled={pending}>
                  취소
                </button>
                <button className="button admin-primary" type="submit" disabled={pending}>
                  {pending ? "저장 중…" : "저장"}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </article>
  );
}

export default function PostManager() {
  return (
    <ManagementList<Post>
      resource="posts"
      title="게시물 관리"
      searchLabel="제목, 본문 또는 작성자 검색"
      render={(post, actions) => <PostRow post={post} actions={actions}/>}
    />
  );
}
