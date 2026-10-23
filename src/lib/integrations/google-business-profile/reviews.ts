/**
 * SERVER-ONLY Google review retrieval + canonical mapping contract.
 *
 * TWO responsibilities, strictly separated:
 *
 * 1. API client (reviews.list) — a thin, typed wrapper over the GBP v4
 *    endpoint. It is NOT invoked anywhere in this loop (no route or sync
 *    calls it yet); it exists so the next loop's sync composes this module
 *    instead of inlining HTTP code. Errors never include tokens.
 *
 * 2. Mapping contract — the ONE canonical Google review → testimonial
 *    mapping (loop spec §9). Google-owned fields are set from the review;
 *    ZT-owned moderation fields are NOT touched here. New Google reviews
 *    always land with approved = false.
 */

import type {
  GoogleListReviewsResponse,
  GoogleReview,
  GoogleStarRating,
} from "./types";

// ─── 1. API client (reviews.list) ─────────────────────────────────────

const GBP_API_BASE = "https://mybusiness.googleapis.com/v4";

export class GoogleBPApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleBPApiError";
  }
}

/**
 * Fetch one page of reviews for a location.
 * @param accessToken  Server-side access token (never a browser token).
 * @param parent       Location resource name: "accounts/{id}/locations/{lid}".
 * @param pageToken    Optional pagination token from a previous response.
 * @returns Parsed ListReviewsResponse (reviews, averageRating, totalReviewCount, nextPageToken).
 *
 * NOT invoked in this loop — the sync loop composes this function.
 */
export async function listReviews(
  accessToken: string,
  parent: string,
  pageToken?: string
): Promise<GoogleListReviewsResponse> {
  if (!accessToken) throw new GoogleBPApiError("Missing Google access token");
  if (!/^accounts\/[^/]+\/locations\/[^/]+$/.test(parent)) {
    throw new GoogleBPApiError(
      `Invalid GBP location parent "${parent}" — expected accounts/{id}/locations/{lid}`
    );
  }

  const params = new URLSearchParams({ pageSize: "50" });
  if (pageToken) params.set("pageToken", pageToken);

  const response = await fetch(
    `${GBP_API_BASE}/${parent}/reviews?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    // Safe error: status only — the body may echo request details and is
    // never surfaced to clients or logs verbatim.
    throw new GoogleBPApiError(
      `reviews.list failed with HTTP ${response.status}`
    );
  }

  return (await response.json()) as GoogleListReviewsResponse;
}

// ─── 2. Canonical mapping contract ────────────────────────────────────

/** snake_case testimonial columns set by the sync (Google-owned content). */
export interface GoogleReviewTestimonialInsert {
  source: "google";
  external_id: string;
  external_url: string | null;
  author_photo_url: string | null;
  reviewed_at: string | null; // Google createTime (RFC3339)
  customer_name: string;
  rating: number;
  comment: string;
  // ZT-owned moderation defaults — new Google reviews are NEVER public.
  approved: false;
}

/**
 * Fields that generic testimonial CRUD must never allow clients to write
 * on Google rows. ZT-owned moderation fields (approved, is_featured,
 * display_order, page_id) are intentionally NOT in this list.
 */
export const GOOGLE_OWNED_TESTIMONIAL_FIELDS = [
  "source",
  "external_id",
  "external_url",
  "author_photo_url",
  "reviewed_at",
  "last_synced_at",
  "customer_name",
  "rating",
  "comment",
] as const;

const STAR_RATING_TO_NUMBER: Record<GoogleStarRating, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

export function starRatingToNumber(starRating: GoogleStarRating | undefined): number {
  return starRating ? STAR_RATING_TO_NUMBER[starRating] ?? 5 : 5;
}

/**
 * THE canonical mapping (loop spec §9):
 *   reviewer.displayName   → customer_name
 *   starRating             → rating
 *   comment                → comment
 *   reviewer.profilePhotoUrl → author_photo_url
 *   reviewId               → external_id
 *   review resource name   → external_url
 *   createTime             → reviewed_at
 *   "google"               → source
 *   — and approved is ALWAYS false for brand-new Google reviews.
 *
 * Returns null when the review is not mappable (missing reviewId) — the
 * future sync counts it under reviews_failed rather than guessing.
 */
export function googleReviewToTestimonialInsert(
  review: GoogleReview
): GoogleReviewTestimonialInsert | null {
  if (!review || !review.reviewId) return null;

  return {
    source: "google",
    external_id: review.reviewId,
    // Google review resource URL — prefer the full resource `name`; fall
    // back to building it from the location + id when available.
    external_url:
      review.name ??
      (review.locationId ? `accounts/-/locations/${review.locationId}/reviews/${review.reviewId}` : null),
    author_photo_url: review.reviewer?.profilePhotoUrl ?? null,
    reviewed_at: review.createTime ?? null,
    // Anonymous reviewers have no displayName — fall back to a neutral label.
    customer_name: review.reviewer?.displayName ?? "Google review",
    rating: starRatingToNumber(review.starRating),
    comment: review.comment ?? "",
    approved: false, // moderation required before publication
  };
}
