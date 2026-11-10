"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { LuArrowUpRight, LuLeaf, LuPenLine } from "react-icons/lu";
import type { PageResult, Post } from "@/app/types/Service";
import { checkedTime } from "@/app/lib/format";
import useApiQuery from "@/app/lib/useApiQuery";
import { Empty, ErrorState, Loading, Pagination } from "@/components/ui/States";

export default function Community() {
  const [kind, setKind] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const query = useApiQuery<PageResult<Post>>(`/api/posts?kind=${kind}&sort=${sort}&page=${page}`.replace("kind=&", ""));
  return (
    <div className="content-page">
      <section className="community-banner"><div><span className="eyebrow">OUR NEIGHBORHOOD STORIES</span><h1>한 끼의 이야기가<br />다음 발견이 되는 곳.</h1><p>써본 이야기, 먹어본 이야기.<br className="mobile-only" /> 이웃의 경험으로 산책이 더 풍성해져요.</p><Link href="/community/new" className="button coral"><LuPenLine />이야기 남기기</Link></div><div className="banner-illustration" aria-hidden="true"><LuLeaf /><span>함께 나누는<br />동네의 맛</span></div></section>
      <div className="list-toolbar"><div className="tabs" aria-label="게시글 유형">{[["", "전체 이야기"], ["experience", "서비스 사용 후기"], ["review", "음식점 리뷰"]].map(([value, label]) => <button key={value} className={kind === value ? "active" : ""} onClick={() => { setKind(value); setPage(1); }}>{label}</button>)}</div><label className="sort-select"><span className="sr-only">정렬</span><select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}><option value="newest">최신순</option><option value="oldest">작성일 오래된 순</option></select></label></div>
      {query.loading && <Loading />}
      {query.error && <ErrorState message={query.error} retry={query.reload} />}
      {query.data?.items.length === 0 && <Empty title="첫 이야기를 기다리고 있어요." text="이웃에게 나누고 싶은 한 끼가 있나요?" />}
      <div className="post-grid">{query.data?.items.map((post) => <Link className="post-card" key={post.id} href={"/community/" + post.id}>
        <div className={"post-cover " + post.kind}>{post.photo_urls[0] ? <Image src={post.photo_urls[0]} fill sizes="(max-width: 700px) 100vw, 33vw" unoptimized alt={post.title + " 첨부 사진"} /> : <><LuLeaf /><span>{post.kind === "review" ? "이웃의 맛집 노트" : "산책하며 남긴 이야기"}</span></>}<span className="badge">{post.kind === "review" ? "음식점 리뷰" : "서비스 사용 후기"}</span></div>
        <div className="post-card-body">{post.rating !== null && <p className="rating">★ {post.rating}<span>{post.restaurant_name}</span></p>}<h2>{post.title}<LuArrowUpRight /></h2><p className="post-excerpt">{post.content}</p><div className="post-meta"><span>{post.author}</span><time>{checkedTime(post.created_at)}</time></div>{post.verification_status === "verified" && <span className="badge">방문 인증 완료</span>}</div>
      </Link>)}</div>
      {query.data && <Pagination page={page} pages={query.data.pages} onChange={setPage} />}
    </div>
  );
}
