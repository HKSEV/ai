import Link from "next/link";
import { LuArrowUpRight, LuCheck, LuMapPin, LuPhone, LuUtensils } from "react-icons/lu";
import type { FactSource, OpeningPeriod, Restaurant, Weekday } from "@/app/types/Service";
import { checkedTime, distanceLabel, money } from "@/app/lib/format";

const weekdays: [Weekday, string][] = [["mon", "월"], ["tue", "화"], ["wed", "수"], ["thu", "목"], ["fri", "금"], ["sat", "토"], ["sun", "일"]];
const hourLabels: Record<string, string> = { hours: "영업시간", break: "브레이크타임", last_order: "라스트오더" };

function periodLabel(period?: OpeningPeriod) {
  if (period?.closed) return "휴무";
  const details = [period?.open && period.close ? period.open + "–" + (period.close <= period.open ? "다음 날 " : "") + period.close : "확인 필요"];
  if (period?.break_start && period.break_end) details.push("브레이크타임 " + period.break_start + "–" + period.break_end);
  if (period?.last_order) details.push("라스트오더 " + period.last_order);
  for (const field of period?.conflicts || []) if (field !== "hours") details.push(hourLabels[field] + " 확인 필요");
  return details.join(" · ");
}

function FactSources({ sources }: { sources: FactSource[] }) {
  return <span className="fact-sources">{sources.map((source, index) => <span key={index}>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.name}</a> : source.name} · {checkedTime(source.checked_at)}</span>)}</span>;
}

function HoursRow({ label, period }: { label: string; period?: OpeningPeriod }) {
  return <div><dt>{label}</dt><dd>{periodLabel(period)}{Object.entries(period?.sources || {}).map(([kind, sources]) => <span className="hours-fact" key={kind}>{hourLabels[kind]} 출처 <FactSources sources={sources} /></span>)}</dd></div>;
}

function RestaurantHours({ restaurant: item }: { restaurant: Restaurant }) {
  const dated = { ...item.hours?.exceptions };
  for (const date of item.closed_dates || []) dated[date] = { closed: true };
  const exceptions = Object.keys(dated).sort();
  const hasWeeklyHours = weekdays.some(([day]) => item.hours?.[day]);
  if (!hasWeeklyHours && !exceptions.length) return <p className="helper">요일별 영업시간 및 날짜별 예외 확인 필요</p>;
  return (
    <details className="restaurant-hours">
      <summary>영업시간 자세히</summary>
      <p>요일별 영업시간</p>
      {hasWeeklyHours ? <dl>{weekdays.map(([day, label]) => <HoursRow key={day} label={label} period={item.hours?.[day]} />)}</dl> : <p className="helper">확인 필요</p>}
      <p>날짜별 예외 영업시간</p>
      {exceptions.length ? <dl>{exceptions.map((date) => <HoursRow key={date} label={date} period={dated[date]} />)}</dl> : <p className="helper">확인 필요</p>}
    </details>
  );
}

