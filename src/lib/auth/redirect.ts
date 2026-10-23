/**
 * Post-login redirect helpers (Loop 65).
 *
 * Middleware preserves the originally requested dashboard URL as
 * `/login?redirect=<path>` for unauthenticated/unauthorized users. These
 * helpers are the single place that decides whether such a value may be
 * navigated to, and they are shared by middleware.ts (the authenticated
 * `/login` branch) and the login page (the post-login navigation) so the two
 * call sites can never drift into conflicting validation.
 *
 * The value originates from a query string, so it is treated as untrusted:
 * only same-origin `/dashboard…` paths are ever returned.
 */

/** The login route that carries the `redirect` parameter. */
export const LOGIN_PATH = "/login";

/** Query parameter that carries the intended post-login destination. */
export const REDIRECT_PARAM = "redirect";

/** Where an authenticated user goes when there is no valid intended target. */
export const DEFAULT_AUTHENTICATED_PATH = "/dashboard";

/**
 * Base used only to resolve root-relative candidates through the WHATWG URL
 * parser. It never leaves this module, and any candidate that resolves to a
 * different origin is rejected below.
 */
const RESOLUTION_BASE = "http://localhost";

/** Percent-encoded ".", "/" or "\" — could confuse a later consumer about depth. */
const ENCODED_SEPARATOR = /%(2e|2f|5c)/i;

/** Control characters (and DEL) have no legitimate place in a path. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Validate an untrusted post-login redirect candidate.
 *
 * Accepts only same-origin paths inside the `/dashboard` tree, preserving the
 * query string of the original request. Returns `null` for everything else:
 * absolute URLs (`https://example.com`), protocol-relative (`//example.com`),
 * `javascript:…`, `data:…`, non-dashboard application paths, and anything that
 * URL resolution would normalize outside `/dashboard` (e.g. `/dashboard/../x`).
 *
 * @param value - Raw `redirect` query parameter (may be null/undefined).
 * @returns A safe `/dashboard…` path (pathname + query), or `null`.
 */
export function safeRedirectPath(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;

  const candidate = value.trim();
  if (candidate.length === 0) return null;

  // Must be a root-relative path. This alone rejects "https://example.com"
  // ("https:" does not start with "/"), "javascript:…", "data:…" and
  // protocol-relative "//example.com".
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return null;

  // Reject backslashes (some consumers treat them as "/") and control chars.
  if (candidate.includes("\\") || CONTROL_CHARS.test(candidate)) return null;
  if (ENCODED_SEPARATOR.test(candidate)) return null;

  let resolved: URL;
  try {
    resolved = new URL(candidate, RESOLUTION_BASE);
  } catch {
    return null;
  }

  // Defense in depth: if anything resolved to another origin, refuse it.
  if (resolved.origin !== RESOLUTION_BASE) return null;

  // Only dashboard destinations are valid; unrelated app paths are rejected.
  // (Resolution above has already collapsed any `..` segments.)
  if (resolved.pathname !== "/dashboard" && !resolved.pathname.startsWith("/dashboard/")) {
    return null;
  }

  return `${resolved.pathname}${resolved.search}`;
}

/**
 * Resolve the post-login destination: the validated intended target when the
 * request carried a safe one, otherwise the default dashboard.
 */
export function postLoginPath(value: string | null | undefined): string {
  return safeRedirectPath(value) ?? DEFAULT_AUTHENTICATED_PATH;
}