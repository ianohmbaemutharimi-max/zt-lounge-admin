/**
 * ZT Lounge Admin — request proxy (Next.js 16 "proxy" file convention).
 *
 * WHY THIS FILE IS AT `src/proxy.ts`
 * ---------------------------------
 * This project keeps its App Router under `src/app`. Next.js 16 resolves the
 * proxy/middleware entrypoint relative to the app directory, so the file must
 * live in `src/` — a root-level `middleware.ts` is silently ignored (it was
 * present for a long time, never executed, and therefore never produced the
 * `/login?redirect=…` deep-link parameter). The file was renamed from
 * `middleware.ts` to `proxy.ts` and moved here per Next 16's official
 * recommendation; the authentication and authorization logic is unchanged.
 *
 * RESPONSIBILITIES (unchanged from the original middleware)
 * - Refresh the Supabase session on every matched request and propagate the
 *   refreshed cookies to both the outgoing request and the response.
 * - `/login`: send already-authenticated ADMINS to their intended dashboard
 *   destination (Loop 65), otherwise let the login page render.
 * - `/dashboard/*`: require a session plus an ADMIN_ROLES profile row.
 * - `/api/*`: pass through — handlers authorize themselves via
 *   getServerSession() (see SECURITY notes inline).
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  DEFAULT_AUTHENTICATED_PATH,
  REDIRECT_PARAM,
  safeRedirectPath,
} from "@/lib/auth/redirect";

export const ADMIN_PATHS = ["/dashboard"];
export const PUBLIC_PATHS = ["/login"];

/**
 * Build a Supabase client that correctly propagates session-refresh cookies
 * from middleware. Returns both the client and the response so the caller
 * can forward the Set-Cookie headers set by Supabase back to the browser.
 */
function createMiddlewareClient(req: NextRequest) {
  // Start with a plain next() response; Supabase will attach cookies to it.
  const res = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write cookies onto both the outgoing request (so subsequent
          // server-side reads see the refreshed value) and the response
          // (so the browser receives the updated session cookie).
          cookiesToSet.forEach(({ name, value }) =>
            req.cookies.set(name, value)
          );
          cookiesToSet.forEach(({ name, value, options }) =>
            res.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  return { supabase, res };
}

export async function proxy(req: NextRequest) {
  const url = req.nextUrl;
  const isAdmin = ADMIN_PATHS.some((p) => url.pathname.startsWith(p));
  const isPublic = PUBLIC_PATHS.includes(url.pathname);
  const isApiRoute = url.pathname.startsWith("/api/");

  // Always create the middleware client so session tokens are refreshed and
  // propagated on every request that passes through middleware.
  const { supabase, res } = createMiddlewareClient(req);

  // Refresh session — this may write a new token via setAll above.
  const { data: { session } } = await supabase.auth.getSession();

  if (isPublic) {
    // Already logged in: redirect away from /login.
    //
    // Loop 65: honor the originally requested destination when it is a safe
    // dashboard path instead of unconditionally discarding it. The value is
    // validated here (never trusted as passed) and can never be /login, so
    // this branch cannot redirect to itself.
    //
    // The bounce is gated on requireAdmin for the same reason the admin
    // branch uses it: the login page accepts `manager` in addition to
    // ADMIN_ROLES, so redirecting any authenticated session to /dashboard
    // would loop forever for a role the dashboard rejects:
    //   /login -> /dashboard (403) -> /login?redirect=/dashboard -> /login …
    // Non-admin sessions simply see the login page, exactly as before.
    if (session?.user) {
      const { requireAdmin } = await import("@/lib/auth/server");
      const admin = await requireAdmin(req);
      if (admin.ok) {
        const target =
          safeRedirectPath(url.searchParams.get(REDIRECT_PARAM)) ??
          DEFAULT_AUTHENTICATED_PATH;
        return NextResponse.redirect(new URL(target, url));
      }
    }
    return res;
  }

  // For API routes, just refresh the session and pass through
  // The API route handlers will check auth themselves
  if (isApiRoute) {
    // SECURITY (Loop 59): API route handlers authorize themselves via
    // getServerSession() (authenticated user -> database profile -> role).
    // No auth metadata is published as request-visible headers here.
    return res;
  }

  if (isAdmin) {
    if (!session?.user) {
      const loginUrl = new URL("/login", url);
      // Loop 65: preserve the full intended destination (path + query) so a
      // deep link such as /dashboard/messages?message=… survives login.
      const dest = url.pathname + url.search;
      return NextResponse.redirect(new URL(`/login?redirect=${encodeURIComponent(dest)}`, url));
    }

    // Check role via the profile table using the service-side auth utilities.
    const { requireAdmin } = await import("@/lib/auth/server");
    const result = await requireAdmin(req);

    if (!result.ok) {
      const loginUrl = new URL("/login", url);
      // Loop 65: same destination fidelity as the unauthenticated branch.
      const dest = url.pathname + url.search;
      return NextResponse.redirect(new URL(`/login?redirect=${encodeURIComponent(dest)}`, url));
    }

    // SECURITY (Loop 59): the x-auth-role / x-auth-profile-id /
    // x-auth-full-name RESPONSE headers were removed. They had no first-party
    // consumer and, because authorization code once trusted request-side
    // copies of them, they were a privilege-escalation vector.
    // Authorization is derived solely from getServerSession().

    // Propagate any refreshed session cookies on the response.
    return res;
  }

  return res;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/login",
    "/api/auth/:path*",
    "/api/admin/:path*",
    "/api/dashboard/:path*",
  ],
};
