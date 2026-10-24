import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ["@vyve/engine"],
  serverExternalPackages: ["pg", "@remotion/renderer", "@remotion/bundler", "@anthropic-ai/sdk"],
  turbopack: { root: path.join(import.meta.dirname, "..", "..") },
  experimental: {
    serverActions: { bodySizeLimit: "600mb" },
  },
};

export default nextConfig;
