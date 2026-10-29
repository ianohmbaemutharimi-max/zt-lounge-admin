"use client";

import { useState, useEffect } from "react";
import { Modal, Input, Field, Button, Select } from "@/components/ui";

interface MediaAsset {
  id: string;
  file_name: string | null;
  alt_text: string | null;
  media_type: string | null;
}

interface MediaEditModalProps {
  asset: MediaAsset | null;
  usageLocations?: string[];
  open: boolean;
  onClose: () => void;
  onSave: (assetId: string, data: { alt_text: string; media_type: string | null }) => Promise<void>;
}

const MEDIA_TYPES = [
  { value: "", label: "Unspecified" },
  { value: "hero", label: "Hero" },
  { value: "gallery", label: "Gallery" },
  { value: "branding", label: "Branding" },
  { value: "service", label: "Service" },
  { value: "testimonial", label: "Testimonial" },
  { value: "promotion", label: "Promotion" },
  { value: "menu", label: "Menu" },
  { value: "seo", label: "SEO image" },
  { value: "feature", label: "Page feature" },
  { value: "general", label: "General" },
] as const;

export function MediaEditModal({ asset, usageLocations, open, onClose, onSave }: MediaEditModalProps) {
  const [altText, setAltText] = useState("");
  const [mediaType, setMediaType] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- sync form state to the selected asset */
  useEffect(() => {
    if (open && asset) {
      setAltText(asset.alt_text || "");
      setMediaType(asset.media_type || "");
      setError(null);
    }
  }, [open, asset]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleClose = () => {
    if (isSaving) return;
    setError(null);
    onClose();
  };

  const handleSave = async () => {
    if (!asset) return;
    try {
      setError(null);
      setIsSaving(true);
      await onSave(asset.id, { alt_text: altText, media_type: mediaType || null });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save media metadata");
    } finally {
      setIsSaving(false);
    }
  };

  if (!asset) return null;

  return (
    <Modal open={open} onClose={handleClose} title="Edit Media Details">
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-400">
            {error}
          </div>
        )}

        <div className="rounded-lg border border-stone-700 bg-stone-800/60 p-3">
          <p className="text-xs text-stone-400">File name</p>
          <p className="text-sm font-medium text-stone-200 break-all">{asset.file_name || "Unnamed file"}</p>
          {usageLocations && usageLocations.length > 0 && (
            <p className="mt-2 text-xs text-stone-400">Used in: {usageLocations.join(", ")}</p>
          )}
        </div>

        <Field label="Media type">
          <Select value={mediaType} onChange={(e) => setMediaType(e.target.value)} disabled={isSaving}>
            {MEDIA_TYPES.map((type) => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </Select>
        </Field>

        <Field label="Alt text">
          <Input
            type="text"
            placeholder="Describe the image for accessibility"
            value={altText}
            onChange={(e) => setAltText(e.target.value)}
            disabled={isSaving}
          />
        </Field>

        <p className="text-xs text-gray-400">
          The Media Library stores shared file metadata. Titles and descriptions belong to the content that uses this image.
        </p>

        <div className="flex items-center justify-end gap-2 border-t border-edge pt-4">
          <Button variant="ghost" onClick={handleClose} disabled={isSaving}>Cancel</Button>
          <Button variant="gold" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
