import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query-keys";

/**
 * Realtime subscription hook for notifications.
 * 
 * Subscribes to INSERT/UPDATE/DELETE events on the notifications table,
 * filtered to the authenticated user's profile_id via RLS policies.
 * 
 * Automatically invalidates React Query caches when notifications change,
 * providing instant UI updates without polling.
 * 
 * Usage:
 *   useNotificationSubscription(auth.profile.id);
 */
export function useNotificationSubscription(profileId: string | null | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!profileId) return;

    const supabase: SupabaseClient = getSupabaseBrowser();

    // Subscribe to notification changes for this user
    // RLS policies ensure we only receive events for our own notifications
    const channel = supabase
      .channel(`notifications:profile_id=eq.${profileId}`)
      .on(
        "postgres_changes",
        {
          event: "*", // INSERT, UPDATE, DELETE
          schema: "public",
          table: "notifications",
          filter: `profile_id=eq.${profileId}`,
        },
        (payload: any) => {
          console.log("[Notification Realtime]", payload.eventType, payload);

          // Invalidate both the list and unread count queries
          // This triggers React Query to refetch the latest data
          queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all() });
          queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unread() });

          // Optional: Show browser notification for new notifications
          if (payload.eventType === "INSERT" && "Notification" in window) {
            const notification = payload.new as any;
            if (Notification.permission === "granted") {
              new Notification(notification.title || "New notification", {
                body: notification.message || notification.body,
                icon: "/favicon.ico",
                tag: notification.id,
              });
            }
          }
        }
      )
      .subscribe((status: any) => {
        console.log("[Notification Subscription]", status);
      });

    // Cleanup on unmount or profileId change
    return () => {
      console.log("[Notification Subscription] Unsubscribing");
      supabase.removeChannel(channel);
    };
  }, [profileId, queryClient]);
}
