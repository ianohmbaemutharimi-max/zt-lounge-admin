"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { create } from "zustand";
import { Menu, X, Bell, CircleUserRound } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { NAV_ITEMS } from "@/lib/constants/nav";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/lib/query-keys";

export const useSidebar = create<{ open: boolean; toggle: () => void; close: () => void }>((set) => ({
  open: false,
  toggle: () => set((s) => ({ open: !s.open })),
  close: () => set({ open: false }),
}));

function BrandMark() {
  return (
    <div className="flex items-center gap-3 px-5 py-5">
      <Image
        src="/images/logo/zt-lounge-logo.png"
        alt="ZT Lounge"
        width={40}
        height={40}
        className="rounded-full ring-1 ring-gold/40"
      />
      <div>
        <p className="text-sm font-semibold tracking-wide text-white">ZT Lounge</p>
        <p className="text-[11px] uppercase tracking-[0.2em] text-gold">Admin</p>
      </div>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { open, close } = useSidebar();

  const nav = (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-6">
      {NAV_ITEMS.map((item) => {
        const active =
          item.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={close}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
              active
                ? "bg-gold/10 font-medium text-gold"
                : "text-stone-400 hover:bg-panel-2 hover:text-stone-100"
            )}
          >
            <item.icon className={cn("h-4.5 w-4.5", active && "text-gold")} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-edge bg-panel lg:flex">
        <BrandMark />
        {nav}
        <div className="border-t border-edge px-5 py-4 text-xs text-muted">
          ZT Lounge Meru · Control Center
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden" onClick={close}>
          <aside
            className="flex h-full w-72 flex-col border-r border-edge bg-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pr-4">
              <BrandMark />
              <button onClick={close} className="rounded-lg p-2 text-muted hover:text-white" aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
          </aside>
        </div>
      )}
    </>
  );
}

export function Topbar() {
  const { toggle } = useSidebar();
  const { data: notifs } = useQuery({
    queryKey: queryKeys.notifications.all(),
    queryFn: () => api.list("notifications"),
  });
  const unread = (notifs ?? []).filter((n: any) => !n.isRead).length;

  // Render the date only after mount to avoid hydration mismatch
  // (server and client may format the locale differently).
  const [today, setToday] = useState<string>("");
  /* eslint-disable react-hooks/set-state-in-effect -- intentional: hydration-safe date formatting */
  useEffect(() => {
    setToday(
      new Date().toLocaleDateString("en-KE", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    );
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-edge bg-ink/90 px-4 backdrop-blur sm:px-6">
      <div className="flex items-center gap-3">
        <button onClick={toggle} className="rounded-lg p-2 text-stone-300 hover:bg-panel-2 lg:hidden" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
        <p className="hidden text-sm text-muted sm:block" aria-live="polite">
          {today}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button
          className="relative rounded-lg p-2 text-stone-300 hover:bg-panel-2"
          aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-black"
              aria-hidden="true"
            >
              {unread}
            </span>
          )}
        </button>
        <div className="flex items-center gap-2 rounded-xl border border-edge bg-panel px-3 py-1.5">
          <CircleUserRound className="h-5 w-5 text-gold" aria-hidden="true" />
          <span className="text-sm text-stone-200">Admin</span>
        </div>
      </div>
    </header>
  );
}
