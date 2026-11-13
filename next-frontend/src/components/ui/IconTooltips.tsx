"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

function iconControl(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const control = target.closest<HTMLElement>("button[aria-label], a[aria-label]");
  return control?.querySelector("svg") && !control.textContent?.trim() ? control : null;
}

export default function IconTooltips() {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  useEffect(() => {
    const tooltip = ref.current;
    if (!tooltip) return;
    let hovered: HTMLElement | null = null;
    let focused: HTMLElement | null = null;
    let active: HTMLElement | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const hide = () => {
      clearTimeout(timer);
      if (tooltip.hidePopover && tooltip.matches(":popover-open"))
        tooltip.hidePopover();
      tooltip.hidden = true;
    };
    const position = () => {
      if (!active?.isConnected) {
        hide();
        return;
      }
      const bounds = active.getBoundingClientRect();
      if (bounds.bottom <= 0 || bounds.top >= window.innerHeight) {
        hide();
        return;
      }
      const width = tooltip.offsetWidth;
      const height = tooltip.offsetHeight;
      const left = Math.max(
        8,
        Math.min(
          bounds.left + (bounds.width - width) / 2,
          window.innerWidth - width - 8
        )
      );
      const above = bounds.top - height - 7;
      tooltip.style.left = left + "px";
      tooltip.style.top = (above >= 8 ? above : bounds.bottom + 7) + "px";
    };
    const update = () => {
      const next = hovered || focused;
      if (active === next) return;
      hide();
      active = next;
      if (!next) return;
      timer = setTimeout(() => {
        if (!next.isConnected || active !== next) return;
        tooltip.textContent = next.getAttribute("aria-label");
        tooltip.hidden = false;
        if (tooltip.showPopover) tooltip.showPopover();
        position();
      }, 320);
    };
    const enter = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      hovered = iconControl(event.target);
      update();
    };
    const leave = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      hovered = iconControl(event.relatedTarget);
      update();
    };
    const focus = (event: FocusEvent) => {
      const control = iconControl(event.target);
      focused = control?.matches(":focus-visible") ? control : null;
      if (focused) hovered = null;
      update();
    };
    const blur = () => {
      focused = null;
      update();
    };
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        hovered = focused = null;
        update();
      }
    };
    const reposition = () => {
      if (!tooltip.hidden) position();
    };
    document.addEventListener("pointerover", enter, true);
    document.addEventListener("pointerout", leave, true);
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", blur);
    document.addEventListener("keydown", dismiss);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      hide();
      document.removeEventListener("pointerover", enter, true);
      document.removeEventListener("pointerout", leave, true);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", blur);
      document.removeEventListener("keydown", dismiss);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [pathname]);
  return (
    <div
      ref={ref}
      className="pointer-events-none fixed inset-auto z-110 m-0 w-max
      max-w-[calc(100vw-1rem)] rounded-[.4rem] border-0 bg-forest-dark px-[.55rem]
      pt-[.35rem] pb-[.28rem] text-[.7rem] leading-[1.45] text-white
      shadow-[0_3px_12px_#193e2e33]"
      role="tooltip"
      popover="manual"
      hidden
    />
  );
}
