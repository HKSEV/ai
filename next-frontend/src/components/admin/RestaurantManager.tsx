"use client";

import { useState, type FormEvent } from "react";
import { LuPenLine, LuTrash2 } from "react-icons/lu";
import { api, ApiError, errorMessage, json } from "@/app/lib/api";
import useApiQuery from "@/app/lib/useApiQuery";
import type { AdminRestaurant, RestaurantRemoval } from "@/app/types/Admin";
import Modal from "@/components/ui/Modal";
import { ErrorState, Loading } from "@/components/ui/States";
import { useToast } from "@/components/ui/ToastProvider";
import ManagementList, { type ListActions } from "./ManagementList";

function RestaurantRow({
  item,
  actions
}: {
  item: AdminRestaurant;
  actions: ListActions;
}) {
  const [dialog, setDialog] = useState<"edit" | "remove" | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  const path = "/api/admin/restaurants/" + item.id;
  const impact = useApiQuery<RestaurantRemoval>(
    dialog === "remove" ? path + "/deletion-impact" : null
  );
  const open = (mode: "edit" | "remove") => {
    setError("");
    setDialog(mode);
    if (mode === "remove") impact.reload();
  };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (name: string) => String(form.get(name) ?? "").trim();
    const latitude = field("latitude");
    const longitude = field("longitude");
    setPending(true);
    setError("");
    try {
      await api(
        path,
        json("PUT", {
          name: field("name"),
          address: field("address"),
          area: field("area"),
          category: field("category"),
          phone: field("phone") || null,
          latitude: latitude ? Number(latitude) : null,
          longitude: longitude ? Number(longitude) : null,
          tags: field("tags")
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        })
      );
      setDialog(null);
      toast("식당 정보를 저장했어요.");
      actions.refresh();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  };
  const remove = async () => {
    if (!impact.data) return;
    setPending(true);
    setError("");
    try {
      await api(path, json("DELETE", impact.data));
      setDialog(null);
      toast("식당을 삭제했어요.");
      actions.removed();
    } catch (error) {
      setError(errorMessage(error));
      if (error instanceof ApiError && error.status === 409) impact.reload();
    } finally {
      setPending(false);
    }
  };
  return (
    <article className="surface flex flex-wrap items-center justify-between gap-4 p-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base">{item.name}</h2>
          {item.is_demo && <span className="badge">예시 식당</span>}
        </div>
        <p className="mt-1 text-sm text-muted">{item.address}</p>
        <p className="mt-1 text-xs text-muted">
          {item.category}
          {item.phone && " · " + item.phone}
        </p>
      </div>
      <div className="flex gap-2">
        <button
          className="button button-secondary button-small"
          type="button"
          onClick={() => open("edit")}>
          <LuPenLine/>
          수정
        </button>
        <button
          className="button button-danger button-small"
          type="button"
          onClick={() => open("remove")}>
          <LuTrash2/>
          삭제
        </button>
      </div>
      {dialog === "edit" && (
        <Modal title="식당 정보 수정" busy={pending} onClose={() => setDialog(null)}>
          {(close) => (
            <form className="form-stack gap-4" onSubmit={save}>
              <label>
                식당 이름
                <input
                  className="field"
                  name="name"
                  required
                  maxLength={150}
                  defaultValue={item.name}
                />
              </label>
              <label>
                주소
                <input
                  className="field"
                  name="address"
                  required
                  minLength={5}
                  maxLength={300}
                  defaultValue={item.address}
                />
              </label>
              <div className="two-fields">
                <label>
                  지역
                  <input
                    className="field"
                    name="area"
                    required
                    maxLength={100}
                    defaultValue={item.area}
                  />
                </label>
                <label>
                  음식 분류
                  <input
                    className="field"
                    name="category"
                    required
                    maxLength={100}
                    defaultValue={item.category}
                  />
                </label>
              </div>
              <label>
                전화번호
                <input
                  className="field"
                  name="phone"
                  type="tel"
                  maxLength={40}
                  defaultValue={item.phone ?? ""}
                />
              </label>
              <div className="two-fields">
                <label>
                  위도
                  <input
                    className="field"
                    name="latitude"
                    type="number"
                    step="any"
                    min={33}
                    max={39}
                    defaultValue={item.latitude ?? ""}
                  />
                </label>
                <label>
                  경도
                  <input
                    className="field"
                    name="longitude"
                    type="number"
                    step="any"
                    min={124}
                    max={132}
                    defaultValue={item.longitude ?? ""}
                  />
                </label>
              </div>
              <label>
                태그
                <input
                  className="field"
                  name="tags"
                  defaultValue={item.tags.join(", ")}
                />
                <span className="helper">태그는 쉼표로 구분해 주세요.</span>
              </label>
              {error && (
                <p className="inline-error" role="alert">
                  {error}
                </p>
              )}
              <div className="form-actions">
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={pending}
                  onClick={close}>
                  취소
                </button>
                <button
                  className="button admin-primary"
                  type="submit"
                  disabled={pending}>
                  {pending ? "저장 중…" : "저장"}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
      {dialog === "remove" && (
        <Modal
          title="식당을 삭제할까요?"
          busy={pending}
          onClose={() => setDialog(null)}>
          {(close) => (
            <>
              <p className="my-4 text-sm text-muted">
                <strong className="text-navy">{item.name}</strong>을 탐색과 관리
                목록에서 삭제합니다. 연결된 리뷰, 방문 기록, 메뉴는 보존합니다.
              </p>
              {impact.loading && <Loading text="연결된 기록을 확인하고 있어요."/>}
              {impact.error && (
                <ErrorState message={impact.error} retry={impact.reload}/>
              )}
              {impact.data && (
                <dl
                  className="mb-4 grid grid-cols-3 gap-2 rounded-lg bg-cream p-3
                text-center text-sm">
                  <div>
                    <dt className="text-muted">리뷰</dt>
                    <dd>{impact.data.review_count}건</dd>
                  </div>
                  <div>
                    <dt className="text-muted">방문 기록</dt>
                    <dd>{impact.data.visit_count}건</dd>
                  </div>
                  <div>
                    <dt className="text-muted">메뉴</dt>
                    <dd>{impact.data.menu_count}개</dd>
                  </div>
                </dl>
              )}
              {error && (
                <p className="inline-error" role="alert">
                  {error}
                </p>
              )}
              <div className="form-actions mt-6">
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={pending}
                  onClick={close}>
                  취소
                </button>
                <button
                  className="button button-danger"
                  type="button"
                  disabled={pending || !impact.data}
                  onClick={remove}>
                  {pending ? "삭제 중…" : "식당 삭제"}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </article>
  );
}

export default function RestaurantManager() {
  return (
    <ManagementList<AdminRestaurant>
      resource="restaurants"
      title="식당 관리"
      searchLabel="식당 이름, 주소 또는 분류 검색"
      render={(item, actions) => <RestaurantRow item={item} actions={actions}/>}
    />
  );
}
