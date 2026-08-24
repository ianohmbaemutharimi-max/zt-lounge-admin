"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Pencil, Trash2, Star, Power, X } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader, Button, Badge, Spinner, Modal, Field, Input, Select, Textarea, Card, EmptyState } from "@/components/ui";
import { DataTable, type Column } from "@/components/data-table";
import { cn, formatKES } from "@/lib/utils";
import { MediaPickerModal } from "@/features/media/media-picker-modal";
import { ImageChangeDialog } from "@/features/media/image-change-dialog";
import type { SelectableMediaAsset } from "@/types/media";
import type { ImageCategory } from "@/lib/storage/paths";

/** Maps admin resource names to canonical upload categories (validated by /api/admin/upload). */
const RESOURCE_UPLOAD_CATEGORY: Record<string, ImageCategory> = {
  "menu-items": "menu",
  services: "services",
};

const itemSchema = z.object({
  name: z.string().min(2, "Name is required"),
  description: z.string().optional(),
  price: z.coerce.number().min(0, "Price must be 0 or more"),
  category_id: z.string().min(1, "Select a category"),
  image_url: z.string().url("Must be a valid URL").or(z.literal("")),
  media_id: z.string().uuid().nullable().optional(),
  duration_minutes: z.coerce.number().optional(),
});
type ItemForm = z.infer<typeof itemSchema>;

const categorySchema = z.object({
  name: z.string().min(2, "Name is required"),
  description: z.string().optional(),
  sort_order: z.coerce.number().default(0),
});
type CategoryForm = z.infer<typeof categorySchema>;

export type CatalogConfig = {
  title: string;
  subtitle: string;
  itemResource: string;
  categoryResource: string;
  itemLabel: string;
  activeField: "is_active" | "isAvailable";
  showDuration?: boolean;
  showFeatured?: boolean;
};

