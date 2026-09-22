import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@consta/core", "@consta/adapters"],
};

export default nextConfig;
