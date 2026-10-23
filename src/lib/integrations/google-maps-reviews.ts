/**
 * SERVER-ONLY Google Maps Places API reviews integration.
 *
 * Replaces the OAuth-based GBP path with a simpler API-key-based approach
 * for fetching public Google Maps reviews.
 *
 * Uses Google Places API (New) - Place Details:
 * https://developers.google.com/maps/documentation/places/web-service/place-details
 *
 * Flow:
 * 1. Admin stores Place ID + API key in business_settings
 * 2. Sync fetches reviews via Places API
 * 3. Maps to testimonials table (approved=false, source='google')
 * 4. Admin moderates (approve/feature) → visible on website
 */

// ─── Types ─────────────────────────────────────────────────────────────

export interface GoogleMapsReview {
  name: string; // Resource name (e.g., "accounts/.../locations/.../reviews/...")
  reviewId: string;
  reviewer: {
    displayName?: string;
    profilePhotoUrl?: string;
  };
  starRating: 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE';
  comment?: string;
  createTime?: string; // RFC3339
  updateTime?: string;
}

export interface GooglePlaceReview {
  author_name?: string;
  author_url?: string;
  profile_photo_url?: string;
  rating?: number; // 1-5
  text?: string;
  time?: number; // Unix timestamp
  relative_time_description?: string;
}

export interface GooglePlaceDetailsResponse {
  result?: {
    name?: string;
    reviews?: GooglePlaceReview[];
    rating?: number;
    user_ratings_total?: number;
  };
  status: string;
  error_message?: string;
}

export interface TestimonialInsert {
  source: 'google';
  external_id: string;
  external_url: string | null;
  author_photo_url: string | null;
  reviewed_at: string | null;
  customer_name: string;
  rating: number;
  comment: string;
  approved: false;
  is_featured: false;
}

// ─── API Client ────────────────────────────────────────────────────────

const PLACES_API_BASE = 'https://maps.googleapis.com/maps/api/place/details/json';

export class GoogleMapsApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleMapsApiError';
  }
}

/**
 * Fetch Google Maps reviews for a place using the Places API.
 * 
 * @param placeId - Google Place ID (e.g., "ChIJ...")
 * @param apiKey - Google Maps API key (server-side only)
 * @returns Array of reviews ready for testimonials table insert
 */
export async function fetchGoogleMapsReviews(
  placeId: string,
  apiKey: string
): Promise<TestimonialInsert[]> {
  if (!placeId || !apiKey) {
    throw new GoogleMapsApiError('Missing Place ID or API key');
  }

  const url = new URL(PLACES_API_BASE);
  url.searchParams.set('place_id', placeId);
  url.searchParams.set('fields', 'name,rating,user_ratings_total,reviews');
  url.searchParams.set('key', apiKey);

  const response = await fetch(url.toString(), {
    headers: {
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new GoogleMapsApiError(
      `Google Maps API request failed with HTTP ${response.status}`
    );
  }

  const data = (await response.json()) as GooglePlaceDetailsResponse;

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new GoogleMapsApiError(
      `Google Maps API error: ${data.status}${
        data.error_message ? ` - ${data.error_message}` : ''
      }`
    );
  }

  const reviews = data.result?.reviews ?? [];
  return reviews
    .map((review) => mapGooglePlaceReviewToTestimonial(review, placeId))
    .filter((t): t is TestimonialInsert => t !== null);
}

// ─── Mapping ───────────────────────────────────────────────────────────

/**
 * Map a Google Place review to testimonials table insert shape.
 * Returns null if the review is not mappable (missing required fields).
 */
function mapGooglePlaceReviewToTestimonial(
  review: GooglePlaceReview,
  placeId: string
): TestimonialInsert | null {
  if (!review || !review.time) {
    return null; // No timestamp = can't dedupe, skip
  }

  // Generate a stable external_id from place_id + timestamp + author
  // (Google Places API doesn't provide review IDs)
  const externalId = `${placeId}_${review.time}_${
    review.author_name?.replace(/\s+/g, '_') ?? 'anonymous'
  }`;

  return {
    source: 'google',
    external_id: externalId,
    external_url: review.author_url ?? null,
    author_photo_url: review.profile_photo_url ?? null,
    reviewed_at: review.time ? new Date(review.time * 1000).toISOString() : null,
    customer_name: review.author_name ?? 'Google User',
    rating: review.rating ?? 5,
    comment: review.text ?? '',
    approved: false,
    is_featured: false,
  };
}

/**
 * Extract Place ID from a Google Maps URL.
 * Supports formats:
 * - https://www.google.com/maps/place/...data=...!1s0x0:0x123!...
 * - https://maps.app.goo.gl/...
 * - Direct Place ID string
 */
export function extractPlaceId(urlOrId: string): string | null {
  if (!urlOrId) return null;

  // Direct Place ID (starts with ChIJ, etc.)
  if (/^[A-Za-z0-9_-]{20,}$/.test(urlOrId)) {
    return urlOrId;
  }

  // Extract from !1s format: !1sChIJabcd...
  const match1s = urlOrId.match(/!1s([A-Za-z0-9_-]{20,})/);
  if (match1s) return match1s[1];

  // Extract from ftid= format
  const matchFtid = urlOrId.match(/ftid=([A-Za-z0-9_-]{20,})/);
  if (matchFtid) return matchFtid[1];

  return null;
}
