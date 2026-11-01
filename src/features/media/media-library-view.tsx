"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Image as ImageIcon, AlertCircle, Pencil, Plus, X, Loader, RefreshCw, Trash2, Info } from "lucide-react";
import { PageHeader, Spinner, EmptyState, Card, Input, Button, Modal, Field, Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import { MediaEditModal } from "./media-edit-modal";
import { MediaDeleteModal } from "./media-delete-modal";
import { MediaUsageModal } from "./media-usage-modal";

interface MediaAsset {
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
  category?: string;
  limit?: number;
  offset?: number;
}): Promise<MediaResponse> {
  const searchParams = new URLSearchParams();
  if (params.filter) searchParams.set("filter", params.filter);
  if (params.search) searchParams.set("search", params.search);
  if (params.category) searchParams.set("category", params.category);
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
  const [categoryFilter, setCategoryFilter] = useState<string>(""); // live media_type enum filter
  const [pageOffset, setPageOffset] = useState(0);
  const [search, setSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [replaceModalOpen, setReplaceModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [usageModalOpen, setUsageModalOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<string>("branding");
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
    setPageOffset(0);
    const timer = setTimeout(() => setDebouncedSearch(value), 300);
    return () => clearTimeout(timer);
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["media", { filter, category: categoryFilter, search: debouncedSearch, offset: pageOffset }],
    queryFn: () =>
      fetchMedia({
        filter: filter || undefined,
        category: categoryFilter || undefined,
        search: debouncedSearch || undefined,
        limit: 50,
        offset: pageOffset,
      }),
  });

  const handleEditClick = (asset: MediaAsset) => {
    setSelectedAsset(asset);
    setEditModalOpen(true);
  };

  const handleSaveMedia = async (assetId: string, data: { alt_text: string }) => {
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
    mutationFn: async ({ file, category }: { file: File; category: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", category);

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
      uploadMutation.mutate({ file, category: uploadCategory });
    }
  };

  const handleRemoveFile = () => {
    setUploadedFileName(null);
    setUploadError(null);
  };

  // Replace mutation - replaces image file while preserving media_assets.id
  const replaceMutation = useMutation({
    mutationFn: async ({ assetId, file }: { assetId: string; file: File }) => {
      const formData = new FormData();
      formData.append("file", file);
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

  // UI-02 fix: selecting a file no longer fires the request immediately — the
  // admin must press "Confirm Replace". (Previously the upload started on the
  // file-input change with no confirmation step.)
  const handleReplaceFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReplaceFile(file);
      setReplaceError(null);
    }
  };

  const handleReplaceConfirm = () => {
    if (selectedAsset && replaceFile) {
      replaceMutation.mutate({
        assetId: selectedAsset.id,
        file: replaceFile,
      });
    }
  };

  const handleReplaceCancel = () => {
    setReplaceModalOpen(false);
    setReplaceFile(null);
    setReplaceError(null);
    setReplaceProgress(0);
  };

  // Delete mutation with safety check
  const deleteMutation = useMutation({
    mutationFn: async (assetId: string) => {
      const response = await fetch(`/api/admin/media_assets/${assetId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        if (response.status === 409) {
          // Asset is in use - backend returned usage details
          throw new Error(
            error.message || 
            "This image is currently being used and cannot be deleted. Please remove it from all locations first."
          );
        }
        throw new Error(error.error || "Failed to delete media asset");
      }

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["media"] });
      setDeleteModalOpen(false);
      setSelectedAsset(null);
    },
    onError: (error: any) => {
      // Keep modal open to show error
      console.error("Delete error:", error);
    },
  });

  const handleDeleteClick = (asset: MediaAsset) => {
    setSelectedAsset(asset);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (selectedAsset) {
      deleteMutation.mutate(selectedAsset.id);
    }
  };

  const handleUsageClick = (asset: MediaAsset) => {
    setSelectedAsset(asset);
    setUsageModalOpen(true);
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
            onClick={() => { setUploadCategory(categoryFilter === "service" ? "services" : categoryFilter === "testimonial" ? "testimonials" : categoryFilter === "promotion" ? "promotions" : categoryFilter || "branding"); setUploadOpen(true); }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Image
          </Button>
        }
      />

      {/* Filters */}
      <Card className="mb-6 p-4">
        <div className="flex flex-col gap-4">
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

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            {/* Usage Filter buttons */}
            <div className="flex gap-2">
              <Button
                variant={filter === "all" ? "gold" : "ghost"}
                onClick={() => { setFilter("all"); setPageOffset(0); }}
                className="text-sm"
              >
                All Images
              </Button>
              <Button
                variant={filter === "used" ? "gold" : "ghost"}
                onClick={() => { setFilter("used"); setPageOffset(0); }}
                className="text-sm"
              >
                Used
              </Button>
              <Button
                variant={filter === "unused" ? "gold" : "ghost"}
                onClick={() => { setFilter("unused"); setPageOffset(0); }}
                className="text-sm"
              >
                Unused
              </Button>
            </div>

            {/* Media type filter */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant={categoryFilter === "" ? "gold" : "ghost"}
                onClick={() => { setCategoryFilter(""); setPageOffset(0); }}
                className="text-sm"
              >
                All Types
              </Button>
              {["hero", "gallery", "menu", "service", "testimonial", "branding", "promotion", "seo", "feature", "general", "uncategorized"].map((cat) => (
                <Button
                  key={cat}
                  variant={categoryFilter === cat ? "gold" : "ghost"}
                  onClick={() => { setCategoryFilter(cat); setPageOffset(0); }}
                  className="text-sm capitalize"
                >
                  {cat === "uncategorized" ? "Unspecified" : cat}
                </Button>
              ))}
            </div>

            {/* Clear filters */}
            {(filter !== "all" || categoryFilter !== "" || search) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setFilter("all");
                  setCategoryFilter("");
                  setPageOffset(0);
                  setSearch("");
                  setDebouncedSearch("");
                }}
              >
                Clear
              </Button>
            )}
          </div>
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
            <MediaAssetCard 
              key={asset.id} 
              asset={asset} 
              onEdit={handleEditClick} 
              onReplace={(asset) => { setSelectedAsset(asset); setReplaceModalOpen(true); }}
              onDelete={handleDeleteClick}
              onViewUsage={handleUsageClick}
            />
          ))}
        </div>
      )}

      {total > 0 && (
        <div className="mt-6 flex items-center justify-between gap-3 text-sm text-gray-400">
          <span>
            Showing {Math.min(pageOffset + 1, total)}–{Math.min(pageOffset + assets.length, total)} of {total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              disabled={pageOffset === 0 || isLoading}
              onClick={() => setPageOffset(Math.max(0, pageOffset - 50))}
            >
              Previous
            </Button>
            <Button
              variant="ghost"
              disabled={!data?.pagination.hasMore || isLoading}
              onClick={() => setPageOffset(pageOffset + 50)}
            >
              Next
            </Button>
          </div>
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

          <Field label="Content role">
            <select
              value={uploadCategory}
              onChange={(event) => setUploadCategory(event.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100"
              disabled={uploadProgress > 0}
            >
              <option value="services">Services</option>
              <option value="gallery">Gallery</option>
              <option value="hero">Hero slides</option>
              <option value="menu">Menu</option>
              <option value="testimonials">Testimonials</option>
              <option value="promotions">Promotions</option>
              <option value="branding">Branding</option>
              <option value="seo">SEO images</option>
              <option value="feature">Page features</option>
              <option value="memberships">Memberships</option>
              <option value="general">General</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">Each upload creates a new media ID and a separate storage path for this role, even when the image bytes match another asset.</p>
          </Field>

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

          {/* Explanation of Replace behavior */}
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
            <div className="flex gap-2">
              <Info className="h-5 w-5 flex-shrink-0 text-blue-400 mt-0.5" />
              <div className="text-sm text-blue-300">
                <p className="font-medium">Replace the image file while keeping all existing uses connected.</p>
                {selectedAsset && selectedAsset.usageCount > 0 && (
                  <p className="mt-1">
                    All {selectedAsset.usageCount} existing use{selectedAsset.usageCount !== 1 ? 's' : ''} will display the new image after replacement.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
            <p className="text-sm text-gray-400">Replacing image:</p>
            <p className="mt-1 font-medium text-white">{selectedAsset?.file_name || "Unnamed file"}</p>
            {selectedAsset && selectedAsset.usageCount > 0 && (
              <div className="mt-2">
                <Badge status="active">
                  Used in {selectedAsset.usageCount} place{selectedAsset.usageCount !== 1 ? 's' : ''}
                </Badge>
              </div>
            )}
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
            <Button
              variant="gold"
              onClick={handleReplaceConfirm}
              disabled={!replaceFile || replaceMutation.isPending}
            >
              {replaceMutation.isPending ? "Replacing…" : "Confirm Replace"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <MediaDeleteModal
        open={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setSelectedAsset(null);
        }}
        asset={selectedAsset}
        onConfirm={handleDeleteConfirm}
        isDeleting={deleteMutation.isPending}
        error={deleteMutation.error}
        onErrorReset={() => deleteMutation.reset()}
      />

      {/* Usage Locations Modal */}
      <MediaUsageModal
        open={usageModalOpen}
        onClose={() => {
          setUsageModalOpen(false);
          setSelectedAsset(null);
        }}
        asset={selectedAsset}
      />
    </div>
  );
}

function MediaAssetCard({ asset, onEdit, onReplace, onDelete, onViewUsage }: { 
  asset: MediaAsset; 
  onEdit: (asset: MediaAsset) => void; 
  onReplace: (asset: MediaAsset) => void;
  onDelete: (asset: MediaAsset) => void;
  onViewUsage: (asset: MediaAsset) => void;
}) {
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
            alt={asset.alt_text || asset.file_name || "Media asset"}
            className="h-full w-full object-cover"
            onError={() => setImageError(true)}
            loading="lazy"
          />
        )}

        {/* Usage badge - improved visibility */}
        <div className="absolute right-2 top-2">
          {asset.usageCount > 0 ? (
            <button
              onClick={() => onViewUsage(asset)}
              className="inline-flex items-center rounded-full bg-green-900/80 backdrop-blur-sm px-2.5 py-1 text-xs font-medium text-green-300 cursor-pointer hover:bg-green-800/80 transition-colors"
              title={`Used in ${asset.usageCount} place${asset.usageCount !== 1 ? 's' : ''} - Click to view`}
            >
              Used in {asset.usageCount}
            </button>
          ) : (
            <span className="inline-flex items-center rounded-full bg-gray-800/80 backdrop-blur-sm px-2.5 py-1 text-xs font-medium text-gray-400">
              Not used
            </span>
          )}
        </div>

        {/* Edit button - always visible */}
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 text-white opacity-0 transition-opacity duration-200 hover:opacity-100">
          <button
            onClick={() => onEdit(asset)}
            className="flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/30"
            aria-label={`Edit image: ${asset.file_name || "Unnamed file"}`}
            title={`Edit image: ${asset.file_name || "Unnamed file"}`}
          >
            <Pencil className="h-4 w-4" />
            <span>Edit</span>
          </button>
        </div>
      </div>

      {/* Asset details */}
      <div className="p-3">
        {/* Title */}
        <h3 className="truncate font-medium text-gray-100" title={asset.file_name || undefined}>
          {asset.file_name || "Unnamed file"}
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
          {asset.file_size && (
            <div className="flex items-center justify-between">
              <span className="font-medium">File:</span>
              <span>{formatFileSize(asset.file_size)}</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="font-medium">Type:</span>
            <span>{asset.media_type || "Unspecified"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-medium">Created:</span>
            <span>{asset.created_at ? formatDate(asset.created_at) : "—"}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-3 flex justify-between gap-2">
          {/* Delete button - safety gated */}
          {asset.usageCount > 0 ? (
            <button
              disabled
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-800 bg-gray-900 px-3 py-1.5 text-xs font-medium text-gray-600 cursor-not-allowed"
              title="This image is currently in use and cannot be deleted"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
          ) : (
            <button
              onClick={() => onDelete(asset)}
              className="inline-flex items-center gap-1.5 rounded-md border border-rose-700/50 bg-rose-900/20 px-3 py-1.5 text-xs font-medium text-rose-400 transition-colors hover:bg-rose-900/40 hover:border-rose-600"
              aria-label={`Delete image: ${asset.file_name || "Unnamed file"}`}
              title="Delete this image"
            >
              <Trash2 className="h-3 w-3" />
              Delete
            </button>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => onReplace(asset)}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-200 transition-colors hover:bg-gray-700 hover:border-gray-600"
              aria-label={`Replace image: ${asset.file_name || "Unnamed file"}`}
              title="Replace the image file while keeping all existing uses"
            >
              <RefreshCw className="h-3 w-3" />
              Replace
            </button>
            <button
              onClick={() => onEdit(asset)}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-200 transition-colors hover:bg-gray-700 hover:border-gray-600"
              aria-label={`Edit image: ${asset.file_name || "Unnamed file"}`}
              title="Edit image details"
            >
              <Pencil className="h-3 w-3" />
              Edit
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}













