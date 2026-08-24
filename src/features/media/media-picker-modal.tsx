"use client";

import { useState, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { getSelectableMedia } from "@/lib/media/selection";
import type { SelectableMediaAsset } from "@/types/media";
import { Modal, Input, Button, Spinner, Badge } from "@/components/ui";
import { cn } from "@/lib/utils";

export interface MediaPickerModalProps {
  open: boolean;
  onClose: () => void;
  selectedMediaId?: string | null;
  onSelect: (asset: SelectableMediaAsset) => void;
}

export function MediaPickerModal({
  open,
  onClose,
  selectedMediaId,
  onSelect,
}: MediaPickerModalProps) {
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 24;

  // Reset pagination and search when modal closes
  useEffect(() => {
    if (!open) {
      setSearch("");
      setOffset(0);
    }
  }, [open]);

  // Fetch media with debounced search
  const query = useQuery({
    queryKey: ["media-picker", search, offset],
    queryFn: async () => {
    const response = await getSelectableMedia({
      search: search || undefined,
      limit,
      offset,
    });
      return response;
    },
    enabled: open,
    staleTime: 60000,
  });

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    setOffset(0); // Reset to first page on search
  }, []);

  const handleLoadMore = useCallback(() => {
    setOffset((prev) => prev + limit);
  }, []);

  const handleSelect = useCallback(
    (asset: SelectableMediaAsset) => {
      onSelect(asset);
      onClose();
    },
    [onSelect, onClose]
  );

  const handleClearSearch = useCallback(() => {
    setSearch("");
    setOffset(0);
  }, []);

  const media = query.data?.data || [];
  const pagination = query.data?.pagination;
  const hasMore = pagination?.hasMore || false;

  const isLoading = query.isLoading;
  const isError = query.isError;
  const isEmpty = !isLoading && media.length === 0;

  return (
    <Modal open={open} onClose={onClose} title="Select Image from Media Library" wide>
      <div className="flex flex-col gap-4 max-w-4xl">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-stone-500" />
          <Input
            type="text"
            placeholder="Search images by name or title…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10"
            autoFocus
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

        {/* Media Grid */}
        <div className="flex flex-col gap-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner label="Loading media…" />
            </div>
          ) : isError ? (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-center text-sm text-rose-400">
              Unable to load media. Please try again.
            </div>
          ) : isEmpty ? (
            <div className="rounded-lg border border-stone-700 bg-stone-900/50 p-12 text-center">
              <p className="text-sm text-stone-400">
                {search
                  ? "No media matches your search."
                  : "No media assets found."}
              </p>
            </div>
          ) : (
            <div className="grid auto-rows-max grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {media.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => handleSelect(asset)}
                  className={cn(
                    "group relative flex aspect-square flex-col overflow-hidden rounded-lg border-2 transition-all",
                    selectedMediaId === asset.id
                      ? "border-gold bg-gold/10"
                      : "border-stone-700 hover:border-stone-500"
                  )}
                  type="button"
                  title={asset.title || asset.original_name || "Untitled"}
                >
                  {/* Thumbnail */}
                  {asset.public_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={asset.public_url}
                      alt={asset.alt_text || asset.title || "Media asset"}
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
                      <Badge status="active">
                        ✓ Selected
                      </Badge>
                    </div>
                  )}

                  {/* Metadata on hover */}
                  <div className="absolute bottom-0 left-0 right-0 translate-y-full space-y-1 bg-black/90 p-2 text-left text-xs transition-transform group-hover:translate-y-0">
                    {asset.title && (
                      <p className="font-semibold text-white truncate">
                        {asset.title}
                      </p>
                    )}
                    {asset.original_name && (
                      <p className="truncate text-stone-400">
                        {asset.original_name}
                      </p>
                    )}
                    {asset.width && asset.height && (
                      <p className="text-stone-500">
                        {asset.width} × {asset.height}
                      </p>
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

        {/* Actions */}
        <div className="flex justify-end gap-2 border-t border-stone-700 pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
