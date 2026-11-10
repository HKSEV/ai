import AuthGuard from "@/components/layout/AuthGuard";
import ServiceLayout from "@/components/layout/ServiceLayout";

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AuthGuard><ServiceLayout>{children}</ServiceLayout></AuthGuard>;
}
