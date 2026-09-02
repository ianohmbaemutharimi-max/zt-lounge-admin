"use client";

import { useState, useEffect } from "react";
import { Modal, Input, Field, Button } from "@/components/ui";

interface MediaAsset {
  id: string;
  alt_text: string | null;
  title: string | null;
  description: string | null;
}

interface MediaEditModalProps {
  asset: MediaAsset | null;
  /** Usage labels (e.g. ["Menu"], ["Branding → Logo"]) shown so the
      administrator can confirm WHICH image they are editing. */
  usageLocations?: string[];
  open: boolean;
  onClose: () => void;
  onSave: (assetId: string, data: { alt_text: string; title: string; description: string }) => Promise<void>;
}

export function MediaEditModal({ asset, usageLocations, open, onClose, onSave }: MediaEditModalProps) {
  const [altText, setAltText] = useState(asset?.alt_text || "");
  const [title, setTitle] = useState(asset?.title || "");
  const [description, setDescription] = useState(asset?.description || "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync form state with the selected asset EVERY time the dialog opens.
  // Previously state was only initialized on first mount (asset = null), so the
  // dialog always opened with empty fields — saving without retyping silently
  // wiped the asset's title/alt_text/description.
  useEffect(() => {
    if (open && asset) {
      setTitle(asset.title || "");
      setAltText(asset.alt_text || "");
      setDescription(asset.description || "");
      setError(null);
    }
  }, [open, asset]);

  // Reset form when modal opens/closes or asset changes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setAltText(asset?.alt_text || "");
      setTitle(asset?.title || "");
      setDescription(asset?.description || "");
      setError(null);
      onClose();
    }
  };

  if (!asset) return null;

  const handleSave = async () => {
    if (!asset) return;

    try {
      setError(null);
      setIsSaving(true);
      await onSave(asset.id, { alt_text: altText, title, description });
      handleOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save media";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => handleOpenChange(false)}
      title="Edit Media"
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-400">
            {error}
          </div>
        )}

        {/* Asset identity context — the administrator must always know
            exactly which image this dialog operates on. */}
        <div className="rounded-lg border border-stone-700 bg-stone-800/60 p-3">
          <p className="text-sm font-medium text-stone-200">
            {asset.title || "Untitled image"}
          </p>
          {usageLocations && usageLocations.length > 0 && (
            <p className="mt-1 text-xs text-stone-400">
              Used in: {usageLocations.join(", ")}
            </p>
          )}
        </div>

        <Field label="Title" error={undefined}>
          <Input
            type="text"
            placeholder="Enter a title for this media"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={isSaving}
          />
        </Field>

        <Field label="Alt Text" error={undefined}>
          <Input
            type="text"
            placeholder="Describe the image for accessibility"
            value={altText}
            onChange={(e) => setAltText(e.target.value)}
            disabled={isSaving}
          />
        </Field>

        <Field label="Description" error={undefined}>
          <Input
            type="text"
            placeholder="Describe where or how this image is used"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isSaving}
          />
        </Field>

        <div className="flex items-center justify-end gap-2 border-t border-edge pt-4">
          <Button
            variant="ghost"
            onClick={() => handleOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            variant="gold"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
