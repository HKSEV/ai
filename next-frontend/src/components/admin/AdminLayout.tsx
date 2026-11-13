"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LuArrowLeft, LuChartNoAxesCombined, LuChevronDown, LuLeaf, LuMenu, LuMoon, LuSparkles, LuSun, LuUsers, LuUtensils } from "react-icons/lu";

const menus = [
  { href: "/admin", label: "통계", icon: LuChartNoAxesCombined },
  { href: "/admin/ai", label: "AI 관리", icon: LuSparkles },
  { href: "/admin/users", label: "유저 관리", icon: LuUsers },
  { href: "/admin/restaurants", label: "식당 관리", icon: LuUtensils },
];
const themeKey = "nowon-admin-theme";
const themeEvent = "nowon:admin-theme";

function subscribeTheme(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(themeEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(themeEvent, onChange);
  };
}

function readTheme() {
  try { return localStorage.getItem(themeKey) === "dark" ? "dark" : "light"; }
  catch { return "light"; }
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "light");
  const pathname = usePathname();
  const toggleTheme = () => {
    try {
      localStorage.setItem(themeKey, theme === "dark" ? "light" : "dark");
      window.dispatchEvent(new Event(themeEvent));
    } catch { /* Storage can be unavailable in a restricted browser. */ }
  };
  return (
    <div className="admin-theme min-h-dvh bg-cream text-navy" data-theme={theme}>
      <div className="mx-auto grid min-h-dvh max-w-[1700px] grid-cols-[15.5rem_minmax(0,1fr)] mobile:grid-cols-1 mobile:content-start">
        <aside className="border-r border-line bg-(--color-admin-sidebar) px-4 py-6 mobile:border-r-0 mobile:border-b mobile:px-4 mobile:py-3">
          <div className="flex items-center justify-between gap-2">
            <Link className="flex min-w-0 items-center gap-2.5 font-bold" href="/admin">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-(--color-admin-accent) text-white"><LuLeaf size={18} /></span>
              <span>노원맛집산책<small className="block text-[.65rem] text-muted">관리자</small></span>
            </Link>
            <button type="button" className="button button-secondary button-small hidden mobile:inline-flex" aria-controls="admin-navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(!mobileOpen)}><LuMenu />메뉴<LuChevronDown className={mobileOpen ? "rotate-180" : ""} /></button>
          </div>
          <nav id="admin-navigation" aria-label="관리자 메뉴" className={"mt-8 grid gap-1 mobile:mt-4 " + (mobileOpen ? "mobile:grid" : "mobile:hidden")}>
            {menus.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMobileOpen(false)} aria-current={pathname === href ? "page" : undefined}
              className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-muted hover:bg-forest-soft hover:text-forest aria-[current=page]:bg-forest-soft aria-[current=page]:text-forest">
              <Icon size={18} />{label}
            </Link>)}
          </nav>
        </aside>
        <div className="min-w-0">
          <header className="flex min-h-16 flex-wrap items-center justify-between gap-2 border-b border-line bg-(--color-admin-sidebar) px-7 py-2 mobile:px-4">
            <Link href="/mypage" className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-muted hover:text-forest"><LuArrowLeft size={16} />마이페이지</Link>
            <button type="button" className="button button-secondary button-small" onClick={toggleTheme}>
              {theme === "dark" ? <><LuSun />라이트 모드</> : <><LuMoon />다크 모드</>}
            </button>
          </header>
          <main className="mx-auto w-full max-w-[1240px] px-8 py-7 mobile:px-4 mobile:py-5">{children}</main>
        </div>
      </div>
    </div>
  );
}
