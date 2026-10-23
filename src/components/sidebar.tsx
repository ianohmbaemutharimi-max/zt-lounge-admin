"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { create } from "zustand";
import { Menu, X } from "lucide-react";
import { NAV_ENTRIES, type NavEntry } from "@/lib/constants/nav";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { LogoutButton } from "@/components/LogoutButton";
import { NotificationBell } from "@/components/notification-bell";
import { ContactInboxNav } from "@/components/contact-inbox-nav";
import { BrandLogo } from "@/components/BrandLogo";

export const useSidebar = create<{ open: boolean; toggle: () => void; close: () => void }>((set) => ({
  open: false,
  toggle: () => set((s) => ({ open: !s.open })),
  close: () => set({ open: false }),
}));

function BrandMark() {
  return (
    <div className="flex items-center gap-3 px-5 py-5">
      <BrandLogo imgClassName="h-10 w-10 ring-1 ring-gold/40" className="shrink-0" />
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
  const { user } = useAuth();

  // Two-role nav visibility: CMS management surfaces marked superAdminOnly are
  // hidden from plain `admin` accounts. This is UX only — the pages and API
  // routes enforce super_admin authorization server-side regardless.
  const isSuperAdmin = user?.role === "super_admin";
  const visibleEntries = NAV_ENTRIES.filter(
    (entry: NavEntry) => !("superAdminOnly" in entry && entry.superAdminOnly) || isSuperAdmin
  );

  const renderEntry = (entry: NavEntry) => {
    const isGroup = "children" in entry;

    // Flat top-level item
    if (!isGroup) {
      const active =
        entry.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(entry.href);
      return (
        <Link
          key={entry.href}
          href={entry.href}
          onClick={close}
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
            active
              ? "bg-gold/10 font-medium text-gold"
              : "text-stone-400 hover:bg-panel-2 hover:text-stone-100"
          )}
        >
          <entry.icon className={cn("h-4.5 w-4.5", active && "text-gold")} />
          {entry.label}
        </Link>
      );
    }

    // Contact Inbox: a BUTTON that opens a destination popup (Messages /
    // Notifications). It is the only Contact Inbox control in the sidebar;
    // the children are never rendered as standalone top-level items.
    return <ContactInboxNav key={entry.label} onNavigate={close} />;
  };

  const nav = (
    <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-6">
      {visibleEntries.map(renderEntry)}
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
        <NotificationBell />
        {/* User identity + log out control (replaces the static chip) */}
        <LogoutButton />
      </div>
    </header>
  );
}
