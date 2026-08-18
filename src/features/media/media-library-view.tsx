"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Image as ImageIcon, AlertCircle, Pencil } from "lucide-react";
import { PageHeader, Spinner, EmptyState, Card, Input, Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { MediaEditModal } from "./media-edit-modal";

interface MediaAsset {
  id: string;
  bucket: string;
  path: string;
  public_url: string;
  original_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  title: string | null;
  created_at: string;
  usageCount: number;
}

interface MediaResponse {
  data: MediaAsset[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

async function fetchMedia(params: {
  bucket?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<MediaResponse> {
  const searchParams = new URLSearchParams();
  if (params.bucket) searchParams.set("bucket", params.bucket);
  if (params.search) searchParams.set("search", params.search);
  if (params.limit) searchParams.set("limit", String(params.limit));
  if (params.offset) searchParams.set("offset", String(params.offset));

  const response = await fetch(`/api/media?${searchParams.toString()}`);

  if (!response.ok) {
    throw new Error("Failed to fetch media assets");
  }

  return response.json();
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function MediaLibraryView() {
  const [bucket, setBucket] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const queryClient = useQueryClient();

  // Debounce search
  const handleSearchChange = (value: string) => {
    setSearch(value);
    const timer = setTimeout(() => setDebouncedSearch(value), 300);
    return () => clearTimeout(timer);
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["media", { bucket, search: debouncedSearch }],
    queryFn: () =>
      fetchMedia({
        bucket: bucket || undefined,
        search: debouncedSearch || undefined,
        limit: 50,
      }),
  });

  const handleEditClick = (asset: MediaAsset) => {
    setSelectedAsset(asset);
    setEditModalOpen(true);
  };

  const handleSaveMedia = async (assetId: string, data: { alt_text: string; title: string }) => {
    const response = await fetch(`/api/admin/media_assets/${assetId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "Failed to save media");
    }

    // Invalidate and refetch the media query
    await queryClient.invalidateQueries({ queryKey: ["media"] });
  };

  // Extract unique buckets for filter dropdown
  const allBuckets = data?.data
    ? Array.from(new Set(data.data.map((a) => a.bucket))).sort()
    : [];

  if (isLoading) {
    return <Spinner label="Loading media library..." />;
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500" />
          <EmptyState
            title="Failed to load media"
            description={error instanceof Error ? error.message : "An unexpected error occurred"}
          />
        </div>
      </div>
    );
  }

  const assets = data?.data || [];
  const total = data?.pagination.total || 0;

  return (
    <div>
      <MediaEditModal
        asset={selectedAsset}
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onSave={handleSaveMedia}
      />

      <PageHeader
        title="Media Library"
        subtitle={`${total} image${total !== 1 ? "s" : ""}`}
      />

      {/* Filters */}
      <Card className="mb-6 p-4">
        <div className="flex flex-col gap-4 sm:flex-row">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                type="text"
                placeholder="Search by title, alt text, or path..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Bucket filter */}
          <div className="sm:w-64">
            <select
              value={bucket}
              onChange={(e) => setBucket(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All buckets</option>
              {allBuckets.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          {/* Clear filters */}
          {(bucket || search) && (
            <Button
              variant="ghost"
              onClick={() => {
                setBucket("");
                setSearch("");
                setDebouncedSearch("");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      </Card>

      {/* Empty state */}
      {assets.length === 0 ? (
        <div className="text-center py-12">
          <ImageIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <EmptyState
            title={search || bucket ? "No matching media" : "No media assets"}
            description={
              search || bucket
                ? "Try adjusting your filters"
                : "Media assets from backfilled content will appear here"
            }
          />
        </div>
      ) : (
        /* Media grid */
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {assets.map((asset) => (
            <MediaAssetCard key={asset.id} asset={asset} onEdit={handleEditClick} />
          ))}
        </div>
      )}
    </div>
  );
}

function MediaAssetCard({ asset, onEdit }: { asset: MediaAsset; onEdit: (asset: MediaAsset) => void }) {
  const [imageError, setImageError] = useState(false);

  return (
    <Card className="overflow-hidden">
      {/* Image thumbnail */}
      <div className="relative aspect-video bg-gray-100">
        {imageError ? (
          <div className="flex h-full items-center justify-center text-gray-400">
            <AlertCircle className="h-8 w-8" />
          </div>
        ) : (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={asset.public_url}
            alt={asset.alt_text || asset.title || "Media asset"}
            className="h-full w-full object-cover"
            onError={() => setImageError(true)}
            loading="lazy"
          />
        )}

        {/* Usage badge */}
        <div className="absolute right-2 top-2">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium",
              asset.usageCount > 0
                ? "bg-green-100 text-green-800"
                : "bg-gray-100 text-gray-600"
            )}
          >
            Used: {asset.usageCount}
          </span>
        </div>

        {/* Edit button overlay */}
        <button
          onClick={() => onEdit(asset)}
          className="absolute inset-0 flex items-center justify-center gap-2 bg-black/50 text-white opacity-0 transition-opacity duration-200 hover:opacity-100"
          aria-label="Edit media"
          title="Edit media"
        >
          <Pencil className="h-5 w-5" />
          <span className="text-sm font-medium">Edit</span>
        </button>
      </div>

      {/* Asset details */}
      <div className="p-3">
        {/* Title */}
        <h3 className="truncate font-medium text-gray-900" title={asset.title || undefined}>
          {asset.title || "Untitled"}
        </h3>

        {/* Alt text */}
        {asset.alt_text && (
          <p className="mt-1 truncate text-sm text-gray-600" title={asset.alt_text}>
            {asset.alt_text}
          </p>
        )}

        {/* Metadata */}
        <div className="mt-2 space-y-1 text-xs text-gray-500">
          {asset.width && asset.height && (
            <div className="flex items-center justify-between">
              <span className="font-medium">Size:</span>
              <span>
                {asset.width} × {asset.height}
              </span>
            </div>
          )}

          {asset.file_size && (
            <div className="flex items-center justify-between">
              <span className="font-medium">File:</span>
              <span>{formatFileSize(asset.file_size)}</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="font-medium">Created:</span>
            <span>{formatDate(asset.created_at)}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
