import type { Metadata } from "next";
import AdminLayout from "@/components/admin/AdminLayout";
import AuthGuard from "@/components/layout/AuthGuard";

export const metadata: Metadata = { title: "관리자" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard adminOnly>
      <AdminLayout>{children}</AdminLayout>
    </AuthGuard>
  );
}
