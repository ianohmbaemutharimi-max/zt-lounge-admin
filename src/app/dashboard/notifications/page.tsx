"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { CheckCheck, Inbox, LoaderCircle } from "lucide-react";
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
}

const PAGE_SIZE = 50;

/**
 * Notifications list page.
 *
 * Mirrors NotificationBell: same data shape (notifications table via the generic
 * resource API + dedicated unread endpoint), same read/unread mutations, and the
 * same entity navigation. The header bell remains the primary entry point; this
 * page is the full scrollable history. read_at / is_read are always set
 * server-side; the client only requests a read-state flip.
 */
export default function NotificationsPage() {
  const router = useRouter();
  const qc = useQueryClient();

  // Auth context for profile ID
  const { profile } = useAuth();

  // Realtime subscription for instant notifications (no polling needed)
  useNotificationSubscription(profile?.id);

  const { data: unreadCount = 0 } = useQuery({
    queryKey: queryKeys.notifications.unread(),
    queryFn: () => api.notificationsUnreadCount(),
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.notifications.all(),
    queryFn: () => api.list<Notification>("notifications", { limit: PAGE_SIZE }),
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

  const openItem = (n: Notification) => {
    if (!n.isRead && !markRead.isPending) markRead.mutate(n.id);
    if (n.entityType === "contact_message" && n.entityId) {
      router.push(`/dashboard/messages?message=${encodeURIComponent(n.entityId)}`);
      return;
    }
    if (n.entityType === "booking" && n.entityId) {
      router.push("/dashboard/bookings");
      return;
    }
    if (n.bookingId) {
      router.push("/dashboard/bookings");
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between border-b border-edge px-4 py-3">
        <h1 className="text-lg font-semibold text-white">Notifications</h1>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      <div className="max-h-[calc(100vh-16rem)] overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            <span>Loading notifications…</span>
          </div>
        )}

        {!isLoading && isError && (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted">
            <p>Couldn&apos;t load notifications.</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="text-gold hover:underline"
            >
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
              <li key={n.id} className="flex items-start gap-3 px-4 py-3">
                <span
                  className={cn(
                    "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                    n.isRead ? "bg-stone-600" : "bg-gold"
                  )}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => openItem(n)}
                    className="block w-full text-left"
                  >
                    <span className="block truncate text-sm font-medium text-stone-100">
                      {n.title}
                    </span>
                    {n.body && (
                      <span className="mt-0.5 block truncate text-xs text-stone-400">
                        {n.body}
                      </span>
                    )}
                    <span className="mt-0.5 block text-[11px] text-muted">
                      {timeAgo(n.createdAt)}
                    </span>
                  </button>
                </span>
                {n.isRead && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      markUnread.mutate(n.id);
                    }}
                    className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-stone-400 hover:text-stone-200 hover:bg-panel-2"
                    aria-label="Mark unread"
                  >
                    Mark unread
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}