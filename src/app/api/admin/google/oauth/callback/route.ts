/**
 * Google Business Profile OAuth — step 2: callback / connection storage.
 *
 * GET /api/admin/google/oauth/callback
 *
 * Server-only boundary (loop spec §5). Super-admin gated (the admin's
 * session cookie is present because Google redirects the admin's browser).
 *
 * Flow:
 *   Google redirect → verify state cookie (CSRF) → exchange authorization
 *   code → obtain refresh token → store the connection row
 *   (google_connections; google_account_id/google_location_id intentionally
 *   NULL — resolving them requires the first real GBP API call, next loop)
 *   → redirect back to the Testimonials dashboard.
 *
 * Security invariants:
 *   - Refresh/access tokens live ONLY in the google_connections row.
 *     They are never put in a redirect URL, cookie, log line, or response body.
 *   - State cookie is single-use, httpOnly, and cleared on every exit path.
 *   - All user-facing failures are opaque redirects with a reason slug.
 *
 * NOTE: Google Business Profile API OAuth — NOT Supabase Auth Google login.
 */

import { NextRequest, NextResponse } from "next/server";
import { withSuperAdminAuth } from "@/lib/auth/server";
import {
  exchangeAuthorizationCode,
  OAUTH_STATE_COOKIE,
} from "@/lib/integrations/google-business-profile";

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

function redirectWithStatus(status: "connected" | "error", reason?: string) {
  const url = new URL(`${appUrl()}/dashboard/testimonials`);
  url.searchParams.set("google", status);
  if (reason) url.searchParams.set("reason", reason);
  const response = NextResponse.redirect(url.toString(), 302);
  // Always clear the single-use state cookie.
  response.cookies.set(OAUTH_STATE_COOKIE, "", { maxAge: 0, path: "/" });
  return response;
}

export const GET = withSuperAdminAuth(async (req: NextRequest, _ctx, auth) => {
  const params = req.nextUrl.searchParams;
  const oauthError = params.get("error");
  const code = params.get("code");
  const state = params.get("state");
  const storedState = req.cookies.get(OAUTH_STATE_COOKIE)?.value;

  // 1. Google-reported consent error (e.g. access_denied)
  if (oauthError) {
    return redirectWithStatus("error", oauthError.slice(0, 64));
  }

  // 2. CSRF: the state must exist, match the httpOnly cookie, and be single-use.
  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.json(
      { error: "Invalid or expired OAuth state" },
      { status: 400 }
    );
  }

  try {
    // 3. Exchange the authorization code (server → Google over TLS only).
    const tokens = await exchangeAuthorizationCode(code);

    if (!tokens.refresh_token) {
      // Google omits refresh_token without offline+consent; the admin must
      // reconnect (start route always sends prompt=consent, so this is rare).
      return redirectWithStatus("error", "no_refresh_token");
    }

    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    // 4. Store the connection via the RLS-gated (manager+) Supabase client.
    //    google_account_id / google_location_id stay NULL until the
    //    location-confirmation step (requires the first real GBP API call).
    const { error: insertError } = await auth.supabase
      .from("google_connections")
      .insert({
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token,
        token_expires_at: tokenExpiresAt.toISOString(),
        connected_by: auth.user.id,
        sync_enabled: true,
      });

    if (insertError) {
      // Safe log: error message only — never tokens or the request URL.
      console.error("[GBP-OAUTH] connection store failed:", insertError.message);
      return redirectWithStatus("error", "store_failed");
    }

    return redirectWithStatus("connected");
  } catch (error) {
    // Safe log: message only (the exchange error is already secret-free).
    console.error(
      "[GBP-OAUTH] callback failed:",
      error instanceof Error ? error.message : String(error)
    );
    return redirectWithStatus("error", "exchange_failed");
  }
});
