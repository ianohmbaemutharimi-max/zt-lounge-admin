"use client";

import { useState, useCallback, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, AlertCircle, Image as ImageIcon, Loader } from "lucide-react";
import { Modal, Button, Input, Field, Spinner } from "@/components/ui";
import { MediaPickerModal } from "./media-picker-modal";
import type { SelectableMediaAsset } from "@/types/media";
import { cn } from "@/lib/utils";

export interface ImageEditorModalProps {
  open: boolean;
  onClose: () => void;
  currentImageUrl?: string | null;
  onSave: (imageUrl: string | null) => Promise<void>;
  title?: string;
  uploadBucket?: string;
}

type EditMode = "browse" | "upload" | "link";

export function ImageEditorModal({
  open,
  onClose,
  currentImageUrl,
  onSave,
  title = "Edit Image",
  uploadBucket = "media-content",
}: ImageEditorModalProps) {
  const qc = useQueryClient();
  const [selectedImage, setSelectedImage] = useState<SelectableMediaAsset | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl || null);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState("");
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mode, setMode] = useState<EditMode>("browse");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!open) {
      setSelectedImage(null);
      setPreviewUrl(currentImageUrl || null);
      setLinkUrl("");
      setLinkError("");
      setMode("browse");
      setUploadedFile(null);
      setUploadProgress(0);
    }
  }, [open, currentImageUrl]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (imageUrl: string | null) => {
      await onSave(imageUrl);
    },
    onSuccess: () => {
      qc.invalidateQueries(); // Invalidate all queries to refresh data
      onClose();
    },
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("bucket", uploadBucket);

      const xhr = new XMLHttpRequest();

      return new Promise<string>((resolve, reject) => {
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status === 200) {
            try {
              const response = JSON.parse(xhr.responseText);
              resolve(response.url);
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
    onSuccess: (url) => {
      setPreviewUrl(url);
      setUploadedFile(null);
      setUploadProgress(0);
      setMode("browse");
    },
  });

  const handleMediaSelect = useCallback((asset: SelectableMediaAsset) => {
    setSelectedImage(asset);
    setPreviewUrl(asset.public_url);
    setMediaPickerOpen(false);
  }, []);

  const handleLinkPaste = useCallback(() => {
    setLinkError("");
    
    if (!linkUrl.trim()) {
      setLinkError("Please enter an image link");
      return;
    }

    // Simple URL validation
    try {
      new URL(linkUrl);
      setPreviewUrl(linkUrl);
      setLinkUrl("");
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
    saveMutation.mutate(previewUrl);
  }, [previewUrl, saveMutation]);

  const isLoading = saveMutation.isPending || uploadMutation.isPending;

  return (
    <>
      <Modal open={open} onClose={onClose} title={title}>
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
              Choose Image
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
              Upload
            </button>
            <button
              onClick={() => setMode("link")}
              className={cn(
                "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                mode === "link"
                  ? "bg-gold/15 text-gold"
                  : "text-stone-400 hover:text-stone-300"
              )}
            >
              Paste Link
            </button>
          </div>

          {/* Browse mode */}
          {mode === "browse" && (
            <div className="flex flex-col gap-3">
              <Button
                onClick={() => setMediaPickerOpen(true)}
                variant="outline"
                className="w-full"
              >
                Browse Media Library
              </Button>
              <p className="text-xs text-stone-500 text-center">
                Or switch tabs to upload a new image or paste a link
              </p>
            </div>
          )}

          {/* Upload mode */}
          {mode === "upload" && (
            <div className="flex flex-col gap-3">
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
              <Field label="Paste Image Link" error={linkError}>
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
                🔗 Use This Link
              </Button>
            </div>
          )}

          {/* Remove button */}
          {previewUrl && (
            <Button
              onClick={handleRemove}
              variant="ghost"
              className="w-full text-rose-400 hover:bg-rose-500/10"
            >
              Remove Image
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
              {isLoading ? "Saving..." : "Save Image"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Media Picker Modal */}
      <MediaPickerModal
        open={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        selectedMediaId={selectedImage?.id}
        onSelect={handleMediaSelect}
      />
    </>
  );
}
