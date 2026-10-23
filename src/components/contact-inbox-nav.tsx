"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Inbox } from "lucide-react";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { usePendingContactCount } from "@/lib/hooks/use-pending-contact-count";
import {
  CONTACT_INBOX_CHILDREN,
  CONTACT_INBOX_HREF,
  type NavItem,
} from "@/lib/constants/nav";

const NOTIFICATIONS_HREF = "/dashboard/notifications";
/** Popup geometry used to keep the menu inside the viewport. */
const POPUP_WIDTH = 248;
const POPUP_HEIGHT = 156;

function Badge({ count, label }: { count: number; label: string }) {
  return (
    <span
      className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-gold px-1.5 text-[10px] font-bold leading-tight text-black"
      aria-label={label}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * Contact Inbox sidebar control + destination popup.
 *
 * The parent is a BUTTON (never navigates directly) that toggles a compact
 * popup containing exactly the two canonical children: Messages and
 * Notifications. Behaviour mirrors the established NotificationBell popover
 * conventions (pointerdown outside-click, Escape, aria-haspopup/expanded).
 *
 * Counter semantics are independent:
 *   - Messages badge      → contact messages awaiting reply
 *                          (queryKeys.messages.pending(), shared cache)
 *   - Notifications badge → unread notifications
 *                          (queryKeys.notifications.unread(), same cache
 *                           entry as the global bell — no extra requests)
 */
export function ContactInboxNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const { data: pendingCount = 0 } = usePendingContactCount();
  const { data: unreadCount = 0 } = useQuery({
    queryKey: queryKeys.notifications.unread(),
    queryFn: () => api.notificationsUnreadCount(),
  });

  const parentActive =
    pathname.startsWith(CONTACT_INBOX_HREF) || pathname.startsWith(NOTIFICATIONS_HREF);

  const place = () => {
    const el = buttonRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.right + 10, window.innerWidth - POPUP_WIDTH - 8));
    const top = Math.max(8, Math.min(r.top - 6, window.innerHeight - POPUP_HEIGHT - 8));
    setCoords({ top, left });
  };

  const toggle = () => {
    if (!open) place();
    setOpen((v) => !v);
  };

  // Escape + click-outside (same convention as NotificationBell).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      const t = e.target as Node;
      if (popupRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  // Route change always closes the popup.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Exact-prefix matching — the two sibling routes can never both be active.
  const childState = (child: NavItem) =>
    child.href === NOTIFICATIONS_HREF
      ? pathname.startsWith(NOTIFICATIONS_HREF)
      : pathname.startsWith(CONTACT_INBOX_HREF);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Contact Inbox${pendingCount > 0 ? ` (${pendingCount} awaiting reply)` : ""}`}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
          parentActive
            ? "bg-gold/10 font-medium text-gold"
            : "text-stone-400 hover:bg-panel-2 hover:text-stone-100"
        )}
      >
        <Inbox className={cn("h-4.5 w-4.5", parentActive && "text-gold")} />
        Contact Inbox
        {pendingCount > 0 && (
          <Badge count={pendingCount} label={`${pendingCount} awaiting reply`} />
        )}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-transform",
            pendingCount > 0 ? "ml-1" : "ml-auto",
            open && "rotate-180",
            parentActive ? "text-gold" : "text-stone-500"
          )}
          aria-hidden
        />
      </button>

      {open && coords && (
        <div
          ref={popupRef}
          role="menu"
          aria-label="Contact Inbox destinations"
          style={{ top: coords.top, left: coords.left }}
          className="fixed z-50 w-62 overflow-hidden rounded-2xl border border-edge bg-panel shadow-2xl"
        >
          <p className="border-b border-edge px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            Contact Inbox
          </p>
          <div className="p-1.5">
            {CONTACT_INBOX_CHILDREN.map((child) => {
              const active = childState(child);
              const count =
                child.href === NOTIFICATIONS_HREF ? unreadCount : pendingCount;
              const countLabel =
                child.href === NOTIFICATIONS_HREF
                  ? `${count} unread notifications`
                  : `${count} awaiting reply`;
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  role="menuitem"
                  aria-current={active ? "page" : undefined}
                  onClick={() => {
                    setOpen(false);
                    onNavigate?.();
                  }}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                    active
                      ? "bg-gold/10 font-medium text-gold"
                      : "text-stone-300 hover:bg-panel-2 hover:text-white"
                  )}
                >
                  <child.icon className={cn("h-4 w-4", active && "text-gold")} />
                  {child.label}
                  {count > 0 && <Badge count={count} label={countLabel} />}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
