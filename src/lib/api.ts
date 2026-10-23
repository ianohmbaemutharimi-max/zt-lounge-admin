'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

const BASE_URL = '/api/admin'

// ─── Types ───────────────────────────────────────────────────────────

export interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
}

export interface ApiResponse<T> {
  data: T[]
  pagination: Pagination
}

// ─── Fetcher ────────────────────────────────────────────────────────

async function fetcher<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(error.error || `HTTP ${response.status}`)
  }

  // 204 No Content / 205 Reset Content (and any successful empty body) have no
  // JSON to parse — response.json() would throw "Unexpected end of JSON input",
  // turning a SUCCESSFUL delete into an onError() with a stale UI row.
  if (response.status === 204 || response.status === 205) {
    return null as T
  }

  const text = await response.text()
  if (!text) {
    return null as T
  }

  return JSON.parse(text) as T
}

// ─── Resource Hooks ─────────────────────────────────────────────────

export interface UseResourceResult<T> {
  data: T[]
  pagination: Pagination | undefined
  isLoading: boolean
  error: Error | null
  refetch: () => void
  create: (data: any) => Promise<T>
  update: (id: string | number, data: any) => Promise<T>
  delete: (id: string | number) => Promise<void>
  batchDelete: (ids: (string | number)[]) => Promise<void>
  isCreating: boolean
  isUpdating: boolean
  isDeleting: boolean
}

export function useResource<T = any>(
  resource: string,
  params?: Record<string, any>
): UseResourceResult<T> {
  const queryClient = useQueryClient()
  const queryKey = [resource, params]

  const queryString = params
    ? `?${new URLSearchParams(
        Object.entries(params).reduce((acc, [key, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            acc[key] = String(value)
          }
          return acc
        }, {} as Record<string, string>)
      ).toString()}`
    : ''

  const { data, isLoading, error, refetch } = useQuery({
    queryKey,
    queryFn: () => fetcher<ApiResponse<T>>(`${BASE_URL}/${resource}${queryString}`),
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => fetcher<T>(`${BASE_URL}/${resource}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [resource] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: (variables: { id: string | number; data: any }) =>
      fetcher<T>(`${BASE_URL}/${resource}/${variables.id}`, {
        method: 'PATCH',
        body: JSON.stringify(variables.data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [resource] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string | number) =>
      fetcher(`${BASE_URL}/${resource}/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [resource] })
    },
  })

  const batchDeleteMutation = useMutation({
    mutationFn: (ids: (string | number)[]) =>
      fetcher(`${BASE_URL}/${resource}/batch`, {
        method: 'DELETE',
        body: JSON.stringify({ ids }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [resource] })
    },
  })

  return {
    data: (data as any)?.data || data?.data || [],
    pagination: (data as any)?.pagination,
    isLoading,
    error,
    refetch,
    create: createMutation.mutateAsync,
    update: ((id: string | number, data: any) => updateMutation.mutateAsync({ id, data })) as UseResourceResult<T>['update'],
    delete: async (id: string | number) => {
      await deleteMutation.mutateAsync(id);
    },
    batchDelete: async (ids: (string | number)[]) => {
      await batchDeleteMutation.mutateAsync(ids);
    },
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  }
}

export function useItem<T = any>(resource: string, id?: string | number | null) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [resource, id],
    queryFn: () => fetcher<T>(`${BASE_URL}/${resource}/${id}`),
    enabled: !!id,
  })

  return { data, isLoading, error, refetch }
}

// ─── Imperative API (used by components that don't use hooks) ────────

/**
 * Shared query-string serializer for resource requests.
 * Skips null/undefined/empty values so optional ownership context (page_id)
 * is simply omitted when the caller has not selected a page.
 */
function buildQueryString(params: Record<string, any>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    searchParams.set(key, String(value));
  }
  return searchParams.toString();
}

