"use client";

import { useEffect, useRef } from "react";
import { LuX } from "react-icons/lu";

export default function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); previous?.focus(); };
  }, []);
  return (
    <dialog ref={ref} className="modal" aria-label={title} onCancel={(event) => { event.preventDefault(); onClose(); }}
            onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal-content">
        <div className="section-heading"><h2>{title}</h2><button type="button" className="icon-button" aria-label="닫기" onClick={onClose}><LuX /></button></div>
        {children}
      </div>
    </dialog>
  );
}
