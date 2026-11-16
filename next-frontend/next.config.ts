import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const basePath = "/group/one/3";
const kakaoKey = process.env.KAKAO_JAVASCRIPT_KEY || "";

export default function nextConfig(phase: string): NextConfig {
  const useServer = phase === PHASE_DEVELOPMENT_SERVER || process.env.NOWON_NEXT_SERVER === "true";
  if (!useServer) {
    return {
      env: { KAKAO_JAVASCRIPT_KEY: kakaoKey, NEXT_PUBLIC_BASE_PATH: basePath },
      output: "export",
      basePath,
      trailingSlash: true,
      images: { unoptimized: true },
    };
  }

  const backend = (process.env.BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
  return {
    env: { KAKAO_JAVASCRIPT_KEY: kakaoKey, NEXT_PUBLIC_BASE_PATH: "" },
    async rewrites() {
      return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
    },
    async headers() {
      return [{
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      }];
    },
    async redirects() {
      return [
        { source: "/community/:id(\\d+)/edit", destination: "/community/edit?id=:id", permanent: false },
        { source: "/community/:id(\\d+)", destination: "/community/detail?id=:id", permanent: false },
        { source: "/admin/overview", destination: "/admin", permanent: false },
      ];
    },
  };
}
