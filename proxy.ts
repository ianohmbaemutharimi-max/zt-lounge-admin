import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

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

export async function middleware(req: NextRequest) {
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
    if (session?.user) {
      return NextResponse.redirect(new URL("/dashboard", url));
    }
    return res;
  }

  // For API routes, just refresh the session and pass through
  // The API route handlers will check auth themselves
  if (isApiRoute) {
    // Still cache auth info if available to optimize API handler performance
    if (session?.user) {
      const { requireAdmin } = await import("@/lib/auth/server");
      const result = await requireAdmin(req);
      
      if (result.ok) {
        res.headers.set("x-auth-profile-id", result.session.profile.id);
        res.headers.set("x-auth-role", result.session.user.role);
        res.headers.set("x-auth-full-name", result.session.profile.full_name);
      }
    }
    return res;
  }

  if (isAdmin) {
    if (!session?.user) {
      const loginUrl = new URL("/login", url);
      loginUrl.searchParams.set("redirect", url.pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Check role via the profile table using the service-side auth utilities.
    const { requireAdmin } = await import("@/lib/auth/server");
    const result = await requireAdmin(req);

    if (!result.ok) {
      const loginUrl = new URL("/login", url);
      loginUrl.searchParams.set("redirect", url.pathname);
      return NextResponse.redirect(loginUrl);
    }

    // OPTIMIZATION: Cache auth results in request headers for API routes
    // to avoid duplicate getUser() + profile queries in each API handler
    res.headers.set("x-auth-profile-id", result.session.profile.id);
    res.headers.set("x-auth-role", result.session.user.role);
    res.headers.set("x-auth-full-name", result.session.profile.full_name);

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
