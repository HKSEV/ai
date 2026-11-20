"use client";

import { useState } from "react";
import { api, errorMessage, json } from "@/app/lib/api";
import useApiQuery from "@/app/lib/useApiQuery";
import type { AdminVisit } from "@/app/types/Admin";
import type { PageResult, User } from "@/app/types/Service";
import Modal from "@/components/ui/Modal";
import { Empty, ErrorState, Loading, Pagination } from "@/components/ui/States";
import { useToast } from "@/components/ui/ToastProvider";

export default function UserVisits({ user, onClose }: { user: User; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState("");
  const toast = useToast();
  const path = `/api/admin/users/${user.id}/visits`;
  const query = useApiQuery<PageResult<AdminVisit>>(path + "?page=" + page);
  const verify = async (visit: AdminVisit) => {
    const verified = !visit.admin_verified;
    setPending(visit.id);
    setError("");
    try {
      await api(`${path}/${visit.id}/verification`, json("PUT", { verified }));
      query.reload();
      toast(verified ? "방문을 임시 인증했어요." : "임시 인증을 해제했어요.");
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(null);
    }
  };
  return (
    <Modal title={`${user.nickname} 방문 기록`} wide busy={pending !== null} onClose={onClose}>
      {query.loading && <Loading/>}
      {query.error && <ErrorState message={query.error} retry={query.reload}/>}
      {error && <p className="inline-error mb-3" role="alert">{error}</p>}
      {query.data?.items.length === 0 && <Empty title="등록된 방문 기록이 없습니다."/>}
      {query.data && (
        <>
          <ul className="grid gap-2">
            {query.data.items.map((visit) => (
              <li
                key={visit.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3">
                <div className="min-w-0">
                  <h3 className="text-sm wrap-anywhere">{visit.restaurant_name}</h3>
                  <p className="mt-1 text-xs text-muted">
                    {visit.visited_on}{visit.receipt_uploaded && " · 영수증 첨부"}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {visit.verification_status === "verified" ? "인증 완료" : "미인증"}
                    {visit.verification_reason && " · " + visit.verification_reason}
                  </p>
                </div>
                <button
                  type="button"
                  className={`button button-small ${visit.admin_verified ? "button-secondary" : "admin-primary"}`}
                  disabled={pending !== null}
                  onClick={() => verify(visit)}>
                  {pending === visit.id ? "처리 중…" : visit.admin_verified ? "임시 인증 해제" : "임시 인증"}
                </button>
              </li>
            ))}
          </ul>
          <Pagination page={page} pages={query.data.pages} onChange={setPage}/>
        </>
      )}
    </Modal>
  );
}
