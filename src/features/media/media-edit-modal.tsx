"use client";

import { useState } from "react";
import { Modal, Input, Field, Button } from "@/components/ui";

interface MediaAsset {
  id: string;
  alt_text: string | null;
  title: string | null;
}

interface MediaEditModalProps {
  asset: MediaAsset | null;
  open: boolean;
  onClose: () => void;
  onSave: (assetId: string, data: { alt_text: string; title: string }) => Promise<void>;
}

export function MediaEditModal({ asset, open, onClose, onSave }: MediaEditModalProps) {
  const [altText, setAltText] = useState(asset?.alt_text || "");
  const [title, setTitle] = useState(asset?.title || "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens/closes or asset changes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setAltText(asset?.alt_text || "");
      setTitle(asset?.title || "");
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
      await onSave(asset.id, { alt_text: altText, title });
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
