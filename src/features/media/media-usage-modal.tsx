"use client";

import { Modal, Button, Badge } from "@/components/ui";

interface MediaAsset {
  id: string;
  title: string | null;
  original_name: string | null;
  usageCount: number;
  usageLocations?: string[];
}

interface MediaUsageModalProps {
  open: boolean;
  onClose: () => void;
  asset: MediaAsset | null;
}

export function MediaUsageModal({ open, onClose, asset }: MediaUsageModalProps) {
  if (!asset) return null;

  return (
    <Modal open={open} onClose={onClose} title="Image Usage">
      <div className="space-y-4">
        <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
          <p className="text-sm text-gray-400">Image:</p>
          <p className="mt-1 font-medium text-white">
            {asset.title || asset.original_name || "Untitled"}
          </p>
          <div className="mt-2">
            <Badge
              status={asset.usageCount > 0 ? "active" : "inactive"}
            >
              {asset.usageCount > 0
                ? `Used in ${asset.usageCount} place${asset.usageCount !== 1 ? "s" : ""}`
                : "Not currently used"}
            </Badge>
          </div>
        </div>

        {asset.usageLocations && asset.usageLocations.length > 0 ? (
          <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
            <p className="text-sm font-medium text-gray-300 mb-3">
              This image appears in:
            </p>
            <div className="space-y-2">
              {asset.usageLocations.map((loc, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 rounded-lg bg-blue-500/10 border border-blue-500/30 px-3 py-2"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                  <span className="text-sm text-blue-300">{loc}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4 text-center">
            <p className="text-sm text-gray-400">
              This image is not currently used anywhere in the website.
            </p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-gray-800 pt-4">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
