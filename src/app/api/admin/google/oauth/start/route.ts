/**
 * Google Business Profile OAuth — step 1: start the consent flow.
 *
 * GET /api/admin/google/oauth/start
 *
 * Server-only boundary (loop spec §5). Super-admin gated. Redirects the
 * admin's browser to Google's consent screen with:
 *   - scope        = GBP management scope (business.manage)
 *   - access_type  = offline  (so a refresh token is issued)
 *   - prompt       = consent  (so a refresh token is issued on re-connect)
 *   - state        = single-use random value, double-submitted via an
 *                    httpOnly cookie and verified by the callback route.
 *
 * No tokens are involved at this stage. If the integration is not
 * configured (missing env vars), returns 503 with variable NAMES only —
 * never values.
 *
 * NOTE: this is the Google Business Profile API OAuth flow, NOT Supabase
 * Auth Google login (they are unrelated integrations).
 */

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { withSuperAdminAuth } from "@/lib/auth/server";
import {
  buildAuthorizationUrl,
  getGoogleBPConfig,
  GOOGLE_BP_ENV_VARS,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_SECONDS,
} from "@/lib/integrations/google-business-profile";

export const GET = withSuperAdminAuth(async (_req: NextRequest, _ctx, auth) => {
  void auth;
  const config = getGoogleBPConfig();

  if (!config) {
    return NextResponse.json(
      {
        error: "Google Business Profile integration is not configured",
        requiredEnvVars: GOOGLE_BP_ENV_VARS,
        // Names only — never values. See .env.example for the placeholders.
      },
      { status: 503 }
    );
  }

  const state = randomBytes(32).toString("hex");

  const consentUrl = buildAuthorizationUrl(config, {
    state,
    prompt: "consent",
  });

  const response = NextResponse.redirect(consentUrl, 302);
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: OAUTH_STATE_TTL_SECONDS,
    path: "/",
  });
  return response;
});
