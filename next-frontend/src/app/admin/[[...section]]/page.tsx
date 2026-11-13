import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import type { User } from "@/app/types/Service";
import AdminLayout from "@/components/admin/AdminLayout";
import Dashboard from "@/components/admin/Dashboard";
import PromptManager from "@/components/admin/PromptManager";
import UserManager from "@/components/admin/UserManager";
import RestaurantManager from "@/components/admin/RestaurantManager";

export const metadata: Metadata = { title: "관리자" };

const pages = {
  overview: Dashboard,
  ai: PromptManager,
  users: UserManager,
  restaurants: RestaurantManager,
};

export default async function AdminPage({ params }: { params: Promise<{ section?: string[] }> }) {
  const store = await cookies();
  const session = store.get("nowon_session");
  if (!session) redirect("/");
  const backend = (process.env.BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
  const response = await fetch(backend + "/api/auth/me", {
    headers: { Cookie: "nowon_session=" + encodeURIComponent(session.value) },
    cache: "no-store", signal: AbortSignal.timeout(6000),
  }).catch(() => null);
  if (response?.status === 401) redirect("/");
  const user: User | null = response?.ok ? await response.json().catch(() => null) : null;
  if (!user) return <main className="content-page"><p className="inline-error" role="alert">로그인 상태를 확인하지 못했습니다. 잠시 후 새로고침해 주세요.</p></main>;
  if (user.role !== "ADMIN") redirect("/mypage");
  if (user.address_setup_pending) redirect("/onboarding/address");

  const { section = [] } = await params;
  const [key = "overview"] = section;
  if (section.length > 1 || !Object.hasOwn(pages, key)) notFound();
  if (section[0] === "overview") redirect("/admin");
  const Page = pages[key as keyof typeof pages];
  return <AdminLayout><Page /></AdminLayout>;
}
