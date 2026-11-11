import type { Coordinates } from "@/app/types/Service";

export const NOWON_STATION = { latitude: 37.655, longitude: 127.0614 };

export interface KakaoLatLng {
  getLat(): number;
  getLng(): number;
}

interface KakaoBounds {
  extend(position: KakaoLatLng): void;
}

export interface KakaoMap {
  getCenter(): KakaoLatLng;
  setCenter(position: KakaoLatLng): void;
  panTo(position: KakaoLatLng): void;
  setLevel(level: number): void;
  setBounds(bounds: KakaoBounds, top?: number, right?: number, bottom?: number, left?: number): void;
  relayout(): void;
}

export interface KakaoMarker {
  getPosition(): KakaoLatLng;
  setPosition(position: KakaoLatLng): void;
  setMap(map: KakaoMap | null): void;
}

interface KakaoInfoWindow {
  open(map: KakaoMap, marker: KakaoMarker): void;
  close(): void;
}

type MapClick = (event: { latLng: KakaoLatLng }) => void;
type MarkerEvent = () => void;

interface GeocodedAddress {
  road_address?: { address_name: string } | null;
  address?: { address_name: string } | null;
}

export interface KakaoMaps {
  load(callback: () => void): void;
  LatLng: new (latitude: number, longitude: number) => KakaoLatLng;
  LatLngBounds: new () => KakaoBounds;
  Map: new (element: HTMLElement, options: { center: KakaoLatLng; level: number }) => KakaoMap;
  Marker: new (options: { position: KakaoLatLng; map: KakaoMap; draggable?: boolean; title?: string }) => KakaoMarker;
  InfoWindow: new (options: { content: HTMLElement; removable: boolean }) => KakaoInfoWindow;
  event: {
    addListener(target: KakaoMap, type: "click", listener: MapClick): void;
    addListener(target: KakaoMarker, type: "click" | "dragend", listener: MarkerEvent): void;
    removeListener(target: KakaoMap, type: "click", listener: MapClick): void;
    removeListener(target: KakaoMarker, type: "click" | "dragend", listener: MarkerEvent): void;
  };
  services: {
    Geocoder: new () => { coord2Address(x: number, y: number, callback: (result: GeocodedAddress[], status: string) => void): void };
    Status: { OK: string };
  };
}

declare global {
  interface Window {
    kakao?: { maps: KakaoMaps };
  }
}

let loading: Promise<KakaoMaps> | undefined;

export function loadKakaoMaps() {
  if (loading) return loading;
  const key = process.env.KAKAO_JAVASCRIPT_KEY?.trim();
  if (!key) return Promise.reject(new Error("카카오 지도 JavaScript 키를 설정해 주세요."));
  loading = new Promise<KakaoMaps>((resolve, reject) => {
    const script = document.createElement("script");
    let timer: number | undefined;
    const fail = () => {
      clearTimeout(timer);
      script.remove();
      reject(new Error("카카오 지도를 불러오지 못했습니다. JavaScript 키와 등록된 도메인을 확인해 주세요."));
    };
    const ready = () => {
      const maps = window.kakao?.maps;
      if (!maps?.load) { fail(); return; }
      timer = window.setTimeout(fail, 20000);
      maps.load(() => {
        if (!maps.Map || !maps.services) { fail(); return; }
        clearTimeout(timer);
        resolve(maps);
      });
    };
    if (window.kakao?.maps) { ready(); return; }
    const url = new URL("https://dapi.kakao.com/v2/maps/sdk.js");
    url.search = new URLSearchParams({ appkey: key, autoload: "false", libraries: "services" }).toString();
    script.src = url.href;
    script.async = true;
    script.onload = ready;
    script.onerror = fail;
    document.head.append(script);
  }).catch((error) => {
    loading = undefined;
    throw error;
  });
  return loading;
}

export function hasCoordinates<T extends { latitude: number | null; longitude: number | null }>(value: T): value is T & Coordinates {
  return value.latitude !== null && value.longitude !== null && Number.isFinite(value.latitude) && Number.isFinite(value.longitude);
}

export function locationSupported({ latitude, longitude }: Coordinates) {
  return latitude >= 33 && latitude <= 39 && longitude >= 124 && longitude <= 132;
}
