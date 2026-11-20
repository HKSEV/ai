"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { hasCoordinates, type KakaoLatLng } from "@/app/lib/kakaoMap";
import { postPath } from "@/app/lib/paths";
import type { Coordinates, JourneyVisit } from "@/app/types/Service";
import useKakaoMap from "@/components/map/useKakaoMap";
import { Empty, ErrorState, Loading } from "@/components/ui/States";

type JourneyEntry = JourneyVisit & { order: number };
type MappedVisit = JourneyEntry & Coordinates;

function JourneyMap({
  visits,
  selected,
  onSelect
}: {
  visits: MappedVisit[];
  selected?: MappedVisit;
  onSelect: (id: number) => void;
}) {
  const { element, instance, error } = useKakaoMap();
  const buttons = useRef(new Map<number, HTMLButtonElement>());
  useEffect(() => {
    if (!instance) return;
    const { map, maps } = instance;
    const bounds = new maps.LatLngBounds();
    const groups = new Map<string, { position: KakaoLatLng; content: HTMLDivElement }>();
    const markers = new Map<number, HTMLButtonElement>();
    for (const visit of visits) {
      const key = visit.latitude + "," + visit.longitude;
      let group = groups.get(key);
      if (!group) {
        const position = new maps.LatLng(visit.latitude, visit.longitude);
        const content = document.createElement("div");
        content.className = "flex max-h-24 w-max max-w-36 flex-wrap justify-center gap-1 " +
          "overflow-auto rounded-xl bg-paper p-1 shadow-md";
        group = { position, content };
        groups.set(key, group);
        bounds.extend(position);
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = "grid h-8 min-w-8 shrink-0 place-items-center rounded-full " +
        "bg-forest px-1 text-xs font-bold text-white aria-pressed:bg-forest-dark";
      button.ariaLabel = `${visit.order}번째 방문 ${visit.restaurant_name} ${visit.visited_on}`;
      button.textContent = String(visit.order);
      button.onclick = () => onSelect(visit.id);
      group.content.append(button);
      markers.set(visit.id, button);
    }
    buttons.current = markers;
    const locations = [...groups.values()];
    const overlays = locations.map(({ position, content }) =>
      new maps.CustomOverlay({ map, position, content, clickable: true, yAnchor: 0 })
    );
    const fit = () => {
      if (locations.length === 1) {
        map.setLevel(4);
        map.setCenter(locations[0].position);
      } else if (locations.length > 1) {
        const bottom = Math.max(45, ...locations.map(({ content }) => content.offsetHeight + 10));
        const sides = Math.max(45, ...locations.map(({ content }) => Math.ceil(content.offsetWidth / 2) + 10));
        map.setBounds(bounds, 70, sides, bottom, sides);
      }
    };
    fit();
    const resize = new ResizeObserver(fit);
    if (element.current) resize.observe(element.current);
    return () => {
      resize.disconnect();
      overlays.forEach((overlay) => overlay.setMap(null));
      markers.forEach((button) => { button.onclick = null; });
      buttons.current = new Map();
    };
  }, [element, instance, onSelect, visits]);

  useEffect(() => {
    if (!instance) return;
    buttons.current.forEach((button, id) => button.setAttribute("aria-pressed", String(id === selected?.id)));
    if (!selected) return;
    const { map, maps } = instance;
    const content = document.createElement("div");
    content.className = "grid max-w-52 gap-1 p-2 text-xs leading-relaxed whitespace-normal text-navy";
    const name = document.createElement("strong");
    const day = document.createElement("time");
    name.textContent = `${selected.order}. ${selected.restaurant_name}`;
    day.dateTime = selected.visited_on;
    day.textContent = selected.visited_on;
    content.append(name, day);
    if (selected.reviews.length) {
      const rating = document.createElement("span");
      rating.textContent = selected.reviews.map((review) => "★ " + review.rating).join(" · ");
      content.append(rating);
    }
    const position = new maps.LatLng(selected.latitude, selected.longitude);
    const popup = new maps.InfoWindow({ position, content, removable: false, disableAutoPan: true });
    popup.open(map);
    return () => popup.close();
  }, [instance, selected, visits]);

  return (
    <>
      <div
      ref={element}
      className="map-surface h-[clamp(15rem,42dvh,22rem)]"
      role="region"
      aria-label="나의 여정 지도"
      hidden={!!error}/>
      {error ? <p className="helper" role="status">{error}</p> : !instance && (
        <p className="helper" role="status">지도를 불러오는 중입니다.</p>
      )}
    </>
  );
}

export default function MyJourney({
  data,
  loading,
  error,
  reload
}: {
  data?: JourneyVisit[];
  loading: boolean;
  error?: string;
  reload: () => void;
}) {
  const entries = useMemo(() => data?.map((visit, index) => ({ ...visit, order: index + 1 })) || [], [data]);
  const mapped = useMemo(() => entries.filter(hasCoordinates), [entries]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const select = useCallback((id: number) => setSelectedId((current) => current === id ? null : id), []);
  return (
    <section className="surface mt-6 mobile:mt-[1.2rem]" aria-labelledby="visit-journey-title">
      <div className="section-heading">
        <h2 className="section-title" id="visit-journey-title">나의 여정</h2>
      </div>
      {loading && <Loading text="방문 기록을 불러오고 있어요."/>}
      {error && <ErrorState message={error} retry={reload}/>}
      {data?.length === 0 && (
        <Empty compact title="아직 남긴 방문 기록이 없어요." text="방문 기록을 남기면 여기에 표시됩니다."/>
      )}
      {entries.length > 0 && (
        <div className="grid gap-3">
          {mapped.length > 0 && (
            <JourneyMap visits={mapped} selected={mapped.find(({ id }) => id === selectedId)} onSelect={select}/>
          )}
          <ol className="grid max-h-64 gap-2 overflow-y-auto" aria-label="방문 순서">
            {entries.map((visit) => {
              const label = `${visit.order}. ${visit.restaurant_name}`;
              return (
                <li key={visit.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-forest-soft px-3 py-2">
                  <div className="grid min-w-0 gap-1">
                    {hasCoordinates(visit) ? (
                      <button
                        type="button"
                        className="text-left text-sm font-bold wrap-anywhere text-forest-dark hover:underline
                        aria-pressed:underline"
                        aria-pressed={selectedId === visit.id}
                        onClick={() => select(visit.id)}>
                        {label}
                      </button>
                    ) : <strong className="text-sm wrap-anywhere">{label}</strong>}
                    <span className="text-xs text-muted">
                      <time dateTime={visit.visited_on}>{visit.visited_on}</time>
                      {!hasCoordinates(visit) && " · 지도 위치 정보 없음"}
                    </span>
                  </div>
                  {visit.reviews.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {visit.reviews.map((review) => (
                        <Link
                          key={review.id}
                          className="text-xs font-bold text-coral underline underline-offset-2"
                          href={postPath(review.id)}
                          aria-label={`${visit.order}번째 방문 리뷰 별점 ${review.rating}점`}>
                          ★ {review.rating}
                        </Link>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
