import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import type { User } from "@/app/types/Service";
import AdminLayout from "@/components/admin/AdminLayout";
import AuthGuard from "@/components/layout/AuthGuard";

export const metadata: Metadata = { title: "관리자" };

export default async function Layout({ children }: { children: React.ReactNode }) {
  if (process.env.NOWON_NEXT_SERVER === "true" || process.env.NODE_ENV === "development") {
    const session = (await cookies()).get("nowon_session");
    if (!session) redirect("/");
    const backend = (process.env.BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
    const response = await fetch(backend + "/api/auth/me", {
      headers: { Cookie: "nowon_session=" + encodeURIComponent(session.value) },
      cache: "no-store",
      signal: AbortSignal.timeout(6000)
    }).catch(() => null);
    if (response?.status === 401) redirect("/");
    const user: User | null = response?.ok
      ? await response.json().catch(() => null)
      : null;
    if (!user)
      return (
        <main className="content-page">
          <p className="inline-error" role="alert">
            로그인 상태를 확인하지 못했습니다. 잠시 후 새로고침해 주세요.
          </p>
        </main>
      );
    if (user.role !== "ADMIN") redirect("/mypage");
    if (user.address_setup_pending) redirect("/onboarding/address");
  }

  return (
    <AuthGuard adminOnly>
      <AdminLayout>{children}</AdminLayout>
    </AuthGuard>
  );
}
