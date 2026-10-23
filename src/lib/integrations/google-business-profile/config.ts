/**
 * SERVER-ONLY Google Business Profile integration configuration.
 *
 * Reads the three required server-side environment variables and reports
 * configuration readiness without ever exposing secret values.
 *
 * IMPORTANT — this is NOT Supabase Auth Google login:
 *   Supabase Auth Google  = signing users INTO the admin app (disabled in
 *                           supabase/config.toml; unrelated to reviews).
 *   Google Business Pro-
 *   file API OAuth        = delegating ZT Lounge's GBP account so the server
 *                           can read that business's reviews. Scope:
 *                           https://www.googleapis.com/auth/business.manage
 *
 * Conventions: server-only variables use bare names (like
 * SUPABASE_SERVICE_ROLE_KEY); NEXT_PUBLIC_* would leak them to the browser
 * and is therefore forbidden here.
 *
 * No secret value is ever logged or returned by this module.
 */

export interface GoogleBPConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export const GOOGLE_BP_ENV_VARS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
] as const;

const PLACEHOLDER_PATTERN = /^(|env_.*PLACEHOLDER|<[^>]*>|changeme|your[-_].*)$/i;

function readEnv(name: string): string {
  const value = process.env[name];
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  // Never treat a committed placeholder as a real credential.
  if (PLACEHOLDER_PATTERN.test(trimmed)) return "";
  return trimmed;
}

/**
 * Returns the full configuration when all three variables are present and
 * non-placeholder; otherwise null. Callers must fail with a clear
 * "not configured" error rather than half-configured behavior.
 */
export function getGoogleBPConfig(): GoogleBPConfig | null {
  const clientId = readEnv("GOOGLE_CLIENT_ID");
  const clientSecret = readEnv("GOOGLE_CLIENT_SECRET");
  const redirectUri = readEnv("GOOGLE_REDIRECT_URI");
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function isGoogleBPConfigured(): boolean {
  return getGoogleBPConfig() !== null;
}

/**
 * httpOnly cookie used for OAuth CSRF state (set by /oauth/start, verified
 * and cleared by /oauth/callback). Lives here — NOT in a route file — because
 * Next.js route modules may only export handlers/config.
 */
export const OAUTH_STATE_COOKIE = "gbp_oauth_state";
export const OAUTH_STATE_TTL_SECONDS = 600; // 10 minutes to complete consent

/** Error type for a missing/unconfigured integration (safe to serialize). */
export class GoogleBPNotConfiguredError extends Error {
  constructor() {
    super(
      "Google Business Profile integration is not configured. Required server env vars: " +
        GOOGLE_BP_ENV_VARS.join(", ")
    );
    this.name = "GoogleBPNotConfiguredError";
  }
}
