/**
 * SERVER-ONLY Google Business Profile account + location discovery.
 *
 * Adds the ONE missing capability the connection flow needs: after OAuth
 * consent the admin must be able to SEE which GBP accounts/locations they
 * actually granted access to, and explicitly pick the ZT Lounge one.
 * (The OAuth callback deliberately stores NULL location ids — see
 * oauth/callback/route.ts — precisely because "first location wins" is not a
 * safe assumption.)
 *
 * Endpoints (GBP v4, current documented Business Profile APIs):
 *   GET /v4/accounts                       — accounts the user manages
 *   GET /v4/{parent=accounts/*}/locations  — locations under one account
 *
 * Security: the access token is supplied by the CALLER (server-side, from the
 * google_connections row). Nothing in this module reads env, persists state,
 * or returns a token. Errors are status-only, mirroring listReviews().
 *
 * Reference:
 *   https://developers.google.com/my-business/reference/rest/v4/accounts
 *   https://developers.google.com/my-business/reference/rest/v4/accounts.locations
 */
// ---------------------------------------------------------------------------
// Barrel re-exports.
//
// The discovery functions below are DECLARED here, but the OAuth/config/reviews
// modules are re-exported so existing consumers
//   import { ... } from "@/lib/integrations/google-business-profile";
// keep working unchanged. GoogleBPApiError is declared above and re-declared
// nowhere else, so it is NOT re-exported from ./reviews (that module has its own
// identically-named error type; consumers import it from ./reviews directly).
// ---------------------------------------------------------------------------
export * from "./config";
export * from "./oauth";
export * from "./types";
export {
  listReviews,
  googleReviewToTestimonialInsert,
} from "./reviews";



import type {
  GoogleListReviewsResponse,
  GoogleReview,
  GoogleStarRating,
} from "./types";

const GBP_API_BASE = "https://mybusiness.googleapis.com/v4";

export class GoogleBPApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleBPApiError";
  }
}

/** One GBP account (business). Token-free summary for the admin UI. */
export interface GoogleAccount {
  name: string; // "accounts/{id}"
  accountName: string;
  accountId: string;
}

/** One GBP location under an account. Token-free summary for the admin UI. */
export interface GoogleLocation {
  name: string; // "accounts/{a}/locations/{l}"
  locationId: string;
  locationName: string;
  storeCode?: string;
  /** Storefront address lines joined — enough to disambiguate ZT Lounge. */
  address?: string;
  languageCode?: string;
}

interface RawAccount {
  name?: string;
  accountName?: string;
}

interface RawLocation {
  name?: string;
  title?: string;
  storeCode?: string;
  languageCode?: string;
  address?: {
    addressLines?: string[];
    locality?: string;
    administrativeArea?: string;
    postalCode?: string;
  };
}

/** `accounts/{id}` -> `{id}` */
function idFromResource(resourceName: string | undefined, kind: "accounts" | "locations"): string | null {
  if (!resourceName) return null;
  const parts = resourceName.split("/");
  const idx = parts.indexOf(kind);
  if (idx === -1 || !parts[idx + 1]) return null;
  return parts[idx + 1];
}

async function assertOk(response: Response, what: string): Promise<void> {
  if (response.ok) return;
  // Safe error: status only. The body may echo request/token details and is
  // never surfaced to clients or logs verbatim (mirrors listReviews()).
  throw new GoogleBPApiError(`${what} failed with HTTP ${response.status}`);
}

/**
 * List the GBP accounts the authorized user can manage.
 * Returns [] when the account has no accessible business — a legitimate
 * state, NOT an error.
 */
export async function listAccounts(accessToken: string): Promise<GoogleAccount[]> {
  if (!accessToken) throw new GoogleBPApiError("Missing Google access token");

  const response = await fetch(`${GBP_API_BASE}/accounts`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  await assertOk(response, "accounts.list");

  const body = (await response.json()) as { accounts?: RawAccount[] };
  const out: GoogleAccount[] = [];
  for (const a of body.accounts ?? []) {
    const accountId = idFromResource(a.name, "accounts");
    if (!a.name || !accountId) continue;
    out.push({ name: a.name, accountId, accountName: a.accountName || accountId });
  }
  return out;
}

/**
 * List the locations under one account.
 * @param accountId Bare account id (not the "accounts/{id}" resource name).
 */
export async function listLocations(
  accessToken: string,
  accountId: string
): Promise<GoogleLocation[]> {
  if (!accessToken) throw new GoogleBPApiError("Missing Google access token");
  if (!/^[^/]+$/.test(accountId)) {
    throw new GoogleBPApiError(`Invalid GBP account id "${accountId}"`);
  }

  const params = new URLSearchParams({ pageSize: "100" });
  const response = await fetch(
    `${GBP_API_BASE}/accounts/${encodeURIComponent(accountId)}/locations?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  await assertOk(response, "locations.list");

  const body = (await response.json()) as { locations?: RawLocation[] };
  const out: GoogleLocation[] = [];
  for (const l of body.locations ?? []) {
    const locationId = idFromResource(l.name, "locations");
    if (!l.name || !locationId) continue;
    const a = l.address;
    const address = a
      ? [...(a.addressLines ?? []), a.locality, a.administrativeArea, a.postalCode]
          .filter(Boolean)
          .join(", ")
          .trim() || undefined
      : undefined;
    out.push({
      name: l.name,
      locationId,
      locationName: l.title || locationId,
      storeCode: l.storeCode || undefined,
      address,
      languageCode: l.languageCode || undefined,
    });
  }
  return out;
}


