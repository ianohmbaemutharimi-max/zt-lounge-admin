"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Pencil, Trash2, Power, BadgePercent, X, Calendar, Globe } from "lucide-react";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { PageHeader, Card, Badge, Spinner, EmptyState, Button, Modal, Field, Input, Select, Textarea } from "@/components/ui";
import { cn, formatDate, formatKES } from "@/lib/utils";
import { ImageChangeDialog } from "@/features/media/image-change-dialog";
import { getSelectableMedia } from "@/lib/media/selection";
import { isPublicPageKey } from "@/lib/constants/public-pages";

/**
 * Form schema uses ACTUAL live database column names (snake_case)
 * to match the Repository response allowlist and the live Supabase schema.
 * 
 * Live promotions columns:
 * - id (uuid)
 * - title (text)
 * - description (text, nullable)
 * - media_id (uuid, FK → media_assets, CANONICAL)
 * - banner_image (text, nullable, DEPRECATED - never written)
 * - discount_percent (numeric, nullable)
 * - start_date (date, nullable)
 * - end_date (date, nullable)
 * - page_id (uuid, FK → website_pages, nullable)
 * - show_on_homepage (boolean, default false)
 * - display_order (integer, default 0)
 * - is_active (boolean, nullable, default true)
 * - created_at (timestamptz)
 * - updated_at (timestamptz)
 * 
 * CANONICAL IMAGE CONTRACT:
 * Promotions must use media_id ONLY. The admin selects from Media Library.
 * banner_image is legacy/deprecated and MUST NOT be written.
 */
const promoSchema = z.object({
  title: z.string().min(2, "Title is required"),
  description: z.string().optional(),
  media_id: z.string().uuid().nullable().optional(),
  discount_percent: z.coerce.number().min(0, "Must be 0 or more"),
  start_date: z.string().min(1, "Start date required"),
  end_date: z.string().min(1, "End date required"),
  // Page-scoped: every promotion must belong to a website page.
  page_id: z.string().uuid("Select a valid page"),
  show_on_homepage: z.boolean().default(false),
  display_order: z.coerce.number().int().default(0),
}).refine((v) => {
  // Date-only comparison - start_time/end_time columns do not exist.
  // end@23:59 > start@00:00 allows same-day promotions.
  const start = `${v.start_date}T00:00`;
  const end = `${v.end_date}T23:59`;
  return end > start;
}, {
  message: "Expiry must be after opening",
  path: ["end_date"],
});
type PromoForm = z.infer<typeof promoSchema>;