export function CatalogManager(cfg: CatalogConfig) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"items" | "categories">("items");
  const [editing, setEditing] = useState<any | null>(null);
  const [itemOpen, setItemOpen] = useState(false);
  const [catEditing, setCatEditing] = useState<any | null>(null);
  const [catOpen, setCatOpen] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<SelectableMediaAsset | null>(null);
  const [imageChangeDialogOpen, setImageChangeDialogOpen] = useState(false);
  const [imageEditingItem, setImageEditingItem] = useState<any | null>(null);

  const items = useQuery({ queryKey: [cfg.itemResource], queryFn: () => api.list(cfg.itemResource) });
  const cats = useQuery({ queryKey: [cfg.categoryResource], queryFn: () => api.list(cfg.categoryResource) });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [cfg.itemResource] });
    qc.invalidateQueries({ queryKey: [cfg.categoryResource] });
  };

  const itemForm = useForm<ItemForm>({ resolver: zodResolver(itemSchema) as any });
  const catForm = useForm<CategoryForm>({ resolver: zodResolver(categorySchema) as any });

  const saveItem = useMutation({
    mutationFn: (v: ItemForm) => {
      const payload: any = { ...v, price: String(v.price), image_url: v.image_url || null };
      if (!cfg.showDuration) delete payload.duration_minutes;
      return editing ? api.update(cfg.itemResource, editing.id, payload) : api.create(cfg.itemResource, payload);
    },
    onSuccess: () => { invalidate(); setItemOpen(false); setEditing(null); },
  });

  const saveCat = useMutation({
    mutationFn: (v: CategoryForm) =>
      catEditing ? api.update(cfg.categoryResource, catEditing.id, v) : api.create(cfg.categoryResource, v),
    onSuccess: () => { invalidate(); setCatOpen(false); setCatEditing(null); },
  });

  const toggleActive = useMutation({
    mutationFn: (row: any) => api.update(cfg.itemResource, row.id, { [cfg.activeField]: !row[cfg.activeField] }),
    onSuccess: invalidate,
  });

  const toggleFeatured = useMutation({
    mutationFn: (row: any) => api.update(cfg.itemResource, row.id, { is_featured: !row.is_featured }),
    onSuccess: invalidate,
  });

  const removeItem = useMutation({
    mutationFn: (id: number) => api.remove(cfg.itemResource, id),
    onSuccess: invalidate,
  });

  const removeCat = useMutation({
    mutationFn: (id: number) => api.remove(cfg.categoryResource, id),
    onSuccess: invalidate,
  });

  function openItem(row?: any) {
    setEditing(row ?? null);
    itemForm.reset(row
      ? { name: row.name, description: row.description ?? "", price: Number(row.price), category_id: String(row.category_id ?? ""), image_url: row.image_url ?? "", media_id: row.media_id ?? null, duration_minutes: row.duration_minutes ?? 60 }
      : { name: "", description: "", price: 0, category_id: "", image_url: "", media_id: null, duration_minutes: 60 });
    setSelectedMedia(null);
    setItemOpen(true);
  }
  function openCat(row?: any) {
    setCatEditing(row ?? null);
    catForm.reset(row ? { name: row.name, description: row.description ?? "", sort_order: row.sort_order } : { name: "", description: "", sort_order: 0 });
    setCatOpen(true);
  }

  const catName = (id: string) => (cats.data ?? []).find((c: any) => c.id === id)?.name ?? "—";

  const columns: Column<any>[] = [
    { header: cfg.itemLabel, cell: (r) => (
      <div className="flex items-center gap-3">
        {r.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.resolved_image_url || r.image_url} alt="" className="h-9 w-9 rounded-lg object-cover" />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold/10 text-xs font-semibold text-gold">{r.name[0]}</span>
        )}
        <div>
          <p className="font-medium">{r.name}</p>
          {r.description && <p className="max-w-52 truncate text-xs text-muted">{r.description}</p>}
        </div>
      </div>
    )},
    { header: "Category", cell: (r) => <span className="text-stone-300">{catName(r.category_id)}</span> },
    { header: "Price", cell: (r) => <span className="text-gold">{formatKES(r.price)}</span> },
    ...(cfg.showDuration ? [{ header: "Duration", cell: (r: any) => <span className="text-stone-400">{r.duration_minutes} min</span> }] : []),
    { header: "Status", cell: (r) => <Badge status={r[cfg.activeField] ? "active" : "inactive"}>{r[cfg.activeField] ? (cfg.activeField === "isAvailable" ? "available" : "active") : (cfg.activeField === "isAvailable" ? "unavailable" : "inactive")}</Badge> },
    { header: "Actions", cell: (r) => (
      <div className="flex gap-1">
        {cfg.showFeatured && (
          <button title={r.is_featured ? "Unfeature" : "Feature"} onClick={() => toggleFeatured.mutate(r)} className={cn("rounded-lg p-1.5 hover:bg-panel-2", r.is_featured ? "text-gold" : "text-stone-500")}>
            <Star className="h-4 w-4" fill={r.is_featured ? "currentColor" : "none"} />
          </button>
        )}
        <button title="Edit image" onClick={() => { setImageEditingItem(r); setImageChangeDialogOpen(true); }} className="rounded-lg p-1.5 text-gold hover:bg-gold/10"><Pencil className="h-4 w-4" /></button>
        <button title={r[cfg.activeField] ? "Deactivate" : "Activate"} onClick={() => toggleActive.mutate(r)} className={cn("rounded-lg p-1.5 hover:bg-panel-2", r[cfg.activeField] ? "text-emerald-400" : "text-stone-500")}>
          <Power className="h-4 w-4" />
        </button>
        <button title="Edit" onClick={() => openItem(r)} className="rounded-lg p-1.5 text-stone-400 hover:bg-panel-2 hover:text-white"><Pencil className="h-4 w-4" /></button>
        <button title="Delete" onClick={() => { if (confirm(`Delete "${r.name}"?`)) removeItem.mutate(r.id); }} className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-500/10"><Trash2 className="h-4 w-4" /></button>
      </div>
    )},
  ];

  if (items.isLoading || cats.isLoading) return <Spinner label={`Loading ${cfg.title.toLowerCase()}…`} />;

  return (
    <div>
      <PageHeader
        title={cfg.title}
        subtitle={cfg.subtitle}
        actions={
          <>
            <div className="flex rounded-xl border border-edge bg-panel p-1">
              <button onClick={() => setTab("items")} className={cn("rounded-lg px-3 py-1.5 text-sm", tab === "items" ? "bg-gold/15 text-gold" : "text-muted hover:text-white")}>{cfg.itemLabel}s</button>
              <button onClick={() => setTab("categories")} className={cn("rounded-lg px-3 py-1.5 text-sm", tab === "categories" ? "bg-gold/15 text-gold" : "text-muted hover:text-white")}>Categories</button>
            </div>
            {tab === "items"
              ? <Button onClick={() => openItem()}><Plus className="h-4 w-4" /> New {cfg.itemLabel}</Button>
              : <Button onClick={() => openCat()}><Plus className="h-4 w-4" /> New Category</Button>}
          </>
        }
      />

      {tab === "items" ? (
        <DataTable
          data={items.data ?? []}
          columns={columns}
          searchKeys={["name", "description"]}
          searchPlaceholder={`Search ${cfg.itemLabel.toLowerCase()}s…`}
          emptyTitle={`No ${cfg.itemLabel.toLowerCase()}s yet`}
          emptyDescription={`Create your first ${cfg.itemLabel.toLowerCase()} to publish it on the website.`}
        />
      ) : (cats.data ?? []).length === 0 ? (
        <EmptyState title="No categories yet" description="Create a category to organize your items." action={<Button onClick={() => openCat()}><Plus className="h-4 w-4" /> New Category</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(cats.data ?? []).map((c: any) => (
            <Card key={c.id} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-white">{c.name}</p>
                  <p className="mt-1 text-sm text-muted">{c.description || "No description"}</p>
                  <p className="mt-2 text-xs text-muted">
                    {(items.data ?? []).filter((i: any) => i.category_id === c.id).length} items · order {c.sort_order}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openCat(c)} className="rounded-lg p-1.5 text-stone-400 hover:bg-panel-2 hover:text-white"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => { if (confirm(`Delete category "${c.name}"?`)) removeCat.mutate(c.id); }} className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-500/10"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Item form */}
      <Modal open={itemOpen} onClose={() => setItemOpen(false)} title={editing ? `Edit ${cfg.itemLabel}` : `New ${cfg.itemLabel}`}>
        <form onSubmit={itemForm.handleSubmit((v) => saveItem.mutate(v))} className="space-y-4">
          <Field label="Name" error={itemForm.formState.errors.name?.message}>
            <Input {...itemForm.register("name")} />
          </Field>
          <Field label="Description">
            <Textarea {...itemForm.register("description")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price (KES)" error={itemForm.formState.errors.price?.message}>
              <Input type="number" min={0} step="50" {...itemForm.register("price")} />
            </Field>
            <Field label="Category" error={itemForm.formState.errors.category_id?.message}>
              <Select {...itemForm.register("category_id")}>
                <option value="">Select…</option>
                {(cats.data ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          </div>
          {cfg.showDuration && (
            <Field label="Duration (minutes)">
              <Input type="number" min={15} step={15} {...itemForm.register("duration_minutes")} />
            </Field>
          )}
          {/* Canonical media is selected via the Media Library picker below.
              Legacy image_url is display-only migration compatibility. */}
          {itemForm.watch("image_url") && (
            <p className="truncate text-xs text-stone-500">
              Legacy image URL (migration compat): {itemForm.watch("image_url")}
            </p>
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
            {itemForm.watch("media_id") && (
              <div className="flex items-center justify-between rounded bg-panel p-2 text-sm text-stone-300">
                <span>Media selected: {itemForm.watch("media_id")}</span>
                <button
                  type="button"
                  onClick={() => itemForm.setValue("media_id", null)}
                  className="text-rose-400 hover:text-rose-300"
                  title="Remove media relationship"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {saveItem.isError && <p className="text-sm text-rose-400">{(saveItem.error as Error).message}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setItemOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saveItem.isPending}>{saveItem.isPending ? "Saving…" : "Save"}</Button>
          </div>
        </form>
      </Modal>

      {/* Category form */}
      <Modal open={catOpen} onClose={() => setCatOpen(false)} title={catEditing ? "Edit Category" : "New Category"}>
        <form onSubmit={catForm.handleSubmit((v) => saveCat.mutate(v))} className="space-y-4">
          <Field label="Name" error={catForm.formState.errors.name?.message}>
            <Input {...catForm.register("name")} />
          </Field>
          <Field label="Description">
            <Textarea {...catForm.register("description")} />
          </Field>
          <Field label="Sort Order">
            <Input type="number" {...catForm.register("sort_order")} />
          </Field>
          {saveCat.isError && <p className="text-sm text-rose-400">{(saveCat.error as Error).message}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCatOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saveCat.isPending}>{saveCat.isPending ? "Saving…" : "Save"}</Button>
          </div>
        </form>
      </Modal>

      {/* Media Picker Modal */}
      <MediaPickerModal
        open={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        onSelect={(media) => {
          itemForm.setValue("media_id", media.id);
          setSelectedMedia(media);
          setMediaPickerOpen(false);
        }}
      />

      {/* Image Change Dialog */}
      {imageEditingItem && (
        <ImageChangeDialog
          open={imageChangeDialogOpen}
          onClose={() => {
            setImageChangeDialogOpen(false);
            setImageEditingItem(null);
          }}
          currentMediaId={imageEditingItem.media_id}
          currentImageUrl={imageEditingItem.resolved_image_url ?? imageEditingItem.image_url ?? ""}
          onSave={async ({ media_id, image_url }) => {
            await saveItem.mutateAsync({
              name: imageEditingItem.name,
              description: imageEditingItem.description,
              price: Number(imageEditingItem.price),
              category_id: String(imageEditingItem.category_id),
              image_url: image_url || "",
              media_id: media_id,
              ...(cfg.showDuration && { duration_minutes: imageEditingItem.duration_minutes }),
            });
          }}
          title="Edit image"
          uploadCategory={RESOURCE_UPLOAD_CATEGORY[cfg.itemResource] ?? "services"}
          canonicalOnly
        />
      )}
    </div>
  );
}
