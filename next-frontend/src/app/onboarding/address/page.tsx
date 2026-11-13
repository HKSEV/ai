"use client";

import { useDispatch } from "react-redux";
import AuthGuard from "@/components/layout/AuthGuard";
import AddressForm from "@/components/map/AddressForm";
import { completeAddressSetup } from "@/store/authSlice";

export default function AddressOnboardingPage() {
  const dispatch = useDispatch();
  return (
    <AuthGuard addressSetup>
      <main className="grid min-h-dvh animate-enter place-items-center p-[1.2rem]">
        <section className="surface w-full max-w-[41rem]">
          <div className="mb-8">
            <h1 className="text-[1.9rem] mobile:text-[1.5rem]">
              첫 산책의 출발지를 지정해 주세요
            </h1>
            <p className="mt-[.6rem] text-[.86rem] text-muted">
              선택한 위치를 기본 주소로 저장해 주변 음식점 탐색에 활용합니다.
            </p>
          </div>
          <AddressForm
            defaultAddress
            onSaved={() => dispatch(completeAddressSetup())}
          />
        </section>
      </main>
    </AuthGuard>
  );
}
