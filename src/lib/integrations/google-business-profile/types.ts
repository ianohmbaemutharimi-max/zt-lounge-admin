/**
 * SERVER-ONLY types for the Google Business Profile integration.
 *
 * Field names mirror the official GBP API v4 payloads (reviews.list /
 * Review resource) and the OAuth 2.0 token endpoint, verified against the
 * current official documentation:
 *   - https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews
 *   - https://developers.google.com/my-business/content/review-data
 *   - https://developers.google.com/my-business/content/prereqs
 *   - https://developers.google.com/my-business/content/limits
 *
 * Nothing in this file is imported by client components.
 */

// ─── GBP management scope (the ONLY scope needed for reviews.list) ────
export const GBP_MANAGE_SCOPE = "https://www.googleapis.com/auth/business.manage";

// ─── OAuth (Google token endpoint payloads) ───────────────────────────
export interface GoogleTokenResponse {
  access_token: string;
  /** Present only on the first consent (access_type=offline, prompt=consent). */
  refresh_token?: string;
  expires_in: number; // seconds (~3600)
  scope?: string;
  token_type?: string;
  id_token?: string;
}

export interface GoogleTokenErrorResponse {
  error: string;
  error_description?: string;
}

// ─── GBP v4 Review resource (subset used by the sync contract) ────────
export type GoogleStarRating =
  | "ONE"
  | "TWO"
  | "THREE"
  | "FOUR"
  | "FIVE";

export interface GoogleReviewer {
  /** Profile photo URL (remote Google asset) — may be absent for anonymous reviewers. */
  profilePhotoUrl?: string;
  displayName?: string;
  isAnonymous?: boolean;
}

export interface GoogleReviewReply {
  comment?: string;
  updateTime?: string;
  /** Rejected-reply moderation states exist per the official reference. */
  [key: string]: unknown;
}

export interface GoogleReview {
  /** Full resource name: accounts/{a}/locations/{l}/reviews/{reviewId}. */
  name?: string;
  /** Stable external identity — the idempotent-sync key. */
  reviewId?: string;
  locationId?: string;
  reviewer?: GoogleReviewer;
  starRating?: GoogleStarRating;
  comment?: string;
  createTime?: string; // RFC3339 — maps to testimonials.reviewed_at
  updateTime?: string; // change-detection input
  reviewReply?: GoogleReviewReply;
}

export interface GoogleListReviewsResponse {
  reviews?: GoogleReview[];
  averageRating?: number;
  totalReviewCount?: number;
  nextPageToken?: string;
}

// ─── google_connections rows (TOKEN-FREE projections only) ────────────
export interface GoogleConnectionPublic {
  id: string;
  google_account_id: string | null;
  google_location_id: string | null;
  google_location_name: string | null;
  connected_at: string | null;
  last_sync_at: string | null;
  sync_enabled: boolean;
  token_expires_at: string | null;
}

// ─── Sync-run rows ────────────────────────────────────────────────────
export type SyncRunStatus = "running" | "completed" | "failed";
