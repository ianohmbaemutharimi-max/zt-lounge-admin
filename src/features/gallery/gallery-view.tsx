"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, Star, ArrowUp, ArrowDown, EyeOff, Eye, X, Pencil } from "lucide-react";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { PageHeader, Button, Spinner, Modal, Field, Input, Select, EmptyState, Card } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ImageChangeDialog } from "@/features/media/image-change-dialog";

const imageSchema = z.object({
  title: z.string().min(2, "Title is required"),
  category: z.string().min(2, "Category is required"),
  // Canonical media reference ONLY
  media_id: z.string().uuid("Choose an image").nullable().optional(),
  // Page ownership lives on the CONTENT record (verified architecture).
  // gallery.page_id is NOT NULL in the live DB, so every record needs one.
  page_id: z.string().uuid("Select a page").min(1, "Select a page"),
});
type ImageForm = z.infer<typeof imageSchema>;

/** Persisted page scope for Admin Gallery (mirrors the Services convention). */
const PAGE_SCOPE_STORAGE_KEY = "zt-admin:gallery-page-scope";

export function GalleryView() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<any | null>(null);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [editingImage, setEditingImage] = useState<any | null>(null);
  const [imageChangeDialogOpen, setImageChangeDialogOpen] = useState(false);

  // Admin Gallery is page-first: the operator selects a website page and the
  // authoritative query ALWAYS carries gallery.page_id = selected_page_id.
  // `null` means "no page chosen yet" and NO gallery request is issued — there
  // is no code path that loads every gallery row and narrows it in React.
  const [pageId, setPageId] = useState<string | null>(null);

  const gallery = useQuery({
    queryKey: [...queryKeys.gallery.all(), { page_id: pageId }],
    queryFn: () => api.list("gallery", {
      limit: 100,
      "filter:page_id": `eq:${pageId}`,
    }),
    enabled: Boolean(pageId),
  });
  const pages = useQuery({ queryKey: queryKeys["website-pages"].all(), queryFn: () => api.list("website-pages") });
  const form = useForm<ImageForm>({ resolver: zodResolver(imageSchema) });

  // Resolve the persisted scope once, then keep it valid if pages reload.
  // A stored value that no longer matches a real page is discarded.
  useEffect(() => {
    if (pageId !== null || !pages.data) return;
    const stored = window.localStorage.getItem(PAGE_SCOPE_STORAGE_KEY);
    if (stored && pages.data.some((p: any) => p.id === stored)) {
      setPageId(stored);
      return;
    }
    setPageId((pages.data.find((p: any) => p.page_key === "gallery") ?? pages.data[0])?.id ?? null);
  }, [pageId, pages.data]);

  const changePageScope = (next: string) => {
    // There is deliberately no "All pages" option: an empty scope is not a
    // page, so it is normalised back to the previous valid selection.
    if (!next) return;
    setPageId(next);
    window.localStorage.setItem(PAGE_SCOPE_STORAGE_KEY, next);
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.gallery.all() });

  // Every mutation carries the selected page as query context so the server can
  // prove ownership (page-first boundary in src/lib/page-scope.ts).
  const scope = pageId ? { page_id: pageId } : undefined;

  const add = useMutation({
    mutationFn: (v: ImageForm) =>
      api.create("gallery", { ...v, display_order: (gallery.data?.length ?? 0) + 1 }, scope),
    onSuccess: () => { invalidate(); setOpen(false); form.reset(); },
  });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => api.update("gallery", id, body, scope),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.remove("gallery", id, scope),
    onSuccess: invalidate,
  });

  function move(row: any, dir: -1 | 1) {
    const sorted = [...(gallery.data ?? [])].sort((a: any, b: any) => a.display_order - b.display_order);
    const idx = sorted.findIndex((g: any) => g.id === row.id);
    const swap = sorted[idx + dir];
    if (!swap) return;
    patch.mutate({ id: row.id, body: { display_order: swap.display_order } });
    patch.mutate({ id: swap.id, body: { display_order: row.display_order } });
  }

  // Open the create form scoped to the SELECTED page. gallery.page_id is NOT
  // NULL, and page ownership is the selected page — not an unrelated default.
  function openAdd() {
    form.reset({
      title: "",
      category: "",
      media_id: null,
      page_id: pageId ?? "",
    });
    setOpen(true);
  }

  if (gallery.isLoading || pages.isLoading) return <Spinner label="Loading gallery…" />;

  const images = [...(gallery.data ?? [])].sort((a: any, b: any) => a.display_order - b.display_order);

  const selectedPage = (pages.data ?? []).find((p: any) => p.id === pageId);
  const selectedPageLabel = selectedPage ? `/${selectedPage.page_key} — ${selectedPage.title}` : "No page selected";

  return (
    <div>
      <PageHeader
        title="Gallery"
        subtitle="Images shown on the public website gallery. Feature, reorder or hide them."
        actions={
          <>
            <Select
              aria-label="Website page"
              value={pageId ?? ""}
              onChange={(e) => changePageScope(e.target.value)}
              className="max-w-xs"
            >
              {(pages.data ?? []).map((p: any) => (
                <option key={p.id} value={p.id}>/{p.page_key} — {p.title}</option>
              ))}
            </Select>
            <Button onClick={openAdd} disabled={!pageId} title={!pageId ? "Select a website page first" : undefined}>
              <Plus className="h-4 w-4" /> Add Image
            </Button>
          </>
        }
      />

      {/* Page-first: until a page is chosen, no gallery collection is requested
          and none is shown. This is not an "All pages" view. */}
      {!pageId ? (
        <EmptyState
          title="Select a website page"
          description="Gallery images are owned by a website page. Choose a page above to load its images."
        />
      ) : images.length === 0 ? (
        <EmptyState
          title="Gallery is empty"
          description="Add your first image to showcase the lounge on the website."
          action={<Button onClick={openAdd}><Plus className="h-4 w-4" /> Add Image</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((g: any, i: number) => (
            <Card key={g.id} className={cn("overflow-hidden", !g.is_active && "opacity-50")}>
              <button className="block w-full" onClick={() => setPreview(g)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.resolved_image_url } alt={g.title ?? ""} className="h-48 w-full object-cover transition-transform hover:scale-105" />
              </button>
              <div className="flex items-center justify-between p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{g.title}</p>
                  <p className="text-xs text-muted">{g.category} · #{g.display_order}</p>
                </div>
                <div className="flex shrink-0 gap-0.5">
                  <button title="Choose image" onClick={() => { setEditingImage(g); setImageChangeDialogOpen(true); }} className="rounded-lg p-1.5 text-gold hover:bg-gold/10"><Pencil className="h-4 w-4" /></button>
                  <button title="Move up" disabled={i === 0} onClick={() => move(g, -1)} className="rounded-lg p-1.5 text-stone-400 hover:bg-panel-2 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                  <button title="Move down" disabled={i === images.length - 1} onClick={() => move(g, 1)} className="rounded-lg p-1.5 text-stone-400 hover:bg-panel-2 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                  <button title={g.is_featured ? "Unfeature" : "Feature"} onClick={() => patch.mutate({ id: g.id, body: { is_featured: !g.is_featured } })} className={cn("rounded-lg p-1.5 hover:bg-panel-2", g.is_featured ? "text-gold" : "text-stone-500")}>
                    <Star className="h-4 w-4" fill={g.is_featured ? "currentColor" : "none"} />
                  </button>
                  <button title={g.is_active ? "Hide" : "Show"} onClick={() => patch.mutate({ id: g.id, body: { is_active: !g.is_active } })} className="rounded-lg p-1.5 text-stone-400 hover:bg-panel-2">
                    {g.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
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
          <img src={preview.resolved_image_url } alt={preview.title ?? ""} className="w-full rounded-xl object-contain" />
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
          <Field label="Page" error={form.formState.errors.page_id?.message}>
            {/* Page-first: the owning page is the SELECTED page, not a free
                choice. Read-only so the create form cannot target another page;
                the server independently rejects any mismatch with ?page_id=. */}
            <Select {...form.register("page_id")} disabled>
              <option value={pageId ?? ""}>{selectedPageLabel}</option>
            </Select>
          </Field>
          {/* Canonical media selection — new gallery images must reference media_id,
              never a raw URL. media_id is the canonical reference. */}
          <div className="space-y-3 rounded-lg border border-edge bg-panel-2/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-stone-300">Image</span>
              <Button
                type="button"
                onClick={() => setMediaPickerOpen(true)}
                className="text-xs"
              >
                Choose image
              </Button>
            </div>
            {form.watch("media_id") && (
              <div className="flex items-center justify-between rounded bg-panel p-2 text-sm text-stone-300">
                <span>✓ Image selected</span>
                <button
                  type="button"
                  onClick={() => { form.setValue("media_id", null); ; }}
                  className="text-rose-400 hover:text-rose-300"
                  title="Remove image"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            {!form.watch("media_id") && (
              <p className="text-xs text-muted">
                No image selected. Click "Choose image" to select one.
              </p>
            )}
          </div>

          {add.isError && <p className="text-sm text-rose-400">{(add.error as Error).message}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={add.isPending}>{add.isPending ? "Adding…" : "Add Image"}</Button>
          </div>
        </form>
      </Modal>

      {/* Unified Edit Image dialog — used by both Add Image and Change Image flows */}
      <ImageChangeDialog
        open={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        currentMediaId={form.watch("media_id") ?? null}
        currentImageUrl={null}
        onSave={async ({ media_id }) => {
          form.setValue("media_id", media_id);
        }}
        title="Choose image"
        uploadCategory="gallery"
      />

      {/* Image Change Dialog */}
      {editingImage && (
        <ImageChangeDialog
          open={imageChangeDialogOpen}
          onClose={() => {
            setImageChangeDialogOpen(false);
            setEditingImage(null);
          }}
          currentMediaId={editingImage.media_id}
          currentImageUrl={editingImage.resolved_image_url}
          onSave={async ({ media_id }) => {
            await patch.mutateAsync({
              id: editingImage.id,
              body: { media_id },
            });
          }}
          title="Choose image"
          uploadCategory="gallery"
        />
      )}
    </div>
  );
}
