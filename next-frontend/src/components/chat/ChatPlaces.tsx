"use client";

import { FaMap, FaTimes } from "react-icons/fa";
import type { MobileView, PlaceInfo } from "@/app/types/Chat";

interface ChatPlacesProps {
  showMap: boolean;
  mobileView: MobileView;
  selectedDistrict: string;
  places: PlaceInfo[];
  onClose: () => void;
};

export default function ChatPlaces({
  showMap,
  mobileView,
  selectedDistrict,
  places,
  onClose,
}: ChatPlacesProps) {
  return (
    <div
    className={`w-full sm:w-1/2 h-full relative flex flex-col overflow-hidden bg-[#0d111a]/60 ${
      mobileView === "chat" && showMap ? "hidden sm:flex" : "flex"
    }`}>
      {/* 배경 지도 시뮬레이션 레이어 */}
      <div className="absolute inset-0 bg-[#0a0e17]/80 backdrop-blur-sm flex flex-col items-center justify-center overflow-hidden">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#3b82f6_1.5px,transparent_1.5px)] [background-size:28px_28px]"></div>
        <div className="text-blue-400/80 text-6xl mb-3 animate-pulse">🗺️</div>
        <p className="text-xs text-blue-300/80 font-mono tracking-widest bg-[#131b2e]/80 backdrop-blur-md px-4 py-2 rounded-2xl shadow-lg border border-white/10">
          [ Kakao Map Interactive Layer Active ]
        </p>
      </div>

      {/* 상단 컨트롤: 지도 아이콘 + 애니메이션 닫기 버튼 */}
      <div className="relative z-10 p-4 bg-[#131b2e]/80 backdrop-blur-md flex justify-between items-center shadow-md border-b border-white/5">
        <div className="flex items-center space-x-2 bg-[#0f172a]/80 backdrop-blur-md px-3.5 py-2 rounded-2xl shadow-inner border border-white/10">
          <FaMap className="text-blue-400 text-xs" />
          <span className="text-xs font-bold text-white">{selectedDistrict} 추천 장소 지도</span>
        </div>

        <button
        onClick={() => onClose()}
        className="group flex items-center space-x-2 bg-[#1e2c4f]/80 backdrop-blur-md hover:bg-red-500/20 hover:text-red-400 text-slate-200 px-3.5 py-2 rounded-2xl text-xs font-medium transition-all duration-300 cursor-pointer shadow-md transform active:scale-95 border border-white/10">
          <FaMap className="text-blue-400 text-sm group-hover:rotate-12 transition-transform duration-300" />
          <span className="max-w-0 overflow-hidden whitespace-nowrap group-hover:max-w-[100px] transition-all duration-300 ease-in-out opacity-0 group-hover:opacity-100">
            지도 닫기
          </span>
          <FaTimes className="text-sm transition-transform duration-300 group-hover:rotate-90" />
        </button>
      </div>

      {/* 토스트 스타일 장소 카드 리스트 */}
      <div className="relative z-10 flex-1 overflow-y-auto p-4 space-y-3">
        <div className="flex space-x-3 p-3 bg-[#131b2e]/80 backdrop-blur-md rounded-2xl text-xs text-slate-300 shadow-lg border border-white/10">
          <div className="flex items-center space-x-1.5">
            <span>🔵</span>
            <span className="font-semibold text-blue-300">공식 등록</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span>🟠</span>
            <span className="font-semibold text-[#fde047]">AI 추천/미등록</span>
          </div>
        </div>

        {places.length > 0 ? (
          places.map((place, index) => (
            <div
            key={index}
            className="p-4 bg-[#17223b]/80 backdrop-blur-md rounded-2xl shadow-xl hover:bg-[#17223b]/95 transition flex items-start space-x-3 text-left group cursor-pointer border border-white/10">
              <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 text-base shadow-md border border-white/10 ${
                place.is_registered
                  ? "bg-blue-500/20 text-blue-300"
                  : "bg-amber-500/20 text-[#fde047]"
              }`}>
                {place.is_registered ? "🔵" : "🟠"}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-bold text-white text-sm truncate group-hover:text-[#fde047] transition">
                    {place.name}
                  </h4>
                  <span
                  className={`text-[10px] px-2.5 py-0.5 rounded-2xl font-semibold shrink-0 border border-white/10 ${
                    place.is_registered
                      ? "bg-blue-500/20 text-blue-300"
                      : "bg-amber-500/20 text-[#fde047]"
                  }`}>
                    {place.is_registered ? "공식 등록" : "커스텀 추천"}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 truncate">
                  📍 {place.address} ({place.category})
                </p>
                <p className="text-xs text-slate-200 mt-2 bg-[#0f172a]/80 backdrop-blur-sm p-2.5 rounded-2xl shadow-inner leading-relaxed border border-white/5">
                  {place.description}
                </p>
              </div>
            </div>
          ))
        ) : (
          <div className="h-40 flex flex-col items-center justify-center text-center text-slate-400 bg-[#131b2e]/80 backdrop-blur-md rounded-2xl p-6 shadow-lg border border-white/10">
            <div className="text-3xl mb-2">🔍</div>
            <p className="text-xs text-slate-300">
              선택하신 지역의 장소 데이터를 불러오는 중이거나 표시할 항목이 없습니다.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
