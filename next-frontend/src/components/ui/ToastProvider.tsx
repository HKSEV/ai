"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { LuCheck, LuX } from "react-icons/lu";

const ToastContext = createContext<(message: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState("");
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setClosing(true);
    timer.current = setTimeout(() => { setMessage(""); setClosing(false); }, 140);
  }, []);
  const notify = useCallback((value: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(value); setClosing(false);
    timer.current = setTimeout(dismiss, 4500);
  }, [dismiss]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return (
    <ToastContext value={notify}>
      {children}
      {message && <div className="toast" data-closing={closing || undefined} role="status"><LuCheck /><span>{message}</span><button aria-label="알림 닫기" onClick={dismiss}><LuX /></button></div>}
    </ToastContext>
  );
}