export default function RestaurantCard({ restaurant: item, index, reviewed, selected, onSelect }: {
  restaurant: Restaurant;
  index: number;
  reviewed?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const phone = item.phone?.trim();
  const dial = phone?.replace(/[()\s.-]/g, "");
  return (
    <article className={"restaurant-card" + (selected ? " is-selected" : "")}>
      <div className="restaurant-title"><span className="restaurant-number">{String(index + 1).padStart(2, "0")}</span><div><p className="card-eyebrow">{item.category}{item.is_demo && " · 개발 예시"}</p><h3>{onSelect ? <button type="button" className="restaurant-map-select" aria-label={item.name + " 추천 지도에서 보기"} aria-pressed={selected} onClick={onSelect}>{item.name}</button> : item.name}</h3></div><LuUtensils className="muted" /></div>
      {reviewed && <span className="badge review-badge"><LuCheck aria-hidden />리뷰를 작성했어요!</span>}
      <p className="restaurant-address"><LuMapPin aria-hidden /><span>주소</span><span>{item.address}</span></p>
      {item.distance_metres !== null && <p className="helper">{item.distance_basis} 약 {distanceLabel(item.distance_metres)}</p>}
      <p className="helper travel-time">{item.travel_label || "이동 시간 확인 불가"}</p>
      <div className="recommendation-reason"><h4>추천 이유</h4><p>{item.reason}</p></div>
      {!!item.confirmed_matches?.length && <div className="tags">{item.confirmed_matches.map((tag, i) => <span key={tag + i}>{tag}</span>)}</div>}
      <div className="restaurant-section">
        <div className="section-heading"><h4>방문 전 확인</h4><span className="badge">{item.opening.label}</span></div>
        <p className="helper">{item.opening.basis}</p>
        {item.visit_schedule && <p className="helper visit-schedule">{item.visit_schedule.date} {item.visit_schedule.basis} 일정 · {item.visit_schedule.summary}</p>}
        <p className="restaurant-phone"><LuPhone aria-hidden />전화번호 {dial && /^\+?\d+$/.test(dial) ? <a href={"tel:" + dial}>{phone}</a> : <span>{phone || "정보 없음"}</span>}</p>
        <RestaurantHours restaurant={item} />
        {item.hours_source && <p className="source">등록된 영업 정보 {item.hours_source_url ? <a href={item.hours_source_url} target="_blank" rel="noreferrer">{item.hours_source}</a> : item.hours_source}{item.hours_checked_at && " · " + checkedTime(item.hours_checked_at)}</p>}
      </div>
      <div className="restaurant-section"><h4>추천 메뉴와 예상 금액</h4>
        {item.menu_combination ? <>
          <ul className="menu-list">{item.menu_combination.items.map((menu) => <li key={menu.menu_id}><span>{menu.name} × {menu.quantity}</span><strong>{money(menu.price * menu.quantity)}</strong></li>)}</ul>
          <div className="menu-total"><span>{item.menu_combination.party_size ? item.menu_combination.party_size + "명 " : ""}예상 총액<strong>{money(item.menu_combination.total)}</strong></span>{item.menu_combination.per_person != null && <span>1인당<strong>{money(item.menu_combination.per_person)}</strong></span>}</div>
          <p className="helper">{item.menu_combination.basis}</p>
        </> : <p className="helper">{item.recommended_menu ? item.recommended_menu + " · " : "추천 메뉴 확인 필요 · "}{item.budget_note || "예상 금액 확인 필요"}</p>}
        {item.menus.length > 0 && <details className="menu-details"><summary>확인한 메뉴 및 출처 {item.menus.length}개</summary>{item.menus.map((menu) => <div className="menu-source" key={menu.id}><p>{menu.name} · {menu.price === null || !menu.is_current ? "가격 확인 필요" : money(menu.price)}{menu.price_conflict && " · 출처 불일치"}</p><FactSources sources={menu.sources || [{ name: menu.source, url: menu.source_url, checked_at: menu.checked_at }]} /></div>)}</details>}
      </div>
      {item.review_summary.length > 0 && <div className="restaurant-section"><h4>이웃 리뷰에서</h4>{item.review_summary.slice(0, 2).map((review) => <Link href={"/community/" + review.id} className="review-excerpt" key={review.id}><span>★ {review.rating} · {checkedTime(review.created_at)}</span><p>{review.excerpt}</p></Link>)}</div>}
      <div className="restaurant-links"><a className="button secondary small" href={item.map_url} target="_blank" rel="noreferrer">지도 보기<LuArrowUpRight /></a><a className="button primary small" href={item.directions_url} target="_blank" rel="noreferrer">길찾기<LuArrowUpRight /></a></div>
      <p className="source">{item.source_url ? <a href={item.source_url} target="_blank" rel="noreferrer">{item.source}</a> : item.source} · {checkedTime(item.checked_at)}</p>
    </article>
  );
}
