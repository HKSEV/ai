import type { NextConfig } from "next";

const basePath = "/group/one/3";

const nextConfig: NextConfig = {
  env: {
    KAKAO_JAVASCRIPT_KEY: process.env.KAKAO_JAVASCRIPT_KEY || "",
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
