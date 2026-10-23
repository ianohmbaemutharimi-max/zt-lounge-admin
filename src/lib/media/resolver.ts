/**
 * Media URL Resolution Layer — CANONICAL ONLY
 * 
 * Resolves image URLs from media_id to media_assets.public_url.
 * 
 * NO FALLBACK to legacy image_url fields.
 * Returns null if media_id is missing or asset not found.
 * 
 * This enforces canonical media architecture:
 * - media_id → media_assets → public_url
 * - No silent fallback masks broken references
 */

import { SupabaseClient } from "@supabase/supabase-js";

export interface ResolvedImageData {
  /** The resolved image URL from media_assets.public_url, or null if not found */
  resolvedUrl: string | null;
  /** Original media_id if provided */
  mediaId: string | null;
  /** Whether the URL was successfully resolved from media_assets */
  fromMediaAsset: boolean;
  /** Error message if resolution failed */
  error?: string;
}

/**
 * Resolve a single image URL from media_id (CANONICAL ONLY)
 * 
 * @param supabase Supabase client
 * @param mediaId UUID of media asset
 * @returns Resolved image data, or null if not found
 */
export async function resolveImageUrl(
  supabase: SupabaseClient,
  mediaId: string | null | undefined
): Promise<ResolvedImageData> {
  // No media_id = no resolution
  if (!mediaId) {
    return {
      resolvedUrl: null,
      mediaId: null,
      fromMediaAsset: false,
      error: "No media_id provided",
    };
  }

  // Fetch media asset
  try {
    const { data, error } = await supabase
      .from("media_assets")
      .select("id, public_url")
      .eq("id", mediaId)
      .single();

    if (error) {
      return {
        resolvedUrl: null,
        mediaId,
        fromMediaAsset: false,
        error: `Media asset not found: ${error.message}`,
      };
    }

    if (!data?.public_url) {
      return {
        resolvedUrl: null,
        mediaId,
        fromMediaAsset: false,
        error: "Media asset exists but has no public_url",
      };
    }

    return {
      resolvedUrl: data.public_url,
      mediaId,
      fromMediaAsset: true,
    };
  } catch (err) {
    return {
      resolvedUrl: null,
      mediaId,
      fromMediaAsset: false,
      error: `Unexpected error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Batch resolve multiple image URLs (CANONICAL ONLY)
 * 
 * Fetches all referenced media assets in one query to avoid N+1.
 * Items without media_id or with missing assets get null resolved_image_url.
 * 
 * @param supabase Supabase client
 * @param items Array of objects with media_id or mediaId properties
 * @returns Original items enriched with resolved URLs
 */
export async function resolveImageUrls<
  T extends {
    media_id?: string | null;
    mediaId?: string | null;
  }
>(supabase: SupabaseClient, items: T[]): Promise<(T & { resolved_image_url: string | null })[]> {
  try {
    // Extract unique media IDs
    const mediaIds = new Set<string>();
    for (const item of items) {
      const id = item.media_id || item.mediaId;
      if (id) mediaIds.add(id);
    }

    // Fetch all media assets in one query
    const mediaMap = new Map<string, string>();
    if (mediaIds.size > 0) {
      const { data, error } = await supabase
        .from("media_assets")
        .select("id, public_url")
        .in("id", Array.from(mediaIds));

      if (error) {
        console.error("[resolveImageUrls] Media asset fetch error:", error);
        // Continue with empty map - items will get null URLs
      } else if (data) {
        for (const asset of data) {
          if (asset.public_url) {
            mediaMap.set(asset.id, asset.public_url);
          }
        }
      }
    }

    // Enrich items with resolved URLs (canonical only)
    return items.map((item) => {
      const mediaId = item.media_id || item.mediaId;
      const resolvedUrl = mediaId ? (mediaMap.get(mediaId) || null) : null;

      return {
        ...item,
        resolved_image_url: resolvedUrl,
      };
    });
  } catch (err) {
    console.error("[resolveImageUrls] Unexpected error:", err);
    // Return items with null URLs rather than failing
    return items.map((item) => ({
      ...item,
      resolved_image_url: null,
    }));
  }
}
