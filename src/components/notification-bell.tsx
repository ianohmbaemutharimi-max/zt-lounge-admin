"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Inbox, LoaderCircle, X } from "lucide-react";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { cn, timeAgo } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useNotificationSubscription } from "@/hooks/use-notification-subscription";

interface Notification {
  id: string;
  title: string;
  body: string | null;
  type: string | null;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  bookingId: string | null;
  profileId: string | null;
}

const MAX_VISIBLE = 12;

/**
 * Notification Bell + Popover.
 *
 * Backed by the existing `notifications` table + generic resource API and the
 * dedicated read/unread endpoints. There is intentionally NO notifications
 * page — the bell is the primary entry point; /dashboard/notifications mirrors this full list. read_at / is_read are always set
 * server-side; the client only requests a mark-read.
 */
export function NotificationBell() {
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auth context for profile ID
  const { profile } = useAuth();

  // Realtime subscription for instant notifications (no polling needed)
  useNotificationSubscription(profile?.id);

  const { data: unreadCount = 0, refetch: refetchUnread } = useQuery({
    queryKey: queryKeys.notifications.unread(),
    queryFn: () => api.notificationsUnreadCount(),
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.notifications.all(),
    queryFn: () => api.list<Notification>("notifications", { limit: MAX_VISIBLE }),
  });

  const notifications = data ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.notifications.all() });
    qc.invalidateQueries({ queryKey: queryKeys.notifications.unread() });
  };

  const markRead = useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: invalidate,
  });

  const markUnread = useMutation({
    mutationFn: (id: string) => api.markNotificationUnread(id),
    onSuccess: invalidate,
  });

  const markAll = useMutation({
    mutationFn: () => api.markAllNotificationsRead(),
    onSuccess: invalidate,
  });

  // Close on Escape + click-outside.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const openItem = (n: Notification) => {
    // READ ≠ RESOLVED: label the bell item seen, but never touch the source
    // entity's workflow status. Contact resolution happens only in the Inbox.
    if (!n.isRead && !markRead.isPending) markRead.mutate(n.id);

    if (n.entityType === "contact_message" && n.entityId) {
      // Canonical destination: Contact Inbox (the notification home).
      // Pass the contact-message id through a clean query param so the Inbox
      // can open/focus the exact message. There is intentionally NO separate
      // notification page — the Inbox is the single operational home.
      router.push(`/dashboard/messages?message=${encodeURIComponent(n.entityId)}`);
      qc.invalidateQueries({ queryKey: queryKeys.messages.all() });
      qc.invalidateQueries({ queryKey: queryKeys.messages.pending() });
    } else if (n.bookingId) {
      router.push("/dashboard/bookings");
    }
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          if (!open) {
            refetch();
            refetchUnread();
          }
          setOpen((v) => !v);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        className="relative rounded-lg p-2 text-stone-300 hover:bg-panel-2"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-black"
            aria-hidden="true"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="fixed inset-x-3 top-16 z-40 max-h-[80vh] w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-edge bg-panel shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-96"
        >
          <div className="flex items-center justify-between border-b border-edge px-4 py-3">
            <p className="text-sm font-semibold text-white">Notifications</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  router.push("/dashboard/notifications");
                  setOpen(false);
                }}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-gold hover:bg-gold/10"
              >
                View All
              </button>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => markAll.mutate()}
                  disabled={markAll.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-gold hover:bg-gold/10 disabled:opacity-50"
                >
                  {markAll.isPending ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCheck className="h-3.5 w-3.5" />
                  )}
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close notifications"
                className="rounded-lg p-1.5 text-muted hover:bg-panel-2 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {isLoading && (
              <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted">
                <LoaderCircle className="h-4 w-4 animate-spin" /> Loading notifications…
              </div>
            )}

            {!isLoading && isError && (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted">
                <p>Couldn&apos;t load notifications.</p>
                <button type="button" onClick={() => refetch()} className="text-gold hover:underline">
                  Retry
                </button>
              </div>
            )}

            {!isLoading && !isError && notifications.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted">
                <Inbox className="h-6 w-6" />
                <p>You&apos;re all caught up.</p>
              </div>
            )}

            {!isLoading && !isError && notifications.length > 0 && (
              <ul className="divide-y divide-edge">
                {notifications.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openItem(n)}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-panel-2",
                        !n.isRead && "bg-gold/[0.04]"
                      )}
                    >
                      <span
                        className={cn(
                          "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                          n.isRead ? "bg-stone-600" : "bg-gold"
                        )}
                        aria-hidden="true"
                      />
                      {n.isRead && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            markUnread.mutate(n.id);
                          }}
                          className="ml-1 shrink-0 rounded px-1.5 py-0.5 text-[10px] text-stone-400 hover:text-stone-200 hover:bg-panel-2"
                          aria-label="Mark unread"
                        >
                          Mark unread
                        </button>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-stone-100">{n.title}</span>
                        {n.body && <span className="mt-0.5 block truncate text-xs text-stone-400">{n.body}</span>}
                        <span className="mt-0.5 block text-[11px] text-muted">{timeAgo(n.createdAt)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}