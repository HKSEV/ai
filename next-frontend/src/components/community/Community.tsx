"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSelector } from "react-redux";
import { LuArrowUpRight, LuLeaf, LuPenLine } from "react-icons/lu";
import type { PageResult, Post } from "@/app/types/Service";
import { checkedTime } from "@/app/lib/format";
import useApiQuery from "@/app/lib/useApiQuery";
import { Empty, ErrorState, Loading, Pagination } from "@/components/ui/States";
import type { RootState } from "@/store/store";
import PostDeleteButton from "./PostDeleteButton";

export default function Community() {
  const [kind, setKind] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const admin = useSelector((state: RootState) => state.auth.user?.role === "ADMIN");
  const query = useApiQuery<PageResult<Post>>(`/api/posts?kind=${kind}&sort=${sort}&page=${page}`.replace("kind=&", ""));
  const reloadAfterDelete = () => {
    if (page > 1 && query.data?.items.length === 1) setPage(page - 1);
    else query.reload();
  };
  return (
    <div className="content-page">
      <section className="relative flex items-center justify-between gap-8 overflow-hidden rounded-[1.3rem] border border-[#dce4d3] bg-[#e9eee2] px-12 py-[2.6rem] mobile:gap-2 mobile:rounded-2xl mobile:px-[1.4rem] mobile:py-[1.8rem]">
        <div>
          <span className="eyebrow text-[.62rem] mobile:text-[.5rem]">OUR NEIGHBORHOOD STORIES</span>
          <h1 className="mt-[.8rem] mb-4 text-[2rem] text-forest-dark mobile:text-[1.55rem]">한 끼의 이야기가<br />다음 발견이 되는 곳.</h1>
          <p className="mb-[1.4rem] text-[.83rem] text-[#6c7b68] mobile:text-[.75rem]">써본 이야기, 먹어본 이야기.<br className="hidden mobile:inline" /> 이웃의 경험으로 산책이 더 풍성해져요.</p>
          <Link href="/community/new" className="button bg-coral text-white mobile:px-4 mobile:pt-[.65rem] mobile:pb-[.65rem] mobile:text-[.75rem]"><LuPenLine />이야기 남기기</Link>
        </div>
        <div className="flex -rotate-5 items-center gap-8 px-10 py-4 text-[#5d7b59] compact:gap-4 compact:px-4 mobile:pointer-events-none mobile:absolute mobile:right-[-.6rem] mobile:bottom-[1.8rem] mobile:opacity-25" aria-hidden="true">
          <LuLeaf className="size-36 stroke-[.8] compact:size-28 mobile:size-22" />
          <span className="border-l border-[#aabda0] pl-8 text-[1.1rem] leading-[2] font-semibold tablet:hidden">함께 나누는<br />동네의 맛</span>
        </div>
      </section>
      <div className="mt-8 mb-6 flex items-center justify-between gap-4 mobile:mt-6 mobile:mb-4 mobile:flex-wrap mobile:gap-3">
        <div className="flex flex-wrap gap-[.4rem] mobile:gap-[.15rem]" aria-label="게시글 유형">
          {[["", "전체 이야기"], ["experience", "서비스 사용 후기"], ["review", "음식점 리뷰"]].map(([value, label]) =>
            <button key={value} className="tab-button" aria-pressed={kind === value} onClick={() => { setKind(value); setPage(1); }}>{label}</button>
          )}
        </div>
        <label className="mobile:ml-auto">
          <span className="sr-only">정렬</span>
          <select className="field w-auto bg-transparent px-[.7rem] py-2 text-[.75rem] mobile:px-[.7rem] mobile:py-2 mobile:text-[.68rem]" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}>
            <option value="newest">최신순</option><option value="oldest">작성일 오래된 순</option>
          </select>
        </label>
      </div>
      {query.loading && <Loading />}
      {query.error && <ErrorState message={query.error} retry={query.reload} />}
      {query.data?.items.length === 0 && <Empty title="첫 이야기를 기다리고 있어요." text="이웃에게 나누고 싶은 한 끼가 있나요?" />}
      <div className="grid grid-cols-3 gap-[1.4rem] tablet:grid-cols-2 mobile:grid-cols-1 mobile:gap-[1.2rem]">
        {query.data?.items.map((post) => <article className="relative min-w-0 overflow-hidden rounded-2xl border border-line bg-paper transition-[box-shadow,translate] duration-200 hover:-translate-y-[3px] hover:shadow-[0_10px_35px_#2233470c]" key={post.id}>
          <Link className="block h-full" href={"/community/" + post.id}>
            <div className={"relative flex h-[175px] flex-col items-center justify-center overflow-hidden mobile:h-[190px] " + (post.kind === "review" ? "bg-[#e6ecdf] text-[#76906b]" : "bg-[#eee9dd] text-[#9a8d70]")}>
              {post.photo_urls[0] ? <Image className="object-cover" src={post.photo_urls[0]} fill sizes="(max-width: 700px) 100vw, 33vw" unoptimized alt={post.title + " 첨부 사진"} /> : <>
                <LuLeaf className="mb-[.55rem] -rotate-20 stroke-1 text-[3rem]" />
                <span className="text-[.69rem] tracking-[.15em]">{post.kind === "review" ? "이웃의 맛집 노트" : "산책하며 남긴 이야기"}</span>
              </>}
              <span className="badge absolute top-[.8rem] left-[.8rem] bg-[#fffefaed]">{post.kind === "review" ? "음식점 리뷰" : "서비스 사용 후기"}</span>
            </div>
            <div className="p-5 mobile:p-[1.2rem]">
              {post.rating !== null && <p className="flex flex-wrap items-center gap-2 text-[.75rem] text-coral">★ {post.rating}<span className="text-[.68rem] text-muted">{post.restaurant_name}</span></p>}
              <h2 className="mt-[.3rem] mb-[.55rem] flex items-center justify-between gap-[.6rem] text-[.98rem]">{post.title}<LuArrowUpRight className="text-[#8f9d87]" /></h2>
              <p className="line-clamp-2 min-h-[2.8rem] text-[.77rem] leading-[1.85] wrap-anywhere text-muted">{post.content}</p>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[#eeeee5] pt-[.8rem] text-[.64rem] text-[#939a8e] mobile:text-[.65rem]">
                <span className="text-[#61715e]">{post.author}</span><time>{checkedTime(post.created_at)}</time>
              </div>
              {post.verification_status === "verified" && <span className="badge">방문 인증 완료</span>}
            </div>
          </Link>
          {admin && <div className="absolute top-[.6rem] right-[.6rem]"><PostDeleteButton post={post} label={post.title + " 삭제"} onDeleted={reloadAfterDelete} /></div>}
        </article>)}
      </div>
      {query.data && <Pagination page={page} pages={query.data.pages} onChange={setPage} />}
    </div>
  );
}
