import "@/assets/css/Global.styles.css";
import type { Metadata } from "next";
import ReduxProvider from "@/store/ReduxProvider";
import ToastProvider from "@/components/ui/ToastProvider";
import IconTooltips from "@/components/ui/IconTooltips";

export const metadata: Metadata = {
  title: { default: "노원맛집산책 | 가까운 동네, 새로운 한 끼", template: "%s | 노원맛집산책" },
  description: "취향과 예산에 맞는 노원구의 한 끼를 AI와 함께 찾아보세요.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body><ReduxProvider><ToastProvider>{children}</ToastProvider></ReduxProvider><IconTooltips /></body></html>;
}
