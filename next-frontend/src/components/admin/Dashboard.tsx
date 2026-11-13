"use client";

import { useState } from "react";
import { LuActivity, LuChartNoAxesCombined, LuMessageSquareText, LuSparkles, LuStar, LuUserRoundPlus, LuUsers, LuUtensils } from "react-icons/lu";
import useApiQuery from "@/app/lib/useApiQuery";
import { checkedTime } from "@/app/lib/format";
import type { AdminAction, AdminStats, AdminTrend } from "@/app/types/Admin";
import { ErrorState, Loading } from "@/components/ui/States";

const number = new Intl.NumberFormat("ko-KR");
const totals = [
  { key: "users", label: "전체 가입자", icon: LuUsers },
  { key: "new_users", label: "신규 가입자", icon: LuUserRoundPlus },
  { key: "experiences", label: "서비스 사용 후기", icon: LuMessageSquareText },
  { key: "reviews", label: "음식점 리뷰", icon: LuStar },
  { key: "restaurants", label: "등록 식당", icon: LuUtensils },
  { key: "search_requests", label: "AI 탐색 요청", icon: LuSparkles },
] as const;
const metrics = [
  { key: "signups", label: "가입", color: "bg-(--color-admin-accent)" },
  { key: "experiences", label: "후기", color: "bg-teal-500" },
  { key: "reviews", label: "리뷰", color: "bg-amber-500" },
  { key: "search_requests", label: "AI 탐색", color: "bg-violet-500" },
] as const;
const actions: Record<AdminAction["action"], string> = {
  prompt_update: "프롬프트 저장", prompt_restore: "프롬프트 복원", user_delete: "유저 삭제",
  restaurant_delete: "식당 삭제", post_delete: "게시물 삭제",
};

function Trend({ data, days }: { data: AdminTrend[]; days: number }) {
  const peak = Math.max(1, ...data.flatMap((point) => metrics.map(({ key }) => point[key])));
  return (
    <section className="surface min-w-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2"><LuChartNoAxesCombined className="text-forest" />등록 추이</h2>
        <span className="text-xs text-muted">한국 시간 · 최근 {days}일</span>
      </div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
        {metrics.map(({ key, label, color }) => <span key={key} className="inline-flex items-center gap-1.5 text-xs text-muted"><span className={"size-2.5 rounded-sm " + color} />{label}</span>)}
      </div>
      <div className="flex min-h-36 items-end gap-1 border-b border-line pt-2 mobile:gap-0.5" aria-hidden="true">
        {data.map((point) => <div className="flex min-w-0 flex-1 items-end justify-center gap-px" key={point.date}
          title={point.date + " · " + metrics.map(({ key, label }) => label + " " + point[key]).join(" · ")}>
          {metrics.map(({ key, color }) => <span key={key} className={"w-1/4 max-w-3 rounded-t-sm " + color}
            style={{ height: point[key] / peak * 136 }} />)}
        </div>)}
      </div>
      <div className="mt-1 flex justify-between text-[.65rem] text-muted" aria-hidden="true">
        <span>{data[0]?.date.slice(5)}</span><span>{data.at(-1)?.date.slice(5)}</span>
      </div>
      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-forest">일별 수치 보기</summary>
        <table className="mt-3 w-full table-fixed text-center text-xs">
          <thead className="border-b border-line text-muted"><tr><th scope="col" className="py-2">날짜</th>{metrics.map(({ key, label }) => <th scope="col" key={key}>{label}</th>)}</tr></thead>
          <tbody>{[...data].reverse().map((point) => <tr className="border-b border-line last:border-0" key={point.date}>
            <th scope="row" className="py-1.5 font-normal">{point.date.slice(5)}</th>{metrics.map(({ key }) => <td key={key}>{number.format(point[key])}</td>)}
          </tr>)}</tbody>
        </table>
      </details>
    </section>
  );
}

export default function Dashboard() {
  const [days, setDays] = useState<7 | 30>(7);
  const query = useApiQuery<AdminStats>("/api/admin/dashboard?days=" + days);
  const data = query.data;
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div><h1>통계</h1><p className="mt-1 text-sm text-muted">가입, 게시물, AI 탐색 현황을 확인하세요.</p></div>
        <div className="flex gap-1 rounded-xl border border-line bg-paper p-1" aria-label="통계 기간">
          {([7, 30] as const).map((value) => <button type="button" key={value} aria-pressed={days === value} onClick={() => setDays(value)}
            className="min-h-9 rounded-lg px-3 text-xs font-semibold text-muted aria-pressed:bg-(--color-admin-accent) aria-pressed:text-white">최근 {value}일</button>)}
        </div>
      </div>
      {query.loading && <Loading text="운영 통계를 불러오고 있어요." />}
      {query.error && <ErrorState message={query.error} retry={query.reload} />}
      {data && <div className="grid gap-5">
        <dl className="grid grid-cols-3 gap-3 mobile:grid-cols-2">
          {totals.map(({ key, label, icon: Icon }) => <div className="min-w-0 rounded-xl border border-line bg-paper p-4 shadow-surface mobile:p-3" key={key}>
            <dt className="flex items-center gap-2 text-sm font-medium text-muted mobile:text-xs"><Icon className="text-forest" size={17} />{label}</dt>
            <dd className="mt-2 text-[1.7rem] font-bold leading-none tabular-nums mobile:text-[1.35rem]">{number.format(data.totals[key])}</dd>
          </div>)}
        </dl>
        <Trend data={data.trend} days={data.days} />
        <section className="surface">
          <h2 className="mb-4 flex items-center gap-2"><LuActivity className="text-forest" />최근 관리자 작업</h2>
          {data.actions.length ? <ul className="divide-y divide-line">
            {data.actions.map((item) => <li className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-3" key={item.id}>
              <div className="min-w-0"><span className="badge mr-2">{actions[item.action]}</span><strong className="text-sm font-semibold">{item.target_label}</strong></div>
              <span className="text-xs text-muted">{item.actor_name} · {checkedTime(item.created_at)}</span>
            </li>)}
          </ul> : <p className="text-sm text-muted">기록된 관리자 작업이 없습니다.</p>}
        </section>
      </div>}
    </>
  );
}
