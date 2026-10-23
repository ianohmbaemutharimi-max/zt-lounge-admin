"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

/**
 * Canonical pending-contact-message count.
 *
 * Single source of truth for the Contact Inbox header badge AND the sidebar
 * "Contact Inbox" badge. Both call the same server endpoint, which counts
 * `contact_messages` WHERE status IN ('new','read') — so they can never
 * disagree. Stale for 30s, refetched every 60s as a cheap refresh.
 */
export function usePendingContactCount() {
  return useQuery({
    queryKey: queryKeys.messages.pending(),
    queryFn: () => api.pendingContactCount(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
