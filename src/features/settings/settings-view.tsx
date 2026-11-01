"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, Image as ImageIcon } from "lucide-react";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { PageHeader, Card, Spinner, EmptyState, Button, Field, Input } from "@/components/ui";
import { ImageChangeDialog } from "@/features/media/image-change-dialog";
import { getSelectableMedia } from "@/lib/media/selection";

const schema = z.object({
  business_name: z.string().min(2, "Business name is required"),
  phone: z.string().min(7, "Phone is required"),
  whatsapp: z.string().optional(),
  email: z.string().email("Invalid email"),
  address: z.string().min(3, "Address is required"),
  city: z.string().optional(),
  google_maps_url: z.union([z.string().url("Invalid URL"), z.literal("")]).optional(),
});
type FormValues = z.infer<typeof schema>;

export function SettingsView() {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [sysDraft, setSysDraft] = useState<Record<number, string>>({});
    const [logoPickerOpen, setLogoPickerOpen] = useState(false);
  const [logoLightPickerOpen, setLogoLightPickerOpen] = useState(false);
  const [faviconPickerOpen, setFaviconPickerOpen] = useState(false);

  const settings = useQuery({ queryKey: queryKeys["business-settings"].all(), queryFn: () => api.list("business-settings") });
  const system = useQuery({ queryKey: queryKeys["system-settings"].all(), queryFn: () => api.list("system-settings") });
  const media = useQuery({ queryKey: queryKeys["media"].all(), queryFn: async () => (await getSelectableMedia({ limit: 999 })).data });
  const biz = settings.data?.[0];

  // Resolve logo and favicon assets from media
    const logoAsset = media.data?.find((m: any) => m.id === biz?.logo_media_id);
  const logoLightAsset = media.data?.find((m: any) => m.id === biz?.logo_light_media_id);
  const faviconAsset = media.data?.find((m: any) => m.id === biz?.favicon_media_id);

  const form = useForm<FormValues>({ 
    resolver: zodResolver(schema) as any,
  });

  useEffect(() => {
    if (biz) {
      form.reset({
        business_name: biz.business_name ?? "",
        phone: biz.phone ?? "",
        whatsapp: biz.whatsapp ?? "",
        email: biz.email ?? "",
        address: biz.address ?? "",
        city: biz.city ?? "",
        google_maps_url: biz.google_maps_url ?? "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biz?.id]);

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 2500); };

  const saveBiz = useMutation({
    mutationFn: (v: FormValues) => api.update("business-settings", biz.id, v),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys["business-settings"].all() }); flash(); },
  });

  const saveSys = useMutation({
    mutationFn: ({ id, value }: { id: number; value: string }) => api.update("system-settings", id, { value }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys["system-settings"].all() }); flash(); },
  });

  const saveBranding = useMutation({
        mutationFn: async (updates: { logo_media_id?: string | null; logo_light_media_id?: string | null; favicon_media_id?: string | null }) => {
      const response = await fetch("/api/admin/business-settings/branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update branding");
      }
      return response.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys["business-settings"].all() });
      qc.invalidateQueries({ queryKey: queryKeys["media"].all() });
      flash();
    },
  });

  // Canonical handlers for the unified Edit Image workflow: onSave only
  // receives media_id (never a raw URL) and persists it to business_settings.
    const handleLogoMediaSave = async ({ media_id }: { media_id: string | null }) => {
    await saveBranding.mutateAsync({ logo_media_id: media_id });
  };

  const handleLogoLightMediaSave = async ({ media_id }: { media_id: string | null }) => {
    await saveBranding.mutateAsync({ logo_light_media_id: media_id });
  };

  const handleFaviconMediaSave = async ({ media_id }: { media_id: string | null }) => {
    await saveBranding.mutateAsync({ favicon_media_id: media_id });
  };

  if (settings.isLoading || system.isLoading) return <Spinner label="Loading settings…" />;
  if (!biz) return <EmptyState title="No business settings found" description="A business_settings row is required." />;

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Business information and system configuration."
        actions={saved && <span className="flex items-center gap-1.5 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Saved</span>}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h3 className="mb-4 text-sm font-semibold text-white">Business Information</h3>
          <form onSubmit={form.handleSubmit((v) => saveBiz.mutate(v))} className="space-y-4">
            <Field label="Business Name" error={form.formState.errors.business_name?.message}>
              <Input {...form.register("business_name")} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone" error={form.formState.errors.phone?.message}><Input {...form.register("phone")} /></Field>
              <Field label="WhatsApp"><Input {...form.register("whatsapp")} placeholder="Optional" /></Field>
            </div>
            <Field label="Email" error={form.formState.errors.email?.message}><Input {...form.register("email")} type="email" /></Field>
            <Field label="Address" error={form.formState.errors.address?.message}><Input {...form.register("address")} /></Field>

            <p className="pt-2 text-xs font-semibold uppercase tracking-wider text-muted">Branding</p>
            
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Logo */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-white">Logo</label>
                {logoAsset ? (
                  <div className="group relative aspect-video overflow-hidden rounded-lg border border-stone-700">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={logoAsset.public_url}
                      alt={logoAsset.file_name || "Logo"}
                      className="h-full w-full object-contain bg-stone-900"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setLogoPickerOpen(true)}
                      >
                        Change Logo
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setLogoPickerOpen(true)}
                    className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-stone-700 bg-stone-900/50 text-stone-500 transition-colors hover:border-stone-600 hover:text-stone-400"
                  >
                    <ImageIcon className="h-8 w-8" />
                    <span className="text-sm">Select Logo</span>
                  </button>
                )}
                                {logoAsset && (
                  <p className="text-xs text-muted">{logoAsset.file_name || "Untitled"}</p>
                )}
              </div>

              {/* Light logo */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-white">Light Logo</label>
                {logoLightAsset ? (
                  <div className="group relative aspect-video overflow-hidden rounded-lg border border-stone-700">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={logoLightAsset.public_url} alt={logoLightAsset.file_name || "Light logo"} className="h-full w-full object-contain bg-stone-900" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button type="button" variant="outline" onClick={() => setLogoLightPickerOpen(true)}>Change Light Logo</Button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setLogoLightPickerOpen(true)} className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-stone-700 bg-stone-900/50 text-stone-500 transition-colors hover:border-stone-600 hover:text-stone-400">
                    <ImageIcon className="h-8 w-8" />
                    <span className="text-sm">Select Light Logo</span>
                  </button>
                )}
                {logoLightAsset && <p className="text-xs text-muted">{logoLightAsset.file_name || "Untitled"}</p>}
              </div>

              {/* Favicon */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-white">Favicon</label>
                {faviconAsset ? (
                  <div className="group relative aspect-video overflow-hidden rounded-lg border border-stone-700">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={faviconAsset.public_url}
                      alt={faviconAsset.file_name || "Favicon"}
                      className="h-full w-full object-contain bg-stone-900"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setFaviconPickerOpen(true)}
                      >
                        Change Favicon
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setFaviconPickerOpen(true)}
                    className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-stone-700 bg-stone-900/50 text-stone-500 transition-colors hover:border-stone-600 hover:text-stone-400"
                  >
                    <ImageIcon className="h-8 w-8" />
                    <span className="text-sm">Select Favicon</span>
                  </button>
                )}
                {faviconAsset && (
                  <p className="text-xs text-muted">{faviconAsset.file_name || "Untitled"}</p>
                )}
              </div>
            </div>

            <p className="pt-2 text-xs font-semibold uppercase tracking-wider text-muted">Location &amp; Maps</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="City"><Input {...form.register("city")} placeholder="Optional" /></Field>
            </div>
            <Field label="Google Maps URL" error={form.formState.errors.google_maps_url?.message}>
              <Input {...form.register("google_maps_url")} placeholder="https://maps.app.goo.gl/..." />
            </Field>
            <p className="text-xs text-muted">Only fields supported by the current live business_settings table are editable here. Additional settings require a reviewed database migration.</p>
            {saveBiz.isError && <p className="text-sm text-rose-400">{(saveBiz.error as Error).message}</p>}
            <div className="flex justify-end">
              <Button type="submit" disabled={saveBiz.isPending}>{saveBiz.isPending ? "Saving…" : "Save Business Info"}</Button>
            </div>
          </form>
        </Card>

        <Card className="p-6">
          <h3 className="mb-4 text-sm font-semibold text-white">System Settings</h3>
          {(system.data ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">No system settings configured.</p>
          ) : (
            <div className="space-y-4">
              {(system.data ?? []).map((s: any) => (
                <div key={s.id} className="flex items-end gap-3">
                  <Field label={(s.key || "").replace(/_/g, " ")} className="flex-1">
                    <Input
                      value={sysDraft[s.id] ?? s.value ?? ""}
                      onChange={(e) => setSysDraft({ ...sysDraft, [s.id]: e.target.value })}
                    />
                    {s.description && <span className="mt-1 block text-xs text-muted">{s.description}</span>}
                  </Field>
                  <Button
                    variant="outline"
                    disabled={sysDraft[s.id] === undefined || sysDraft[s.id] === s.value || saveSys.isPending}
                    onClick={() => saveSys.mutate({ id: s.id, value: sysDraft[s.id] })}
                  >
                    Save
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Unified Edit Image dialogs — logo and favicon share the SAME
          workflow (upload / browse / paste link) converging on media_id → media_assets. */}
      <ImageChangeDialog
        open={logoPickerOpen}
        onClose={() => setLogoPickerOpen(false)}
        currentMediaId={biz?.logo_media_id}
        currentImageUrl={logoAsset?.public_url ?? null}
                onSave={handleLogoMediaSave}
        title="Edit Logo"
        uploadCategory="branding"
        allowRemove={false}
      />
      <ImageChangeDialog
        open={logoLightPickerOpen}
        onClose={() => setLogoLightPickerOpen(false)}
        currentMediaId={biz?.logo_light_media_id}
        currentImageUrl={logoLightAsset?.public_url ?? null}
        onSave={handleLogoLightMediaSave}
        title="Edit Light Logo"
        uploadCategory="branding"
        allowRemove={true}
      />
      <ImageChangeDialog
        open={faviconPickerOpen}
        onClose={() => setFaviconPickerOpen(false)}
        currentMediaId={biz?.favicon_media_id}
        currentImageUrl={faviconAsset?.public_url ?? null}
        onSave={handleFaviconMediaSave}
        title="Edit Favicon"
        uploadCategory="branding"
        allowRemove={false}
      />
    </div>
  );
}
