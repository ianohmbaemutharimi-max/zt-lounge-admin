"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Pencil, Trash2, Power, CheckCircle2, X } from "lucide-react";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { PageHeader, Button, Spinner, Modal, Field, Input, Textarea, Card, Badge, EmptyState, Select, Toggle } from "@/components/ui";
import { cn } from "@/lib/utils";
import { ImageChangeDialog } from "@/features/media/image-change-dialog";
import { getSelectableMedia } from "@/lib/media/selection";

// ============================================================
// Forms use the ACTUAL live database column names (snake_case)
// to match the Repository allowlists and the live Supabase schema.
// ============================================================

const slideSchema = z.object({
  title: z.string().min(2, "Title is required"),
  subtitle: z.string().optional(),
  cta_text: z.string().optional(),
  cta_link: z.string().optional(),
  display_order: z.coerce.number().default(0),
  is_active: z.boolean().default(true),
  media_id: z.string().uuid().nullable().optional(),
  // Page ownership lives on the content record. hero_slides.page_id is
  // NOT NULL in the live database, so every slide needs a page.
  page_id: z.string().uuid("Select a page").min(1, "Select a page"),
});
type SlideForm = z.infer<typeof slideSchema>;

const bizSchema = z.object({
  business_name: z.string().min(2, "Business name is required"),
  tagline: z.string().optional(),
  phone: z.string().min(7, "Phone is required"),
  whatsapp: z.string().optional(),
  email: z.string().email("Invalid email"),
  address: z.string().min(3, "Address is required"),
  city: z.string().optional(),
  instagram: z.string().optional(),
  facebook: z.string().optional(),
  twitter: z.string().optional(),
  youtube: z.string().optional(),
  logo_media_id: z.string().uuid().nullable().optional(),
  favicon_media_id: z.string().uuid().nullable().optional(),
});
type BizForm = z.infer<typeof bizSchema>;

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

