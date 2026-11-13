"use client";

import { useState, type FormEvent } from "react";
import { api, errorMessage, json } from "@/app/lib/api";
import { today } from "@/app/lib/format";
import type { RestaurantChoice, UploadedFile, Visit } from "@/app/types/Service";
import RestaurantSelect from "@/components/ui/RestaurantSelect";

export default function VisitForm({ initial, onSaved }: { initial?: Visit; onSaved: () => void }) {
  const [restaurant, setRestaurant] = useState<RestaurantChoice | null>(initial ? { id: initial.restaurant_id, name: initial.restaurant_name } : null);
  const [date, setDate] = useState(initial?.visited_on || today());
  const [note, setNote] = useState(initial?.note || "");
  const [receipt, setReceipt] = useState<string | null>(initial?.receipt_id || null);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true); setError("");
    try {
      const body = new FormData(); body.append("file", file);
      const response = await api<UploadedFile>("/api/uploads?kind=receipt", { method: "POST", body });
      setReceipt(response.id);
    } catch (error) { setError(errorMessage(error)); }
    finally { setUploading(false); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!restaurant) { setError("검색 결과에서 음식점을 선택해 주세요."); return; }
    setPending(true); setError("");
    try {
      await api(initial ? "/api/me/visits/" + initial.id : "/api/me/visits", json(initial ? "PUT" : "POST", { restaurant_id: restaurant.id, visited_on: date, note, receipt_id: receipt }));
      onSaved();
    } catch (error) { setError(errorMessage(error)); }
    finally { setPending(false); }
  };
  return (
    <form className="form-stack" onSubmit={submit}>
      <RestaurantSelect value={restaurant} onChange={setRestaurant} />
      <label>방문일<input className="field" type="date" required value={date} max={today()} onChange={(event) => setDate(event.target.value)} /></label>
      <label>나만의 메모<textarea className="field leading-[1.65]" rows={3} value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} placeholder="먹었던 메뉴나 기억하고 싶은 점" /></label>
      <label>영수증 첨부 (선택 · 비공개)<input className="field text-[.8rem] mobile:text-[.8rem]" type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={(event) => { upload(event.target.files?.[0]); event.target.value = ""; }} /></label>
      {receipt && <div className="mt-[.8rem] flex flex-wrap items-center gap-2">
        <a className="attachment" href={"/api/uploads/" + receipt} target="_blank" rel="noreferrer">첨부된 영수증 보기</a>
        <button className="inline-grid place-items-center p-[.3rem] text-[.75rem] text-coral" type="button" onClick={() => setReceipt(null)}>제거</button>
      </div>}
      <p className="helper">실제 방문한 경우에만 기록해 주세요. 영수증 첨부만으로 방문 인증이 완료되지는 않습니다. 현재 인증 제공처는 미연동 상태예요.</p>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <button className="button button-primary" type="submit" disabled={pending || uploading}>{pending ? "저장 중…" : uploading ? "영수증 업로드 중…" : "방문 기록 저장"}</button>
    </form>
  );
}
