import type { NextConfig } from "next";

/**
 * ZT Lounge Admin — Next.js project-root anchor (Tailwind resolution fix).
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The admin app lives in a nested directory:
 *   .../zt-lounge-demo/zt-lounge-admin/   (this directory)
 *
 * Its `package.json` is the only package in this subtree that declares
 * `next`, `react`, and `tailwindcss`. Next.js 16 + Turbopack uses the
 * directory containing `next.config.{js,mjs,ts}` as the project root.
 *
 * Before this file existed, Turbopack walked UP the tree, landed in the
 * parent `zt-lounge-demo` directory (package "zt-lounge-demo-root"), and
 * tried to resolve `tailwindcss` from a `node_modules` that does NOT
 * contain it — producing:
 *
 *     error  Can't resolve 'tailwindcss' in '...\zt-lounge-demo'
 *
 * Because this file is present here, the root is pinned to THIS directory
 * and all `node_modules` resolution is anchored to
 * `zt-lounge-admin/node_modules`, where `tailwindcss@4.1.17`
 * (via `@tailwindcss/postcss@4.1.17`) is installed.
 *
 * DO NOT remove or relocate this file.
 *
 * DO NOT set a `root` under `experimental.turbopack`: Next 16.x's
 * `ExperimentalConfig` does NOT expose a `turbopack.root` option (the only
 * `experimental.*` turbopack keys are the `turbopackFileSystemCache*`,
 * `turbopackInferModuleSideEffects`, and `turbopackPluginRuntimeStrategy`
 * flags). Adding it is a hard TypeScript error
 * (`TS2353: 'turbopack' does not exist in type 'ExperimentalConfig'`) and
 * is unnecessary — file presence alone is the canonical, stable anchor.
 *
 * See: TAILWIND_ROOT_CAUSE_FIX_REPORT.md
 *      TAILWIND_PROJECT_ROOT_FIX_VERIFICATION.md
 */
const nextConfig: NextConfig = {
  // Keep `pg` (node-postgres) out of the bundle — it uses runtime-only Node
  // bindings and must remain external to both server and client bundles.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
