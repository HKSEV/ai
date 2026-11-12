import Link from "next/link";
import { LuArrowUpRight, LuCheck, LuMapPin, LuPhone, LuUtensils } from "react-icons/lu";
import type { Restaurant } from "@/app/types/Service";
import { checkedTime, distanceLabel, money } from "@/app/lib/format";

export default function RestaurantCard({ restaurant: item, index, reviewed, selected, onSelect }: {
  restaurant: Restaurant;
  index: number;
  reviewed?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const phone = item.phone?.trim();
  const dial = phone?.replace(/[()\s.-]/g, "");
  const order = item.menu_combination;
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
        <h4>방문 전 확인</h4>
        <p className="restaurant-phone"><LuPhone aria-hidden />전화번호 {dial && /^\+?\d+$/.test(dial) ? <a href={"tel:" + dial}>{phone}</a> : <span>{phone || "정보 없음"}</span>}</p>
      </div>
      <div className="restaurant-section"><h4>추천 메뉴와 예상 금액</h4>
        {order ? <>
          <ul className="menu-list">
            {order.items.map((menu, i) => <li key={menu.menu_id ?? i}>
              <span>{menu.name} × {menu.quantity}</span>
              {menu.price != null && <strong>{money(menu.price * menu.quantity)}</strong>}
            </li>)}
          </ul>
          {order.total !== null ? <div className="menu-total">
            <span>{order.party_size ? order.party_size + "명 " : ""}예상 총액<strong>{money(order.total)}</strong></span>
            {order.per_person != null && <span>1인당<strong>{money(order.per_person)}</strong></span>}
          </div> : <p className="helper">예상 금액 확인 필요</p>}
          <p className="helper">{order.basis}</p>
        </> : <p className="helper">{item.recommended_menu ? item.recommended_menu + " · " : "추천 메뉴 확인 필요 · "}{item.budget_note || "예상 금액 확인 필요"}</p>}
        {item.menus.length > 0 && <details className="menu-details"><summary>확인한 메뉴 및 출처 {item.menus.length}개</summary>{item.menus.map((menu) => <div className="menu-source" key={menu.id}><p>{menu.name} · {menu.price === null || !menu.is_current ? "가격 확인 필요" : money(menu.price)}</p><small>{menu.source_url ? <a href={menu.source_url} target="_blank" rel="noreferrer">{menu.source}</a> : menu.source} · {checkedTime(menu.checked_at)}</small></div>)}</details>}
      </div>
      {item.review_summary.length > 0 && <div className="restaurant-section"><h4>이웃 리뷰에서</h4>{item.review_summary.slice(0, 2).map((review) => <Link href={"/community/" + review.id} className="review-excerpt" key={review.id}><span>★ {review.rating} · {checkedTime(review.created_at)}</span><p>{review.excerpt}</p></Link>)}</div>}
      <div className="restaurant-links">
        {item.source_url && <a className="button secondary small" href={item.source_url} target="_blank" rel="noreferrer">상세정보<LuArrowUpRight /></a>}
        <a className="button primary small" href={item.directions_url} target="_blank" rel="noreferrer">길찾기<LuArrowUpRight /></a>
      </div>
      <p className="helper restaurant-details-note">{item.source_url ? "영업시간은 상세정보에서 확인하세요." : "영업시간은 매장에 문의하세요."}</p>
    </article>
  );
}
