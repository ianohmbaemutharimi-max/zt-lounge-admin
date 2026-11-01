"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { getSelectableMedia } from "@/lib/media/selection";
import type { SelectableMediaAsset } from "@/types/media";
import type { ImageCategory } from "@/lib/storage/paths";
import { Info } from "lucide-react";
import { Input, Button, Spinner, Badge } from "@/components/ui";
import { cn } from "@/lib/utils";

const MEDIA_TYPE_BY_UPLOAD_CATEGORY: Record<ImageCategory, string> = {
  hero: "hero",
  gallery: "gallery",
  menu: "menu",
  services: "service",
  testimonials: "testimonial",
  branding: "branding",
  promotions: "promotion",
  memberships: "general",
  seo: "seo",
  feature: "feature",
  general: "general",
};

export interface ImageBrowserProps {
  /** Currently selected media ID (for visual indication) */
  selectedMediaId?: string | null;
  /** Callback when user selects an image */
  onSelect: (asset: SelectableMediaAsset) => void;
  /** Whether the browser is actively displayed (controls query enable/disable) */
  enabled?: boolean;
  /** Optional category filter (enforces category locking: only show assets with matching category) */
  category?: ImageCategory;
}

/**
 * ImageBrowser — reusable image-browsing UI (NOT a modal).
 *
 * Contains the search input, thumbnail grid, selection, pagination, loading,
 * empty, and error states for browsing the canonical media library. It owns
 * only the browser state (search + offset); it does NOT render any dialog or
 * modal chrome, and it does NOT implement modal open/close, cancel, or save
 * behavior.
 *
 * Used by:
 * - ImageChangeDialog (inline, LOOP 16B) — current
 * - MediaPickerModal (thin modal shell wrapper, retained for embeddability)
 */
export function ImageBrowser({ selectedMediaId, onSelect, enabled = true, category }: ImageBrowserProps) {
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 24;
  const mediaTypeFilter = category ? MEDIA_TYPE_BY_UPLOAD_CATEGORY[category] : undefined;

  // Reset offset when search changes
  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    setOffset(0);
  }, []);

  const handleLoadMore = useCallback(() => {
    setOffset((prev) => prev + limit);
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearch("");
    setOffset(0);
  }, []);

  // Fetch media with search and pagination (canonical /api/media via getSelectableMedia)
  const query = useQuery({
    queryKey: ["media-picker", search, offset, mediaTypeFilter],
    queryFn: async () => {
      const response = await getSelectableMedia({
        search: search || undefined,
        limit,
        offset,
        ...(mediaTypeFilter && { category: mediaTypeFilter }),
      });
      return response;
    },
    enabled,
    staleTime: 60000,
  });

  const media = query.data?.data || [];
  const pagination = query.data?.pagination;
  const hasMore = pagination?.hasMore || false;
  const isLoading = query.isLoading;
  const isError = query.isError;
  const isEmpty = !isLoading && media.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-stone-500" />
        <Input
          type="text"
          placeholder="Search by file name or alt text…"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="pl-10"
          autoFocus
          aria-label="Search images"
        />
        {search && (
          <button
            onClick={handleClearSearch}
            className="absolute right-3 top-3 text-stone-500 hover:text-white"
            type="button"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
{/* Loading / Error / Empty / Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner label="Loading images…" />
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-center text-sm text-rose-400">
          Unable to load images. Please try again.
        </div>
      ) : isEmpty ? (
        <div className="rounded-lg border border-stone-700 bg-stone-900/50 p-12 text-center">
          <p className="text-sm text-stone-400">
            {search
              ? "No images match your search."
              : "No images found."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {media.map((asset) => (
            <button
              key={asset.id}
              onClick={() => onSelect(asset)}
              className={cn(
                "group relative flex aspect-square flex-col overflow-hidden rounded-lg border-2 transition-all",
                selectedMediaId === asset.id
                  ? "border-gold bg-gold/10"
                  : "border-stone-700 hover:border-stone-500"
              )}
              type="button"
              title={asset.file_name || "Unnamed file"}
            >
              {/* Thumbnail */}
              {asset.public_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={asset.public_url}
                  alt={asset.alt_text || asset.file_name || "Image"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-stone-800 text-xs text-stone-500">
                  No image
                </div>
              )}

              {/* Overlay */}
              <div className="absolute inset-0 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100" />

              {/* Selected Indicator */}
              {selectedMediaId === asset.id && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Badge status="active">✓ Image selected</Badge>
                </div>
              )}

              {/* Metadata on hover */}
              <div className="absolute bottom-0 left-0 right-0 translate-y-full space-y-1 bg-black/90 p-2 text-left text-xs transition-transform group-hover:translate-y-0">
                {asset.file_name && (
                  <p className="font-semibold text-white truncate">
                    {asset.file_name}
                  </p>
                )}
                {asset.media_type && (
                  <p className="truncate text-stone-400">
                    {asset.media_type}
                  </p>
                )}
                {(asset.usageCount ?? 0) > 0 ? (
                  <div className="flex items-center gap-1.5">
                    <Info className="h-3 w-3 text-amber-400" />
                    <span
                      className="truncate text-amber-300"
                      title={asset.usageLocations?.join(", ") || "In use elsewhere"}
                    >
                      {asset.usageCount === 1
                        ? asset.usageLocations?.[0]
                        : `Used in ${asset.usageCount} places`}
                    </span>
                  </div>
                ) : (
                  <span className="text-stone-500">Unused</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Load More / Pagination */}
      {hasMore && !isLoading && (
        <div className="flex justify-center">
          <Button
            onClick={handleLoadMore}
            variant="outline"
            className="w-full sm:w-auto"
          >
            Load More
          </Button>
        </div>
      )}

      {/* Pagination Info */}
      {pagination && (
        <p className="text-center text-xs text-stone-500">
          Showing {media.length} of {pagination.total} images
        </p>
      )}
    </div>
  );
}