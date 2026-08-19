import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Explicitly set the project root to this directory to prevent Turbopack
  // from walking up the directory tree and resolving from the parent.
  // The parent directory (zt-lounge-demo) lacks tailwindcss, next, and react.
  // This ensures all module resolution occurs from zt-lounge-admin/node_modules.
  experimental: {
    turbopack: {
      root: path.resolve(__dirname),
    },
  },
  serverExternalPackages: ["pg"],
};

export default nextConfig;
