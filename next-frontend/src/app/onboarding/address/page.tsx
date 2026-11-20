"use client";

import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { LuPartyPopper } from "react-icons/lu";
import { api, json } from "@/app/lib/api";
import type { User } from "@/app/types/Service";
import AuthGuard from "@/components/layout/AuthGuard";
import AddressForm from "@/components/map/AddressForm";
import { PreferenceFields, readPreferenceFields } from "@/components/mypage/ProfileFields";
import { setUser } from "@/store/authSlice";
import type { RootState } from "@/store/store";

export default function AddressOnboardingPage() {
  const dispatch = useDispatch();
  const user = useSelector((state: RootState) => state.auth.user);
  const [completed, setCompleted] = useState<User | null>(null);
  useEffect(() => {
    if (!completed) return;
    const timer = window.setTimeout(() => dispatch(setUser(completed)), 1600);
    return () => window.clearTimeout(timer);
  }, [completed, dispatch]);
  return (
    <AuthGuard addressSetup>
      <main className="grid min-h-dvh place-items-center p-[1.2rem]">
        {completed ? (
          <section
            className="surface w-full max-w-[30rem] py-10 text-center motion-safe:animate-enter"
            role="status">
            <span className="mx-auto mb-5 grid size-16 place-items-center rounded-full
              bg-forest-soft text-[1.9rem] text-forest">
              <LuPartyPopper aria-hidden/>
            </span>
            <h1 className="text-[1.65rem] mobile:text-[1.35rem]">가입을 축하해요!</h1>
            <p className="mt-3 text-sm text-muted">{completed.nickname}님의 첫 맛집 산책을 시작해요.</p>
          </section>
        ) : user && (
          <section className="surface w-full max-w-[41rem] motion-safe:animate-enter">
            <div className="mb-8">
              <h1 className="text-[1.9rem] mobile:text-[1.5rem]">
                첫 산책의 출발지와 취향을 알려 주세요
              </h1>
              <p className="mt-[.6rem] text-[.86rem] text-muted">
                기본 주소와 취향을 저장해 음식점 추천에 활용합니다.
              </p>
            </div>
            <AddressForm
              defaultAddress
              onSave={async (address, form) => {
                const result = await api<{ user: User; completed: boolean }>(
                  "/api/me/onboarding",
                  json("PUT", { address, ...readPreferenceFields(new FormData(form)) })
                );
                if (result.completed) setCompleted(result.user);
                else dispatch(setUser(result.user));
              }}>
              <PreferenceFields user={user}/>
            </AddressForm>
          </section>
        )}
      </main>
    </AuthGuard>
  );
}
