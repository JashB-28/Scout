import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained .next/standalone server for a small Docker image.
  output: "standalone",
};

export default nextConfig;
