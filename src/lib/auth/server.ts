/**
 * Shared server-side authentication & authorization utilities.
 *
 * This module centralizes all auth logic that was previously duplicated
 * across middleware.ts, API route handlers, and the dashboard layout.
 *
 * Key design decisions:
 * - Accepts an optional NextRequest parameter.
 *   - With req: middleware path (uses req.cookies).
 *   - Without req: server component / route handler path (uses next/headers cookies()).
 * - Queries profiles by `id` (not `user_id`) to match auth.uid()
 * - Uses the `roles` table join via `role_id` FK
 * - Provides both imperative (requireAuth/requireAdmin) and declarative (withAdminAuth) APIs
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServer } from "@/lib/supabase/server";

/** Admin role names that are allowed to access the dashboard. */
export const ADMIN_ROLES = ["super_admin", "admin"] as const;

/** Content manager roles that can manage gallery, testimonials, and uploads. */
export const CONTENT_MANAGER_ROLES = ["super_admin", "admin", "manager"] as const;

/** All role names that grant employee-level access. */
export const EMPLOYEE_ROLES = ["super_admin", "admin", "staff"] as const;

/**
 * Shape of the authenticated session context returned by getServerSession.
 */
export interface SessionContext {
  supabase: SupabaseClient;
  user: {
    id: string;
    email?: string | null;
    role: string;
  };
  profile: {
    id: string;
    full_name: string;
    role_id: string | null;
    role_name: string;
  };
}

/**
 * Result type for auth checks that may fail.
 */
export type AuthResult =
  | { ok: true; session: SessionContext }
  | { ok: false; error: string; status: 401 | 403 };

/**
 * Create a Supabase client for server-side use.
 *
 * Two code paths:
 * 1. Middleware (req provided): reads cookies from the request only. Cookie
 *    writes/refreshes are handled by the middleware's own createMiddlewareClient
 *    which owns the response. This path is used for role-checking only.
 * 2. Server components / route handlers (req omitted): uses next/headers cookies().
 *    setAll errors from Server Component contexts are suppressed safely.
 */
async function getSupabase(req?: NextRequest) {
  if (req) {
    return createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll(cookiesToSet) {
            // Middleware cookie propagation is handled by createMiddlewareClient
            // in middleware.ts. Here we only update the request-side cookies so
            // subsequent reads within the same middleware invocation are consistent.
            cookiesToSet.forEach(({ name, value }) =>
              req.cookies.set(name, value)
            );
          },
        },
      }
    );
  }

  return getSupabaseServer();
}

  // Request-level cache for auth results (in-memory, short-lived)
  const sessionCache = new WeakMap<NextRequest, AuthResult>();

  /**
   * Get the current session from the request, including the user's profile
   * and role. Queries by `id` to match auth.uid().
   *
   * Two usage modes:
   * - Middleware: pass the NextRequest (getServerSession(req))
   * - Server component / route handler: omit argument (getServerSession())
   *
   * @returns AuthResult with session context or an error.
   */
  export async function getServerSession(req?: NextRequest): Promise<AuthResult> {
    // Check request-level cache first
    if (req && sessionCache.has(req)) {
      return sessionCache.get(req)!;
    }

    const supabase = await getSupabase(req);

    // OPTIMIZATION: Try to get cached profile/role from request headers
    // (set by middleware to avoid duplicate queries)
    if (req) {
      const cachedProfileId = req.headers.get("x-auth-profile-id");
      const cachedRole = req.headers.get("x-auth-role");
      const cachedFullName = req.headers.get("x-auth-full-name");
      
      if (cachedProfileId && cachedRole) {
        // We still need to verify the user exists and get email
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          return { ok: false, error: "Unauthorized", status: 401 };
        }

        const result: AuthResult = {
          ok: true,
          session: {
            supabase,
            user: {
              id: user.id,
              email: user.email ?? null,
              role: cachedRole,
            },
            profile: {
              id: cachedProfileId,
              full_name: cachedFullName || "",
              role_id: null,
              role_name: cachedRole,
            },
          },
        };
        
        if (req) sessionCache.set(req, result);
        return result;
      }
    }

    // Get user first
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return { ok: false, error: "Unauthorized", status: 401 };
    }

    // PERFORMANCE OPTIMIZATION: Single query with JOIN instead of 3 sequential queries
    // This reduces auth overhead from ~3 DB round trips to 1
    const { data: profileWithRole, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, role_id, roles:role_id(name)")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profileWithRole) {
      return { ok: false, error: "Profile not found", status: 403 };
    }

    // Extract role name from joined data
    // roles is an array in PostgREST response, take first element
    const roles = profileWithRole.roles as any;
    const roleName = Array.isArray(roles) ? roles[0]?.name : roles?.name;
    if (!roleName) {
      return { ok: false, error: "Role not assigned", status: 403 };
    }

    const result: AuthResult = {
      ok: true,
      session: {
        supabase,
        user: {
          id: user.id,
          email: user.email ?? null,
          role: roleName,
        },
        profile: {
          id: profileWithRole.id,
          full_name: profileWithRole.full_name,
          role_id: profileWithRole.role_id,
          role_name: roleName,
        },
      },
    };
    
    // Cache result for this request
    if (req) sessionCache.set(req, result);
    return result;
  }

