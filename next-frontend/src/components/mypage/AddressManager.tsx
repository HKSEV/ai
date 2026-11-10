"use client";

import { useState, type FormEvent } from "react";
import { LuHouse, LuMapPin, LuPlus } from "react-icons/lu";
import { api, errorMessage, json } from "@/app/lib/api";
import useApiQuery from "@/app/lib/useApiQuery";
import type { Address } from "@/app/types/Service";
import Modal from "@/components/ui/Modal";
import { Empty, ErrorState, Loading } from "@/components/ui/States";
import { useToast } from "@/components/ui/ToastProvider";

export default function AddressManager() {
  const query = useApiQuery<Address[]>("/api/me/addresses");
  const [editing, setEditing] = useState<Address | "new" | null>(null);
  const [removing, setRemoving] = useState<Address | null>(null);
  const [pending, setPending] = useState(false);
  const toast = useToast();
  const remove = async () => {
    if (!removing) return;
    setPending(true);
    try { await api("/api/me/addresses/" + removing.id, { method: "DELETE" }); setRemoving(null); query.reload(); toast("주소를 삭제했어요."); }
    catch (error) { toast(errorMessage(error)); }
    finally { setPending(false); }
  };
  const makeDefault = async (address: Address) => {
    try {
      const { id, ...values } = address;
      await api("/api/me/addresses/" + id, json("PUT", { ...values, is_default: true }));
      query.reload(); toast("기본 주소를 변경했어요.");
    } catch (error) { toast(errorMessage(error)); }
  };
  return (
    <section className="surface address-manager"><div className="section-heading"><h2>산책의 출발지</h2><button className="button secondary small" onClick={() => setEditing("new")}><LuPlus />주소 추가</button></div><p className="helper">직접 출발지를 입력하지 않으면 기본 주소를 추천에 활용해요. 주소는 나에게만 표시됩니다.</p>
      {query.loading && <Loading />}{query.error && <ErrorState message={query.error} retry={query.reload} />}{query.data?.length === 0 && <Empty title="출발지를 등록해 보세요." text="집, 직장 등 자주 출발하는 곳을 저장해요." />}
      <div className="address-list">{query.data?.map((item) => <article className="address-card" key={item.id}><span className="address-icon">{item.is_default ? <LuHouse /> : <LuMapPin />}</span><div><div className="address-label"><h3>{item.label}</h3>{item.is_default && <span className="badge">기본 주소</span>}</div><p>{item.address}</p><div className="text-actions">{!item.is_default && <button onClick={() => makeDefault(item)}>기본으로 설정</button>}<button onClick={() => setEditing(item)}>수정</button><button className="danger-text" onClick={() => setRemoving(item)}>삭제</button></div></div></article>)}</div>
      {editing && <Modal title={editing === "new" ? "출발지 추가" : "출발지 수정"} onClose={() => setEditing(null)}><AddressForm initial={editing === "new" ? undefined : editing} onSaved={() => { setEditing(null); query.reload(); toast("주소를 저장했어요."); }} /></Modal>}
      {removing && <Modal title="주소를 삭제할까요?" onClose={() => { if (!pending) setRemoving(null); }}><p>{removing.label} 주소를 삭제합니다.</p><div className="form-actions"><button className="button secondary" disabled={pending} onClick={() => setRemoving(null)}>취소</button><button className="button danger" disabled={pending} onClick={remove}>삭제하기</button></div></Modal>}
    </section>
  );
}

function AddressForm({ initial, onSaved }: { initial?: Address; onSaved: () => void }) {
  const [label, setLabel] = useState(initial?.label || "");
  const [address, setAddress] = useState(initial?.address || "");
  const [isDefault, setDefault] = useState(initial?.is_default || false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setPending(true); setError("");
    try {
      // Changing free-text addresses clears stale coordinates from the previous address.
      await api(initial ? "/api/me/addresses/" + initial.id : "/api/me/addresses", json(initial ? "PUT" : "POST", { label, address, is_default: isDefault, latitude: initial?.address === address ? initial.latitude : null, longitude: initial?.address === address ? initial.longitude : null }));
      onSaved();
    } catch (error) { setError(errorMessage(error)); }
    finally { setPending(false); }
  };
  return <form className="form-stack" onSubmit={submit}><label>주소 이름<input required maxLength={20} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="집, 직장, 자주 가는 곳" /></label><label>주소<input required minLength={5} maxLength={300} value={address} onChange={(event) => setAddress(event.target.value)} placeholder="서울 노원구 공릉로…" /></label><label className="checkbox"><input type="checkbox" checked={isDefault} onChange={(event) => setDefault(event.target.checked)} />기본 출발지로 사용</label>{error && <p className="inline-error" role="alert">{error}</p>}<button type="submit" className="button primary" disabled={pending}>{pending ? "저장 중…" : "주소 저장"}</button></form>;
}
