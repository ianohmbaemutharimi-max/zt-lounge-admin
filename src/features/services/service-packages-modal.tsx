"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { z } from "zod";
import { Plus, Pencil, Power, Trash2, LoaderCircle, CheckCircle2, Info } from "lucide-react";
import { Modal, Button, Field, Input, Select, Textarea, Spinner, Badge } from "@/components/ui";
import { cn, formatKES } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

/**
 * Generic Packages / Charges manager for ANY service (zero per-service code).
 * Edits service_charges.price only — booking prices are snapshotted
 * server-side by create_booking()/admin_booking(); no client price is sent.
 */

const chargeSchema = z.object({
  name: z.string().min(2, "Package name is required"),
  description: z.string().optional(),
  price: z.coerce.number().min(0, "Price must be 0 or more"),
  unit: z.string().optional(),
  status: z.enum(["active", "inactive"]),
  sort_order: z.coerce.number().min(0),
});
type ChargeForm = z.infer<typeof chargeSchema>;

type Props = {
  service: { id: string; name: string; slug: string; price: number | string } | null;
  onClose: () => void;
  /**
   * Canonical Services hierarchy: website_pages.id -> services.page_id ->
   * service_charges.service_id. The selected page is sent with every charge
   * request so the server can verify the parent service belongs to it. A
   * missing page_id makes the server reject the call (fail-closed).
   */
  pageId?: string;
};

/** Append the page scope to a charge URL. */
export function withPageScope(url: string, pageId?: string): string {
  if (!pageId) return url;
  return `${url}${url.includes("?") ? "&" : "?"}page_id=${encodeURIComponent(pageId)}`;
}

