"use client";

import { useState, useCallback, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, AlertCircle, Image as ImageIcon, Loader, ArrowLeft, Info } from "lucide-react";
import { Modal, Button, Input, Field, Spinner } from "@/components/ui";
import { ImageBrowser } from "./image-browser";
import type { SelectableMediaAsset } from "@/types/media";
import type { ImageCategory } from "@/lib/storage/paths";
import { cn } from "@/lib/utils";

export interface ImageChangeDialogProps {
  open: boolean;
  onClose: () => void;
  currentMediaId?: string | null;
  currentImageUrl?: string | null;
  onSave: (result: { media_id: string | null; image_url: string | null }) => Promise<void>;
  title?: string;
  /** Canonical upload category validated by /api/admin/upload (hero|gallery|menu|services|testimonials|branding) */
  uploadCategory: ImageCategory;
  allowRemove?: boolean;
  /** When true, hides the URL paste option (canonical mode) */
  canonicalOnly?: boolean;
  /** Whether the media picker browser is actively enabled (controls query fetch) */
  enabled?: boolean;
  /** @deprecated Bucket metadata is not present in the canonical media_assets schema. */
  bucket?: string;
}

type EditMode = "browse" | "upload" | "link";

export function ImageChangeDialog({
  open,
  onClose,
  currentMediaId,
  currentImageUrl,
  onSave,
  title = "Choose image",
  uploadCategory,
  allowRemove = true,
  canonicalOnly = false,
  enabled,
}: ImageChangeDialogProps) {
  const qc = useQueryClient();
  const [selectedImage, setSelectedImage] = useState<SelectableMediaAsset | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl || null);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState("");
  type View = "choose" | "browse";
  const [view, setView] = useState<View>("choose");
  const [mode, setMode] = useState<EditMode>("browse");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Reset state when modal opens/closes
  /* eslint-disable react-hooks/set-state-in-effect -- intentional: reset transient form state on modal close */
  useEffect(() => {
    if (!open) {
      setSelectedImage(null);
      setPreviewUrl(currentImageUrl || null);
      setLinkUrl("");
      setLinkError("");
      setMode("browse");
      setUploadedFile(null);
      setUploadProgress(0);
      setView("choose");
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, currentImageUrl]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async ({ media_id, image_url }: { media_id: string | null; image_url: string | null }) => {
      await onSave({ media_id, image_url });
    },
    onSuccess: () => {
      qc.invalidateQueries();
      onClose();
    },
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", uploadCategory);

      const xhr = new XMLHttpRequest();

      return new Promise<{ media_id: string; public_url: string }>((resolve, reject) => {
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status === 200 || xhr.status === 201) {
            try {
              const response = JSON.parse(xhr.responseText);
              // Return both media_id and public_url for canonical handling
              resolve({
                media_id: response.data.id,
                public_url: response.data.publicUrl
              });
            } catch (e) {
              reject(new Error("Invalid response"));
            }
          } else {
            reject(new Error(`Upload failed: ${xhr.status}`));
          }
        });

        xhr.addEventListener("error", () => {
          reject(new Error("Upload failed"));
        });

        xhr.open("POST", "/api/admin/upload");
        xhr.send(formData);
      });
    },
    onSuccess: (result) => {
      setSelectedImage({ id: result.media_id, public_url: result.public_url } as SelectableMediaAsset);
      setPreviewUrl(result.public_url);
      setUploadedFile(null);
      setUploadProgress(0);
      setMode("browse");
    },
  });

  const handleMediaSelect = useCallback((asset: SelectableMediaAsset) => {
    setSelectedImage(asset);
    setPreviewUrl(asset.public_url);
    setView("choose");
  }, []);

  // Handle legacy URL fallback for backwards compatibility
  const handleLinkPaste = useCallback(() => {
    setLinkError("");
    
    if (!linkUrl.trim()) {
      setLinkError("Please enter an image link");
      return;
    }

    // Simple URL validation
    try {
      new URL(linkUrl);
      // Legacy support: store URL only, media_id remains null
      setPreviewUrl(linkUrl);
      setLinkUrl("");
      setSelectedImage(null);
      setView("choose");
      setMode("browse");
    } catch {
      setLinkError("Please enter a valid image link (must start with http:// or https://)");
    }
  }, [linkUrl]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      alert("Image must be less than 10MB");
      return;
    }

    setUploadedFile(file);
    uploadMutation.mutate(file);
  }, [uploadMutation]);

  const handleRemove = useCallback(() => {
    setPreviewUrl(null);
    setSelectedImage(null);
    setLinkUrl("");
    setMode("browse");
  }, []);

  const handleSave = useCallback(() => {
    saveMutation.mutate({
      media_id: selectedImage?.id ?? null,
      image_url: previewUrl && !selectedImage ? previewUrl : null
    });
  }, [previewUrl, saveMutation, selectedImage]);

  const isLoading = saveMutation.isPending || uploadMutation.isPending;

  return (
    <Modal open={open} onClose={onClose} title={title} wide={view === "browse"}>
      {view === "browse" ? (
        <div className="flex flex-col gap-4 max-w-4xl">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setView("choose")}
              aria-label="Back to image options"
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-stone-400 transition-colors hover:bg-panel-2 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <h3 className="text-sm font-medium text-stone-300">
              Your images
            </h3>
          </div>
          <ImageBrowser
            selectedMediaId={selectedImage?.id}
            onSelect={handleMediaSelect}
            enabled={enabled}
              category={uploadCategory}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-6 min-h-[400px] max-w-lg">
          {/* Current/Preview Image */}
          {previewUrl ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-stone-300">Preview</p>
              <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-stone-700 bg-stone-900">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="h-full w-full object-cover"
                  onError={() => {
                    setLinkError("Failed to load image. Check the URL and try again.");
                    setPreviewUrl(null);
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="flex h-32 w-full items-center justify-center rounded-lg border border-dashed border-stone-700 bg-stone-900/50">
              <div className="flex flex-col items-center gap-2 text-center">
                <ImageIcon className="h-8 w-8 text-stone-600" />
                <p className="text-sm text-stone-400">No image selected</p>
              </div>
            </div>
          )}

          {/* Mode tabs */}
          <div className="flex gap-2 rounded-lg border border-stone-700 bg-stone-900/30 p-1">
            <button
              onClick={() => setMode("browse")}
              className={cn(
                "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                mode === "browse"
                  ? "bg-gold/15 text-gold"
                  : "text-stone-400 hover:text-stone-300"
              )}
            >
              Choose
            </button>
            <button
              onClick={() => setMode("upload")}
              className={cn(
                "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                mode === "upload"
                  ? "bg-gold/15 text-gold"
                  : "text-stone-400 hover:text-stone-300"
              )}
            >
                            Upload image
            </button>
            {!canonicalOnly && (
              <button
                onClick={() => setMode("link")}
                className={cn(
                  "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  mode === "link"
                    ? "bg-gold/15 text-gold"
                    : "text-stone-400 hover:text-stone-300"
                )}
              >
                Paste image link
              </button>
            )}
          </div>

          {/* Browse mode */}
          {mode === "browse" && (
            <div className="flex flex-col gap-3">
              <Button
                onClick={() => setView("browse")}
                variant="outline"
                className="w-full"
              >
                Your images
              </Button>
              <p className="text-xs text-stone-500 text-center">
                Or switch tabs to upload a new image or paste a link
              </p>
            </div>
          )}

          {/* Upload mode */}
          {mode === "upload" && (
            <div className="flex flex-col gap-3">

                            {selectedImage && (
                              <span
                                className={cn(
                                  "mt-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                                  (selectedImage.usageCount ?? 0) > 0
                                    ? "bg-amber-500/10 text-amber-400"
                                    : "bg-stone-800/60 text-stone-500",
                                )}
                                title={selectedImage.usageLocations?.join(", ") || undefined}
                              >
                                {(selectedImage.usageCount ?? 0) === 0 ? (
                                  "Unused"
                                ) : selectedImage.usageCount === 1 ? (
                                  <>Used by: {selectedImage.usageLocations?.[0]}</>
                                ) : (
                                  <>Used in {selectedImage.usageCount} places</>
                                )}
                              </span>
                            )}
              {uploadMutation.isPending ? (
                <div className="flex flex-col items-center gap-3 py-6">
                  <Loader className="h-6 w-6 animate-spin text-gold" />
                  <div className="w-full bg-stone-800 rounded-full h-1">
                    <div
                      className="bg-gold h-full rounded-full transition-all"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-stone-400">
                    Uploading... {uploadProgress}%
                  </p>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-stone-700 px-4 py-6 hover:border-stone-600 cursor-pointer transition-colors">
                  <div className="text-2xl">📤</div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-stone-300">
                      Click to upload
                    </p>
                    <p className="text-xs text-stone-500">
                      PNG, JPG, WebP up to 10MB
                    </p>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                    disabled={uploadMutation.isPending}
                  />
                </label>
              )}
            </div>
          )}

          {/* Link mode */}
          {mode === "link" && (
            <div className="flex flex-col gap-3">
              <Field label="Paste image link" error={linkError}>
                <Input
                  type="url"
                  placeholder="https://example.com/image.jpg"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleLinkPaste();
                    }
                  }}
                  disabled={isLoading}
                />
              </Field>
              {linkError && (
                <div className="flex gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-400">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <p>{linkError}</p>
                </div>
              )}
              <Button
                onClick={handleLinkPaste}
                variant="outline"
                className="w-full"
                disabled={!linkUrl.trim() || isLoading}
              >
                🔗 Use this link
              </Button>
            </div>
          )}

          {/* Remove button */}
          {previewUrl && allowRemove && (
            <Button
              onClick={handleRemove}
              variant="ghost"
              className="w-full text-rose-400 hover:bg-rose-500/10"
            >
              Remove image
            </Button>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 border-t border-stone-700 pt-4">
            <Button
              variant="ghost"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              variant="gold"
              onClick={handleSave}
              disabled={!previewUrl || isLoading}
            >
              {isLoading ? "Saving..." : "Save image"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
