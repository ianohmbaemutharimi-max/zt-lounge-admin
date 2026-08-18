/**
 * Media URL Resolution Layer
 * 
 * Resolves image URLs from media_id to media_assets.public_url
 * with fallback to legacy image_url field.
 * 
 * This enables backward-compatible rendering where:
 * - If media_id exists and asset is found: use media_assets.public_url
 * - If media_id is NULL or asset not found: use image_url
 * - If both are missing: return null
 */

import { SupabaseClient } from "@supabase/supabase-js";

export interface ResolvedImageData {
  /** The resolved image URL (prioritized: media_assets.public_url > image_url) */
  resolvedUrl: string | null;
  /** Original media_id if provided */
  mediaId: string | null;
  /** Original fallback image_url */
  imageUrl: string | null;
  /** Whether the URL came from media_assets (true) or legacy image_url (false) */
  fromMediaAsset: boolean;
}

/**
 * Resolve a single image URL from media_id and fallback
 * 
 * @param supabase Supabase client
 * @param mediaId UUID of media asset
 * @param fallbackUrl Legacy image_url
 * @returns Resolved image data with priority: media_asset > fallback
 */
export async function resolveImageUrl(
  supabase: SupabaseClient,
  mediaId: string | null | undefined,
  fallbackUrl: string | null | undefined
): Promise<ResolvedImageData> {
  // If no media_id, use fallback
  if (!mediaId) {
    return {
      resolvedUrl: fallbackUrl || null,
      mediaId: null,
      imageUrl: fallbackUrl || null,
      fromMediaAsset: false,
    };
  }

  // Try to fetch media asset
  try {
    const { data, error } = await supabase
      .from("media_assets")
      .select("id, public_url")
      .eq("id", mediaId)
      .single();

    if (!error && data?.public_url) {
      return {
        resolvedUrl: data.public_url,
        mediaId,
        imageUrl: fallbackUrl || null,
        fromMediaAsset: true,
      };
    }
  } catch (err) {
    // Silently fall through to fallback
  }

  // Fallback to legacy image_url
  return {
    resolvedUrl: fallbackUrl || null,
    mediaId,
    imageUrl: fallbackUrl || null,
    fromMediaAsset: false,
  };
}

/**
 * Batch resolve multiple image URLs
 * 
 * Fetches all referenced media assets in one query to avoid N+1.
 * 
 * @param supabase Supabase client
 * @param items Array of objects with mediaId and imageUrl properties
 * @returns Original items enriched with resolved URLs
 */
export async function resolveImageUrls<
  T extends {
    media_id?: string | null;
    image_url?: string | null;
    mediaId?: string | null;
    imageUrl?: string | null;
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
        // Silently fall through - use fallback URLs
      } else if (data) {
        for (const asset of data) {
          mediaMap.set(asset.id, asset.public_url);
        }
      }
    }

    // Enrich items with resolved URLs
    return items.map((item) => {
      const mediaId = item.media_id || item.mediaId;
      const imageUrl = item.image_url || item.imageUrl;

      let resolvedUrl: string | null = null;
      if (mediaId && mediaMap.has(mediaId)) {
        resolvedUrl = mediaMap.get(mediaId) || null;
      } else if (imageUrl) {
        resolvedUrl = imageUrl;
      }

      return {
        ...item,
        resolved_image_url: resolvedUrl,
      };
    });
  } catch (err) {
    console.error("[resolveImageUrls] Unexpected error:", err);
    // Fallback: just add resolved_image_url based on existing fields
    return items.map((item) => {
      const imageUrl = item.image_url || item.imageUrl;
      return {
        ...item,
        resolved_image_url: imageUrl || null,
      };
    });
  }
}
