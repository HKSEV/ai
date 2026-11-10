"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import { LuArrowUpRight, LuCompass, LuFootprints, LuLeaf, LuMessageSquare, LuSparkles } from "react-icons/lu";
import { RiKakaoTalkFill } from "react-icons/ri";
import { api, errorMessage } from "@/app/lib/api";
import type { RootState } from "@/store/store";
import { useToast } from "@/components/ui/ToastProvider";

export default function Home() {
  const router = useRouter();
  const status = useSelector((state: RootState) => state.auth.status);
  const toast = useToast();
  const [pending, setPending] = useState(false);
  useEffect(() => { if (status === "authenticated") router.replace("/explore"); }, [status, router]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("login_error")) {
      toast("카카오 로그인을 완료하지 못했어요. 설정을 확인한 뒤 다시 시도해 주세요.");
      window.history.replaceState(null, "", "/");
    }
  }, [toast]);
  const login = async () => {
    setPending(true);
    try {
      const response = await api<{ authorization_url: string }>("/api/auth/kakao/authorize");
      window.location.assign(response.authorization_url);
    } catch (error) { toast(errorMessage(error)); setPending(false); }
  };
  return (
    <div className="landing">
      <header className="landing-header"><Link href="/" className="brand"><span className="brand-mark"><LuLeaf /></span><span>노원맛집산책</span></Link><span className="landing-tagline">우리 동네를 맛있게 걷는 방법</span></header>
      <main>
        <section className="landing-hero">
          <div className="hero-art" role="img" aria-label="초록빛 골목과 따뜻한 동네 식당, 정갈한 한 끼를 그린 일러스트" />
          <div className="hero-copy">
            <span className="eyebrow"><LuSparkles />AI와 함께 발견하는 노원의 맛</span>
            <h1>오늘의 한 끼가<br />작은 산책이 되도록.</h1>
            <p>익숙한 골목에도 새로운 맛이 있어요.<br />취향과 예산을 이야기하면,<br className="mobile-only" /> 당신에게 어울리는 한 끼를 찾아드릴게요.</p>
            <div className="neighborhoods"><span>공릉동</span><span>상계동</span><span>중계동</span><span>월계동</span></div>
            <div className="login-dock"><button className="kakao-button" disabled={pending} onClick={login}><RiKakaoTalkFill size={22} />{pending ? "카카오로 연결 중…" : "카카오로 시작하기"}<LuArrowUpRight /></button><small>카카오 계정으로 간편하게, 나만의 맛집 산책을 시작하세요.</small></div>
          </div>
          <span className="hero-caption"><LuFootprints />한 입의 발견, 한 걸음의 즐거움</span>
        </section>
        <section className="landing-features">
          <div className="feature-intro"><span className="eyebrow">A LITTLE DISCOVERY</span><h2>맛있는 발견이<br />일상이 되는 곳</h2></div>
          <article><span className="feature-icon"><LuCompass /></span><h3>말하듯, 편하게 찾아요</h3><p>“공릉동에서 조용한 데이트 식당”<br />원하는 한 끼를 자연스럽게 이야기해요.</p></article>
          <article><span className="feature-icon coral"><LuMessageSquare /></span><h3>이웃의 한 끼를 만나요</h3><p>직접 남긴 리뷰와 서비스 사용 후기로<br />우리 동네의 맛을 함께 발견해요.</p></article>
          <article><span className="feature-icon"><LuLeaf /></span><h3>취향이 쌓이는 산책</h3><p>선호 음식과 직접 남긴 방문 기록으로<br />나에게 맞는 맛집을 찾아가요.</p></article>
        </section>
      </main>
      <footer className="landing-footer"><span>노원맛집산책</span><p>가까운 동네, 새로운 한 끼.</p><small>음식점 정보는 출처와 확인 시각을 안내하며, 방문 전 확인을 권장해요.</small></footer>
    </div>
  );
}
