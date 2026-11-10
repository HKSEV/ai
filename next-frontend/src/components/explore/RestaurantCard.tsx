import Link from "next/link";
import { LuArrowUpRight, LuMapPin, LuUtensils } from "react-icons/lu";
import type { Restaurant } from "@/app/types/Service";
import { checkedTime, money } from "@/app/lib/format";

export default function RestaurantCard({ restaurant: item, index }: { restaurant: Restaurant; index: number }) {
  return (
    <article className="restaurant-card">
      <div className="restaurant-title"><span className="restaurant-number">{String(index + 1).padStart(2, "0")}</span><div><p className="card-eyebrow">{item.category}{item.is_demo && " · 개발 예시"}</p><h3>{item.name}</h3></div><LuUtensils className="muted" /></div>
      <p className="restaurant-address"><LuMapPin />{item.address}</p>
      {item.distance_metres !== null && <p className="helper">{item.distance_basis} 약 {item.distance_metres >= 1000 ? (item.distance_metres / 1000).toFixed(1) + "km" : item.distance_metres + "m"} · 실제 이동 시간 정보 없음</p>}
      <div className="recommendation-reason"><span>이런 점이 어울려요</span><p>{item.reason}</p></div>
      {!!item.confirmed_matches?.length && <div className="tags">{item.confirmed_matches.map((tag, i) => <span key={tag + i}>{tag}</span>)}</div>}
      <div className="restaurant-section"><div className="section-heading"><h4>방문 전 확인</h4><span className="badge">{item.opening.label}</span></div><p className="helper">{item.opening.basis}</p><p className="source">영업 정보: {item.hours_source || "정보 없음"} · {checkedTime(item.hours_checked_at)}</p></div>
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
