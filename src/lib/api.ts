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

  return response.json()
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

export const api = {
  async list<T = any>(resource: string, params?: Record<string, any>): Promise<T[]> {
    const qs = params
      ? `?${new URLSearchParams(
          Object.entries(params).reduce((acc, [key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
              acc[key] = String(value)
            }
            return acc
          }, {} as Record<string, string>)
        ).toString()}`
      : ''
    const res = await fetcher<ApiResponse<T>>(`${BASE_URL}/${resource}${qs}`)
    return res.data || []
  },

  async get<T = any>(resource: string, id: string | number): Promise<T> {
    return fetcher<T>(`${BASE_URL}/${resource}/${id}`)
  },

  async create<T = any>(resource: string, data: any): Promise<T> {
    return fetcher<T>(`${BASE_URL}/${resource}`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async update<T = any>(resource: string, id: string | number, data: any): Promise<T> {
    return fetcher<T>(`${BASE_URL}/${resource}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  async delete<T = any>(resource: string, id: string | number): Promise<T> {
    return fetcher<T>(`${BASE_URL}/${resource}/${id}`, {
      method: 'DELETE',
    })
  },

  async remove<T = any>(resource: string, id: string | number): Promise<T> {
    return this.delete<T>(resource, id)
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
}

// ─── Dashboard Stats Hook ────────────────────────────────────────────

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => fetcher('/api/dashboard/stats'),
  })
}