export async function chargeFetcher<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export function ServicePackagesModal({ service, onClose, pageId }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<any | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const slug = service?.slug ?? "";
  const base = `/api/admin/services/${slug}/charges`;

  const charges = useQuery({
    queryKey: ["service-charges", slug, pageId ?? null],
    queryFn: () => chargeFetcher<{ data: any[] }>(withPageScope(base, pageId)),
    // Page-first: charges are never fetched without a selected page.
    enabled: !!service && !!pageId,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["service-charges", slug] });

  const form = useForm<ChargeForm>({ resolver: zodResolver(chargeSchema) as any });

  function openForm(row?: any) {
    setEditing(row ?? null);
    form.reset(
      row
        ? { name: row.name, description: row.description ?? "", price: Number(row.price), unit: row.unit ?? "", status: row.status, sort_order: row.sort_order ?? 0 }
        : { name: "", description: "", price: 0, unit: "", status: "active", sort_order: 0 }
    );
    setFormOpen(true);
  }

  const save = useMutation({
    mutationFn: (v: ChargeForm) => {
      const payload = {
        name: v.name,
        description: v.description || null,
        price: String(v.price),
        unit: v.unit || null,
        status: v.status,
        sort_order: v.sort_order,
      };
      return editing
        ? chargeFetcher(withPageScope(`${base}/${editing.id}`, pageId), { method: "PATCH", body: JSON.stringify(payload) })
        : chargeFetcher(withPageScope(base, pageId), { method: "POST", body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      invalidate();
      toast.success(
        editing ? "Package updated" : "Package created",
        editing ? `"${editing.name}" has been updated successfully` : "New package has been added"
      );
      setFormOpen(false);
      setEditing(null);
      form.reset();
    },
    onError: (error: Error) => {
      toast.error("Failed to save package", error.message);
    },
  });

  const toggleStatus = useMutation({
    mutationFn: (row: any) =>
      chargeFetcher(withPageScope(`${base}/${row.id}`, pageId), {
        method: "PATCH",
        body: JSON.stringify({ status: row.status === "active" ? "inactive" : "active" }),
      }),
    onSuccess: (_, row) => {
      invalidate();
      const newStatus = row.status === "active" ? "inactive" : "active";
      toast.success(
        `Package ${newStatus === "active" ? "activated" : "deactivated"}`,
        `"${row.name}" is now ${newStatus}`
      );
    },
    onError: (error: Error) => {
      toast.error("Failed to toggle status", error.message);
    },
  });

  const remove = useMutation({
    mutationFn: (row: any) =>
      chargeFetcher(withPageScope(`${base}/${row.id}`, pageId), { method: "DELETE" }),
    onSuccess: (_, row) => {
      invalidate();
      toast.success("Package deleted", `"${row.name}" has been removed`);
    },
    onError: (error: Error) => {
      toast.error("Failed to delete package", error.message);
    },
  });

  return (
    <Modal open={!!service} onClose={onClose} title={service ? `${service.name} — Packages / Charges` : ""}>
      {!service ? null : (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-edge bg-panel px-4 py-3">
            <span className="text-sm text-muted">Reference Price (not used for booking)</span>
            <span className="font-semibold text-gold">{formatKES(Number(service.price))}</span>
          </div>

          {charges.isLoading ? (
            <Spinner label="Loading packages…" />
          ) : (charges.data?.data ?? []).length === 0 ? (
            <div className="space-y-3 rounded-xl border border-dashed border-edge bg-panel-2/50 p-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-gold/10">
                <Info className="h-6 w-6 text-gold" />
              </div>
              <div>
                <p className="font-medium text-white">No packages configured yet</p>
                <p className="mt-1 text-sm text-muted">
                  Add pricing packages to offer customers flexible booking options.
                </p>
              </div>
              <Button onClick={() => openForm()} className="mt-2">
                <Plus className="h-4 w-4" /> Create First Package
              </Button>
            </div>
          ) : (
            <ul className="space-y-2">
              {(charges.data?.data ?? []).map((c: any) => (
                <li key={c.id} data-testid="package-item" data-package-id={c.id} data-package-status={c.status} className="flex items-center justify-between rounded-xl border border-edge bg-panel px-4 py-3 transition-colors hover:bg-panel-2/50">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p data-testid="package-name" className="truncate font-medium text-white">{c.name}</p>
                      <Badge status={c.status === "active" ? "active" : "inactive"}>
                        {c.status === "active" ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <p data-testid="package-details" className="mt-0.5 text-xs text-muted" title={c.description || undefined}>
                      {formatKES(Number(c.price))}
                      {c.unit ? ` · ${c.unit}` : ""} · order {c.sort_order}
                      {c.description && (
                        <span data-testid="package-description" className="ml-1 text-stone-500">• {c.description.substring(0, 40)}{c.description.length > 40 ? "..." : ""}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button data-testid="package-edit" title="Edit" onClick={() => openForm(c)} className="rounded-lg p-1.5 text-gold transition-colors hover:bg-gold/10">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      data-testid="package-toggle"
                      title={c.status === "active" ? "Deactivate package" : "Activate package"}
                      onClick={() => toggleStatus.mutate(c)}
                      disabled={toggleStatus.isPending}
                      className={cn(
                        "rounded-lg p-1.5 transition-colors hover:bg-panel-2",
                        c.status === "active" ? "text-emerald-400" : "text-stone-500",
                        toggleStatus.isPending && "opacity-50 cursor-wait"
                      )}
                    >
                      {toggleStatus.isPending ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Power className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      data-testid="package-delete"
                      title="Delete package"
                      onClick={() => {
                        if (confirm(`Delete package "${c.name}"? Existing bookings keep their recorded price.`)) remove.mutate(c);
                      }}
                      disabled={remove.isPending}
                      className={cn(
                        "rounded-lg p-1.5 text-rose-400 transition-colors hover:bg-rose-500/10",
                        remove.isPending && "opacity-50 cursor-wait"
                      )}
                    >
                      {remove.isPending ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <Button className="w-full" onClick={() => openForm()}>
            <Plus className="h-4 w-4" /> Add Package
          </Button>

          {formOpen && (
            <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4 rounded-xl border border-edge bg-panel-2/50 p-4">
              <div className="mb-2 flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2">
                <Info className="h-4 w-4 text-amber-400" />
                <p className="text-xs text-amber-200">
                  {editing ? "Update package details below" : "Create a new pricing package for this service"}
                </p>
              </div>
              
              <Field label="Package Name" error={form.formState.errors.name?.message}>
                <Input {...form.register("name")} placeholder="e.g. Premium Event Package" />
              </Field>
              
              <Field label="Description">
                <Textarea 
                  {...form.register("description")} 
                  placeholder="Describe what's included in this package (optional)"
                  rows={3}
                />
              </Field>
              
              <div className="grid grid-cols-2 gap-3">
                <Field label="Price (KES)" error={form.formState.errors.price?.message}>
                  <Input 
                    type="number" 
                    min={0} 
                    {...form.register("price")} 
                    placeholder="0"
                  />
                  <p className="mt-1 text-xs text-muted">Enter amount without commas</p>
                </Field>
                <Field label="Unit (Optional)">
                  <Input 
                    {...form.register("unit")} 
                    list="unit-suggestions"
                    placeholder="e.g. per event"
                  />
                  <datalist id="unit-suggestions">
                    <option value="per event" />
                    <option value="per day" />
                    <option value="per person" />
                    <option value="per hour" />
                    <option value="per session" />
                    <option value="per booking" />
                  </datalist>
                </Field>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <Field label="Status">
                  <Select {...form.register("status")}>
                    <option value="active">Active (visible to customers)</option>
                    <option value="inactive">Inactive (hidden from customers)</option>
                  </Select>
                </Field>
                <Field label="Display Order" error={form.formState.errors.sort_order?.message}>
                  <Input 
                    type="number" 
                    min={0} 
                    {...form.register("sort_order")}
                    placeholder="0"
                  />
                  <p className="mt-1 text-xs text-muted">Lower numbers appear first</p>
                </Field>
              </div>
              
              {save.isError && (
                <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 px-3 py-2">
                  <p className="text-sm text-rose-400">{(save.error as Error).message}</p>
                </div>
              )}
              
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => {
                  setFormOpen(false);
                  setEditing(null);
                  form.reset();
                }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={save.isPending}>
                  {save.isPending ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : editing ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Save Changes
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Add Package
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </Modal>
  );
}
