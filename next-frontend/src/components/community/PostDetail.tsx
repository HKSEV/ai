"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import { LuArrowLeft, LuPenLine } from "react-icons/lu";
import useApiQuery from "@/app/lib/useApiQuery";
import { checkedTime } from "@/app/lib/format";
import type { Post } from "@/app/types/Service";
import { ErrorState, Loading } from "@/components/ui/States";
import type { RootState } from "@/store/store";
import PostDeleteButton from "./PostDeleteButton";
import PostForm from "./PostForm";

export default function PostDetail({
  id,
  edit = false
}: {
  id: string;
  edit?: boolean;
}) {
  const query = useApiQuery<Post>("/api/posts/" + id);
  const admin = useSelector((state: RootState) => state.auth.user?.role === "ADMIN");
  const router = useRouter();
  if (query.loading) return <Loading/>;
  if (query.error) return <ErrorState message={query.error} retry={query.reload}/>;
  const post = query.data;
  if (!post) return null;
  if (edit)
    return post.is_owner ? (
      <PostForm initial={post}/>
    ) : (
      <ErrorState message="본인이 작성한 글만 수정할 수 있어요."/>
    );
  return (
    <div className="post-page">
      <Link href="/community" className="back-link">
        <LuArrowLeft/>
        이웃 이야기로 돌아가기
      </Link>
      <article className="surface p-10 tablet:p-[1.4rem] mobile:p-5">
        <span className="badge">
          {post.kind === "review" ? "음식점 리뷰" : "서비스 사용 후기"}
        </span>
        <h1 className="mt-4 text-[1.9rem] wrap-anywhere mobile:text-[1.55rem]">
          {post.title}
        </h1>
        <div className="mt-4 mb-6 flex flex-wrap gap-4 text-[.75rem] text-muted">
          <span>{post.author}</span>
          <time>{checkedTime(post.created_at)}</time>
          {post.created_at !== post.updated_at && <span>수정됨</span>}
        </div>
        {post.kind === "review" && (
          <div
            className="mt-4 mb-8 flex flex-wrap items-center gap-3 rounded-[.7rem]
          bg-forest-soft p-4 text-[.75rem] mobile:gap-2">
            <strong className="text-[.9rem]">{post.restaurant_name}</strong>
            <span className="text-coral">★ {post.rating}</span>
            <span>방문일 {post.visited_on}</span>
            <span className="badge">
              {post.verification_status === "verified"
                ? "방문 인증 완료"
                : post.receipt_uploaded
                  ? "영수증 첨부 · 방문 미인증"
                  : "방문 미인증"}
            </span>
          </div>
        )}
        <div
          className="border-t border-line py-6 leading-[2] break-normal wrap-anywhere
        whitespace-pre-wrap mobile:text-[.87rem]">
          {post.content}
        </div>
        <div className="my-4 flex flex-col gap-4">
          {post.photo_urls.map((src, index) => (
            <div key={src}>
              <Image
                className="block h-auto w-full rounded-[.7rem]"
                unoptimized
                src={src}
                width={1200}
                height={900}
                sizes="(max-width: 700px) 100vw, 800px"
                alt={post.title + " 사진 " + (index + 1)}
              />
            </div>
          ))}
        </div>
        {(post.is_owner || admin) && (
          <div className="form-actions">
            {post.is_owner && (
              <Link
                className="button button-secondary button-small"
                href={"/community/" + id + "/edit"}>
                <LuPenLine/>
                수정
              </Link>
            )}
            <PostDeleteButton post={post} onDeleted={() => router.push("/community")}/>
          </div>
        )}
      </article>
    </div>
  );
}
