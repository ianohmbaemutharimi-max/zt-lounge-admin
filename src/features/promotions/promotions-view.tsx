"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Pencil, Trash2, Power, BadgePercent } from "lucide-react";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { PageHeader, Card, Badge, Spinner, EmptyState, Button, Modal, Field, Input, Select, Textarea } from "@/components/ui";
import { cn, formatDate, formatKES } from "@/lib/utils";

/**
 * Form schema uses ACTUAL live database column names (snake_case)
 * to match the Repository response allowlist and the live Supabase schema.
 * 
 * Live promotions columns:
 * - id (uuid)
 * - title (text)
 * - description (text, nullable)
 * - banner_image (text, nullable)
 * - discount_percent (numeric, nullable)
 * - start_date (date, nullable)
 * - end_date (date, nullable)
 * - is_active (boolean, nullable, default true)
 * - created_at (timestamptz)
 * - updated_at (timestamptz)
 */
const promoSchema = z.object({
  title: z.string().min(2, "Title is required"),
  description: z.string().optional(),
  discount_percent: z.coerce.number().min(0, "Must be 0 or more"),
  start_date: z.string().min(1, "Start date required"),
  end_date: z.string().min(1, "End date required"),
}).refine((v) => v.end_date >= v.start_date, {
  message: "End date must be after start date",
  path: ["end_date"],
});
type PromoForm = z.infer<typeof promoSchema>;

export function PromotionsView() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const promos = useQuery({ queryKey: queryKeys.promotions.all(), queryFn: () => api.list("promotions") });
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
          discount_percent: p.discount_percent ?? 0,
          start_date: p.start_date ?? "",
          end_date: p.end_date ?? "",
        }
      : {
          title: "",
          description: "",
          discount_percent: 10,
          start_date: "",
          end_date: "",
        });
    setOpen(true);
  }

  if (promos.isLoading) return <Spinner label="Loading promotions…" />;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader
        title="Promotions"
        subtitle="Offers and discounts displayed on the public website."
        actions={<Button onClick={() => openForm()}><Plus className="h-4 w-4" /> New Promotion</Button>}
      />

      {(promos.data ?? []).length === 0 ? (
        <EmptyState
          title="No promotions"
          description="Create your first offer to attract more guests."
          action={<Button onClick={() => openForm()}><Plus className="h-4 w-4" /> New Promotion</Button>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(promos.data ?? []).map((p: any) => {
            const startDate = (p.start_date ?? "").slice(0, 10);
            const endDate = (p.end_date ?? "").slice(0, 10);
            const live = p.is_active && startDate <= today && endDate >= today;
            return (
              <Card key={p.id} className={cn("flex flex-col p-5", !p.is_active && "opacity-60")}>
                <div className="flex items-start justify-between">
                  <div className="rounded-xl bg-gold/10 p-2.5"><BadgePercent className="h-5 w-5 text-gold" /></div>
                  <Badge status={live ? "active" : p.is_active ? "pending" : "inactive"}>
                    {live ? "live" : p.is_active ? "scheduled" : "inactive"}
                  </Badge>
                </div>
                <p className="mt-3 font-semibold text-white">{p.title}</p>
                <p className="mt-1 flex-1 text-sm text-muted">{p.description}</p>
                <p className="mt-3 text-lg font-semibold text-gold">
                  {p.discount_percent !== undefined && p.discount_percent !== null
                    ? `${p.discount_percent}% OFF`
                    : ""}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {startDate ? formatDate(startDate) : "—"} → {endDate ? formatDate(endDate) : "—"}
                </p>
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

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit Promotion" : "New Promotion"}>
        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
          <Field label="Title" error={form.formState.errors.title?.message}>
            <Input placeholder="e.g. VIP Cabin Night" {...form.register("title")} />
          </Field>
          <Field label="Description">
            <Textarea placeholder="Describe the offer…" {...form.register("description")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Discount (%)" error={form.formState.errors.discount_percent?.message}>
              <Input type="number" min={0} placeholder="e.g. 20" {...form.register("discount_percent")} />
            </Field>
            <div />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Date" error={form.formState.errors.start_date?.message}>
              <Input type="date" {...form.register("start_date")} />
            </Field>
            <Field label="End Date" error={form.formState.errors.end_date?.message}>
              <Input type="date" {...form.register("end_date")} />
            </Field>
          </div>
          {save.isError && <p className="text-sm text-rose-400">{(save.error as Error).message}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save Promotion"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
