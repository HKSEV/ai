import Link from "next/link";
import {
  LuArrowUpRight,
  LuCheck, LuMapPin,
  LuPhone,
  LuUtensils
} from "react-icons/lu";
import type { Restaurant } from "@/app/types/Service";
import { checkedTime, distanceLabel, money } from "@/app/lib/format";

const section = "mt-[1.15rem] border-t border-[#eeeee4] pt-[.95rem]";
const sectionTitle = "mb-[.6rem]";
const sectionHelp = "helper text-[.67rem] mobile:text-[.72rem]";
const linkButton = "button button-small flex-1 text-[.7rem]";

export default function RestaurantCard({
  restaurant: item, index, reviewed, selected, onSelect
}: {
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
    <article className={`
      mb-4 rounded-2xl border bg-paper p-5 shadow-surface compact:p-4
      mobile:p-[1.2rem] ${selected ? "border-forest" : "border-line"}
    `}>
      <div className="flex items-start gap-[.65rem]">
        <span className="rounded-lg bg-coral-soft px-2 pt-[.4rem]
        pb-[.3rem] text-[.8rem] leading-[1.35] font-[750] text-coral">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[.68rem] leading-[1.5] text-muted">
            {item.category}{item.is_demo && " · 개발 예시"}
          </p>
          <h3 className="text-[1.08rem] leading-[1.4] wrap-anywhere
          mobile:text-[1.15rem]">
            {onSelect
            ? (
              <button
              type="button"
              className="block p-0 text-left hover:underline
              hover:underline-offset-[.2em]"
              aria-label={item.name + " 추천 지도에서 보기"}
              aria-pressed={selected}
              onClick={onSelect}>
                {item.name}
              </button>
            ) : item.name}
          </h3>
        </div>
        <LuUtensils className="mt-1 text-muted"/>
      </div>
      {reviewed && (
        <span className="badge mt-[.65rem] gap-[.3rem]">
          <LuCheck aria-hidden/>리뷰를 작성했어요!
        </span>
      )}
      <p className="mt-3 mb-[.35rem] flex items-start gap-[.4rem] text-xs
      leading-[1.55] text-muted">
        <LuMapPin className="mt-[.15em]" aria-hidden/>
        <span className="shrink-0">주소</span>
        <span>{item.address}</span>
      </p>
      {item.distance_metres !== null && (
        <p className="helper">
          {item.distance_basis} 약 {distanceLabel(item.distance_metres)}
        </p>
      )}
      <p className="helper">{item.travel_label || "이동 시간 확인 불가"}</p>
      <div className="mt-[.85rem] mb-[.65rem] rounded-[.6rem] bg-[#F3F4EAAA]
      px-[.9rem] py-[.8rem] text-[.78rem] leading-[1.65] text-[#4C6250]">
        <h4 className="mb-[.3rem] text-[.72rem] font-bold text-forest">
          추천 이유
        </h4>
        <p>{item.reason}</p>
      </div>
      {!!item.confirmed_matches?.length && (
        <div className="flex flex-wrap gap-[.3rem]">
          {item.confirmed_matches.map((tag, i) => (
            <span className="rounded-full bg-forest-soft px-[.6rem] py-[.2rem]
            text-[.65rem] text-forest" key={tag + i}>
              {tag}
            </span>
          ))}
        </div>
      )}
      <div className={section}>
        <h4>방문 전 확인</h4>
        <p className="helper text-[.7rem]">
          {item.source_url
          ? "영업시간은 상세정보에서 확인하세요."
          : "영업시간은 매장에 문의하세요."}
        </p>
        <p className="mt-[.6rem] mb-[.4rem] flex flex-wrap items-center
        gap-[.35rem] text-[.76rem] text-muted">
          <LuPhone aria-hidden/>전화번호
          {dial && /^\+?\d+$/.test(dial)
          ? (
            <a
            className="text-forest underline underline-offset-[.15em]"
            href={"tel:" + dial}>
              {phone}
            </a>
          ) : <span>{phone || "정보 없음"}</span>}
        </p>
      </div>
      <div className={section}>
        <h4 className={sectionTitle}>추천 메뉴와 예상 금액</h4>
        {order ? (
          <>
            <ul>
              {order.items.map((menu, i) => (
                <li
                className="flex justify-between gap-[.7rem] py-1 text-[.74rem]"
                key={menu.menu_id ?? i}>
                  <span>{menu.name} × {menu.quantity}</span>
                  {menu.price != null && (
                    <strong className="font-semibold whitespace-nowrap">
                      {money(menu.price * menu.quantity)}
                    </strong>
                  )}
                </li>
              ))}
            </ul>
            {order.total !== null ? (
              <div className="mt-[.7rem] flex justify-between rounded-lg
              bg-forest-soft p-3 text-[.65rem] text-forest
              [&_strong]:block [&_strong]:text-[.95rem]">
                <span>
                  {order.party_size ? order.party_size + "명 " : ""}예상 총액
                  <strong>{money(order.total)}</strong>
                </span>
                {order.per_person != null && (
                  <span>
                    1인당<strong>{money(order.per_person)}</strong>
                  </span>
                )}
              </div>
            ) : <p className={sectionHelp}>예상 금액 확인 필요</p>}
            <p className={sectionHelp}>{order.basis}</p>
          </>
        ) : (
          <p className={sectionHelp}>
            {item.recommended_menu
            ? item.recommended_menu + " · "
            : "추천 메뉴 확인 필요 · "}
            {item.budget_note || "예상 금액 확인 필요"}
          </p>
        )}
        {item.menus.length > 0 && (
          <details className="mt-3 text-[.68rem] text-muted">
            <summary className="cursor-pointer">
              확인한 메뉴 및 출처 {item.menus.length}개
            </summary>
            {item.menus.map((menu) => (
              <div className="my-[.6rem]" key={menu.id}>
                <p>
                  {menu.name} · {menu.price === null || !menu.is_current
                  ? "가격 확인 필요" : money(menu.price)}
                </p>
                <small className="text-[.59rem] text-[#92968C]">
                  {menu.source_url ? (
                    <a
                    className="underline underline-offset-3"
                    href={menu.source_url}
                    target="_blank"
                    rel="noreferrer">
                      {menu.source}
                    </a>
                  ) : menu.source} · {checkedTime(menu.checked_at)}
                </small>
              </div>
            ))}
          </details>
        )}
      </div>
      {item.review_summary.length > 0 && (
        <div className={section}>
          <h4 className={sectionTitle}>이웃 리뷰에서</h4>
          {item.review_summary.slice(0, 2).map((review) => (
            <Link
            href={"/community/" + review.id}
            className="mt-[.6rem] block border-l-2 border-[#d3dccb]
            pl-[.6rem] text-[.7rem]"
            key={review.id}>
              <span className="text-[.61rem] text-coral">
                ★ {review.rating} · {checkedTime(review.created_at)}
              </span>
              <p className="mt-[.2rem] line-clamp-2 text-muted">
                {review.excerpt}
              </p>
            </Link>
          ))}
        </div>
      )}
      <div className="mt-[1.2rem] flex gap-[.55rem]">
        {item.source_url && (
          <a
          className={linkButton + " button-secondary"}
          href={item.source_url}
          target="_blank"
          rel="noreferrer">
            상세정보<LuArrowUpRight/>
          </a>
        )}
        <a
        className={linkButton + " button-primary"}
        href={item.directions_url}
        target="_blank"
        rel="noreferrer">
          길찾기<LuArrowUpRight/>
        </a>
      </div>
    </article>
  );
};
