"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Pencil, Trash2, Power, CheckCircle2, X } from "lucide-react";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { PageHeader, Button, Spinner, Modal, Field, Input, Textarea, Card, Badge, EmptyState } from "@/components/ui";
import { cn } from "@/lib/utils";
import { MediaPickerModal } from "@/features/media/media-picker-modal";
import { ImageChangeDialog } from "@/features/media/image-change-dialog";
import type { SelectableMediaAsset } from "@/types/media";

// ============================================================
// Forms use the ACTUAL live database column names (snake_case)
// to match the Repository allowlists and the live Supabase schema.
// ============================================================

const slideSchema = z.object({
  title: z.string().min(2, "Title is required"),
  subtitle: z.string().optional(),
  image_url: z.string().optional(),
  cta_text: z.string().optional(),
  cta_link: z.string().optional(),
  display_order: z.coerce.number().default(0),
  is_active: z.boolean().default(true),
  media_id: z.string().uuid().nullable().optional(),
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
});
type BizForm = z.infer<typeof bizSchema>;

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

export function WebsiteCms() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"hero" | "business" | "hours" | "pages">("hero");
  const [slideOpen, setSlideOpen] = useState(false);
  const [editingSlide, setEditingSlide] = useState<any | null>(null);
  const [saved, setSaved] = useState(false);
  const [heroMediaPickerOpen, setHeroMediaPickerOpen] = useState(false);
  const [heroSelectedMedia, setHeroSelectedMedia] = useState<SelectableMediaAsset | null>(null);
  const [heroImageChangeOpen, setHeroImageChangeOpen] = useState(false);
  const [heroImageEditingSlide, setHeroImageEditingSlide] = useState<any | null>(null);

  const slides = useQuery({ queryKey: queryKeys["hero-slides"].all(), queryFn: () => api.list("hero-slides") });
  const settings = useQuery({ queryKey: queryKeys["business-settings"].all(), queryFn: () => api.list("business-settings") });
  const pages = useQuery({ queryKey: queryKeys["website-pages"].all(), queryFn: () => api.list("website-pages") });

  const biz = settings.data?.[0];

  const slideForm = useForm<SlideForm>({ resolver: zodResolver(slideSchema) as any });
  const bizForm = useForm<BizForm>({ resolver: zodResolver(bizSchema) });
  const [hours, setHours] = useState<Record<string, string> | null>(null);

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 2500); };

  const saveSlide = useMutation({
    mutationFn: (v: SlideForm) =>
      editingSlide ? api.update("hero-slides", editingSlide.id, v) : api.create("hero-slides", v),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys["hero-slides"].all() }); setSlideOpen(false); setEditingSlide(null); flash(); },
  });
  const patchSlide = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api.update("hero-slides", id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys["hero-slides"].all() }),
  });
  const removeSlide = useMutation({
    mutationFn: (id: string) => api.remove("hero-slides", id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys["hero-slides"].all() }),
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
    slideForm.reset(s
      ? { title: s.title, subtitle: s.subtitle ?? "", image_url: s.image_url ?? "", cta_text: s.cta_text ?? "", cta_link: s.cta_link ?? "", display_order: s.display_order ?? 0, is_active: s.is_active ?? true }
      : { title: "", subtitle: "", image_url: "", cta_text: "", cta_link: "", display_order: (slides.data?.length ?? 0) + 1, is_active: true });
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
    });
  }

  if (slides.isLoading || settings.isLoading || pages.isLoading) return <Spinner label="Loading website content…" />;

  const tabs = [
    { key: "hero", label: "Hero Section" },
    { key: "business", label: "Business Info" },
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
          <button key={t.key} onClick={() => { setTab(t.key); if (t.key === "business") startBizEdit(); if (t.key === "hours") setHours(biz?.opening_hours ?? {}); }}
            className={cn("rounded-lg px-4 py-2 text-sm", tab === t.key ? "bg-gold/15 text-gold" : "text-muted hover:text-white")}>
            {t.label}
          </button>
        ))}
      </div>

      {/* HERO */}
      {tab === "hero" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => openSlide()}><Plus className="h-4 w-4" /> New Slide</Button>
          </div>
          {(slides.data ?? []).length === 0 ? (
            <EmptyState title="No hero slides" description="Add a slide to control the homepage hero banner." />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {(slides.data ?? []).map((s: any) => (
                <Card key={s.id} className={cn("overflow-hidden", !s.is_active && "opacity-60")}>
                  <div className="relative h-40">
                    {s.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.image_url} alt="" className="h-full w-full object-cover" />
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
                      <button title="Change image" onClick={() => { setHeroImageEditingSlide(s); setHeroImageChangeOpen(true); }} className="rounded-lg p-1.5 text-gold hover:bg-gold/10"><Pencil className="h-4 w-4" /></button>
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
      )}

      {/* BUSINESS INFO */}
      {tab === "business" && biz && (
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
          <Field label="Image URL">
            <Input placeholder="https://… (storage upload URL)" {...slideForm.register("image_url")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="CTA Text"><Input placeholder="Book a Table" {...slideForm.register("cta_text")} /></Field>
            <Field label="CTA Link"><Input placeholder="/bookings" {...slideForm.register("cta_link")} /></Field>
          </div>
          <Field label="Display Order"><Input type="number" {...slideForm.register("display_order")} /></Field>

          <div className="space-y-3 rounded-lg border border-edge bg-panel-2/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-stone-300">Media Library</span>
              <Button 
                type="button" 
                onClick={() => setHeroMediaPickerOpen(true)}
                className="text-xs"
              >
                Select from Library
              </Button>
            </div>
            {slideForm.watch("media_id") && (
              <div className="flex items-center justify-between rounded bg-panel p-2 text-sm text-stone-300">
                <span>✓ Media linked</span>
                <button
                  type="button"
                  onClick={() => slideForm.setValue("media_id", null)}
                  className="text-rose-400 hover:text-rose-300"
                  title="Remove media"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {saveSlide.isError && <p className="text-sm text-rose-400">{(saveSlide.error as Error).message}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setSlideOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saveSlide.isPending}>{saveSlide.isPending ? "Saving…" : "Save Slide"}</Button>
          </div>
        </form>
      </Modal>

       {/* Media Picker Modal for Hero */}
       <MediaPickerModal
         open={heroMediaPickerOpen}
         onClose={() => setHeroMediaPickerOpen(false)}
         onSelect={(media) => {
           slideForm.setValue("media_id", media.id);
           setHeroSelectedMedia(media);
           setHeroMediaPickerOpen(false);
         }}
       />

       {/* Image Change Dialog for Hero Slides */}
       {heroImageEditingSlide && (
         <ImageChangeDialog
           open={heroImageChangeOpen}
           onClose={() => {
             setHeroImageChangeOpen(false);
             setHeroImageEditingSlide(null);
           }}
           currentImageUrl={heroImageEditingSlide.image_url}
           onSave={async (newImageUrl) => {
             await patchSlide.mutateAsync({
               id: heroImageEditingSlide.id,
               body: { image_url: newImageUrl },
             });
           }}
           title="Edit slide image"
           uploadBucket="media-hero-slides"
         />
       )}
     </div>
   );
 }
