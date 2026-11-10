"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { LuCheck, LuX } from "react-icons/lu";

const ToastContext = createContext<(message: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((value: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(value);
    timer.current = setTimeout(() => setMessage(""), 4500);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <ToastContext value={notify}>
      {children}
      {message && <div className="toast" role="status"><LuCheck /><span>{message}</span><button aria-label="알림 닫기" onClick={() => setMessage("")}><LuX /></button></div>}
    </ToastContext>
  );
}
