import type { ReactNode } from "react";
import { Sidebar, Topbar } from "@/components/sidebar";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/server";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const auth = await requireAdmin();

  if (!auth.ok) {
    redirect("/login");
  }

  // NOTE: The root layout (src/app/layout.tsx) already mounts <Providers>
  // (a single QueryClientProvider + AuthProvider). Nesting another <Providers>
  // here would create a second, isolated QueryClient — causing cache
  // divergence and the "No QueryClient set" runtime exception in hooks
  // mounted under a different client instance.
  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="lg:pl-64">
        <Topbar />
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
