"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import { api, errorMessage } from "@/app/lib/api";
import AuthGuard from "@/components/layout/AuthGuard";
import AuthSplash, { AUTH_SPLASH_DURATION } from "@/components/layout/AuthSplash";
import { ErrorState, Loading } from "@/components/ui/States";
import type { RootState } from "@/store/store";

function Welcome() {
  const router = useRouter();
  const nickname = useSelector((state: RootState) => state.auth.user?.nickname || "");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<Promise<{ show_welcome: boolean }> | null>(null);
  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    // Keep the same one-time request when React re-runs this effect during development.
    request.current ??= api("/api/auth/welcome", { method: "POST" });
    request.current.then(({ show_welcome }) => {
      if (!active) return;
      if (!show_welcome) {
        router.replace("/explore");
        return;
      }
      setShow(true);
      timer = window.setTimeout(() => router.replace("/explore"), AUTH_SPLASH_DURATION);
    }).catch((failure) => {
      if (active) setError(errorMessage(failure));
    });
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [router]);
  if (error) return <ErrorState message={error} retry={() => window.location.reload()}/>;
  return show
    ? <AuthSplash nickname={nickname} returning/>
    : <Loading text="산책을 준비하고 있어요."/>;
}

export default function WelcomePage() {
  return (
    <AuthGuard>
      <Welcome/>
    </AuthGuard>
  );
}
