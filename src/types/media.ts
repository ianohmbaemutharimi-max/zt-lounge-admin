/**
 * Canonical Media Library contract. These fields match public.media_assets.
 * Storage bucket/object-key metadata is not exposed as asset-row columns.
 */
export interface SelectableMediaAsset {
  id: string;
  public_url: string;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  alt_text: string | null;
  media_type: string | null;
  display_id: number;
  page_id: string | null;
  created_at: string | null;
  updated_at?: string | null;
  usageCount?: number;
  usageLocations?: string[];
}

export interface MediaQueryOptions {
  /** Filters the live media_type enum, not a separate category column. */
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface PaginationMeta {
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
}

export interface MediaSelectionResponse {
  data: SelectableMediaAsset[];
  pagination: PaginationMeta;
}

export interface MediaAssetWithUsage extends SelectableMediaAsset {
  usageCount: number;
}
