"use client";

import { useDispatch } from "react-redux";
import AuthGuard from "@/components/layout/AuthGuard";
import AddressForm from "@/components/map/AddressForm";
import { completeAddressSetup } from "@/store/authSlice";

export default function AddressOnboardingPage() {
  const dispatch = useDispatch();
  return <AuthGuard addressSetup>
    <main className="onboarding-page page-enter">
      <section className="surface onboarding-card">
        <div className="page-heading"><div><h1>첫 산책의 출발지를 지정해 주세요</h1><p>선택한 위치를 기본 주소로 저장해 주변 음식점 탐색에 활용합니다.</p></div></div>
        <AddressForm defaultAddress onSaved={() => dispatch(completeAddressSetup())} />
      </section>
    </main>
  </AuthGuard>;
}
