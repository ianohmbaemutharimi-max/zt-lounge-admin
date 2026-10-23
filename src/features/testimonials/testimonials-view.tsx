"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, X, Star, Image, RefreshCw, Settings, AlertCircle, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/query-keys";
import { PageHeader, Card, Badge, Spinner, Button, EmptyState, Toggle, Field, Input } from "@/components/ui";
import { ImageChangeDialog } from "@/features/media/image-change-dialog";
import { cn, timeAgo } from "@/lib/utils";

/**
 * Testimonials moderation (clean GBP path, fix loop).
 *
 * Moderation field is the REAL `approved` boolean â€” never `status`
 * (the previous implementation patched a non-existent `status` field,
 * which sanitizePayload stripped, making approve/hide silent no-ops).
 *
 * Google reviews (source = 'google') are moderated on ZT-owned fields
 * only: approved / is_featured. Their content (customer_name, comment,
 * rating) is Google-owned and is deliberately not editable here or via
 * the generic CRUD API.
 */
export function TestimonialsView() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [connectGoogle, setConnectGoogle] = useState(false);
  const grSchema = z.object({ google_maps_reviews_url: z.string().min(1, "Required").url("Invalid URL"), google_reviews_api_key: z.string().min(1, "Required") });
  const grQuery = useQuery({ queryKey: ["google-reviews"], queryFn: async () => { const r = await fetch("/api/admin/google-reviews"); if (!r.ok) throw new Error("Failed"); return r.json(); }, enabled: connectGoogle });
  const grForm = useForm({ resolver: zodResolver(grSchema), defaultValues: { google_maps_reviews_url: "", google_reviews_api_key: "" } });
  useEffect(() => { if (grQuery.data?.config) { grForm.reset({ google_maps_reviews_url: grQuery.data.config.google_maps_reviews_url ?? "", google_reviews_api_key: grQuery.data.config.google_reviews_api_key ?? "" }); } }, [grQuery.data]);
  const grSave = useMutation({ mutationFn: async (v: any) => { const r = await fetch("/api/admin/google-reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) }); if (!r.ok) { const body = await r.json(); throw new Error(body.error || "Failed"); } return r.json(); }, onSuccess: () => { qc.invalidateQueries({ queryKey: ["google-reviews"] }); qc.invalidateQueries({ queryKey: queryKeys.testimonials.all() }); }, });
  const [grStatus, setGrStatus] = useState<{ success?: string; error?: string }>({});
  const testimonials = useQuery({
    queryKey: queryKeys.testimonials.all(),
    queryFn: () => api.list("testimonials"),
  });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.update("testimonials", id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.testimonials.all() }),
  });

  const [syncState, setSyncState] = useState<{
    loading: boolean;
    success?: string;
    error?: string;
  }>({ loading: false });

  const sync = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/google/reviews/sync", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body.detail === "string" ? body.detail : `Sync failed: ${res.status}`);
      }
      const data = await res.json();
      return data as { success: boolean; seen: number; created: number; updated: number; skipped: number };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: queryKeys.testimonials.all() });
      setSyncState({
        loading: false,
        success: `Synced ${res.seen} reviews (${res.created} new, ${res.updated} updated, ${res.skipped} skipped).`,
      });
    },
    onError: (err: unknown) => {
      setSyncState({
        loading: false,
        error: err instanceof Error ? err.message : "Sync failed.",
      });
    },
    onSettled: () => setSyncState({ loading: false }),
  });

  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaTargetId, setMediaTargetId] = useState<string | null>(null);
  const isSuperAdmin = user?.role === "super_admin";

  if (testimonials.isLoading) return <Spinner label="Loading testimonialsâ€¦" />;

  const list = testimonials.data ?? [];
  // Awaiting moderation = not yet approved. (No `status` column exists.)
  const pending = list.filter((t: any) => !t.approved);
  // Row currently targeted by the canonical media picker (media_id -> media_assets).
  const target = list.find((t: any) => t.id === mediaTargetId) ?? null;

  return (
    <div>
      <PageHeader
        title="Testimonials"
        subtitle={`Moderate customer reviews before they appear on the website. ${pending.length} awaiting review.`}
        actions={
          isSuperAdmin && (
            <SyncButton onClick={() => sync.mutate()} disabled={syncState.loading || sync.isPending} loading={syncState.loading} error={syncState.error} />
          )
        }
      />
      <Toggle label="Connect to Google Reviews (GBP)" checked={connectGoogle} onChange={setConnectGoogle} />
      {connectGoogle && (
        <Card className="p-6">
          {grQuery.isLoading ? <Spinner label="Loading..." /> : (
            <form onSubmit={grForm.handleSubmit((v) => grSave.mutate(v, { onSuccess: (res: any) => setGrStatus({ success: `Synced ${res.sync?.seen ?? 0} reviews!` }), onError: (e: any) => setGrStatus({ error: e.message }) }))} className="space-y-4">
              <Field label="Google Maps URL" error={grForm.formState.errors.google_maps_reviews_url?.message as string | undefined}>
                <Input {...grForm.register("google_maps_reviews_url")} placeholder="https://maps.app.goo.gl/..." defaultValue={grQuery.data?.config?.google_maps_reviews_url ?? ""} />
              </Field>
              <Field label="API Key" error={grForm.formState.errors.google_reviews_api_key?.message as string | undefined}>
                <Input {...grForm.register("google_reviews_api_key")} type="password" placeholder="AIza..." defaultValue={grQuery.data?.config?.google_reviews_api_key ?? ""} />
              </Field>
              {grStatus.success && <div className="flex items-center gap-2 rounded bg-emerald-500/10 p-3 text-sm text-emerald-400"><CheckCircle2 className="h-4 w-4" />{grStatus.success}</div>}
              {grStatus.error && <div className="flex items-center gap-2 rounded bg-rose-400/10 p-3 text-sm text-rose-400"><AlertCircle className="h-4 w-4" />{grStatus.error}</div>}
              <div className="flex justify-end">
                <Button type="submit" disabled={grSave.isPending}>{grSave.isPending ? <><RefreshCw className="h-4 w-4 animate-spin" />Syncing...</> : <><RefreshCw className="h-4 w-4" />Save & Sync</>}</Button>
              </div>
            </form>
          )}
        </Card>
      )}

      {list.length === 0 ? (
        <EmptyState title="No testimonials yet" description="Customer reviews synced from Google will appear here for moderation." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((t: any) => (
            <Card key={t.id} className={cn("p-5", !t.approved && "border-gold/40")}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">{t.customer_name}</p>
                  <div className="mt-1 flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={cn("h-3.5 w-3.5", i < t.rating ? "text-gold" : "text-edge")} fill={i < t.rating ? "currentColor" : "none"} />
                    ))}
                    <span className="ml-2 text-xs text-muted">{timeAgo(t.created_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {t.is_featured && <Badge status="active">featured</Badge>}
                  <Badge status={t.approved ? "active" : "inactive"}>{t.approved ? "approved" : "hidden"}</Badge>
                  {t.source === "google" && <Badge status="active">Google</Badge>}
                </div>
              </div>
              <p className="mt-3 text-sm text-stone-300">&ldquo;{t.comment}&rdquo;</p>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                {!t.approved && (
                  <Button variant="outline" onClick={() => patch.mutate({ id: t.id, body: { approved: true } })}>
                    <Check className="h-4 w-4" /> Approve
                  </Button>
                )}
                {t.approved && (
                  <Button variant="danger" onClick={() => patch.mutate({ id: t.id, body: { approved: false, is_featured: false } })}>
                    <X className="h-4 w-4" /> Hide
                  </Button>
                )}
                {t.approved && (
                  <Button variant={t.is_featured ? "gold" : "outline"} onClick={() => patch.mutate({ id: t.id, body: { is_featured: !t.is_featured } })}>
                    <Star className="h-4 w-4" /> {t.is_featured ? "Unfeature" : "Feature"}
                  </Button>
                )}
                {t.approved && (
                  <Button variant="ghost" onClick={() => { setMediaTargetId(t.id); setMediaPickerOpen(true); }}>
                    <Image className="h-4 w-4" /> {t.media_id ? "Change" : "Add"} Image
                  </Button>
                )}
              </div>
            </Card>
          ))}
    </div>
      )}

                        
      {/* Canonical Media Library picker (media_id to media_assets.public_url).
          Reuses the shared ImageChangeDialog. No testimonial-specific uploader,
          no raw image-URL editing (canonicalOnly). Google reviewer photos
          (author_photo_url) are Google-owned and are never written here. */}
      {mediaTargetId && (
        <ImageChangeDialog
          open={mediaPickerOpen}
          onClose={() => {
            setMediaPickerOpen(false);
            setMediaTargetId(null);
          }}
          currentMediaId={target?.media_id ?? null}
          currentImageUrl={target?.resolved_image_url ?? null}
          uploadCategory="testimonials"
          canonicalOnly
          title="Testimonial image"
          onSave={async ({ media_id }) => {
            if (!mediaTargetId) return;
            // Only the canonical relationship is written. image_url is a
            // legacy display-only column and is not in WRITABLE_FIELDS.
            await api.update("testimonials", mediaTargetId, { media_id });
          }}
        />
      )}
    </div>
  );
}

function SyncButton({ onClick, disabled, loading, error }: { onClick: () => void; disabled: boolean; loading?: boolean; error?: string }) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      disabled={disabled || loading}
      className="flex-1 sm:flex-none"
    >
      {loading ? (
        <>
          <RefreshCw className="h-4 w-4 animate-spin" /> Syncing…
        </>
      ) : error ? (
        <>
          <span className="text-rose-400">Error</span>
        </>
      ) : (
        <>
          <RefreshCw className="h-4 w-4" /> Sync Google Reviews
        </>
      )}
    </Button>
  );
}