export const api = {
  async list<T = any>(resource: string, params?: Record<string, any>): Promise<T[]> {
    // Filter serialization contract (matches [resource]/route.ts parsing):
    //   filter:<field>=<operator>:<value>   (structured: { field: { operator, value } })
    //   filter:<field>=<value>              (scalar: server defaults operator to "eq")
    // A structured filter object must NEVER be String()-ed — that produced
    // "filter=[object Object]", which the server silently ignored, breaking
    // page-scoped hero-slides queries.
    const searchParams = new URLSearchParams();
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') continue;
        if (key === 'filter' && typeof value === 'object') {
          for (const [field, fValue] of Object.entries(value as Record<string, any>)) {
            if (fValue === undefined || fValue === null || fValue === '') continue;
            if (typeof fValue === 'object' && ('operator' in fValue || 'value' in fValue)) {
              searchParams.set(`filter:${field}`, `${fValue.operator ?? 'eq'}:${fValue.value}`);
            } else {
              searchParams.set(`filter:${field}`, String(fValue));
            }
          }
        } else {
          searchParams.set(key, String(value));
        }
      }
    }
    const qs = searchParams.toString();
    const res = await fetcher<ApiResponse<T>>(`${BASE_URL}/${resource}${qs ? `?${qs}` : ''}`);
    return res.data || [];
  },

  /**
   * Paginated list - returns the full ApiResponse<T> (data + pagination meta)
   * so admin UIs can render next/previous controls. Additive: the existing
   * `list()` contract (returns T[]) is unchanged.
   */
  async listPaged<T = any>(resource: string, params?: Record<string, any>): Promise<ApiResponse<T>> {
    const qs = buildQueryString(params ?? {});
    return fetcher<ApiResponse<T>>(`${BASE_URL}/${resource}${qs ? `?${qs}` : ''}`);
  },

  async get<T = any>(resource: string, id: string | number): Promise<T> {
    return fetcher<T>(`${BASE_URL}/${resource}/${id}`)
  },

  async create<T = any>(resource: string, data: any, params?: Record<string, any>): Promise<T> {
    // Optional query context (e.g. page_id) lets page-scoped resources prove
    // ownership server-side on mutation. Omitted callers are unaffected.
    const qs = params ? buildQueryString(params) : ''
    return fetcher<T>(`${BASE_URL}/${resource}${qs ? `?${qs}` : ''}`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async update<T = any>(resource: string, id: string | number, data: any, params?: Record<string, any>): Promise<T> {
    // Optional query context (e.g. page_id) lets page-scoped resources prove
    // ownership server-side on mutation. Omitted callers are unaffected.
    const qs = params ? buildQueryString(params) : ''
    return fetcher<T>(`${BASE_URL}/${resource}/${id}${qs ? `?${qs}` : ''}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  /** Authoritative confirmation via confirm_booking() (atomic customer create/link). */
  async confirmBooking<T = any>(id: string | number): Promise<T> {
    return fetcher<T>(`${BASE_URL}/bookings/${id}/confirm`, {
      method: 'POST',
    })
  },

  /** Authoritative status transition (completed/cancelled/no_show; also confirmed). */
  async setBookingStatus<T = any>(id: string | number, status: string): Promise<T> {
    return fetcher<T>(`${BASE_URL}/bookings/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
  },

  async delete<T = any>(resource: string, id: string | number, params?: Record<string, any>): Promise<T> {
    const qs = params ? buildQueryString(params) : ''
    return fetcher<T>(`${BASE_URL}/${resource}/${id}${qs ? `?${qs}` : ''}`, {
      method: 'DELETE',
    })
  },

  async remove<T = any>(resource: string, id: string | number, params?: Record<string, any>): Promise<T> {
    return this.delete<T>(resource, id, params)
  },

  async batchDelete<T = any>(resource: string, ids: (string | number)[]): Promise<T> {
    return fetcher<T>(`${BASE_URL}/${resource}/batch`, {
      method: 'DELETE',
      body: JSON.stringify({ ids }),
    })
  },

    async stats<T = any>(): Promise<T> {
    const response = await fetcher<{ success: boolean; data: T }>('/api/dashboard/stats');
    return response.data;
  },

  // ─── Contact Inbox (canonical notification linkage) ─────────────────

  /** Canonical total count of contact messages awaiting a reply. */
  async pendingContactCount(): Promise<number> {
    const res = await fetcher<{ pending: number }>('/api/admin/contact-messages/pending-count');
    return res.pending ?? 0;
  },

  /** Mark the notification(s) tied to a contact_message as read (read ≠ resolved). */
  async markContactNotificationRead(contactMessageId: string | number): Promise<unknown> {
    return fetcher('/api/admin/notifications/mark-read-by-entity', {
      method: 'POST',
      body: JSON.stringify({ entityType: 'contact_message', entityId: contactMessageId }),
    });
  },

        /** Resolve (reply to) a contact message: status → 'replied', notification read. */
  async replyContactMessage(contactMessageId: string | number): Promise<unknown> {
    return fetcher(`/api/admin/contact-messages/${contactMessageId}/reply`, {
      method: 'POST',
    });
  },

  // ─── Notifications ────────────────────────────────────────────────
  async notificationsUnreadCount(): Promise<number> {
    const res = await fetcher<{ unreadCount: number }>(`${BASE_URL}/notifications/unread-count`);
    return res.unreadCount ?? 0;
  },

  /** Mark a single notification as read; read_at is set server-side. */
  async markNotificationRead(id: string | number): Promise<unknown> {
    return fetcher(`${BASE_URL}/notifications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isRead: true }),
    });
  },

  /** Mark a single notification as unread; read_at is cleared server-side. */
  async markNotificationUnread(id: string | number): Promise<unknown> {
    return fetcher(`${BASE_URL}/notifications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isRead: false }),
    });
  },

  /** Mark every notification visible to this admin as read. */
  async markAllNotificationsRead(): Promise<unknown> {
    return fetcher(`${BASE_URL}/notifications/mark-all-read`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
  /** Sync Google Business Profile reviews into public.testimonials.
   * Server-side only (super_admin). Returns counters: seen/created/updated/skipped.
   * Protected by the exclusive POST /api/admin/google/reviews/sync route.
   */
  async syncGoogleReviews(): Promise<{ seen: number; created: number; updated: number; skipped: number }> {
    const res = await fetcher<{ success: boolean; seen?: number; created?: number; updated?: number; skipped?: number; error?: string }>(
      '/api/admin/google/reviews/sync',
      { method: 'POST' }
    );
    if (!res.success) throw new Error(res.error ?? 'Google review sync failed');
    return {
      seen: res.seen ?? 0,
      created: res.created ?? 0,
      updated: res.updated ?? 0,
      skipped: res.skipped ?? 0,
    };
  },
}

// ─── Dashboard Stats Hook ────────────────────────────────────────────

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => fetcher('/api/dashboard/stats'),
    refetchOnWindowFocus: "always", // Override global default to ensure real-time updates
  })
}
