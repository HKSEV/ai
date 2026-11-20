import { LuFootprints, LuPartyPopper } from "react-icons/lu";

export const AUTH_SPLASH_DURATION = 1600;

export default function AuthSplash({
  nickname,
  returning = false
}: {
  nickname: string;
  returning?: boolean;
}) {
  const Icon = returning ? LuFootprints : LuPartyPopper;
  return (
    <main className="grid min-h-dvh place-items-center p-[1.2rem]">
      <section className="surface w-full max-w-[30rem] py-10 text-center" role="status">
        <span className="mx-auto mb-5 grid size-16 place-items-center rounded-full
          bg-forest-soft text-[1.9rem] text-forest motion-safe:animate-splash">
          <Icon aria-hidden/>
        </span>
        <h1 className="text-[1.65rem] motion-safe:animate-splash motion-safe:[animation-delay:70ms]
          mobile:text-[1.35rem]">
          {returning ? "환영합니다" : "가입을 축하해요!"}
        </h1>
        <p className="mt-3 text-sm wrap-anywhere text-muted motion-safe:animate-splash
          motion-safe:[animation-delay:140ms]">
          {nickname}님의 {returning ? "맛집 산책을 이어가요." : "첫 맛집 산책을 시작해요."}
        </p>
      </section>
    </main>
  );
}
