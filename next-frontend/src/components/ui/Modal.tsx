"use client";

import { useEffect, useRef, useState } from "react";
import { LuX } from "react-icons/lu";

export default function Modal({ title, onClose, children, busy = false, wide = false }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  busy?: boolean;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [closing, setClosing] = useState(false);
  const pressedBackdrop = useRef(false);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(onClose, window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 140);
    return () => clearTimeout(timer);
  }, [closing, onClose]);
  const close = () => setClosing(true);
  const dismiss = () => { if (!busy) close(); };
  return (
    <dialog ref={ref} className={"modal" + (wide ? " modal-wide" : "")} aria-label={title} data-closing={closing || undefined} onCancel={(event) => { event.preventDefault(); dismiss(); }}
            onPointerDown={(event) => { pressedBackdrop.current = event.target === event.currentTarget; }}
            onClick={(event) => { if (pressedBackdrop.current && event.target === event.currentTarget) dismiss(); }}>
      <div className="modal-content">
        <div className="section-heading"><h2>{title}</h2><button type="button" className="icon-button" aria-label="닫기" disabled={busy} onClick={dismiss}><LuX /></button></div>
        {typeof children === "function" ? children(close) : children}
      </div>
    </dialog>
  );
}
