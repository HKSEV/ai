"use client";

import { useState } from "react";
import { LuHouse, LuMapPin, LuPlus } from "react-icons/lu";
import { api, errorMessage, json } from "@/app/lib/api";
import useApiQuery from "@/app/lib/useApiQuery";
import type { Address } from "@/app/types/Service";
import AddressForm from "@/components/map/AddressForm";
import Modal from "@/components/ui/Modal";
import { Empty, ErrorState, Loading } from "@/components/ui/States";
import { useToast } from "@/components/ui/ToastProvider";

export default function AddressManager() {
  const query = useApiQuery<Address[]>("/api/me/addresses");
  const [editing, setEditing] = useState<Address | "new" | null>(null);
  const [removing, setRemoving] = useState<Address | null>(null);
  const [pending, setPending] = useState(false);
  const toast = useToast();
  const remove = async (close: () => void) => {
    if (!removing) return;
    setPending(true);
    try {
      await api("/api/me/addresses/" + removing.id, { method: "DELETE" });
      close();
      query.reload();
      toast("주소를 삭제했어요.");
    } catch (error) {
      toast(errorMessage(error));
    } finally {
      setPending(false);
    }
  };
  const makeDefault = async (address: Address) => {
    try {
      const { id, ...values } = address;
      await api(
        "/api/me/addresses/" + id,
        json("PUT", { ...values, is_default: true })
      );
      query.reload();
      toast("기본 주소를 변경했어요.");
    } catch (error) {
      toast(errorMessage(error));
    }
  };
  return (
    <section className="surface">
      <div className="section-heading">
        <h2 className="section-title">산책의 출발지</h2>
        <button
          className="button button-secondary button-small"
          onClick={() => setEditing("new")}>
          <LuPlus/>
          주소 추가
        </button>
      </div>
      <p className="helper">
        직접 출발지를 입력하지 않으면 기본 주소를 추천에 활용해요. 주소는 나에게만
        표시됩니다.
      </p>
      {query.loading && <Loading/>}
      {query.error && <ErrorState message={query.error} retry={query.reload}/>}
      {query.data?.length === 0 && (
        <Empty
          title="출발지를 등록해 보세요."
          text="집, 직장 등 자주 출발하는 곳을 저장해요."
        />
      )}
      <div className="mt-6 flex flex-col gap-[.9rem]">
        {query.data?.map((item) => (
          <article
            className="flex items-start gap-3 rounded-[.8rem] border border-[#e4e8dc]
            bg-[#fafaf3] p-4"
            key={item.id}>
            <span
              className="grid size-8 shrink-0 place-items-center rounded-lg
            bg-forest-soft text-forest">
              {item.is_default ? <LuHouse/> : <LuMapPin/>}
            </span>
            <div className="min-w-0">
              <div className="mb-[.35rem] flex flex-wrap items-center gap-[.6rem]">
                <h3 className="text-[.9rem]">{item.label}</h3>
                {item.is_default && <span className="badge">기본 주소</span>}
              </div>
              <p className="text-[.76rem] wrap-anywhere text-muted">{item.address}</p>
              <div
                className="mt-2 flex items-center gap-[.8rem] text-[.66rem]
              text-[#8c9685] [&>button]:py-[.2rem]">
                {!item.is_default && (
                  <button onClick={() => makeDefault(item)}>기본으로 설정</button>
                )}
                <button onClick={() => setEditing(item)}>수정</button>
                <button className="text-[#ae5945]" onClick={() => setRemoving(item)}>
                  삭제
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {editing && (
        <Modal
          title={editing === "new" ? "출발지 추가" : "출발지 수정"}
          onClose={() => setEditing(null)}
          busy={pending}
          wide>
          {(close) => (
            <AddressForm
              initial={editing === "new" ? undefined : editing}
              onPendingChange={setPending}
              onSaved={() => {
                close();
                query.reload();
                toast("주소를 저장했어요.");
              }}
            />
          )}
        </Modal>
      )}
      {removing && (
        <Modal
          title="주소를 삭제할까요?"
          onClose={() => setRemoving(null)}
          busy={pending}>
          {(close) => (
            <>
              <p className="my-4 text-[.9rem] text-muted">
                {removing.label} 주소를 삭제합니다.
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
                  삭제하기
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </section>
  );
}
