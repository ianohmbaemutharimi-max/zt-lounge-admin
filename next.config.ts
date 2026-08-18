import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This file establishes zt-lounge-admin as the Next.js project root.
  // Without next.config.ts, Turbopack walks up the directory tree and
  // resolves dependencies from the parent directory (zt-lounge-demo),
  // which lacks tailwindcss, next, and react dependencies.
  // Next.js automatically sets the project root to the directory
  // containing next.config.ts, ensuring all module resolution
  // occurs from this directory's node_modules.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
