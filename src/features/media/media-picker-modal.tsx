"use client";

import { useCallback } from "react";
import type { SelectableMediaAsset } from "@/types/media";
import { Modal, Button } from "@/components/ui";
import { ImageBrowser } from "./image-browser";

export interface MediaPickerModalProps {
  open: boolean;
  onClose: () => void;
  selectedMediaId?: string | null;
  onSelect: (asset: SelectableMediaAsset) => void;
  /** Whether the browser is actively displayed (controls query enable/disable) */
  enabled?: boolean;
  /** Optional bucket filter passed to ImageBrowser */
  bucket?: string;
}

export function MediaPickerModal({
  open,
  onClose,
  selectedMediaId,
  onSelect,
  enabled,
  bucket,
}: MediaPickerModalProps) {
  const handleSelect = useCallback(
    (asset: SelectableMediaAsset) => {
      onSelect(asset);
      onClose();
    },
    [onSelect, onClose]
  );

  return (
    <Modal open={open} onClose={onClose} title="Browse Media Library" wide>
      <div className="flex flex-col gap-4 max-w-4xl">
        <ImageBrowser
          selectedMediaId={selectedMediaId}
          onSelect={handleSelect}
          enabled={enabled}
          bucket={bucket}
        />

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
