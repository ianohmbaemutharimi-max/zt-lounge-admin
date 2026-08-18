import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import { Sidebar, Topbar } from "@/components/sidebar";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/server";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const auth = await requireAdmin();

  if (!auth.ok) {
    redirect("/login");
  }

  return (
    <Providers>
      <div className="min-h-screen">
        <Sidebar />
        <div className="lg:pl-64">
          <Topbar />
          <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </Providers>
  );
}
