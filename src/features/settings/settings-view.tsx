"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { PageHeader, Card, Spinner, EmptyState, Button, Field, Input, Select, Textarea } from "@/components/ui";

const schema = z.object({
  business_name: z.string().min(2, "Business name is required"),
  description: z.string().optional(),
  phone: z.string().min(7, "Phone is required"),
  whatsapp: z.string().optional(),
  email: z.string().email("Invalid email"),
  address: z.string().min(3, "Address is required"),
  city: z.string().optional(),
  country: z.string().optional(),
  google_maps_url: z.union([z.string().url("Invalid URL"), z.literal("")]).optional(),
  latitude: z.union([z.coerce.number().min(-90, "Latitude must be between -90 and 90").max(90, "Latitude must be between -90 and 90"), z.literal("")]).optional(),
  longitude: z.union([z.coerce.number().min(-180, "Longitude must be between -180 and 180").max(180, "Longitude must be between -180 and 180"), z.literal("")]).optional(),
  currency: z.string().min(2),
  timezone: z.string().min(2),
});
type FormValues = z.infer<typeof schema>;

export function SettingsView() {
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [sysDraft, setSysDraft] = useState<Record<number, string>>({});

  const settings = useQuery({ queryKey: queryKeys["business-settings"].all(), queryFn: () => api.list("business-settings") });
  const system = useQuery({ queryKey: queryKeys["system-settings"].all(), queryFn: () => api.list("system-settings") });
  const biz = settings.data?.[0];

  const form = useForm<FormValues>({ 
    resolver: zodResolver(schema) as any,
  });

  useEffect(() => {
    if (biz) {
      form.reset({
        business_name: biz.business_name,
        description: biz.description ?? "",
        phone: biz.phone ?? "",
        whatsapp: biz.whatsapp ?? "",
        email: biz.email ?? "",
        address: biz.address ?? "",
        city: biz.city ?? "",
        country: biz.country ?? "",
        google_maps_url: biz.google_maps_url ?? "",
        latitude: biz.latitude ?? "",
        longitude: biz.longitude ?? "",
        currency: biz.currency ?? "KES",
        timezone: biz.timezone ?? "Africa/Nairobi",
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
            <Field label="Description" error={form.formState.errors.description?.message}>
              <Textarea {...form.register("description")} placeholder="Brief description of your business" rows={3} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone" error={form.formState.errors.phone?.message}><Input {...form.register("phone")} /></Field>
              <Field label="WhatsApp"><Input {...form.register("whatsapp")} placeholder="Optional" /></Field>
            </div>
            <Field label="Email" error={form.formState.errors.email?.message}><Input {...form.register("email")} type="email" /></Field>
            <Field label="Address" error={form.formState.errors.address?.message}><Input {...form.register("address")} /></Field>

            <p className="pt-2 text-xs font-semibold uppercase tracking-wider text-muted">Location &amp; Maps</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="City"><Input {...form.register("city")} placeholder="Optional" /></Field>
              <Field label="Country"><Input {...form.register("country")} placeholder="Optional" /></Field>
            </div>
            <Field label="Google Maps URL" error={form.formState.errors.google_maps_url?.message}>
              <Input {...form.register("google_maps_url")} placeholder="https://maps.app.goo.gl/..." />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Latitude" error={form.formState.errors.latitude?.message}>
                <Input {...form.register("latitude")} type="number" step="any" placeholder="Optional (e.g. -1.2921)" />
              </Field>
              <Field label="Longitude" error={form.formState.errors.longitude?.message}>
                <Input {...form.register("longitude")} type="number" step="any" placeholder="Optional (e.g. 36.8219)" />
              </Field>
            </div>

            <p className="pt-2 text-xs font-semibold uppercase tracking-wider text-muted">System</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Currency">
                <Select {...form.register("currency")}>
                  <option value="KES">KES — Kenyan Shilling</option>
                  <option value="USD">USD — US Dollar</option>
                  <option value="EUR">EUR — Euro</option>
                </Select>
              </Field>
              <Field label="Timezone">
                <Select {...form.register("timezone")}>
                  <option value="Africa/Nairobi">Africa/Nairobi (EAT)</option>
                  <option value="UTC">UTC</option>
                </Select>
              </Field>
            </div>
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
    </div>
  );
}