export function PromotionsView() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);

  const [promoPage, setPromoPage] = useState(1);
  const PROMO_LIMIT = 25;
  const promos = useQuery({
    queryKey: [...queryKeys.promotions.all(), promoPage],
    queryFn: () => api.listPaged("promotions", { limit: PROMO_LIMIT, offset: (promoPage - 1) * PROMO_LIMIT }),
  });
  const pages = useQuery({ queryKey: queryKeys["website-pages"].all(), queryFn: () => api.list("website-pages") });
  const mediaQuery = useQuery({
    queryKey: queryKeys.media.all(),
    // Canonical media-selection endpoint (/api/media) — full asset list;
    // the generic admin route caps pages at 100 rows.
    queryFn: async () => (await getSelectableMedia({ limit: 999 })).data,
  });
  const mediaList = (mediaQuery.data as any[]) ?? [];

  // PLACEMENT SAFETY: only page keys that the public site can actually resolve
  // to a SERVED page are offered. `website_pages` can legitimately hold rows
  // with no public destination (e.g. barbershop, autospa), and a promotion
  // saved against one of those is unreachable on every page. The allowlist
  // mirrors the public source of truth — see @/lib/constants/public-pages.
  const placementPages = (pages.data ?? []).filter((p: any) => isPublicPageKey(p.page_key));
  const form = useForm<PromoForm>({ resolver: zodResolver(promoSchema) as any });

  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.promotions.all() });

  const save = useMutation({
    mutationFn: (v: PromoForm) => {
      const payload = {
        ...v,
        discount_percent: v.discount_percent,
      };
      return editing ? api.update("promotions", editing.id, payload) : api.create("promotions", payload);
    },
    onSuccess: () => { invalidate(); setOpen(false); setEditing(null); },
  });
  const toggle = useMutation({
    mutationFn: (p: any) => api.update("promotions", p.id, { is_active: !p.is_active }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.remove("promotions", id),
    onSuccess: invalidate,
  });

  function openForm(p?: any) {
    setEditing(p ?? null);
    form.reset(p
      ? {
          title: p.title,
          description: p.description ?? "",
          media_id: p.media_id ?? null,
          discount_percent: p.discount_percent ?? 0,
          start_date: p.start_date ?? "",
          end_date: p.end_date ?? "",
          page_id: p.page_id ?? "",
          show_on_homepage: p.show_on_homepage ?? false,
          display_order: p.display_order ?? 0,
        }
      : {
          title: "",
          description: "",
          media_id: null,
          discount_percent: 10,
          start_date: "",
          end_date: "",
          page_id: "",
          show_on_homepage: false,
          display_order: 0,
        });
    setMediaPickerOpen(false);
    setOpen(true);
  }

  if (promos.isLoading) return <Spinner label="Loading promotions…" />;

  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  // Derive human-readable status for a promotion
  function getPromoStatus(p: any): { label: string; color: string } {
    if (!p.is_active) return { label: "Inactive", color: "gray" };
    const start = (p.start_date ?? "").slice(0, 10);
    const end = (p.end_date ?? "").slice(0, 10);
    if (!start || !end) return { label: "Invalid Dates", color: "red" };
    if (today < start) return { label: "Upcoming", color: "blue" };
    if (today > end) return { label: "Expired", color: "orange" };
    return { label: "Live", color: "green" };
  }

  return (
    <div>
      <PageHeader
        title="Promotions"
        subtitle="Offers and discounts displayed on the public website."
        actions={<Button onClick={() => openForm()}><Plus className="h-4 w-4" /> New Promotion</Button>}
      />

      {(promos.data?.data ?? []).length === 0 ? (
        <EmptyState
          title="No promotions"
          description="Create your first offer to attract more guests."
          action={<Button onClick={() => openForm()}><Plus className="h-4 w-4" /> New Promotion</Button>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(promos.data?.data ?? []).map((p: any) => {
            const startDate = (p.start_date ?? "").slice(0, 10);
            const endDate = (p.end_date ?? "").slice(0, 10);
            const status = getPromoStatus(p);
            const statusColorMap: Record<string, string> = {
              green: "bg-emerald-500/15 text-emerald-400",
              blue: "bg-blue-500/15 text-blue-400",
              orange: "bg-orange-500/15 text-orange-400",
              red: "bg-rose-500/15 text-rose-400",
              gray: "bg-stone-500/15 text-stone-400",
            };
            return (
              <Card key={p.id} className={cn("flex flex-col p-5", !p.is_active && "opacity-60")}>
                <div className="flex items-start justify-between">
                  <div className="rounded-xl bg-gold/10 p-2.5"><BadgePercent className="h-5 w-5 text-gold" /></div>
                  <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", statusColorMap[status.color])}>
                    {status.label}
                  </span>
                </div>
                <p className="mt-3 font-semibold text-white">{p.title}</p>
                <p className="mt-1 flex-1 text-sm text-muted">{p.description}</p>
                <p className="mt-3 text-lg font-semibold text-gold">
                  {p.discount_percent !== undefined && p.discount_percent !== null
                    ? `${p.discount_percent}% OFF`
                    : ""}
                </p>
                <div className="mt-1 space-y-1 text-xs text-muted">
                  <p className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {startDate ? formatDate(startDate) : "—"} → {endDate ? formatDate(endDate) : "—"}
                  </p>
                  <p className="flex items-center gap-1">
                    <Globe className="h-3 w-3" />
                    {`Page: ${(p.page_id ?? "").slice(0, 8)}...`}
                  </p>
                </div>
                <div className="mt-4 flex justify-end gap-1 border-t border-edge pt-3">
                  <button
                    title={p.is_active ? "Deactivate" : "Activate"}
                    onClick={() => toggle.mutate(p)}
                    className={cn(
                      "rounded-lg p-1.5 hover:bg-panel-2",
                      p.is_active ? "text-emerald-400" : "text-stone-500"
                    )}
                  >
                    <Power className="h-4 w-4" />
                  </button>
                  <button
                    title="Edit"
                    onClick={() => openForm(p)}
                    className="rounded-lg p-1.5 text-stone-400 hover:bg-panel-2 hover:text-white"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    title="Delete"
                    onClick={() => {
                      if (confirm(`Delete "${p.title}"?`)) remove.mutate(p.id);
            }}
                    className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {promos.data?.pagination && (
        <div className="flex items-center justify-between pt-4 text-sm text-muted">
          <span>Page {promos.data?.pagination?.page ?? 1} of {promos.data?.pagination?.totalPages ?? 1}</span>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg px-3 py-1.5 text-sm hover:bg-panel-2"
              disabled={!promos.data?.pagination?.hasPrev}
              onClick={() => setPromoPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="rounded-lg px-3 py-1.5 text-sm hover:bg-panel-2"
              disabled={!promos.data?.pagination?.hasNext}
              onClick={() => setPromoPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit Promotion" : "New Promotion"}>
        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
          <Field label="Title" error={form.formState.errors.title?.message}>
            <Input placeholder="e.g. VIP Cabin Night" {...form.register("title")} />
          </Field>
          <Field label="Description">
            <Textarea placeholder="Describe the offer…" {...form.register("description")} />
          </Field>

          {/* Promotion Poster - Canonical Media Library Pattern */}
          <div className="space-y-3 rounded-lg border border-edge bg-panel-2/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-stone-300">Promotion Poster</span>
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
                <span>
                  {(() => {
                    const m = form.watch("media_id");
                    const asset = mediaList.find((a: any) => a.id === m);
                    return asset 
                      ? `${asset.title || asset.original_name || "Image"} (${asset.original_name || "asset"})` 
                      : `Poster`;
                  })()}
                </span>
                <button
                  type="button"
                  onClick={() => form.setValue("media_id", null)}
                  className="text-rose-400 hover:text-rose-300"
                  title="Remove poster"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            {!form.watch("media_id") && (
              <p className="text-xs text-muted">
                No poster selected. Click &ldquo;Choose image&rdquo; to select one.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Discount (%)" error={form.formState.errors.discount_percent?.message}>
              <Input type="number" min={0} placeholder="e.g. 20" {...form.register("discount_percent")} />
            </Field>
            <Field label="Placement" error={form.formState.errors.page_id?.message}>
              <div className="space-y-1">
                <Select {...form.register("page_id")}>
                  
                  {placementPages.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.title || p.page_key}
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-muted">
                  Targets specific page
                </p>
                {!!pages.data && form.watch("page_id") &&
                  !placementPages.some((p: any) => p.id === form.watch("page_id")) && (
                    <p className="text-xs text-rose-400">
                      This promotion targets a page that has no public destination.
                      Choose another page — otherwise it cannot appear anywhere on the website.
                    </p>
                  )}
              </div>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Opening Date" error={form.formState.errors.start_date?.message}>
              <div className="flex gap-2">
                <Input type="date" {...form.register("start_date")} className="flex-1" />
              </div>
            </Field>
            <Field label="Expiry Date" error={form.formState.errors.end_date?.message}>
              <div className="flex gap-2">
                <Input type="date" {...form.register("end_date")} className="flex-1" />
              </div>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Display Order">
              <Input type="number" min={0} placeholder="0" {...form.register("display_order")} />
            </Field>
            <Field label="Show on Homepage">
              <Select {...form.register("show_on_homepage", { setValueAs: (v) => v === "true" || v === true })}>
                <option value="false">No</option>
                <option value="true">Yes</option>
              </Select>
            </Field>
          </div>

          {save.isError && <p className="text-sm text-rose-400">{(save.error as Error).message}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save Promotion"}</Button>
          </div>
        </form>
      </Modal>

      {/* Unified Edit Image dialog for Promotion Poster */}
      <ImageChangeDialog
        open={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        currentMediaId={form.watch("media_id")}
        currentImageUrl={
          (() => {
            const m = form.watch("media_id");
            const asset = mediaList.find((a: any) => a.id === m);
            return asset?.public_url ?? null;
          })()
        }
        onSave={async ({ media_id }) => {
          form.setValue("media_id", media_id);
        }}
        title="Choose image"
        uploadCategory="promotions"
      />
    </div>
  );
}
