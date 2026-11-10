"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import type { RootState } from "@/store/store";
import { ErrorState, Loading } from "@/components/ui/States";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { status, error } = useSelector((state: RootState) => state.auth);
  const router = useRouter();
  useEffect(() => { if (status === "anonymous") router.replace("/"); }, [status, router]);
  if (status === "error") return <ErrorState message={error || "로그인 상태를 확인하지 못했습니다."} retry={() => window.location.reload()} />;
  if (status !== "authenticated") return <Loading text="산책을 준비하고 있어요." />;
  return children;
}
