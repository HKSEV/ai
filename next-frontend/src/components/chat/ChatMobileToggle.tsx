"use client";

import { FaMap } from "react-icons/fa";
import type { MobileView } from "@/app/types/Chat";

interface ChatMobileToggleProps {
  mobileView: MobileView;
  messageCount: number;
  onToggle: () => void;
};

export default function ChatMobileToggle({
  mobileView,
  messageCount,
  onToggle,
}: ChatMobileToggleProps) {
  return (
    <div className="fixed bottom-6 right-6 z-50 sm:hidden">
      <button
      onClick={() => onToggle()}
      className="bg-[#fde047] hover:bg-[#facc15] text-slate-950 px-5 py-3 rounded-2xl font-bold shadow-2xl flex items-center space-x-2 text-sm active:scale-95 transition cursor-pointer backdrop-blur-md">
        {mobileView === "chat" ? (
          <>
            <FaMap className="text-slate-950" />
            <span>지도 보기</span>
            <span className="w-2 h-2 rounded-2xl bg-blue-600 animate-ping"></span>
          </>
        ) : (
          <>
            <span>💬 채팅 보기</span>
            {messageCount > 0 && (
              <span className="bg-slate-950 text-[#fde047] w-5 h-5 rounded-2xl text-xs flex items-center justify-center font-extrabold shadow-md">
                {messageCount}
              </span>
            )}
          </>
        )}
      </button>
    </div>
  );
};
