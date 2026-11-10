"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import { LuCompass, LuLeaf, LuLogOut, LuMessageSquare, LuUserRound } from "react-icons/lu";
import { api, errorMessage } from "@/app/lib/api";
import type { RootState } from "@/store/store";
import { clearUser } from "@/store/authSlice";
import { resetChat } from "@/store/chatSlice";
import { useToast } from "@/components/ui/ToastProvider";

const menus = [
  { href: "/explore", label: "AI 탐색", icon: LuCompass },
  { href: "/community", label: "커뮤니티", icon: LuMessageSquare },
  { href: "/mypage", label: "마이페이지", icon: LuUserRound },
];

export default function ServiceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useSelector((state: RootState) => state.auth.user);
  const dispatch = useDispatch();
  const toast = useToast();
  const nav = menus.map(({ href, label, icon: Icon }) => (
    <Link key={href} href={href} className={pathname.startsWith(href) ? "active" : ""} aria-current={pathname.startsWith(href) ? "page" : undefined}><Icon /><span>{label}</span></Link>
  ));
  const logout = async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
      dispatch(clearUser()); dispatch(resetChat()); router.replace("/");
    } catch (error) { toast(errorMessage(error)); }
  };
  return (
    <div className="service-shell">
      <header className="site-header">
        <Link className="brand" href="/explore"><span className="brand-mark"><LuLeaf /></span><span>노원맛집산책<small>가까운 동네, 새로운 한 끼</small></span></Link>
        <nav className="desktop-nav" aria-label="주요 메뉴">{nav}</nav>
        <div className="header-account"><Link href="/mypage" className="nickname">{user?.nickname}</Link><button className="icon-button" aria-label="로그아웃" onClick={logout}><LuLogOut /></button></div>
      </header>
      <main className="service-main">{children}</main>
      <footer className="site-footer"><LuLeaf />우리 동네의 한 끼를, 조금 더 다정하게.<span>노원맛집산책</span></footer>
      <nav className="mobile-nav" aria-label="모바일 주요 메뉴">{nav}</nav>
    </div>
  );
}
