import type { ChatResponse } from "@/app/types/Chat";

// 기존 백엔드 주소와 요청 형식을 공통으로 관리합니다.
export async function requestChat(message: string): Promise<ChatResponse> {
  const response = await fetch("http://localhost:8000/api/chat", {
    method: "POST",
    headers: { "Content-type": "application/json" },
    body: JSON.stringify({ message }),
  });

  if (!response.ok)
    throw new Error("서버 에러가 발생했습니다");

  return response.json();
};
