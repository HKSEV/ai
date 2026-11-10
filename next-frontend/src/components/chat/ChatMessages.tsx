"use client";

import type { RefObject } from "react";
import ReactMarkdown from "react-markdown";
import { FaRobot } from "react-icons/fa";
import type { Message } from "@/app/types/Chat";

interface ChatMessagesProps {
  messages: Message[];
  isLoading: boolean;
  messagesEndRef: RefObject<HTMLDivElement | null>;
};

export default function ChatMessages({ messages, isLoading, messagesEndRef }: ChatMessagesProps) {
  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
      {messages.map((msg) => (
        <div
        key={msg.id}
        className={`flex items-end space-x-2 ${
          msg.sender === "user" ? "justify-end" : "justify-start"
        }`}>
          {msg.sender === "ai" && (
            <div className="w-9 h-9 rounded-2xl bg-[#1e2c4f]/80 backdrop-blur-md flex items-center justify-center shrink-0 shadow-md text-slate-200 border border-white/10">
              <FaRobot size={16} />
            </div>
          )}

          <div
          className={`max-w-[85%] sm:max-w-[75%] px-4 py-3 rounded-2xl text-sm sm:text-base leading-relaxed shadow-lg backdrop-blur-md ${
            msg.sender === "user"
              ? "bg-[#2563eb]/90 text-white rounded-br-none shadow-blue-900/30 border border-blue-400/20"
              : "bg-[#17223b]/80 text-slate-200 rounded-bl-none shadow-md border border-white/10"
          }`}>
            <div className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown>{msg.text}</ReactMarkdown>
            </div>
          </div>
        </div>
      ))}

      {isLoading && (
        <div className="flex items-end space-x-2 justify-start">
          <div className="w-9 h-9 rounded-2xl bg-[#1e2c4f]/80 backdrop-blur-md flex items-center justify-center shrink-0 text-slate-200 border border-white/10">
            <FaRobot size={16} />
          </div>
          <div className="bg-[#17223b]/80 backdrop-blur-md px-4 py-3 rounded-2xl rounded-bl-none shadow-md flex items-center space-x-2 border border-white/10">
            <div className="w-2.5 h-2.5 bg-[#fde047] rounded-full animate-bounce [animation-delay:-0.3s]"></div>
            <div className="w-2.5 h-2.5 bg-[#fde047] rounded-full animate-bounce [animation-delay:-0.15s]"></div>
            <div className="w-2.5 h-2.5 bg-[#fde047] rounded-full animate-bounce"></div>
            <span className="text-xs text-slate-300 ml-1 font-medium">최적의 장소 분석 중...</span>
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};
