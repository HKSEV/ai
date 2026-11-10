"use client";

import type { KeyboardEvent } from "react";

interface ChatInputProps {
  inputText: string;
  isLoading: boolean;
  selectedDistrict: string;
  onInputChange: (text: string) => void;
  onKeyPress: (event: KeyboardEvent<HTMLInputElement>) => void;
  onSend: () => void;
};

export default function ChatInput({
  inputText,
  isLoading,
  selectedDistrict,
  onInputChange,
  onKeyPress,
  onSend,
}: ChatInputProps) {
  return (
    <div className="p-4 bg-[#131b2e]/60 backdrop-blur-md flex items-center space-x-3 shrink-0 shadow-inner border-t border-white/5">
      <input
      type="text"
      className="flex-1 bg-[#0d111a]/80 backdrop-blur-md rounded-2xl px-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#fde047] transition shadow-inner border border-white/10"
      placeholder={`${selectedDistrict} 맛집이나 학원을 물어보세요...`}
      value={inputText}
      onChange={(e) => onInputChange(e.target.value)}
      onKeyPress={onKeyPress}/>
      {/* 노란색 계열 전송 버튼 */}
      <button
      onClick={onSend}
      disabled={isLoading}
      className="bg-[#fde047] hover:bg-[#facc15] disabled:bg-slate-800 text-slate-950 px-6 py-3 rounded-2xl text-sm font-bold transition shadow-md cursor-pointer shrink-0">
        전송
      </button>
    </div>
  );
};
