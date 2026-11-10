"use client";

import { useState } from "react";
import useApiQuery from "@/app/lib/useApiQuery";
import type { RestaurantOption } from "@/app/types/Service";

export default function RestaurantSelect({ value, onChange, currentName }: { value: string; onChange: (id: string) => void; currentName?: string }) {
  const [search, setSearch] = useState("");
  const query = useApiQuery<RestaurantOption[]>("/api/restaurants?query=" + encodeURIComponent(search));
  return (
    <div className="restaurant-select">
      <label>음식점 검색<input value={search} maxLength={100} onChange={(event) => setSearch(event.target.value)} placeholder="등록된 음식점 이름·동네 검색" /></label>
      <label>음식점 선택<select value={value} required onChange={(event) => onChange(event.target.value)}><option value="">음식점을 선택해 주세요</option>{value && !query.data?.some((item) => String(item.id) === value) && <option value={value}>{currentName || "선택된 음식점"}</option>}{query.data?.map((item) => <option value={item.id} key={item.id}>{item.is_demo ? "[개발 예시] " : ""}{item.name} · {item.address}</option>)}</select></label>
      {query.loading && <p className="helper" role="status">음식점을 불러오고 있어요.</p>}
      {query.error && <p className="inline-error" role="alert">{query.error}</p>}
      {query.data?.length === 0 && <p className="helper">등록된 음식점이 없어요. AI 탐색으로 조회하거나 운영자가 이용 가능한 데이터를 등록해야 합니다.</p>}
    </div>
  );
}