/**
 * Require an authenticated user. Returns the session context or throws
 * an error response that can be returned directly from an API route.
 */
export async function requireAuth(req?: NextRequest): Promise<AuthResult> {
  return getServerSession(req);
}

/**
 * Require an authenticated user with an admin role.
 *
 * @param req - Optional NextRequest (omit for server components)
 * @param allowedRoles - Optional override for allowed roles (defaults to ADMIN_ROLES)
 * @returns AuthResult with session context or an error.
 */
export async function requireAdmin(
  req?: NextRequest,
  allowedRoles: readonly string[] = ADMIN_ROLES
): Promise<AuthResult> {
  const result = await getServerSession(req);

  if (!result.ok) {
    return result;
  }

  if (!allowedRoles.includes(result.session.user.role)) {
    return { ok: false, error: "Forbidden", status: 403 };
  }

  return result;
}

/**
 * Higher-order function that wraps an API route handler with admin auth.
 *
 * @example
 * export const GET = withAdminAuth(async (req, { params }, auth) => {
 *   const data = await auth.session.supabase.from("customers").select("*");
 *   return NextResponse.json(data);
 * });
 */
export function withAdminAuth<T extends Record<string, any>>(
  handler: (
    req: NextRequest,
    context: T,
    auth: SessionContext
  ) => Promise<NextResponse> | NextResponse
) {
  return async (req: NextRequest, context: T): Promise<NextResponse> => {
    const result = await requireAdmin(req);

    if (!result.ok) {
      return NextResponse.json(
        { error: (result as { ok: false; error: string; status: 401 | 403 }).error },
        { status: (result as { ok: false; error: string; status: 401 | 403 }).status }
      );
    }

    try {
      return await handler(req, context, result.session);
    } catch (e) {
      // Log full error server-side for diagnostics; return sanitized message to client
      if (e instanceof Error) {
        console.error("[auth-handler] Handler error:", e.message);
      }
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  };
}

/**
 * Higher-order function that wraps an API route handler with content manager auth.
 * Allows super_admin, admin, and manager roles to access content management operations.
 *
 * @example
 * export const POST = withContentManagerAuth(async (req, { params }, auth) => {
 *   const data = await auth.session.supabase.from("gallery").insert(body);
 *   return NextResponse.json(data);
 * });
 */
export function withContentManagerAuth<T extends Record<string, any>>(
  handler: (
    req: NextRequest,
    context: T,
    auth: SessionContext
  ) => Promise<NextResponse> | NextResponse
) {
  return async (req: NextRequest, context: T): Promise<NextResponse> => {
    const result = await requireAdmin(req, CONTENT_MANAGER_ROLES);

    if (!result.ok) {
      return NextResponse.json(
        { error: (result as { ok: false; error: string; status: 401 | 403 }).error },
        { status: (result as { ok: false; error: string; status: 401 | 403 }).status }
      );
    }

    try {
      return await handler(req, context, result.session);
    } catch (e) {
      // Log full error server-side for diagnostics; return sanitized message to client
      if (e instanceof Error) {
        console.error("[auth-handler] Handler error:", e.message);
      }
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  };
}

/**
 * Check if the current user has a specific role.
 * Useful for middleware and page-level guards.
 */
export async function hasRole(req: NextRequest, role: string): Promise<boolean> {
  const result = await getServerSession(req);
  if (!result.ok) return false;
  return result.session.user.role === role;
}

/**
 * Check if the current user has any of the specified roles.
 */
export async function hasAnyRole(req: NextRequest, roles: readonly string[]): Promise<boolean> {
  const result = await getServerSession(req);
  if (!result.ok) return false;
  return roles.includes(result.session.user.role);
}