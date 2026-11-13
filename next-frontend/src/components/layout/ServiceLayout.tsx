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

const desktopLink = "flex items-center gap-2 border-b-[3px] border-transparent pt-[3px] text-[.87rem] font-semibold text-muted aria-[current=page]:border-forest aria-[current=page]:text-forest";
const mobileLink = "flex flex-1 flex-col items-center gap-1 px-[.4rem] py-[.15rem] text-[.62rem] text-[#99a18f] aria-[current=page]:font-bold aria-[current=page]:text-forest [&>svg]:text-[1.2rem]";

export default function ServiceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useSelector((state: RootState) => state.auth.user);
  const dispatch = useDispatch();
  const toast = useToast();
  const nav = (className: string) => menus.map(({ href, label, icon: Icon }) => (
    <Link key={href} href={href} className={className} aria-current={pathname.startsWith(href) ? "page" : undefined}><Icon /><span>{label}</span></Link>
  ));
  const logout = async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
      dispatch(clearUser()); dispatch(resetChat()); router.replace("/");
    } catch (error) { toast(errorMessage(error)); }
  };
  return (
    <div>
      <header className="flex h-[86px] items-center justify-between gap-6 border-b border-line bg-paper px-[max(2rem,calc((100vw-1440px)/2))] compact:px-6 mobile:h-[72px] mobile:gap-[.7rem] mobile:px-[1.1rem]">
        <Link className="brand mobile:text-[1rem]" href="/explore">
          <span className="brand-mark"><LuLeaf /></span>
          <span>노원맛집산책<small className="mt-[.1rem] block text-[.58rem] leading-[1.4] font-medium tracking-[.03em] text-muted mobile:text-[.51rem]">가까운 동네, 새로운 한 끼</small></span>
        </Link>
        <nav className="flex h-full gap-8 compact:gap-[1.3rem] mobile:hidden" aria-label="주요 메뉴">{nav(desktopLink)}</nav>
        <div className="flex items-center gap-2">
          <Link href="/mypage" className="max-w-40 truncate text-[.75rem] tablet:hidden">{user?.nickname}</Link>
          <button className="icon-button" aria-label="로그아웃" onClick={logout}><LuLogOut /></button>
        </div>
      </header>
      <main key={pathname} className="min-h-[calc(100dvh-170px)] animate-enter">{children}</main>
      <footer className="m-auto flex max-w-[1440px] items-center gap-2 border-t border-line px-8 py-6 text-[.68rem] text-muted mobile:mx-[1.1rem] mobile:px-0 mobile:pt-5 mobile:pb-26 mobile:text-[.57rem]">
        <LuLeaf />우리 동네의 한 끼를, 조금 더 다정하게.<span className="ml-auto font-semibold text-forest mobile:hidden">노원맛집산책</span>
      </footer>
      <nav data-mobile-navigation className="fixed inset-x-0 bottom-0 z-40 hidden justify-around border-t border-line bg-[#fffefaf5] px-2 pt-[.65rem] pb-[calc(.55rem+env(safe-area-inset-bottom))] backdrop-blur-[10px] mobile:flex" aria-label="모바일 주요 메뉴">
        {nav(mobileLink)}
      </nav>
    </div>
  );
}
