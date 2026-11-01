"use client";

import { AlertCircle } from "lucide-react";
import { Modal, Button } from "@/components/ui";

interface MediaAsset {
  id: string;
  file_name: string | null;
  usageCount: number;
  usageLocations?: string[];
}

interface MediaDeleteModalProps {
  open: boolean;
  onClose: () => void;
  asset: MediaAsset | null;
  onConfirm: () => void;
  isDeleting: boolean;
  error: Error | null;
  onErrorReset: () => void;
}

export function MediaDeleteModal({
  open,
  onClose,
  asset,
  onConfirm,
  isDeleting,
  error,
  onErrorReset,
}: MediaDeleteModalProps) {
  const handleClose = () => {
    onErrorReset();
    onClose();
  };

  if (!asset) return null;

  return (
    <Modal open={open} onClose={handleClose} title="Delete Image">
      <div className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-400">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <p>{error.message || "Failed to delete image"}</p>
          </div>
        )}

        <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
          <p className="text-sm text-gray-400">Delete this image:</p>
          <p className="mt-1 font-medium text-white">
            {asset.file_name || "Unnamed file"}
          </p>
        </div>

        {asset.usageCount > 0 ? (
          <>
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4">
              <div className="flex gap-2">
                <AlertCircle className="h-5 w-5 flex-shrink-0 text-rose-400 mt-0.5" />
                <div className="text-sm text-rose-300">
                  <p className="font-medium">
                    This image is currently used in {asset.usageCount} place
                    {asset.usageCount !== 1 ? "s" : ""} and cannot be deleted.
                  </p>
                  <p className="mt-1">
                    Remove the image from all locations before deleting it.
                  </p>
                </div>
              </div>
            </div>

            {asset.usageLocations && asset.usageLocations.length > 0 && (
              <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
                <p className="text-sm font-medium text-gray-300 mb-2">Used in:</p>
                <div className="space-y-1">
                  {asset.usageLocations.map((loc, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 text-sm text-gray-400"
                    >
                      <span className="h-1 w-1 rounded-full bg-gray-500" />
                      {loc}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-gray-800 pt-4">
              <Button variant="ghost" onClick={handleClose}>
                Close
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
              <p className="text-sm text-gray-400">
                This image is not currently used anywhere. It will be permanently
                deleted.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-800 pt-4">
              <Button
                variant="ghost"
                onClick={handleClose}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={onConfirm}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete Image"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
