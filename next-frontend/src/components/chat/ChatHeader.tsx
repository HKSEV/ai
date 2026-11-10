"use client";

import { FaRobot, FaMapMarkerAlt, FaMap } from "react-icons/fa";

interface ChatHeaderProps {
  selectedDistrict: string;
  showMap: boolean;
  onSelectDistrict: (district: string) => void;
};

export default function ChatHeader({
  selectedDistrict,
  showMap,
  onSelectDistrict,
}: ChatHeaderProps) {
  return (
    <header className="flex flex-wrap justify-between items-center px-6 py-4 bg-[#17223b]/60 backdrop-blur-md text-slate-100 shrink-0 gap-4 shadow-sm border-b border-white/5">
      <div className="flex items-center space-x-3.5">
        <div className="w-11 h-11 rounded-2xl bg-[#1e2c4f]/80 backdrop-blur-md flex items-center justify-center shadow-inner text-[#fde047] text-xl border border-white/10">
          <FaRobot />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#fde047] flex items-center gap-2 drop-shadow-sm">
            AI <span className="text-white text-xl font-bold">로컬 어시스턴트</span>
          </h1>
          <p className="text-xs text-slate-400">지역 맞춤형 맛집 및 학원 추천 플랫폼</p>
        </div>
      </div>

      <div className="flex items-center space-x-3">
        {/* 지역 선택 셀렉트 */}
        <div className="flex items-center space-x-2 bg-[#131b2e]/80 backdrop-blur-md px-3.5 py-2 rounded-2xl shadow-inner cursor-pointer border border-white/10">
          <FaMapMarkerAlt className="text-red-400 text-xs" />
          <span className="text-xs text-slate-400">지역:</span>
          <select
          value={selectedDistrict}
          onChange={(e) => onSelectDistrict(e.target.value)}
          className="bg-transparent text-xs font-semibold text-[#fde047] focus:outline-none cursor-pointer">
            <option value="노원구" className="bg-[#131b2e] text-white">
              노원구
            </option>
            <option value="도봉구" className="bg-[#131b2e] text-white">
              도봉구
            </option>
            <option value="강북구" className="bg-[#131b2e] text-white">
              강북구
            </option>
            <option value="중랑구" className="bg-[#131b2e] text-white">
              중랑구
            </option>
            <option value="성북구" className="bg-[#131b2e] text-white">
              성북구
            </option>
          </select>
        </div>

        {/* 상태 배지 */}
        <div className="text-xs bg-[#1e2c4f]/80 backdrop-blur-md text-[#fde047] px-3.5 py-2 rounded-2xl font-semibold shadow-inner hidden sm:flex items-center gap-2 border border-white/10">
          <FaMap className="text-xs text-[#fde047]" />
          <span>{showMap ? "지도 연동 활성화" : "AI 대화 모드"}</span>
        </div>
      </div>
    </header>
  );
};
