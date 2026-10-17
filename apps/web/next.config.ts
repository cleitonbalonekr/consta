import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@consta/core", "@consta/adapters"],
  // pdf.js loads its worker from its own folder at run time, so the server must not bundle it.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
