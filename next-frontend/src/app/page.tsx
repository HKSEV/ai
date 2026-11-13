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

const neighborhoods = ["공릉동", "상계동", "중계동", "월계동"];
const features = [
  { icon: LuCompass, title: "말하듯, 편하게 찾아요", lead: "“공릉동에서 조용한 데이트 식당”", detail: "원하는 한 끼를 자연스럽게 이야기해요." },
  { icon: LuMessageSquare, title: "이웃의 한 끼를 만나요", lead: "직접 남긴 리뷰와 서비스 사용 후기로", detail: "우리 동네의 맛을 함께 발견해요.", coral: true },
  { icon: LuLeaf, title: "취향이 쌓이는 산책", lead: "선호 음식과 직접 남긴 방문 기록으로", detail: "나에게 맞는 맛집을 찾아가요." },
];

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
    <div className="m-auto max-w-[1600px] animate-enter">
      <header className="flex h-24 items-center justify-between px-[6%] mobile:h-[76px] mobile:px-[1.3rem]">
        <Link href="/" className="brand mobile:text-[1.05rem]"><span className="brand-mark"><LuLeaf /></span><span>노원맛집산책</span></Link>
        <span className="text-[.75rem] text-muted mobile:hidden">우리 동네를 맛있게 걷는 방법</span>
      </header>
      <main>
        <section className="relative mx-8 min-h-[660px] overflow-hidden rounded-3xl bg-[#e9ebd9] wide:min-h-[730px] tablet:mx-[1.2rem] tablet:min-h-[630px] mobile:mx-0 mobile:min-h-[790px] mobile:overflow-visible mobile:rounded-none mobile:bg-cream mobile:pb-6">
          <div className="absolute inset-0 bg-[linear-gradient(90deg,#f5f2e8_4%,#f5f2e8eb_23%,#f5f2e840_49%,transparent_65%),url('/images/nowon-alley.webp')] bg-cover bg-right bg-no-repeat tablet:bg-center mobile:h-[420px] mobile:bg-[linear-gradient(0deg,var(--color-cream),#f8f6ef00_40%),url('/images/nowon-alley.webp')] mobile:bg-position-[64%_40%]"
               role="img" aria-label="초록빛 골목과 따뜻한 동네 식당, 정갈한 한 끼를 그린 일러스트" />
          <div className="relative z-1 max-w-[42rem] pt-20 pb-12 pl-[5%] wide:pt-24 tablet:pl-[4%] mobile:max-w-full mobile:px-6 mobile:pt-[340px] mobile:pb-0 mobile:text-center narrow:px-4">
            <span className="eyebrow rounded-full bg-[#fffefa90] px-[.85rem] py-[.4rem] tracking-[.04em] mobile:bg-[#fffefaab] mobile:px-[.8rem] mobile:py-[.35rem] mobile:text-[.63rem]"><LuSparkles />AI와 함께 발견하는 노원의 맛</span>
            <h1 className="mt-[1.55rem] mb-[1.4rem] text-[clamp(2.5rem,3.8vw,3.8rem)] leading-[1.4] tracking-[-.065em] text-forest-dark tablet:text-[3rem] mobile:my-4 mobile:text-[clamp(2rem,8vw,2.8rem)] mobile:leading-[1.5] narrow:text-[1.9rem]">오늘의 한 끼가<br />작은 산책이 되도록.</h1>
            <p className="text-base leading-[1.95] text-[#5c6d60] mobile:text-[.82rem]">익숙한 골목에도 새로운 맛이 있어요.<br />취향과 예산을 이야기하면,<br className="hidden mobile:inline" /> 당신에게 어울리는 한 끼를 찾아드릴게요.</p>
            <div className="mt-6 flex flex-wrap gap-[.45rem] mobile:mt-[1.2rem] mobile:justify-center">
              {neighborhoods.map((name) => <span key={name} className="rounded-full border border-[#7d8e6e44] bg-[#fffefa50] px-[.85rem] py-1 text-[.73rem] text-[#5b715e] mobile:text-[.67rem]">{name}</span>)}
            </div>
            <div className="mt-10 w-[22rem] max-w-full mobile:fixed mobile:inset-x-0 mobile:bottom-0 mobile:z-30 mobile:m-0 mobile:w-full mobile:border-t mobile:border-[#e5e7dc] mobile:bg-[#f8f6eff5] mobile:px-[1.3rem] mobile:pt-4 mobile:pb-[calc(.75rem+env(safe-area-inset-bottom))] mobile:backdrop-blur-[10px]">
              <button className="flex min-h-14 w-full items-center justify-center gap-[.65rem] rounded-[.8rem] bg-[#fee500] px-5 py-4 text-[.95rem] font-bold text-[#33261e] shadow-[0_4px_16px_#b6a32816] hover:not-disabled:bg-[#f4d900] mobile:min-h-[54px] mobile:text-[.9rem]" disabled={pending} onClick={login}>
                <RiKakaoTalkFill className="mr-auto" size={22} />{pending ? "카카오로 연결 중…" : "카카오로 시작하기"}<LuArrowUpRight className="ml-auto" />
              </button>
              <small className="mt-[.7rem] block text-center text-[.65rem] text-[#78816d] mobile:mt-[.55rem] mobile:text-[.58rem]">카카오 계정으로 간편하게, 나만의 맛집 산책을 시작하세요.</small>
            </div>
          </div>
          <span className="absolute right-8 bottom-[1.6rem] flex items-center gap-2 rounded-full bg-[#fffefaab] px-4 py-2 text-[.72rem] text-forest-dark backdrop-blur-[6px] mobile:top-4 mobile:right-4 mobile:bottom-auto mobile:px-[.7rem] mobile:py-[.4rem] mobile:text-[.6rem]"><LuFootprints />한 입의 발견, 한 걸음의 즐거움</span>
        </section>
        <section className="grid grid-cols-[1.15fr_repeat(3,1fr)] gap-12 px-[6%] py-22 compact:gap-6 tablet:grid-cols-3 tablet:gap-8 tablet:px-[5%] tablet:py-14 mobile:grid-cols-1 mobile:gap-[1.8rem] mobile:px-6 mobile:pt-8 mobile:pb-12">
          <div className="tablet:col-span-full mobile:mb-[.4rem]">
            <span className="eyebrow text-[.6rem]">A LITTLE DISCOVERY</span>
            <h2 className="mt-[.8rem] text-[1.7rem] text-forest-dark tablet:text-[1.5rem] mobile:text-[1.4rem]">맛있는 발견이<br className="tablet:hidden" />일상이 되는 곳</h2>
          </div>
          {features.map(({ icon: Icon, title, lead, detail, coral }) => <article key={title} className="mobile:relative mobile:pl-16">
            <span className={"mb-[1.1rem] grid size-[2.7rem] place-items-center rounded-[.9rem] text-[1.3rem] mobile:absolute mobile:top-[.1rem] mobile:left-0 mobile:size-[2.8rem] " + (coral ? "bg-coral-soft text-coral" : "bg-forest-soft text-forest")}><Icon /></span>
            <h3 className="mb-[.65rem] text-[1rem] mobile:text-[.92rem]">{title}</h3>
            <p className="text-[.8rem] leading-[1.9] text-muted mobile:text-[.77rem]">{lead}<br />{detail}</p>
          </article>)}
        </section>
      </main>
      <footer className="mx-[6%] flex flex-wrap items-center gap-4 border-t border-line pt-8 pb-12 text-[.75rem] text-muted mobile:mx-6 mobile:gap-x-4 mobile:gap-y-2 mobile:pb-[150px]">
        <span className="font-bold text-forest">노원맛집산책</span>
        <p>가까운 동네, 새로운 한 끼.</p>
        <small className="ml-auto text-[.65rem] mobile:mt-2 mobile:ml-0 mobile:w-full mobile:text-[.6rem]">음식점 정보는 출처와 확인 시각을 안내하며, 방문 전 확인을 권장해요.</small>
      </footer>
    </div>
  );
}
