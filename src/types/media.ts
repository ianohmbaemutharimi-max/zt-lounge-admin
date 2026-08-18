/**
 * PHASE 3 — MEDIA SELECTION DATA CONTRACT
 * 
 * Shared TypeScript types for media asset selection across CMS modules.
 * This establishes a stable interface for Phase 4 media picker UI.
 * 
 * Media selection is READ-ONLY and does not mutate media_assets.
 * It retrieves existing media and exposes stable IDs for CMS references.
 */

/**
 * Selectable media asset for CMS modules
 * 
 * This is the core data contract:
 * - Admin can select from available media
 * - Receives media_id + metadata
 * - Later saves media_id to CMS record via repository
 * 
 * All fields are read-only. No mutations occur.
 */
export interface SelectableMediaAsset {
  // Core identifier — used for CMS record reference
  id: string;

  // Public URL — used for thumbnail display / preview
  public_url: string;

  // Metadata — used for admin reference
  original_name: string | null;
  mime_type: string | null;
  title: string | null;
  alt_text: string | null;

  // Dimensions — used for aspect ratio / thumbnail sizing
  width: number | null;
  height: number | null;

  // Storage info — informational only
  bucket: string;
  path: string;
  file_size: number | null;

  // Timestamps
  created_at: string;
}

/**
 * Media query filter options
 * Supports Phase 4 search/filter UI
 */
export interface MediaQueryOptions {
  bucket?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
}

/**
 * Paginated media response
 * Matches existing /api/media endpoint structure
 */
export interface MediaSelectionResponse {
  data: SelectableMediaAsset[];
  pagination: PaginationMeta;
}

/**
 * Media asset with usage tracking
 * (Extended by /api/media, but not required for selection)
 */
export interface MediaAssetWithUsage extends SelectableMediaAsset {
  usageCount: number;
}
