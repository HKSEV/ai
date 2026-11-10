"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import { LuArrowUpRight, LuPlus, LuTrash2 } from "react-icons/lu";
import { api, errorMessage } from "@/app/lib/api";
import { checkedTime } from "@/app/lib/format";
import useApiQuery from "@/app/lib/useApiQuery";
import type { Conversation, ConversationSummary, PageResult, Post, Visit } from "@/app/types/Service";
import type { RootState } from "@/store/store";
import { resetChat, setConversation } from "@/store/chatSlice";
import { Empty, ErrorState, Loading, Pagination } from "@/components/ui/States";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/ToastProvider";
import VisitForm from "./VisitForm";

export default function MyRecords() {
  const [tab, setTab] = useState<"conversations" | "visits" | "posts">("conversations");
  const [page, setPage] = useState(1);
  const path = tab === "conversations" ? "/api/conversations" : tab === "visits" ? "/api/me/visits" : "/api/posts?mine=true";
  const query = useApiQuery<PageResult<ConversationSummary | Visit | Post>>(path + (path.includes("?") ? "&" : "?") + "size=10&page=" + page);
  const [editing, setEditing] = useState<Visit | "new" | null>(null);
  const [removing, setRemoving] = useState<{ id: number; type: string } | null>(null);
  const [pending, setPending] = useState(false);
  const active = useSelector((state: RootState) => state.chat.active);
  const dispatch = useDispatch();
  const router = useRouter();
  const toast = useToast();
  const open = async (id: number) => {
    try { dispatch(setConversation(await api<Conversation>("/api/conversations/" + id))); router.push("/explore"); }
    catch (error) { toast(errorMessage(error)); }
  };
  const remove = async () => {
    if (!removing) return;
    setPending(true);
    try {
      await api((removing.type === "visits" ? "/api/me/visits/" : "/api/conversations/") + removing.id, { method: "DELETE" });
      if (removing.type === "conversations" && active?.id === removing.id) dispatch(resetChat());
      setRemoving(null); query.reload(); toast("기록을 삭제했어요.");
    } catch (error) { toast(errorMessage(error)); }
    finally { setPending(false); }
  };
  return (
    <section className="surface my-records"><div className="section-heading"><div><h2>나의 산책 기록</h2><p className="helper">개인화에 사용하는 검색·방문·리뷰를 확인하고 관리해요.</p></div>{tab === "visits" && <button className="button secondary small" onClick={() => setEditing("new")}><LuPlus />방문 기록</button>}</div>
      <div className="tabs">{[["conversations", "검색·대화 기록"], ["visits", "방문 기록"], ["posts", "내가 쓴 이야기"]].map(([value, label]) => <button key={value} className={tab === value ? "active" : ""} onClick={() => { setTab(value as typeof tab); setPage(1); }}>{label}</button>)}</div>
      {tab === "conversations" && <p className="helper record-notice">대화를 삭제하면 연결된 검색 조건과 추천 기록도 함께 삭제됩니다.</p>}
      {tab === "visits" && <p className="helper record-notice">직접 등록한 방문만 표시해요. 추천을 받았다는 이유로 방문 기록이 생기지 않습니다.</p>}
      {query.loading && <Loading />}{query.error && <ErrorState message={query.error} retry={query.reload} />}{query.data?.items.length === 0 && <Empty title="아직 남긴 기록이 없어요." text="취향이 담긴 첫 산책을 시작해 보세요." />}
      <div className="record-list">{query.data?.items.map((row) => <article className="record-row" key={row.id}><div className="record-copy">{"restaurant_name" in row && "note" in row ? <><h3>{row.restaurant_name}</h3><p>{row.visited_on} · {row.verification_status === "verified" ? "방문 인증 완료" : row.receipt_uploaded ? "영수증 첨부 · 미인증" : "방문 미인증"}</p><p className="record-excerpt">{row.note}</p></> : "kind" in row ? <><Link href={"/community/" + row.id}><h3>{row.title}<LuArrowUpRight /></h3></Link><p>{row.kind === "review" ? "음식점 리뷰" : "서비스 사용 후기"} · {checkedTime(row.created_at)}</p></> : <><button className="record-link" onClick={() => open(row.id)}><h3>{row.title}<LuArrowUpRight /></h3></button><p>{checkedTime(row.updated_at)} · {[row.conditions.area, row.conditions.cuisine].filter(Boolean).join(" · ") || "조건 확인 중"}</p></>}</div>
        <div className="record-actions">{tab === "visits" && "note" in row && <button className="text-button" onClick={() => setEditing(row)}>수정</button>}{tab !== "posts" && <button className="icon-button danger-text" aria-label="기록 삭제" onClick={() => setRemoving({ id: row.id, type: tab })}><LuTrash2 /></button>}</div></article>)}</div>
      {query.data && <Pagination page={page} pages={query.data.pages} onChange={setPage} />}
      {editing && <Modal title={editing === "new" ? "방문 기록 남기기" : "방문 기록 수정"} onClose={() => setEditing(null)}><VisitForm initial={editing === "new" ? undefined : editing} onSaved={() => { setEditing(null); query.reload(); toast("방문 기록을 저장했어요."); }} /></Modal>}
      {removing && <Modal title="기록을 삭제할까요?" onClose={() => { if (!pending) setRemoving(null); }}><p>{removing.type === "conversations" ? "이 대화의 메시지와 검색 기록이 함께 삭제됩니다." : "방문 기록과 영수증이 삭제됩니다. 작성한 음식점 리뷰는 커뮤니티에서 별도로 관리해 주세요."}</p><div className="form-actions"><button className="button secondary" disabled={pending} onClick={() => setRemoving(null)}>취소</button><button className="button danger" disabled={pending} onClick={remove}>{pending ? "삭제 중…" : "삭제하기"}</button></div></Modal>}
    </section>
  );
}
