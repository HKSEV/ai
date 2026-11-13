"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import { LuArrowUpRight, LuPlus, LuTrash2 } from "react-icons/lu";
import { api, deleteConversation, errorMessage } from "@/app/lib/api";
import { checkedTime } from "@/app/lib/format";
import useApiQuery from "@/app/lib/useApiQuery";
import type {
  Conversation,
  ConversationSummary,
  PageResult,
  Post,
  Visit
} from "@/app/types/Service";
import type { RootState } from "@/store/store";
import { conversationDeleted, setConversation } from "@/store/chatSlice";
import { Empty, ErrorState, Loading, Pagination } from "@/components/ui/States";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/ToastProvider";
import VisitForm from "./VisitForm";

const recordTitle = "flex items-center gap-2 text-[.9rem] mobile:text-[.8rem]";
const recordDetail = "mt-[.3rem] text-[.7rem] text-muted mobile:text-[.65rem]";

export default function MyRecords() {
  const [tab, setTab] = useState<"conversations" | "visits" | "posts">("conversations");
  const [page, setPage] = useState(1);
  const path =
    tab === "conversations"
      ? "/api/conversations"
      : tab === "visits"
        ? "/api/me/visits"
        : "/api/posts?mine=true";
  const query = useApiQuery<PageResult<ConversationSummary | Visit | Post>>(
    path + (path.includes("?") ? "&" : "?") + "size=10&page=" + page
  );
  const [editing, setEditing] = useState<Visit | "new" | null>(null);
  const [removing, setRemoving] = useState<{ id: number; type: string } | null>(null);
  const [pending, setPending] = useState(false);
  const sending = useSelector((state: RootState) => state.chat.pending);
  const dispatch = useDispatch();
  const router = useRouter();
  const toast = useToast();
  const open = async (id: number) => {
    try {
      dispatch(setConversation(await api<Conversation>("/api/conversations/" + id)));
      router.push("/explore");
    } catch (error) {
      toast(errorMessage(error));
    }
  };
  const remove = async (close: () => void) => {
    if (!removing) return;
    setPending(true);
    try {
      if (removing.type === "conversations") {
        await deleteConversation(removing.id);
        dispatch(conversationDeleted(removing.id));
      } else await api("/api/me/visits/" + removing.id, { method: "DELETE" });
      if (page > 1 && query.data?.items.length === 1) setPage(page - 1);
      else query.reload();
      close();
      toast("기록을 삭제했어요.");
    } catch (error) {
      toast(errorMessage(error));
    } finally {
      setPending(false);
    }
  };
  return (
    <section className="surface mt-6 mobile:mt-[1.2rem]">
      <div className="section-heading mobile:items-start">
        <div>
          <h2 className="section-title">나의 산책 기록</h2>
          <p className="helper mobile:text-[.7rem]">
            개인화에 사용하는 검색·방문·리뷰를 확인하고 관리해요.
          </p>
        </div>
        {tab === "visits" && (
          <button
            className="button button-secondary button-small"
            onClick={() => setEditing("new")}>
            <LuPlus/>
            방문 기록
          </button>
        )}
      </div>
      <div
        className="flex flex-wrap gap-[.4rem] border-b border-line pt-[.7rem] pb-4
      mobile:gap-[.15rem]">
        {(
          [
            ["conversations", "검색·대화 기록"],
            ["visits", "방문 기록"],
            ["posts", "내가 쓴 이야기"]
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className="tab-button narrow:px-[.55rem] narrow:text-[.67rem]"
            aria-pressed={tab === value}
            onClick={() => {
              setTab(value);
              setPage(1);
            }}>
            {label}
          </button>
        ))}
      </div>
      {tab === "conversations" && (
        <p className="helper pt-4 mobile:text-[.7rem]">
          대화를 삭제하면 연결된 검색 조건과 추천 기록도 함께 삭제됩니다.
        </p>
      )}
      {tab === "visits" && (
        <p className="helper pt-4 mobile:text-[.7rem]">
          직접 등록한 방문만 표시해요. 추천을 받았다는 이유로 방문 기록이 생기지
          않습니다.
        </p>
      )}
      {query.loading && <Loading/>}
      {query.error && <ErrorState message={query.error} retry={query.reload}/>}
      {query.data?.items.length === 0 && (
        <Empty
          title="아직 남긴 기록이 없어요."
          text="취향이 담긴 첫 산책을 시작해 보세요."
        />
      )}
      <div className="mt-2">
        {query.data?.items.map((row) => (
          <article
            className="flex items-center justify-between gap-4 border-b border-[#eeeee5]
            px-[.2rem] py-[1.2rem] mobile:gap-[.4rem]"
            key={row.id}>
            <div className="min-w-0">
              {"restaurant_name" in row && "note" in row ? (
                <>
                  <h3 className={recordTitle}>{row.restaurant_name}</h3>
                  <p className={recordDetail}>
                    {row.visited_on} ·{" "}
                    {row.verification_status === "verified"
                      ? "방문 인증 완료"
                      : row.receipt_uploaded
                        ? "영수증 첨부 · 미인증"
                        : "방문 미인증"}
                  </p>
                  <p className={recordDetail + " line-clamp-2 wrap-anywhere"}>
                    {row.note}
                  </p>
                </>
              ) : "kind" in row ? (
                <>
                  <Link href={"/community/" + row.id}>
                    <h3 className={recordTitle}>
                      {row.title}
                      <LuArrowUpRight className="text-[#829777]"/>
                    </h3>
                  </Link>
                  <p className={recordDetail}>
                    {row.kind === "review" ? "음식점 리뷰" : "서비스 사용 후기"} ·{" "}
                    {checkedTime(row.created_at)}
                  </p>
                </>
              ) : (
                <>
                  <button className="p-0 text-left" onClick={() => open(row.id)}>
                    <h3 className={recordTitle}>
                      {row.title}
                      <LuArrowUpRight className="text-[#829777]"/>
                    </h3>
                  </button>
                  <p className={recordDetail}>
                    {checkedTime(row.updated_at)} ·{" "}
                    {[row.conditions.area, row.conditions.cuisine]
                      .filter(Boolean)
                      .join(" · ") || "조건 확인 중"}
                  </p>
                </>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2 mobile:gap-[.2rem]">
              {tab === "visits" && "note" in row && (
                <button
                  className="text-[.78rem] text-muted underline underline-offset-4"
                  onClick={() => setEditing(row)}>
                  수정
                </button>
              )}
              {tab !== "posts" && (
                <button
                  className="icon-button text-[#ae5945] mobile:h-9 mobile:w-8
                  mobile:text-[.95rem]"
                  aria-label="기록 삭제"
                  disabled={tab === "conversations" && sending}
                  onClick={() => setRemoving({ id: row.id, type: tab })}>
                  <LuTrash2/>
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {query.data && (
        <Pagination page={page} pages={query.data.pages} onChange={setPage}/>
      )}
      {editing && (
        <Modal
          title={editing === "new" ? "방문 기록 남기기" : "방문 기록 수정"}
          onClose={() => setEditing(null)}>
          {(close) => (
            <VisitForm
              initial={editing === "new" ? undefined : editing}
              onSaved={() => {
                close();
                query.reload();
                toast("방문 기록을 저장했어요.");
              }}
            />
          )}
        </Modal>
      )}
      {removing && (
        <Modal
          title="기록을 삭제할까요?"
          onClose={() => setRemoving(null)}
          busy={pending}>
          {(close) => (
            <>
              <p className="my-4 text-[.9rem] text-muted">
                {removing.type === "conversations"
                  ? "이 대화의 메시지와 검색 기록이 함께 삭제됩니다."
                  : "방문 기록과 영수증이 삭제됩니다. 작성한 음식점 리뷰는 커뮤니티에서 별도로 관리해 주세요."}
              </p>
              <div className="form-actions mt-6">
                <button
                  className="button button-secondary"
                  disabled={pending}
                  onClick={close}>
                  취소
                </button>
                <button
                  className="button button-danger"
                  disabled={pending}
                  onClick={() => remove(close)}>
                  {pending ? "삭제 중…" : "삭제하기"}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </section>
  );
}
