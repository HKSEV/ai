"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { LuArrowLeft, LuPenLine, LuTrash2 } from "react-icons/lu";
import { api, errorMessage } from "@/app/lib/api";
import useApiQuery from "@/app/lib/useApiQuery";
import { checkedTime } from "@/app/lib/format";
import type { Post } from "@/app/types/Service";
import { ErrorState, Loading } from "@/components/ui/States";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/ToastProvider";
import PostForm from "./PostForm";

export default function PostDetail({ id, edit = false }: { id: string; edit?: boolean }) {
  const query = useApiQuery<Post>("/api/posts/" + id);
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  const toast = useToast();
  if (query.loading) return <Loading />;
  if (query.error) return <ErrorState message={query.error} retry={query.reload} />;
  const post = query.data;
  if (!post) return null;
  if (edit) return post.is_owner ? <PostForm initial={post} /> : <ErrorState message="본인이 작성한 글만 수정할 수 있어요." />;
  const remove = async () => {
    setPending(true);
    try { await api("/api/posts/" + id, { method: "DELETE" }); toast("이야기를 삭제했어요."); router.push("/community"); }
    catch (error) { toast(errorMessage(error)); setPending(false); }
  };
  return (
    <div className="detail-page"><Link href="/community" className="back-link"><LuArrowLeft />이웃 이야기로 돌아가기</Link><article className="surface post-detail">
      <span className="badge">{post.kind === "review" ? "음식점 리뷰" : "서비스 사용 후기"}</span><h1>{post.title}</h1><div className="post-detail-meta"><span>{post.author}</span><time>{checkedTime(post.created_at)}</time>{post.created_at !== post.updated_at && <span>수정됨</span>}</div>
      {post.kind === "review" && <div className="review-info"><strong>{post.restaurant_name}</strong><span className="rating">★ {post.rating}</span><span>방문일 {post.visited_on}</span><span className="badge">{post.verification_status === "verified" ? "방문 인증 완료" : post.receipt_uploaded ? "영수증 첨부 · 방문 미인증" : "방문 미인증"}</span></div>}
      <div className="post-content">{post.content}</div><div className="post-photos">{post.photo_urls.map((src, index) => <div className="post-photo" key={src}><Image unoptimized src={src} width={1200} height={900} sizes="(max-width: 700px) 100vw, 800px" alt={post.title + " 사진 " + (index + 1)} /></div>)}</div>
      {post.is_owner && <div className="form-actions"><Link className="button secondary small" href={"/community/" + id + "/edit"}><LuPenLine />수정</Link><button className="button danger small" onClick={() => setConfirm(true)}><LuTrash2 />삭제</button></div>}
    </article>{confirm && <Modal title="이야기를 삭제할까요?" busy={pending} onClose={() => setConfirm(false)}>{(close) => <><p>삭제한 글과 첨부 사진은 복구할 수 없어요.</p><div className="form-actions"><button className="button secondary" disabled={pending} onClick={close}>취소</button><button className="button danger" disabled={pending} onClick={remove}>{pending ? "삭제 중…" : "삭제하기"}</button></div></>}</Modal>}</div>
  );
}
