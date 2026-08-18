/**
 * Google Business Profile API Client
 */
import {
  GoogleReview,
  GoogleReviewsListResponse,
  GoogleIntegrationError,
  GoogleErrorCode,
} from './types';

const BBP = 'https://mybusinessbusinessinformation.googleapis.com/v1';

export async function fetchGoogleReviewsPage(
  accessToken: string,
  locationId: string,
  pageToken?: string
): Promise<GoogleReviewsListResponse> {
  const url = new URL(`${BBP}/${locationId}/reviews`);
  if (pageToken) url.searchParams.set('pageToken', pageToken);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new GoogleIntegrationError(
      `Google API: ${res.status} ${res.statusText}`,
      GoogleErrorCode.API_REQUEST_FAILED,
      { status: res.status, body: await res.text() }
    );
  }
  return (await res.json()) as GoogleReviewsListResponse;
}
