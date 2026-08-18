/**
 * PHASE 3 — MEDIA SELECTION DATA ACCESS
 * 
 * Reusable client-side helper for fetching media assets for CMS selection.
 * This is a thin wrapper around /api/media providing type-safe access.
 * 
 * Usage:
 *   const result = await getSelectableMedia({ search: "photo" });
 *   const asset = result.data[0];  // SelectableMediaAsset
 *   const mediaId = asset.id;      // Use with CMS record
 */

import type {
  SelectableMediaAsset,
  MediaQueryOptions,
  MediaSelectionResponse,
} from "@/types/media";

/**
 * Fetch selectable media assets from /api/media
 * 
 * Admin-only operation protected by withAdminAuth middleware.
 * 
 * @param options Query parameters (bucket, search, pagination)
 * @returns Paginated media assets with metadata
 * @throws Error if unauthorized or API fails
 */
export async function getSelectableMedia(
  options?: MediaQueryOptions
): Promise<MediaSelectionResponse> {
  const searchParams = new URLSearchParams();

  if (options?.bucket) {
    searchParams.set("bucket", options.bucket);
  }

  if (options?.search) {
    searchParams.set("search", options.search);
  }

  if (options?.limit) {
    searchParams.set("limit", String(options.limit));
  }

  if (options?.offset) {
    searchParams.set("offset", String(options.offset));
  }

  const response = await fetch(`/api/media?${searchParams.toString()}`);

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Unauthorized: Admin access required");
    }
    if (response.status === 403) {
      throw new Error("Forbidden: Insufficient permissions");
    }
    throw new Error("Failed to fetch media assets");
  }

  const data = await response.json() as MediaSelectionResponse;
  return data;
}

/**
 * Fetch a single media asset by ID
 * 
 * @param mediaId UUID of media asset
 * @returns The media asset or null if not found
 * @throws Error if unauthorized or API fails
 */
export async function getMediaAssetById(
  mediaId: string
): Promise<SelectableMediaAsset | null> {
  try {
    const result = await getSelectableMedia();
    const asset = result.data.find((a) => a.id === mediaId);
    return asset || null;
  } catch {
    return null;
  }
}

/**
 * Search media assets by text query
 * 
 * Searches title, alt_text, and path fields.
 * Admin-only operation.
 * 
 * @param query Search term
 * @param limit Max results (default 50)
 * @returns Matching media assets
 */
export async function searchMediaAssets(
  query: string,
  limit: number = 50
): Promise<SelectableMediaAsset[]> {
  try {
    const result = await getSelectableMedia({
      search: query,
      limit,
    });
    return result.data;
  } catch (error) {
    console.error("Media search error:", error);
    return [];
  }
}

/**
 * Validate that a media_id exists and is accessible
 * 
 * Used by Phase 4 UI to verify selection before saving.
 * 
 * @param mediaId UUID to validate
 * @returns true if media exists and is accessible
 */
export async function validateMediaId(mediaId: string): Promise<boolean> {
  try {
    const asset = await getMediaAssetById(mediaId);
    return asset !== null;
  } catch {
    return false;
  }
}

/**
 * Get media assets in a specific bucket
 * 
 * @param bucket Bucket name
 * @param limit Max results
 * @returns Media assets in bucket
 */
export async function getMediaByBucket(
  bucket: string,
  limit: number = 50
): Promise<SelectableMediaAsset[]> {
  try {
    const result = await getSelectableMedia({
      bucket,
      limit,
    });
    return result.data;
  } catch (error) {
    console.error("Error fetching media by bucket:", error);
    return [];
  }
}
