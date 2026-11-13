"use client";

import { useEffect, useState } from "react";
import { locationSupported, NOWON_STATION, type KakaoLatLng } from "@/app/lib/kakaoMap";
import type { MapLocation } from "@/app/types/Service";
import useKakaoMap from "./useKakaoMap";

export default function AddressMapPicker({
  initial,
  location,
  onChange
}: {
  initial: MapLocation | null;
  location: MapLocation | null;
  onChange: (location: MapLocation | null) => void;
}) {
  const { element, instance, error } = useKakaoMap();
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState("");
  useEffect(() => {
    if (!instance) return;
    const { map, maps } = instance;
    const center = initial || NOWON_STATION;
    const position = new maps.LatLng(center.latitude, center.longitude);
    map.setCenter(position);
    const marker = new maps.Marker({
      map,
      position,
      draggable: true,
      title: "선택한 주소 위치"
    });
    const geocoder = new maps.services.Geocoder();
    let request = 0;
    const select = (position: KakaoLatLng) => {
      const coordinates = { latitude: position.getLat(), longitude: position.getLng() };
      marker.setPosition(position);
      const current = ++request;
      onChange(null);
      setLookupError("");
      if (!locationSupported(coordinates)) {
        setLookingUp(false);
        setLookupError("지도에서 국내 주소를 선택해 주세요.");
        return;
      }
      setLookingUp(true);
      geocoder.coord2Address(
        coordinates.longitude,
        coordinates.latitude,
        (result, status) => {
          if (current !== request) return;
          setLookingUp(false);
          const address =
            result?.[0]?.road_address?.address_name ||
            result?.[0]?.address?.address_name;
          if (status === maps.services.Status.OK && address)
            onChange({ address, ...coordinates });
          else
            setLookupError(
              "주소를 찾지 못했습니다. 지도에서 다른 지점을 선택해 주세요."
            );
        }
      );
    };
    const click = (event: { latLng: KakaoLatLng }) => select(event.latLng);
    const drag = () => select(marker.getPosition());
    maps.event.addListener(map, "click", click);
    maps.event.addListener(marker, "dragend", drag);
    return () => {
      request++;
      maps.event.removeListener(map, "click", click);
      maps.event.removeListener(marker, "dragend", drag);
      marker.setMap(null);
    };
  }, [initial, instance, onChange]);

  return (
    <div className="grid min-w-0 gap-[.65rem]">
      <p className="helper">지도를 누르거나 마커를 움직여 주소를 지정해 주세요.</p>
      <div
        ref={element}
        className="map-surface h-[clamp(13rem,39dvh,20rem)]"
        role="region"
        aria-label="주소 지정 지도"
        hidden={!!error}
      />
      {!instance && !error && (
        <p className="helper" role="status">
          지도를 불러오는 중입니다.
        </p>
      )}
      {(error || lookupError) && (
        <p className="inline-error" role="alert">
          {error || lookupError}
        </p>
      )}
      <label>
        선택한 주소
        <input
          className="field"
          readOnly
          value={location?.address || ""}
          placeholder={
            lookingUp ? "주소를 확인하는 중입니다." : "지도에서 지점을 선택해 주세요."
          }
        />
      </label>
    </div>
  );
}
