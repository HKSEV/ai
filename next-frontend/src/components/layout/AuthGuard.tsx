"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import type { RootState } from "@/store/store";
import { ErrorState, Loading } from "@/components/ui/States";

export default function AuthGuard({ children, addressSetup = false }: { children: React.ReactNode; addressSetup?: boolean }) {
  const { status, error, user } = useSelector((state: RootState) => state.auth);
  const router = useRouter();
  const destination = status === "anonymous" ? "/" : status === "authenticated" && !!user?.address_setup_pending !== addressSetup
    ? (user?.address_setup_pending ? "/onboarding/address" : "/explore") : null;
  useEffect(() => { if (destination) router.replace(destination); }, [destination, router]);
  if (status === "error") return <ErrorState message={error || "로그인 상태를 확인하지 못했습니다."} retry={() => window.location.reload()} />;
  if (status !== "authenticated" || destination) return <Loading text="산책을 준비하고 있어요." />;
  return children;
}
