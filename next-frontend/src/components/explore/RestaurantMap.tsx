"use client";

import { useEffect, useRef } from "react";
import { hasCoordinates, type KakaoMarker } from "@/app/lib/kakaoMap";
import type { Restaurant } from "@/app/types/Service";
import useKakaoMap from "@/components/map/useKakaoMap";

export default function RestaurantMap({ answerId, restaurants, selected, onSelect }: {
  answerId: number;
  restaurants: Restaurant[];
  selected: { id: number } | null;
  onSelect: (selection: { answer: number; id: number }) => void;
}) {
  const { element, instance, error } = useKakaoMap();
  const markers = useRef(new Map<number, KakaoMarker>());

  useEffect(() => {
    if (!instance) return;
    const { map, maps } = instance;
    const positions = new maps.LatLngBounds();
    const places = new Map<number, KakaoMarker>();
    const listeners = restaurants.filter(hasCoordinates).map((item) => {
      const position = new maps.LatLng(item.latitude, item.longitude);
      const marker = new maps.Marker({ map, position, title: item.name });
      const click = () => onSelect({ answer: answerId, id: item.id });
      maps.event.addListener(marker, "click", click);
      positions.extend(position);
      places.set(item.id, marker);
      return { marker, click };
    });
    markers.current = places;
    if (places.size === 1) map.setCenter(listeners[0].marker.getPosition());
    else if (places.size > 1) map.setBounds(positions, 38, 25, 25, 25);
    return () => {
      for (const { marker, click } of listeners) {
        maps.event.removeListener(marker, "click", click);
        marker.setMap(null);
      }
      markers.current = new Map();
    };
  }, [answerId, instance, onSelect, restaurants]);

  useEffect(() => {
    if (!instance || selected === null) return;
    const item = restaurants.find((item) => item.id === selected.id);
    const marker = markers.current.get(selected.id);
    if (!item || !marker) return;
    const { map, maps } = instance;
    const content = document.createElement("div");
    content.className = "grid max-w-56 gap-[.2rem] py-[.55rem] pr-[1.65rem] pl-[.65rem] text-xs leading-[1.5] whitespace-normal text-navy";
    const name = document.createElement("strong");
    const address = document.createElement("span");
    name.textContent = item.name;
    address.textContent = item.address;
    content.append(name, address);
    const info = new maps.InfoWindow({ content, removable: true });
    map.panTo(marker.getPosition());
    info.open(map, marker);
    return () => info.close();
  }, [instance, restaurants, selected]);

  return <div className="mb-3">
    <div ref={element} className="map-surface h-60" role="region" aria-label="추천 음식점 지도" hidden={!!error} />
    {error ? <p className="helper" role="status">{error}</p> : !instance && <p className="helper" role="status">지도를 불러오는 중입니다.</p>}
  </div>;
}
