"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from "react";
import { usePathname } from "next/navigation";
import { LuCheck, LuX } from "react-icons/lu";

const ToastContext = createContext<(message: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [message, setMessage] = useState("");
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useRef<HTMLDivElement>(null);
  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setClosing(true);
    timer.current = setTimeout(() => {
      setMessage("");
      setClosing(false);
    }, 140);
  }, []);
  const notify = useCallback(
    (value: string) => {
      if (timer.current) clearTimeout(timer.current);
      setMessage(value);
      setClosing(false);
      timer.current = setTimeout(dismiss, 4500);
    },
    [dismiss]
  );
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );
  useEffect(() => {
    const node = toast.current;
    if (!node) return;
    const viewport = window.visualViewport;
    const navigation = document.querySelector("[data-mobile-navigation]");
    const compose = document.querySelector("[data-chat-composer]");
    const updatePosition = () => {
      if (window.innerWidth > 700) {
        node.style.removeProperty("bottom");
        return;
      }
      const gap = 12;
      const top = viewport?.offsetTop || 0;
      const bottom = Math.min(
        window.innerHeight,
        top + (viewport?.height || window.innerHeight)
      );
      const nav = navigation?.getBoundingClientRect();
      const composer = compose?.getBoundingClientRect();
      const usableBottom = nav?.height ? Math.min(nav.top, bottom) : bottom;
      let edge = usableBottom - gap;
      if (
        composer &&
        composer.top < edge &&
        composer.bottom > edge - node.offsetHeight &&
        composer.top - gap - node.offsetHeight >= top
      ) {
        edge = composer.top - gap;
      }
      node.style.bottom = Math.max(gap, window.innerHeight - edge) + "px";
    };
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updatePosition);
    if (navigation) observer?.observe(navigation);
    if (compose) observer?.observe(compose);
    observer?.observe(node);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, { passive: true });
    viewport?.addEventListener("resize", updatePosition);
    viewport?.addEventListener("scroll", updatePosition);
    updatePosition();
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition);
      viewport?.removeEventListener("resize", updatePosition);
      viewport?.removeEventListener("scroll", updatePosition);
    };
  }, [message, pathname]);
  return (
    <ToastContext value={notify}>
      {children}
      {message && (
        <div
          ref={toast}
          data-closing={closing || undefined}
          role="status"
          className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-1/2
          z-100 flex w-max max-w-[min(calc(100vw-2rem),36rem)] -translate-x-1/2
          animate-toast items-center gap-[.6rem] rounded-[.8rem] bg-forest-dark
          py-[.65rem] pr-[.8rem] pl-4 text-[.84rem] leading-[1.5] text-white
          shadow-[0_8px_40px_#0002] data-closing:animate-dismiss
          mobile:bottom-[calc(1rem+env(safe-area-inset-bottom))] mobile:text-[.8rem]">
          <LuCheck aria-hidden/>
          <span className="min-w-0 pt-[.1rem]">{message}</span>
          <button
            type="button"
            className="grid size-8 flex-none place-items-center rounded-[.4rem]
            hover:bg-white/10"
            aria-label="알림 닫기"
            onClick={dismiss}>
            <LuX/>
          </button>
        </div>
      )}
    </ToastContext>
  );
}