export function WebsiteCms() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"hero" | "business" | "hours" | "pages">("hero");
  // F-1 (UI-01) fix: `pages` must be declared BEFORE it is referenced by the
  // selectedPageId initializer below. The previous declaration order evaluated
  // `pages.data` inside the useState initializer while `pages` was still in the
  // temporal dead zone — a ReferenceError that crashed the entire Website CMS
  // on every render.
  // D2: the generic admin route defaults `limit` to 10 when the param is absent.
  // The Hero editor's Page <select> is built from these rows, and a native
  // <select> cannot display a value with no matching <option> — it falls back to
  // its first option ("Select a page…"). Request the full page set explicitly.
  const pages = useQuery({ queryKey: queryKeys["website-pages"].all(), queryFn: () => api.list("website-pages", { limit: 100 }) });
  const [selectedPageId, setSelectedPageId] = useState<string | null>(
    (pages.data ?? [])[0]?.id ?? null
  );
  const [slideOpen, setSlideOpen] = useState(false);
  const [editingSlide, setEditingSlide] = useState<any | null>(null);
  const [saved, setSaved] = useState(false);
  const [heroMediaPickerOpen, setHeroMediaPickerOpen] = useState(false);
  // Brand asset media pickers
  const [logoMediaPickerOpen, setLogoMediaPickerOpen] = useState(false);
  const [faviconMediaPickerOpen, setFaviconMediaPickerOpen] = useState(false);

  const slides = useQuery({
    queryKey: queryKeys["hero-slides"].pageId(selectedPageId),
    // D1: the server's list route only reads filter params keyed `filter:<field>`
    // (src/app/api/admin/[resource]/route.ts). Passing a nested `filter: {...}`
    // object made api.list serialize it via String() -> "[object Object]", which
    // the server ignored, so the slides list was never scoped to the selected
    // page. Use the server's existing filter contract; ordering is unchanged.
    // The generic admin route defaults `limit` to 10 when the param is absent
    // (src/app/api/admin/[resource]/route.ts), so request the full slide set
    // explicitly for the selected page.
    queryFn: () => api.list("hero-slides", { "filter:page_id": `eq:${selectedPageId}`, limit: 100, orderBy: "display_order", ascending: true }),
    enabled: !!selectedPageId,
  });
  const settings = useQuery({ queryKey: queryKeys["business-settings"].all(), queryFn: () => api.list("business-settings") });
  const mediaQuery = useQuery({
    queryKey: queryKeys.media.all(),
    // Canonical media-selection endpoint (/api/media) — full asset list;
    // the generic admin route caps pages at 100 rows (referenced assets
    // were frequently missing, breaking logo/favicon/hero reopen previews).
    queryFn: async () => (await getSelectableMedia({ limit: 999 })).data,
  });
  const mediaList = (mediaQuery.data as any[]) ?? [];

  // F-1 (UI-01) companion: the useState initializer above runs before any data
  // exists, so adopt the first page once the pages query resolves — preserving
  // the original default-first-page intent without redesigning the component.
  useEffect(() => {
    if (!selectedPageId && pages.data && pages.data.length > 0) {
      setSelectedPageId(pages.data[0].id);
    }
  }, [pages.data, selectedPageId]);

  const biz = settings.data?.[0];

  const slideForm = useForm<SlideForm>({ resolver: zodResolver(slideSchema) as any });

  // ── Destination-page Hero rows (canonical Display Order source) ──
  // The slide modal has its OWN Page selector, so Display Order must be derived
  // from the page currently selected INSIDE the editor (form `page_id`) — not from
  // `selectedPageId`, which only drives the outer list. Query params are identical
  // to the list query, so when the modal's page equals the list page React Query
  // reuses that cache entry and issues no extra request.
  const formPageId = slideForm.watch("page_id");
  const targetSlides = useQuery({
    queryKey: queryKeys["hero-slides"].pageId(formPageId),
    queryFn: () =>
      api.list("hero-slides", { "filter:page_id": `eq:${formPageId}`, limit: 100, orderBy: "display_order", ascending: true }),
    enabled: !!formPageId && slideOpen,
  });
  const targetRows = (targetSlides.data as any[]) ?? [];
  const editingId: string | null = editingSlide?.id ?? null;
  // Orders occupied by a DIFFERENT slide on the destination page.
  const occupiedElsewhere = new Set<number>(
    targetRows.filter((r: any) => r.id !== editingId && Number.isInteger(r.display_order)).map((r: any) => r.display_order)
  );
  // Highest real order on the destination page (-1 when that page has no Heroes).
  const maxOrder = targetRows.reduce(
    (m: number, r: any) => (Number.isInteger(r.display_order) && r.display_order > m ? r.display_order : m),
    -1
  );
  const watchedOrder = Number(slideForm.watch("display_order"));
  // Options come ONLY from real rows, the value being edited, and the next free
  // position — never from a hardcoded range such as 0–10.
  const orderOptions = Array.from(
    new Set<number>([
      ...targetRows.filter((r: any) => Number.isInteger(r.display_order)).map((r: any) => r.display_order as number),
      Number.isInteger(watchedOrder) ? watchedOrder : 0,
      maxOrder + 1,
    ])
  ).sort((a, b) => a - b);
  // A duplicate order on the destination page blocks saving: no silent renumber and
  // no silent overwrite of the slide that already holds that position. Only
  // reachable when an existing slide is moved to a page where its order is taken.
  const orderConflict =
    !!editingId && targetSlides.isSuccess && Number.isInteger(watchedOrder) && occupiedElsewhere.has(watchedOrder);

  const orderLabel = (o: number) => {
    if (editingId && o === (editingSlide?.display_order ?? null)) return `${o} (current)`;
    if (occupiedElsewhere.has(o)) return `${o} (in use)`;
    if (!editingId && o === maxOrder + 1) return `${o} (next available)`;
    return `${o}`;
  };

  // New-slide default is page-aware: max(display_order) + 1 on the DESTINATION page,
  // or 0 when that page has no Heroes. The previous `slides.length + 1` was wrong —
  // with orders 0,1,4,5 it produced 5 (colliding with the existing 5), and on an
  // empty page it produced 1 instead of the zero-based 0.
  useEffect(() => {
    if (!slideOpen || editingId || !targetSlides.isSuccess) return;
    slideForm.setValue("display_order", maxOrder + 1);
  }, [slideOpen, editingId, targetSlides.isSuccess, maxOrder, slideForm]);
  const bizForm = useForm<BizForm>({ resolver: zodResolver(bizSchema) });
  const [hours, setHours] = useState<Record<string, string> | null>(null);

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 2500); };

  const saveSlide = useMutation({
      mutationFn: (v: SlideForm) =>
        editingSlide ? api.update("hero-slides", editingSlide.id, v) : api.create("hero-slides", v),
    onSuccess: (_data, v) => {
      // A slide can be moved to another page from the modal's own Page selector, so
      // refresh every Hero list this write affects: the outer list page, the
      // destination page, and the page the slide was moved away from. Ids are
      // de-duplicated, so the unchanged-page case still issues a single call.
      new Set<string | null>([selectedPageId, v.page_id, editingSlide?.page_id ?? null]).forEach((pid) =>
        qc.invalidateQueries({ queryKey: queryKeys["hero-slides"].pageId(pid) })
      );
      setSlideOpen(false); setEditingSlide(null); flash();
    },
  });
  const patchSlide = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api.update("hero-slides", id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys["hero-slides"].pageId(selectedPageId) }),
  });
  const removeSlide = useMutation({
    mutationFn: (id: string) => api.remove("hero-slides", id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys["hero-slides"].pageId(selectedPageId) }),
  });

  const saveBiz = useMutation({
    mutationFn: (v: BizForm) => {
      if (!biz) throw new Error("No business settings row loaded");
      return api.update("business-settings", biz.id, v);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys["business-settings"].all() }); flash(); },
  });

  const saveHours = useMutation({
    mutationFn: (h: Record<string, string>) => {
      if (!biz) throw new Error("No business settings row loaded");
      return api.update("business-settings", biz.id, { opening_hours: h });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys["business-settings"].all() }); flash(); },
  });

  function openSlide(s?: any) {
    setEditingSlide(s ?? null);
    const defaultPageId = s?.page_id ?? selectedPageId ?? (pages.data?.[0]?.id ?? "");
    slideForm.reset(s
      ? { title: s.title, subtitle: s.subtitle ?? "", cta_text: s.cta_text ?? "", cta_link: s.cta_link ?? "", display_order: s.display_order ?? 0, is_active: s.is_active ?? true, media_id: s.media_id ?? null, page_id: s.page_id ?? defaultPageId }
      : { title: "", subtitle: "", cta_text: "", cta_link: "", display_order: 0, is_active: true, media_id: null, page_id: defaultPageId });
    setSlideOpen(true);
  }

  function startBizEdit() {
    if (!biz) return;
    bizForm.reset({
      business_name: biz.business_name ?? "",
      tagline: biz.tagline ?? "",
      phone: biz.phone ?? "",
      whatsapp: biz.whatsapp ?? "",
      email: biz.email ?? "",
      address: biz.address ?? "",
      city: biz.city ?? "",
      instagram: biz.instagram ?? "",
      facebook: biz.facebook ?? "",
      twitter: biz.twitter ?? "",
      youtube: biz.youtube ?? "",
      logo_media_id: biz.logo_media_id ?? null,
      favicon_media_id: biz.favicon_media_id ?? null,
    });
  }

  if (slides.isLoading || settings.isLoading || pages.isLoading) return <Spinner label="Loading website content…" />;

  const tabs = [
    { key: "hero", label: "Hero Section" },
    { key: "business", label: "Brand" },
    { key: "hours", label: "Opening Hours" },
    { key: "pages", label: "Pages" },
  ] as const;

  return (
    <div>
      <PageHeader
        title="Website CMS"
        subtitle="Control what visitors see on the public website. Changes go live instantly."
        actions={saved && <span className="flex items-center gap-1.5 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Changes saved</span>}
      />

      <div className="mb-6 flex flex-wrap gap-1 rounded-xl border border-edge bg-panel p-1">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => { 
            setTab(t.key); 
            if (t.key === "business") startBizEdit(); 
            if (t.key === "hours") setHours(biz?.opening_hours ?? {}); 
          }}
            className={cn("rounded-lg px-4 py-2 text-sm", tab === t.key ? "bg-gold/15 text-gold" : "text-muted hover:text-white")}>
            {t.label}
          </button>
        ))}
      </div>

      {/* HERO */}
      {tab === "hero" && (
        <div className="space-y-4">
          {/* Page selector */}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-stone-300">Hero page</label>
            <Select
              value={selectedPageId ?? ""}
              onChange={(e) => setSelectedPageId(e.target.value || null)}
              className="max-w-xs"
            >
              {(pages.data ?? []).map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.title} /{p.page_key}
                </option>
              ))}
            </Select>
          </div>

          {/* Hero slides — the single Hero editing flow (page-scoped hero_slides CRUD) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-stone-300">Slides for</span>
                  <span className="text-sm font-semibold text-white">
                    {(pages.data ?? []).find((p: any) => p.id === selectedPageId)?.title ?? "—"}
                  </span>
                  {/* Actual Hero count for the currently selected LIST page, derived
                      from the fetched rows — never a global or invented total. */}
                  <span className="rounded-full border border-edge px-2 py-0.5 text-xs font-medium text-stone-300">
                    {slides.isSuccess
                      ? `${slides.data?.length ?? 0} ${(slides.data?.length ?? 0) === 1 ? "Hero" : "Heroes"}`
                      : "Loading…"}
                  </span>
                </div>
                <Button onClick={() => openSlide()}><Plus className="h-4 w-4" /> New Slide</Button>
              </div>
              {(slides.data ?? []).length === 0 ? (
                <EmptyState
                  title={
                    !selectedPageId
                      ? "Select a page"
                      : `No hero slides for “${(pages.data ?? []).find((p: any) => p.id === selectedPageId)?.title ?? selectedPageId}”`
                  }
                  description={
                    !selectedPageId
                      ? "Choose a page above to manage its hero slides."
                      : "Add a slide to control the hero banner on this page."
                  }
                />
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {(slides.data ?? []).map((s: any) => (
                    <Card key={s.id} className={cn("overflow-hidden", !s.is_active && "opacity-60")}>
                      <div className="relative h-40">
                        {s.resolved_image_url ? (
                          <img src={s.resolved_image_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-stone-900">
                            <span className="text-sm text-stone-500">No image</span>
                          </div>
                        )}
                        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/40 to-transparent p-4">
                          <p className="text-lg font-semibold text-white">{s.title}</p>
                          <p className="text-sm text-stone-300">{s.subtitle}</p>
                        </div>
                        <div className="absolute right-3 top-3"><Badge status={s.is_active ? "active" : "inactive"}>{s.is_active ? "live" : "hidden"}</Badge></div>
                      </div>
                      <div className="flex items-center justify-between p-3">
                        <p className="text-xs text-muted">Order {s.display_order}{s.cta_text ? ` · CTA: ${s.cta_text}` : ""}</p>
                        <div className="flex gap-1">
                          <button title={s.is_active ? "Hide" : "Publish"} onClick={() => patchSlide.mutate({ id: s.id, body: { is_active: !s.is_active } })} className={cn("rounded-lg p-1.5 hover:bg-panel-2", s.is_active ? "text-emerald-400" : "text-stone-500")}><Power className="h-4 w-4" /></button>
                          <button title="Edit slide" onClick={() => openSlide(s)} className="rounded-lg p-1.5 text-stone-400 hover:bg-panel-2 hover:text-white"><Pencil className="h-4 w-4" /></button>
                          <button title="Delete" onClick={() => { if (confirm("Delete this slide?")) removeSlide.mutate(s.id); }} className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-500/10"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
        </div>
      )}

      {/* BRAND */}
      {tab === "business" && biz && (
        <div className="space-y-6">
          <Card className="max-w-2xl p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">Logo</h3>
            <div className="flex items-center gap-4">
              {biz.resolved_logo_url ? (
                <img src={biz.resolved_logo_url} alt="Logo" className="h-16 w-auto rounded-lg border border-edge" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-edge bg-stone-800">
                  <span className="text-xs text-stone-500">Logo</span>
                </div>
              )}
              <Button
                type="button"
                onClick={() => setLogoMediaPickerOpen(true)}
                className="text-xs"
              >
                Change Logo
              </Button>
            </div>

            <h3 className="mt-6 mb-4 text-lg font-semibold text-white">Favicon</h3>
            <div className="flex items-center gap-4">
              {biz.resolved_favicon_url ? (
                <img src={biz.resolved_favicon_url} alt="Favicon" className="h-8 w-auto rounded border border-edge" />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded border border-edge bg-stone-800">
                  <span className="text-xs text-stone-500">FI</span>
                </div>
              )}
              <Button
                type="button"
                onClick={() => setFaviconMediaPickerOpen(true)}
                className="text-xs"
              >
                Change Favicon
              </Button>
            </div>
          </Card>

          <Card className="max-w-2xl p-6">
            <form onSubmit={bizForm.handleSubmit((v) => saveBiz.mutate(v))} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Business Name" error={bizForm.formState.errors.business_name?.message}>
                  <Input {...bizForm.register("business_name")} />
                </Field>
                <Field label="Tagline"><Input {...bizForm.register("tagline")} /></Field>
                <Field label="Phone" error={bizForm.formState.errors.phone?.message}><Input {...bizForm.register("phone")} /></Field>
                <Field label="WhatsApp"><Input {...bizForm.register("whatsapp")} /></Field>
                <Field label="Email" error={bizForm.formState.errors.email?.message}><Input {...bizForm.register("email")} /></Field>
                <Field label="City"><Input {...bizForm.register("city")} /></Field>
              </div>
              <Field label="Address" error={bizForm.formState.errors.address?.message}><Input {...bizForm.register("address")} /></Field>
              <p className="pt-2 text-xs font-semibold uppercase tracking-wider text-muted">Social Media</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Instagram"><Input {...bizForm.register("instagram")} /></Field>
                <Field label="Facebook"><Input {...bizForm.register("facebook")} /></Field>
                <Field label="X (Twitter)"><Input {...bizForm.register("twitter")} /></Field>
                <Field label="YouTube"><Input {...bizForm.register("youtube")} /></Field>
              </div>
              {saveBiz.isError && <p className="text-sm text-rose-400">{(saveBiz.error as Error).message}</p>}
              <div className="flex justify-end"><Button type="submit" disabled={saveBiz.isPending}>{saveBiz.isPending ? "Saving…" : "Save Changes"}</Button></div>
            </form>
          </Card>
        </div>
      )}

      {/* HOURS */}
      {tab === "hours" && biz && (
        <Card className="max-w-xl p-6">
          <div className="space-y-3">
            {DAYS.map((day) => (
              <div key={day} className="flex items-center gap-4">
                <span className="w-28 text-sm capitalize text-stone-300">{day}</span>
                <Input
                  value={(hours ?? biz.opening_hours ?? {})[day] ?? ""}
                  onChange={(e) => setHours({ ...(hours ?? biz.opening_hours ?? {}), [day]: e.target.value })}
                  placeholder="e.g. 10:00 - 23:00 or Closed"
                />
              </div>
            ))}
            <div className="flex justify-end pt-2">
              <Button onClick={() => hours && saveHours.mutate(hours)} disabled={saveHours.isPending || !hours}>
                {saveHours.isPending ? "Saving…" : "Save Hours"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* PAGES */}
      {tab === "pages" && (
        (pages.data ?? []).length === 0 ? (
          <EmptyState title="No pages found" description="Website pages will appear here." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {(pages.data ?? []).map((p: any) => (
              <Card key={p.id} className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-white">{p.title}</p>
                    <p className="text-xs text-gold">/{p.page_key}</p>
                    <p className="mt-2 line-clamp-2 text-sm text-muted">{p.seo_description}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )
      )}

      {/* Slide form */}
      <Modal open={slideOpen} onClose={() => setSlideOpen(false)} title={editingSlide ? "Edit Hero Slide" : "New Hero Slide"}>
        <form onSubmit={slideForm.handleSubmit((v) => saveSlide.mutate(v))} className="space-y-4">
          <Field label="Title" error={slideForm.formState.errors.title?.message}>
            <Input placeholder="Experience Luxury" {...slideForm.register("title")} />
          </Field>
          <Field label="Subtitle">
            <Input placeholder="Premium dining and entertainment" {...slideForm.register("subtitle")} />
          </Field>
          <Field label="CTA Text"><Input placeholder="Book a Table" {...slideForm.register("cta_text")} /></Field>
          <Field label="CTA Link"><Input placeholder="/bookings" {...slideForm.register("cta_link")} /></Field>
          {/* Display Order options are derived from the DESTINATION page's real
              hero_slides rows (see targetSlides above). Positions held by another
              slide are listed but not selectable, so moving a slide between pages
              cannot create a duplicate order or silently renumber another slide. */}
          <Field
            label="Display Order"
            error={orderConflict ? `Display order ${watchedOrder} is already used on this page — choose a free position.` : undefined}
          >
            <Select {...slideForm.register("display_order")}>
              {orderOptions.map((o) => (
                <option key={o} value={o} disabled={occupiedElsewhere.has(o)}>
                  {orderLabel(o)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Page" error={slideForm.formState.errors.page_id?.message}>
            <Select {...slideForm.register("page_id")}>
              <option value="">Select a page…</option>
              {(pages.data ?? []).map((p: any) => (
                <option key={p.id} value={p.id}>/{p.page_key} — {p.title}</option>
              ))}
            </Select>
          </Field>
          <Toggle
            checked={slideForm.watch("is_active")}
            onChange={(v) => slideForm.setValue("is_active", v)}
            label={slideForm.watch("is_active") ? "Active" : "Inactive"}
            id="slide-active-toggle"
          />
          <div className="space-y-3 rounded-lg border border-edge bg-panel-2/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-stone-300">Hero Image</span>
              <Button 
                type="button" 
                onClick={() => setHeroMediaPickerOpen(true)}
                className="text-xs"
              >
                Choose image
              </Button>
            </div>
            {slideForm.watch("media_id") && (
              <div className="flex items-center justify-between rounded bg-panel p-2 text-sm text-stone-300">
                <span>
                  {(() => {
                    const m = slideForm.watch("media_id");
                    const asset = mediaList.find((a) => a.id === m);
                    return asset ? `${asset.title || asset.original_name || "Image"} (${asset.original_name || "image"})` : `Image`;
                  })()}
                </span>
                <button
                  type="button"
                  onClick={() => slideForm.setValue("media_id", null)}
                  className="text-rose-400 hover:text-rose-300"
                  title="Remove image"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            {!slideForm.watch("media_id") && (
              <p className="text-xs text-muted">
                No image selected. Click "Choose image" to select one.
              </p>
            )}
          </div>

          {saveSlide.isError && <p className="text-sm text-rose-400">{(saveSlide.error as Error).message}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setSlideOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saveSlide.isPending || orderConflict}>{saveSlide.isPending ? "Saving…" : "Save Slide"}</Button>
          </div>
        </form>
      </Modal>

      {/* Unified Edit Image dialog for Hero slide */}
      <ImageChangeDialog
        open={heroMediaPickerOpen}
        onClose={() => setHeroMediaPickerOpen(false)}
        currentMediaId={slideForm.watch("media_id")}
        currentImageUrl={
          (() => {
            const m = slideForm.watch("media_id");
            // D3: /api/media caps its result set at 100 rows regardless of the
            // requested limit (limit: 999 is silently clamped), so the referenced
            // asset can be absent from mediaList and the existing image would not
            // preview. The Hero API already resolves media_id -> media_assets.
            // public_url for this slide (resolved_image_url), so prefer that for
            // the slide's own media_id. Guarded on equality so a newly chosen
            // image is never masked by the stale slide URL.
            if (!m) return null;
            if (editingSlide?.media_id === m && editingSlide?.resolved_image_url) {
              return editingSlide.resolved_image_url;
            }
            const asset = mediaList.find((a) => a.id === m);
            return asset?.public_url ?? null;
          })()
        }
        onSave={async ({ media_id }) => {
          slideForm.setValue("media_id", media_id);
        }}
        title="Choose image"
        uploadCategory="hero"
        canonicalOnly
      />

      {/* Unified Edit Image dialog for Logo */}
      <ImageChangeDialog
        open={logoMediaPickerOpen}
        onClose={() => setLogoMediaPickerOpen(false)}
        currentMediaId={bizForm.watch("logo_media_id")}
        currentImageUrl={
          (() => {
            const m = bizForm.watch("logo_media_id");
            const asset = mediaList.find((a) => a.id === m);
            return asset?.public_url ?? null;
          })()
        }
        onSave={async ({ media_id }) => {
          bizForm.setValue("logo_media_id", media_id);
        }}
        title="Edit Logo"
        uploadCategory="branding"
        allowRemove={false}
      />

      {/* Unified Edit Image dialog for Favicon */}
      <ImageChangeDialog
        open={faviconMediaPickerOpen}
        onClose={() => setFaviconMediaPickerOpen(false)}
        currentMediaId={bizForm.watch("favicon_media_id")}
        currentImageUrl={
          (() => {
            const m = bizForm.watch("favicon_media_id");
            const asset = mediaList.find((a) => a.id === m);
            return asset?.public_url ?? null;
          })()
        }
        onSave={async ({ media_id }) => {
          bizForm.setValue("favicon_media_id", media_id);
        }}
        title="Edit Favicon"
        uploadCategory="branding"
        allowRemove={false}
      />
    </div>
  );
}
