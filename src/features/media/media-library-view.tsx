"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Image as ImageIcon, AlertCircle, Pencil, Plus, X, Loader, RefreshCw } from "lucide-react";
import { PageHeader, Spinner, EmptyState, Card, Input, Button, Modal, Field } from "@/components/ui";
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
  description: string | null;
  created_at: string;
  usageCount: number;
  usageLocations?: string[];
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
  filter?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<MediaResponse> {
  const searchParams = new URLSearchParams();
  if (params.filter) searchParams.set("filter", params.filter);
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
  const [filter, setFilter] = useState<string>("all"); // "all", "used", "unused"
  const [search, setSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [replaceModalOpen, setReplaceModalOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [replaceProgress, setReplaceProgress] = useState(0);
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);
  const queryClient = useQueryClient();

  // Debounce search
  const handleSearchChange = (value: string) => {
    setSearch(value);
    const timer = setTimeout(() => setDebouncedSearch(value), 300);
    return () => clearTimeout(timer);
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["media", { filter, search: debouncedSearch }],
    queryFn: () =>
      fetchMedia({
        filter: filter || undefined,
        search: debouncedSearch || undefined,
        limit: 50,
      }),
  });

  const handleEditClick = (asset: MediaAsset) => {
    setSelectedAsset(asset);
    setEditModalOpen(true);
  };

  const handleSaveMedia = async (assetId: string, data: { alt_text: string; title: string; description: string }) => {
    const response = await fetch(`/api/admin/media_assets/${assetId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error("Failed to save media");
    }

    queryClient.invalidateQueries({ queryKey: ["media"] });
  };

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", "branding"); // Default category for media library

      const xhr = new XMLHttpRequest();

      return new Promise<{ id: string; public_url: string }>((resolve, reject) => {
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              resolve(response.data);
            } catch (err) {
              reject(new Error("Invalid response format"));
            }
          } else {
            reject(new Error(xhr.responseText || "Upload failed"));
          }
        });

        xhr.addEventListener("error", () => reject(new Error("Network error")));
        xhr.open("POST", "/api/admin/upload");
        xhr.send(formData);
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["media"] });
      setUploadOpen(false);
      setUploadedFileName(null);
      setUploadError(null);
      setUploadProgress(0);
    },
    onError: (error: any) => {
      setUploadError(error.message || "Upload failed");
      setUploadProgress(0);
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFileName(file.name);
      setUploadError(null);
      uploadMutation.mutate(file);
    }
  };

  const handleRemoveFile = () => {
    setUploadedFileName(null);
    setUploadError(null);
  };

  // Replace mutation - replaces image file while preserving media_assets.id
  const replaceMutation = useMutation({
    mutationFn: async ({ assetId, file, category }: { assetId: string; file: File; category: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", category);
      formData.append("deleteOld", "true");

      const xhr = new XMLHttpRequest();

      return new Promise<{ id: string; public_url: string }>((resolve, reject) => {
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            setReplaceProgress(Math.round((e.loaded / e.total) * 100));
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const response = JSON.parse(xhr.responseText);
              resolve(response.data);
            } catch (err) {
              reject(new Error("Invalid response format"));
            }
          } else {
            reject(new Error(xhr.responseText || "Replace failed"));
          }
        });

        xhr.addEventListener("error", () => reject(new Error("Network error")));
        xhr.open("PUT", `/api/admin/media_assets/${assetId}/replace`);
        xhr.send(formData);
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["media"] });
      setReplaceModalOpen(false);
      setReplaceFile(null);
      setReplaceError(null);
      setReplaceProgress(0);
    },
    onError: (error: any) => {
      setReplaceError(error.message || "Replace failed");
      setReplaceProgress(0);
    },
  });

  const handleReplaceFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReplaceFile(file);
      setReplaceError(null);
      if (selectedAsset) {
        replaceMutation.mutate({
          assetId: selectedAsset.id,
          file,
          category: "branding", // Default category for media library
        });
      }
    }
  };

  const handleReplaceCancel = () => {
    setReplaceModalOpen(false);
    setReplaceFile(null);
    setReplaceError(null);
    setReplaceProgress(0);
  };

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
        usageLocations={selectedAsset?.usageLocations}
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onSave={handleSaveMedia}
      />

      <PageHeader
        title="Media Library"
        subtitle={`${total} image${total !== 1 ? "s" : ""}`}
        actions={
          <Button
            variant="gold"
            onClick={() => setUploadOpen(true)}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Image
          </Button>
        }
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
                placeholder="Search images..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Filter buttons */}
          <div className="flex gap-2">
            <Button
              variant={filter === "all" ? "gold" : "ghost"}
              onClick={() => setFilter("all")}
              className="text-sm"
            >
              All Images
            </Button>
            <Button
              variant={filter === "used" ? "gold" : "ghost"}
              onClick={() => setFilter("used")}
              className="text-sm"
            >
              Used
            </Button>
            <Button
              variant={filter === "unused" ? "gold" : "ghost"}
              onClick={() => setFilter("unused")}
              className="text-sm"
            >
              Unused
            </Button>
          </div>

          {/* Clear filters */}
          {(filter !== "all" || search) && (
            <Button
              variant="ghost"
              onClick={() => {
                setFilter("all");
                setSearch("");
                setDebouncedSearch("");
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </Card>

      {/* Empty state */}
      {assets.length === 0 ? (
        <div className="text-center py-12">
          <ImageIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <EmptyState
            title={search || filter !== "all" ? "No matching images" : "No media assets"}
            description={
              search || filter !== "all"
                ? "Try adjusting your filters"
                : "Upload images to get started"
            }
          />
        </div>
      ) : (
        /* Media grid */
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {assets.map((asset) => (
            <MediaAssetCard key={asset.id} asset={asset} onEdit={handleEditClick} onReplace={(asset) => { setSelectedAsset(asset); setReplaceModalOpen(true); }} />
          ))}
        </div>
      )}

      {/* Upload Dialog */}
      <Modal
        open={uploadOpen}
        onClose={() => {
          setUploadOpen(false);
          setUploadedFileName(null);
          setUploadError(null);
        }}
        title="Add Image"
      >
        <div className="space-y-4">
          {uploadError && (
            <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-400">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <p>{uploadError}</p>
            </div>
          )}

          <Field label="Image File">
            <div className="flex items-center gap-4">
              {uploadedFileName ? (
                <div className="flex flex-1 items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2">
                  <ImageIcon className="h-4 w-4 text-green-400" />
                  <span className="flex-1 truncate text-sm text-green-300">{uploadedFileName}</span>
                  <button
                    onClick={handleRemoveFile}
                    className="text-gray-400 hover:text-gray-200"
                    aria-label="Remove file"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-700 px-4 py-8 hover:border-gray-600 transition-colors">
                  <Plus className="h-8 w-8 text-gray-400" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-300">Click to upload</p>
                    <p className="text-xs text-gray-500">PNG, JPG, WebP up to 10MB</p>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                    disabled={uploadProgress > 0}
                  />
                </label>
              )}
            </div>
          </Field>

          {uploadProgress > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">uploadProgress...</span>
                <span className="text-gray-300">{uploadProgress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-800">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-gray-800 pt-4">
            <Button
              variant="ghost"
              onClick={() => {
                setUploadOpen(false);
                setUploadedFileName(null);
                setUploadError(null);
              }}
              disabled={uploadProgress > 0}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Replace Image Dialog */}
      <Modal
        open={replaceModalOpen}
        onClose={handleReplaceCancel}
        title="Replace Image"
      >
        <div className="space-y-4">
          {replaceError && (
            <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-400">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <p>{replaceError}</p>
            </div>
          )}

          <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
            <p className="text-sm text-gray-400">Replacing image:</p>
            <p className="mt-1 font-medium text-white">{selectedAsset?.title || "Untitled"}</p>
            <p className="mt-1 text-xs text-gray-500">
              ID: {selectedAsset?.id || "—"} (will be preserved)
            </p>
          </div>

          <Field label="New Image File">
            <div className="flex items-center gap-4">
              {replaceFile ? (
                <div className="flex flex-1 items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2">
                  <ImageIcon className="h-4 w-4 text-green-400" />
                  <span className="flex-1 truncate text-sm text-green-300">{replaceFile.name}</span>
                  <button
                    onClick={handleReplaceCancel}
                    className="text-gray-400 hover:text-gray-200"
                    aria-label="Remove file"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-700 px-4 py-8 hover:border-gray-600 transition-colors">
                  <Plus className="h-8 w-8 text-gray-400" />
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-300">Click to upload</p>
                    <p className="text-xs text-gray-500">PNG, JPG, WebP up to 10MB</p>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleReplaceFileSelect}
                    className="hidden"
                    disabled={replaceMutation.isPending}
                  />
                </label>
              )}
            </div>
          </Field>

          {replaceProgress > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Replacing...</span>
                <span className="text-gray-300">{replaceProgress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-800">
                <div
                  className="h-full rounded-full bg-gold transition-all"
                  style={{ width: `${replaceProgress}%` }}
                />
              </div>
            </div>
          )}

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
            <p className="font-medium">Important:</p>
            <p className="mt-1">
              This will replace the image file while preserving the media asset ID.
              All references to this image (Hero, Menu, Services, etc.) will automatically use the new image.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-gray-800 pt-4">
            <Button
              variant="ghost"
              onClick={handleReplaceCancel}
              disabled={replaceMutation.isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function MediaAssetCard({ asset, onEdit, onReplace }: { asset: MediaAsset; onEdit: (asset: MediaAsset) => void; onReplace: (asset: MediaAsset) => void }) {
  const [imageError, setImageError] = useState(false);

  return (
    <Card className="overflow-hidden">
      {/* Image thumbnail */}
      <div className="relative aspect-video bg-gray-800">
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
          {asset.usageCount > 0 ? (
            <span className="inline-flex items-center rounded-full bg-green-900/50 px-2 py-1 text-xs font-medium text-green-300">
              {asset.usageCount}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-gray-800 px-2 py-1 text-xs font-medium text-gray-400">
              Unused
            </span>
          )}
        </div>

        {/* Edit button - always visible */}
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 text-white opacity-0 transition-opacity duration-200 hover:opacity-100">
          <button
            onClick={() => onEdit(asset)}
            className="flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/30"
            aria-label={`Edit image: ${asset.title || asset.original_name || "Untitled"}`}
            title={`Edit image: ${asset.title || asset.original_name || "Untitled"}`}
          >
            <Pencil className="h-4 w-4" />
            <span>Edit</span>
          </button>
        </div>
      </div>

      {/* Asset details */}
      <div className="p-3">
        {/* Title */}
        <h3 className="truncate font-medium text-gray-100" title={asset.title || undefined}>
          {asset.title || "Untitled"}
        </h3>

        {/* Alt text */}
        {asset.alt_text && (
          <p className="mt-1 truncate text-sm text-gray-300" title={asset.alt_text}>
            {asset.alt_text}
          </p>
        )}

        {/* Usage locations */}
        {asset.usageLocations && asset.usageLocations.length > 0 && (
          <div className="mt-2">
            <p className="text-xs font-medium text-gray-300">Used in:</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {asset.usageLocations.map((loc) => (
                <span
                  key={loc}
                  className="inline-flex items-center rounded bg-blue-900/50 px-1.5 py-0.5 text-xs text-blue-300"
                >
                  {loc}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Metadata */}
        <div className="mt-2 space-y-1 text-xs text-gray-400">
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

        {/* Edit and Replace buttons - always visible */}
        <div className="mt-3 flex justify-end gap-2">
          <button
            onClick={() => onReplace(asset)}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-200 transition-colors hover:bg-gray-700 hover:border-gray-600"
            aria-label={`Replace image: ${asset.title || asset.original_name || "Untitled"}`}
            title={`Replace image: ${asset.title || asset.original_name || "Untitled"}`}
          >
            <RefreshCw className="h-3 w-3" />
            Replace
          </button>
          <button
            onClick={() => onEdit(asset)}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-200 transition-colors hover:bg-gray-700 hover:border-gray-600"
            aria-label={`Edit image: ${asset.title || asset.original_name || "Untitled"}`}
            title={`Edit image: ${asset.title || asset.original_name || "Untitled"}`}
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
        </div>
      </div>
    </Card>
  );
}













