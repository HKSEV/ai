"use client";

import { useEffect, useRef, useState } from "react";
import { loadKakaoMaps, NOWON_STATION, type KakaoMap, type KakaoMaps } from "@/app/lib/kakaoMap";

export default function useKakaoMap() {
  const element = useRef<HTMLDivElement>(null);
  const [instance, setInstance] = useState<{ map: KakaoMap; maps: KakaoMaps } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const container = element.current;
    if (!container) return;
    let disposed = false;
    let resize: ResizeObserver | undefined;
    loadKakaoMaps().then((maps) => {
      if (disposed) return;
      const center = new maps.LatLng(NOWON_STATION.latitude, NOWON_STATION.longitude);
      const map = new maps.Map(container, { center, level: 4 });
      resize = new ResizeObserver(() => {
        const center = map.getCenter();
        map.relayout();
        map.setCenter(center);
      });
      resize.observe(container);
      setInstance({ map, maps });
    }).catch((error: Error) => {
      if (!disposed) setError(error.message);
    });
    return () => {
      disposed = true;
      resize?.disconnect();
      container.replaceChildren();
    };
  }, []);

  return { element, instance, error };
}
