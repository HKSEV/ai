import Link from "next/link";
import { LuArrowUpRight, LuCheck, LuMapPin, LuPhone, LuUtensils } from "react-icons/lu";
import type { OpeningPeriod, Restaurant, Weekday } from "@/app/types/Service";
import { checkedTime, distanceLabel, money } from "@/app/lib/format";

const weekdays: [Weekday, string][] = [["mon", "월"], ["tue", "화"], ["wed", "수"], ["thu", "목"], ["fri", "금"], ["sat", "토"], ["sun", "일"]];

function periodLabel(period?: OpeningPeriod) {
  if (period?.closed) return "휴무";
  if (!period?.open || !period.close) return "정보 없음";
  const end = period.close <= period.open ? "다음 날 " + period.close : period.close;
  const pause = period.break_start && period.break_end ? " · 휴식 " + period.break_start + "–" + period.break_end : "";
  return period.open + "–" + end + pause;
}

function RestaurantHours({ restaurant: item }: { restaurant: Restaurant }) {
  const dated = { ...item.hours?.exceptions };
  for (const date of item.closed_dates || []) dated[date] = { closed: true };
  const exceptions = Object.keys(dated).sort();
  const hasWeeklyHours = weekdays.some(([day]) => item.hours?.[day]);
  if (!hasWeeklyHours && !exceptions.length) return <p className="helper">요일별 영업시간 및 날짜별 예외 정보 없음</p>;
  return (
    <details className="restaurant-hours">
      <summary>영업시간 자세히</summary>
      <p>요일별 영업시간</p>
      {hasWeeklyHours ? <dl>{weekdays.map(([day, label]) => <div key={day}><dt>{label}</dt><dd>{periodLabel(item.hours?.[day])}</dd></div>)}</dl> : <p className="helper">정보 없음</p>}
      <p>날짜별 예외 영업시간</p>
      {exceptions.length ? <dl>{exceptions.map((date) => <div key={date}><dt>{date}</dt><dd>{periodLabel(dated[date])}</dd></div>)}</dl> : <p className="helper">정보 없음</p>}
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
      <p className="restaurant-address"><LuMapPin aria-hidden /><span>{item.address}</span></p>
      {item.distance_metres !== null && <p className="helper">{item.distance_basis} 약 {distanceLabel(item.distance_metres)} · 실제 이동 시간 정보 없음</p>}
      <div className="recommendation-reason"><h4>추천 이유</h4><p>{item.reason}</p></div>
      {!!item.confirmed_matches?.length && <div className="tags">{item.confirmed_matches.map((tag, i) => <span key={tag + i}>{tag}</span>)}</div>}
      <div className="restaurant-section">
        <div className="section-heading"><h4>방문 전 확인</h4><span className="badge">{item.opening.label === "확인 필요" ? "정보 없음" : item.opening.label}</span></div>
        <p className="helper">{item.opening.basis}</p>
        <p className="restaurant-phone"><LuPhone aria-hidden />전화번호 {dial && /^\+?\d+$/.test(dial) ? <a href={"tel:" + dial}>{phone}</a> : <span>{phone || "정보 없음"}</span>}</p>
        <RestaurantHours restaurant={item} />
        <p className="source">영업 정보 {item.hours_source_url ? <a href={item.hours_source_url} target="_blank" rel="noreferrer">{item.hours_source}</a> : item.hours_source || "정보 없음"}{item.hours_checked_at && " · " + checkedTime(item.hours_checked_at)}</p>
      </div>
      <div className="restaurant-section"><h4>메뉴와 예상 금액</h4>
        {item.menu_combination ? <>
          <ul className="menu-list">{item.menu_combination.items.map((menu) => <li key={menu.menu_id}><span>{menu.name} × {menu.quantity}</span><strong>{money(menu.price * menu.quantity)}</strong></li>)}</ul>
          <div className="menu-total"><span>{item.menu_combination.party_size}명 예상 총액<strong>{money(item.menu_combination.total)}</strong></span><span>1인당<strong>{money(item.menu_combination.per_person)}</strong></span></div>
          <p className="helper">{item.menu_combination.basis}</p>
        </> : <p className="helper">{item.budget_note || "메뉴 가격 또는 인원 정보가 없어 금액을 계산할 수 없어요."}</p>}
        {item.menus.length > 0 && <details className="menu-details"><summary>등록된 메뉴 및 출처 {item.menus.length}개</summary>{item.menus.map((menu) => <div className="menu-source" key={menu.id}><p>{menu.name} · {menu.price === null ? "가격 정보 없음" : money(menu.price)}{!menu.is_current && " · 최신 가격 확인 필요"}</p><small>{menu.source_url ? <a href={menu.source_url} target="_blank" rel="noreferrer">{menu.source}</a> : menu.source} · {checkedTime(menu.checked_at)}</small></div>)}</details>}
      </div>
      {item.review_summary.length > 0 && <div className="restaurant-section"><h4>이웃 리뷰에서</h4>{item.review_summary.slice(0, 2).map((review) => <Link href={"/community/" + review.id} className="review-excerpt" key={review.id}><span>★ {review.rating} · {checkedTime(review.created_at)}</span><p>{review.excerpt}</p></Link>)}</div>}
      <div className="restaurant-links"><a className="button secondary small" href={item.map_url} target="_blank" rel="noreferrer">지도 보기<LuArrowUpRight /></a><a className="button primary small" href={item.directions_url} target="_blank" rel="noreferrer">길찾기<LuArrowUpRight /></a></div>
      <p className="source">{item.source_url ? <a href={item.source_url} target="_blank" rel="noreferrer">{item.source}</a> : item.source} · {checkedTime(item.checked_at)}</p>
    </article>
  );
}
