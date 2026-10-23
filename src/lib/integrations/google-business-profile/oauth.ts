/**
 * SERVER-ONLY Google OAuth helpers for the Business Profile API path.
 *
 * Responsibility boundary (clean path, loop spec §5):
 *   - build the consent URL (offline access, consent prompt → refresh token)
 *   - exchange the authorization code for tokens
 *   - refresh an access token from a stored refresh token
 * It does NOT persist anything and does NOT touch Supabase — storage is the
 * route layer's job (google_connections table via the RLS-gated client).
 *
 * Secrets: client_secret is sent only to Google's token endpoint over TLS
 * and is never logged, serialized into errors, or returned to the browser.
 * No browser-side token handling exists anywhere in this module.
 */

import {
  getGoogleBPConfig,
  GoogleBPNotConfiguredError,
  type GoogleBPConfig,
} from "./config";
import type {
  GoogleTokenResponse,
  GoogleTokenErrorResponse,
} from "./types";

const OAUTH_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface AuthorizationUrlOptions {
  /** Server-generated single-use state (CSRF protection). */
  state: string;
  /** Force the consent screen so a refresh_token is always issued. */
  prompt?: "consent" | "select_account" | "none";
}

/**
 * Build the Google consent URL (does not perform any network call).
 * access_type=offline + prompt=consent are required to obtain a refresh
 * token on repeat connections.
 */
export function buildAuthorizationUrl(
  config: GoogleBPConfig,
  options: AuthorizationUrlOptions
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/business.manage",
    access_type: "offline",
    include_granted_scopes: "true",
    state: options.state,
  });
  if (options.prompt) params.set("prompt", options.prompt);
  return `${OAUTH_AUTH_BASE}?${params.toString()}`;
}

/** Convenience wrapper that fails with the typed not-configured error. */
export function buildAuthorizationUrlOrThrow(
  options: AuthorizationUrlOptions
): string {
  const config = getGoogleBPConfig();
  if (!config) throw new GoogleBPNotConfiguredError();
  return buildAuthorizationUrl(config, options);
}

interface TokenRequestForm {
  code?: string;
  refresh_token?: string;
  grant_type: "authorization_code" | "refresh_token";
}

async function requestTokens(form: TokenRequestForm): Promise<GoogleTokenResponse> {
  const config = getGoogleBPConfig();
  if (!config) throw new GoogleBPNotConfiguredError();

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    ...form,
  });

  const response = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const payload = (await response.json().catch(() => null)) as
    | GoogleTokenResponse
    | GoogleTokenErrorResponse
    | null;

  if (!response.ok || !payload || "error" in payload) {
    // SAFE error: only Google's error code/description — never the request
    // body, never the client secret, never any token value.
    const err = payload && "error" in payload ? payload : null;
    throw new Error(
      `Google OAuth token request failed (${response.status}): ${
        err?.error ?? "unknown_error"
      }${err?.error_description ? `: ${err.error_description}` : ""}`
    );
  }
  return payload;
}

/** Exchange the OAuth authorization code for tokens (called from the callback route). */
export function exchangeAuthorizationCode(code: string): Promise<GoogleTokenResponse> {
  return requestTokens({ code, grant_type: "authorization_code" });
}

/** Refresh an access token from the stored refresh token (used by the future sync). */
export function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  return requestTokens({ refresh_token: refreshToken, grant_type: "refresh_token" });
}
