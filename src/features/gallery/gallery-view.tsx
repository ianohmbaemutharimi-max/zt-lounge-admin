"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, Star, ArrowUp, ArrowDown, EyeOff, Eye, X, Pencil } from "lucide-react";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { PageHeader, Button, Spinner, Modal, Field, Input, EmptyState, Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import { MediaPickerModal } from "@/features/media/media-picker-modal";
import { ImageChangeDialog } from "@/features/media/image-change-dialog";
import type { SelectableMediaAsset } from "@/types/media";

const imageSchema = z.object({
  title: z.string().min(2, "Title is required"),
  imageUrl: z.string().url("Enter a valid image URL").or(z.literal("")),
  category: z.string().min(2, "Category is required"),
  mediaId: z.string().uuid().nullable().optional(),
});
type ImageForm = z.infer<typeof imageSchema>;

export function GalleryView() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<any | null>(null);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<SelectableMediaAsset | null>(null);
  const [editingImage, setEditingImage] = useState<any | null>(null);
  const [imageChangeDialogOpen, setImageChangeDialogOpen] = useState(false);

  const gallery = useQuery({ queryKey: queryKeys.gallery.all(), queryFn: () => api.list("gallery") });
  const form = useForm<ImageForm>({ resolver: zodResolver(imageSchema) });
  const watchedUrl = form.watch("imageUrl");

  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.gallery.all() });

  const add = useMutation({
    mutationFn: (v: ImageForm) =>
      api.create("gallery", { ...v, sortOrder: (gallery.data?.length ?? 0) + 1 }),
    onSuccess: () => { invalidate(); setOpen(false); form.reset(); },
  });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => api.update("gallery", id, body),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.remove("gallery", id),
    onSuccess: invalidate,
  });

  function move(row: any, dir: -1 | 1) {
    const sorted = [...(gallery.data ?? [])].sort((a: any, b: any) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((g: any) => g.id === row.id);
    const swap = sorted[idx + dir];
    if (!swap) return;
    patch.mutate({ id: row.id, body: { sortOrder: swap.sortOrder } });
    patch.mutate({ id: swap.id, body: { sortOrder: row.sortOrder } });
  }

  if (gallery.isLoading) return <Spinner label="Loading gallery…" />;

  const images = [...(gallery.data ?? [])].sort((a: any, b: any) => a.sortOrder - b.sortOrder);

  return (
    <div>
      <PageHeader
        title="Gallery"
        subtitle="Images shown on the public website gallery. Feature, reorder or hide them."
        actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add Image</Button>}
      />

      {images.length === 0 ? (
        <EmptyState
          title="Gallery is empty"
          description="Add your first image to showcase the lounge on the website."
          action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add Image</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((g: any, i: number) => (
            <Card key={g.id} className={cn("overflow-hidden", !g.isActive && "opacity-50")}>
              <button className="block w-full" onClick={() => setPreview(g)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.imageUrl} alt={g.title ?? ""} className="h-48 w-full object-cover transition-transform hover:scale-105" />
              </button>
              <div className="flex items-center justify-between p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{g.title}</p>
                  <p className="text-xs text-muted">{g.category} · #{g.sortOrder}</p>
                </div>
                <div className="flex shrink-0 gap-0.5">
                  <button title="Edit image" onClick={() => { setEditingImage(g); setImageChangeDialogOpen(true); }} className="rounded-lg p-1.5 text-gold hover:bg-gold/10"><Pencil className="h-4 w-4" /></button>
                  <button title="Move up" disabled={i === 0} onClick={() => move(g, -1)} className="rounded-lg p-1.5 text-stone-400 hover:bg-panel-2 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                  <button title="Move down" disabled={i === images.length - 1} onClick={() => move(g, 1)} className="rounded-lg p-1.5 text-stone-400 hover:bg-panel-2 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                  <button title={g.isFeatured ? "Unfeature" : "Feature"} onClick={() => patch.mutate({ id: g.id, body: { isFeatured: !g.isFeatured } })} className={cn("rounded-lg p-1.5 hover:bg-panel-2", g.isFeatured ? "text-gold" : "text-stone-500")}>
                    <Star className="h-4 w-4" fill={g.isFeatured ? "currentColor" : "none"} />
                  </button>
                  <button title={g.isActive ? "Hide" : "Show"} onClick={() => patch.mutate({ id: g.id, body: { isActive: !g.isActive } })} className="rounded-lg p-1.5 text-stone-400 hover:bg-panel-2">
                    {g.isActive ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                  <button title="Delete" onClick={() => { if (confirm("Delete this image?")) remove.mutate(g.id); }} className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-500/10"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Preview */}
      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview?.title ?? "Preview"} wide>
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview.imageUrl} alt={preview.title ?? ""} className="w-full rounded-xl object-contain" />
        )}
      </Modal>

      {/* Add image */}
      <Modal open={open} onClose={() => setOpen(false)} title="Add Gallery Image">
        <form onSubmit={form.handleSubmit((v) => add.mutate(v))} className="space-y-4">
          <Field label="Title" error={form.formState.errors.title?.message}>
            <Input placeholder="e.g. VIP Booth" {...form.register("title")} />
          </Field>
          <Field label="Category" error={form.formState.errors.category?.message}>
            <Input placeholder="Interior, Food, Drinks, Events…" {...form.register("category")} />
          </Field>
          <Field label="Image URL" error={form.formState.errors.imageUrl?.message}>
            <Input placeholder="https://… (storage upload URL)" {...form.register("imageUrl")} />
          </Field>
          {watchedUrl && !form.formState.errors.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={watchedUrl} alt="Preview" className="h-40 w-full rounded-xl object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
          )}

          <div className="space-y-3 rounded-lg border border-edge bg-panel-2/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-stone-300">Media Library</span>
              <Button 
                type="button" 
                onClick={() => setMediaPickerOpen(true)}
                className="text-xs"
              >
                Select from Library
              </Button>
            </div>
            {form.watch("mediaId") && (
              <div className="flex items-center justify-between rounded bg-panel p-2 text-sm text-stone-300">
                <span>✓ Media linked</span>
                <button
                  type="button"
                  onClick={() => form.setValue("mediaId", null)}
                  className="text-rose-400 hover:text-rose-300"
                  title="Remove media"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {add.isError && <p className="text-sm text-rose-400">{(add.error as Error).message}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={add.isPending}>{add.isPending ? "Adding…" : "Add Image"}</Button>
          </div>
        </form>
      </Modal>

      {/* Media Picker Modal */}
      <MediaPickerModal
        open={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        onSelect={(media) => {
          form.setValue("mediaId", media.id);
          setSelectedMedia(media);
          setMediaPickerOpen(false);
        }}
      />

      {/* Image Change Dialog */}
      {editingImage && (
        <ImageChangeDialog
          open={imageChangeDialogOpen}
          onClose={() => {
            setImageChangeDialogOpen(false);
            setEditingImage(null);
          }}
          currentImageUrl={editingImage.imageUrl}
          onSave={async (newImageUrl) => {
            await patch.mutateAsync({
              id: editingImage.id,
              body: { imageUrl: newImageUrl },
            });
          }}
          title="Change gallery image"
          uploadBucket="media-gallery"
        />
      )}
    </div>
  );
}
