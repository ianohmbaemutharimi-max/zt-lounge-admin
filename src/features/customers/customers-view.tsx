"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Eye, Pencil, Mail, Phone, RefreshCw, Power, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { PageHeader, Button, Badge, Spinner, Modal, Field, Input, Textarea } from "@/components/ui";
import { DataTable, type Column } from "@/components/data-table";
import { formatDate, formatKES, formatTime } from "@/lib/utils";

const customerSchema = z.object({
  full_name: z.string().min(2, "Name is required"),
  email: z.string().email("Invalid email").or(z.literal("")),
  phone: z.string().min(7, "Phone is required"),
  notes: z.string().optional(),
});
type CustomerForm = z.infer<typeof customerSchema>;

export function CustomersView() {
  const qc = useQueryClient();
  const [viewing, setViewing] = useState<any | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState("");

  // Newest-first within the existing API cap (100) so a customer created by
  // booking confirmation is immediately visible instead of falling outside the
  // default 10-row page. No new pagination system — reuses the generic API.
  const customers = useQuery({
    queryKey: queryKeys.customers.all(),
    queryFn: () => api.list("customers", { limit: 100, orderBy: "created_at", ascending: false }),
  });
  const bookings = useQuery({ queryKey: queryKeys.bookings.all(), queryFn: () => api.list("bookings") });
  const services = useQuery({ queryKey: queryKeys.services.all(), queryFn: () => api.list("services") });
  // Membership capability lives INSIDE Customers (no separate memberships page).
  // One canonical fetch each — no per-customer membership requests (no N+1).
  const memberships = useQuery({ queryKey: queryKeys["customer-memberships"].all(), queryFn: () => api.list("customer-memberships", { limit: 100, orderBy: "created_at", ascending: false }) });
  const plans = useQuery({ queryKey: queryKeys["membership-plans"].all(), queryFn: () => api.list("membership-plans") });

  const form = useForm<CustomerForm>({ resolver: zodResolver(customerSchema) });

  const save = useMutation({
    mutationFn: (v: CustomerForm) => {
      // Transform empty email to field omission (NULL in DB) to satisfy valid_email constraint
      const customerPayload = {
        full_name: v.full_name,
        phone: v.phone,
        ...(v.email?.trim() ? { email: v.email.trim() } : {}),
        ...(v.notes !== undefined ? { notes: v.notes } : {}),
      };
      return editing ? api.update("customers", editing.id, customerPayload) : api.create("customers", customerPayload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.customers.all() });
      setFormOpen(false);
      setEditing(null);
    },
  });

  function openForm(c?: any) {
    setEditing(c ?? null);
    form.reset(c ? { full_name: c.full_name, email: c.email ?? "", phone: c.phone ?? "", notes: c.notes ?? "" } : { full_name: "", email: "", phone: "", notes: "" });
    setFormOpen(true);
  }

  const customerBookings = (id: string) =>
    (bookings.data ?? []).filter((b: any) => b.customer_id === id);


  /** The customer's current active membership, if any. */
  const activeMembership = (id: string) =>
    (memberships.data ?? []).find((m: any) => m.customer_id === id && m.status === "active");

  /** Dedicated lifecycle subroutes (renew/cancel) — POST, not PATCH. */
  async function postMembershipAction(id: string, action: "renew" | "cancel") {
    const res = await fetch(`/api/admin/customer-memberships/${id}/${action}`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error?.message ?? body?.error ?? `HTTP ${res.status}`);
    }
    return res.json();
  }

  const invalidateMemberships = () =>
    qc.invalidateQueries({ queryKey: queryKeys["customer-memberships"].all() });

  const assignMembership = useMutation({
    mutationFn: (v: { customerId: string; planId: string }) =>
      api.create("customer-memberships", { customer_id: v.customerId, plan_id: v.planId }),
    onSuccess: invalidateMemberships,
  });

  const renewMembership = useMutation({
    mutationFn: (id: string) => postMembershipAction(id, "renew"),
    onSuccess: invalidateMemberships,
  });

  const cancelMembership = useMutation({
    mutationFn: (id: string) => postMembershipAction(id, "cancel"),
    onSuccess: invalidateMemberships,
  });

  // Change package (R-5 rollback-safe): create the replacement FIRST,
  // then cancel the current active membership (lifecycle state, record
  // preserved). Cancel-first left the member with no active membership when
  // the create failed (cancelled is terminal). Prices are re-snapshotted
  // server-side from the canonical plan; the UI never hard-codes tiers.
  const changeMembership = useMutation({
    mutationFn: async (v: { currentId: string; customerId: string; planId: string }) => {
      const created = await api.create("customer-memberships", { customer_id: v.customerId, plan_id: v.planId });
      await postMembershipAction(v.currentId, "cancel");
      return created;
    },
    onSuccess: invalidateMemberships,
  });

  /** Calculate days remaining until membership expires */
  const daysLeft = (expiresAt: string | null | undefined): number | null => {
    if (!expiresAt) return null;
    const expiry = new Date(expiresAt);
    const today = new Date();
    const diff = expiry.getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const columns: Column<any>[] = [
    { header: "Customer", cell: (c) => (
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold/10 text-sm font-semibold text-gold">
          {(c.full_name ?? "").split(" ").map((p: string) => p[0]).slice(0, 2).join("")}
        </span>
        <div>
          <div className="font-medium">{c.full_name}</div>
          {c.email && <div className="text-xs text-stone-400">{c.email}</div>}
        </div>
      </div>
    )},
    { header: "Phone", cell: (c) => <span className="text-stone-300">{c.phone ?? "—"}</span> },
    { header: "Member Code", cell: (c) => {
      const m = activeMembership(c.id);
      return <span className="font-mono text-xs text-stone-300">{m?.member_number ?? "—"}</span>;
    }},
    { header: "Package", cell: (c) => {
      const m = activeMembership(c.id);
      if (!m) return <span className="text-stone-500">—</span>;
      const plan = (plans.data ?? []).find((p: any) => p.id === m.plan_id);
      return <Badge status="success">{plan?.name ?? "Member"}</Badge>;
    }},
    { header: "Status", cell: (c) => {
      const m = activeMembership(c.id);
      if (!m) return <Badge status="secondary">Customer</Badge>;
      if (m.status === "active") return <Badge status="success">Active</Badge>;
      if (m.status === "expired") return <Badge status="warning">Expired</Badge>;
      if (m.status === "cancelled") return <Badge status="error">Cancelled</Badge>;
      return <Badge status="secondary">{m.status}</Badge>;
    }},
    { header: "Expires", cell: (c) => {
      const m = activeMembership(c.id);
      if (!m || !m.expires_at) return <span className="text-stone-500">—</span>;
      return <span className="text-xs text-stone-400">{formatDate(m.expires_at)}</span>;
    }},
    { header: "Days Left", cell: (c) => {
      const m = activeMembership(c.id);
      if (!m || !m.expires_at) return <span className="text-stone-500">—</span>;
      const days = daysLeft(m.expires_at);
      if (days === null) return <span className="text-stone-500">—</span>;
      if (days < 0) return <span className="text-rose-400">Expired</span>;
      if (days < 30) return <span className="text-amber-400">{days}d</span>;
      return <span className="text-emerald-400">{days}d</span>;
    }},
    { header: "Actions", cell: (c) => (
      <div className="flex gap-1">
        <button title="Profile" onClick={() => { setSelectedPlanId(""); setViewing(c); }} className="rounded-lg p-1.5 text-stone-400 hover:bg-panel-2 hover:text-white"><Eye className="h-4 w-4" /></button>
        <button title="Edit" onClick={() => openForm(c)} className="rounded-lg p-1.5 text-stone-400 hover:bg-panel-2 hover:text-white"><Pencil className="h-4 w-4" /></button>
      </div>
    )},
  ];

  if (customers.isLoading) return <Spinner label="Loading customers…" />;

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Search customers, view profiles and booking history."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.location.href = '/dashboard/members'}>
              <ShieldCheck className="h-4 w-4" /> Members
            </Button>
            <Button onClick={() => openForm()}>
              <Plus className="h-4 w-4" /> Add Customer
            </Button>
          </div>
        }
      />

      <DataTable
        data={customers.data ?? []}
        columns={columns}
        searchKeys={["full_name", "email", "phone"]}
        searchPlaceholder="Search by name, email or phone…"
        emptyTitle="No customers yet"
        emptyDescription="Customers will appear here when they book or when you add them."
      />

      {/* Profile */}
      <Modal open={!!viewing} onClose={() => setViewing(null)} title="Customer Profile" wide>
        {viewing && (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gold/10 text-lg font-semibold text-gold">
                {(viewing.full_name ?? "").split(" ").map((p: string) => p[0]).slice(0, 2).join("")}
              </span>
              <div>
                <p className="text-lg font-semibold text-white">{viewing.full_name}</p>
                <div className="mt-1 flex flex-wrap gap-3 text-sm text-muted">
                  {viewing.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {viewing.email}</span>}
                  {viewing.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {viewing.phone}</span>}
                </div>
              </div>
              <div className="ml-auto rounded-xl bg-panel-2 px-4 py-2 text-center">
                <p className="text-xl font-semibold text-gold">{viewing.total_visits ?? 0}</p>
                <p className="text-xs text-muted">visits</p>
                <p className="text-xs font-medium text-stone-400 mt-1">Source: {viewing.source}</p>
              </div>
            </div>
            {viewing.notes && <p className="rounded-xl bg-panel-2 px-4 py-3 text-sm text-stone-300">{viewing.notes}</p>}
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Booking History</p>
              {customerBookings(viewing.id).length === 0 ? (
                <p className="rounded-xl border border-dashed border-edge py-8 text-center text-sm text-muted">No bookings for this customer yet.</p>
              ) : (
                <div className="space-y-2">
                  {customerBookings(viewing.id).map((b: any) => {
                    const svc = (services.data ?? []).find((s: any) => s.id === b.service_id);
                    return (
                      <div key={b.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-panel-2 px-4 py-3 text-sm">
                        <span className="font-medium text-gold">{b.booking_number}</span>
                        <span className="text-stone-300">{svc?.name ?? "—"}</span>
                        <span className="text-muted">{formatDate(b.booking_date)} · {formatTime(b.start_time)}</span>
                        
                        <Badge status={b.status}>{b.status}</Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Membership</p>
              {(() => {
                const m = activeMembership(viewing.id);
                const plan = m ? (plans.data ?? []).find((p: any) => p.id === m.plan_id) : null;
                const mutationError =
                  (assignMembership.error ?? changeMembership.error ?? renewMembership.error ?? cancelMembership.error) as Error | null;
                return (
                  <div className="space-y-3">
                    {m ? (
                      <div className="rounded-xl bg-panel-2 px-4 py-3 text-sm">
                        <div className="flex flex-wrap items-center gap-3">
                          <Badge status="success">{plan?.name ?? "Member"}</Badge>
                          <span className="font-medium text-gold">{formatKES(m.annual_price_snapshot)}/year</span>
                          <Badge status={m.status === "active" ? "success" : m.status === "cancelled" ? "danger" : "warning"}>{m.status}</Badge>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
                          <span>Member №: {m.member_number}</span>
                          <span>Started: {formatDate(m.registered_at)}</span>
                          <span>Expires: {formatDate(m.expires_at)}</span>
                          <span>Registration: {formatKES(m.registration_fee_snapshot)}</span>
                        </div>
                        <div className="mt-3 flex gap-2">
                          {(m.status === "active" || m.status === "expired") && (
                            <Button variant="outline" onClick={() => renewMembership.mutate(m.id)} disabled={renewMembership.isPending}>
                              <RefreshCw className="mr-1 h-3.5 w-3.5" /> Renew
                            </Button>
                          )}
                          {(m.status === "active" || m.status === "pending") && (
                            <Button variant="outline" onClick={() => cancelMembership.mutate(m.id)} disabled={cancelMembership.isPending}>
                              <Power className="mr-1 h-3.5 w-3.5" /> Cancel Membership
                            </Button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="rounded-xl border border-dashed border-edge px-4 py-3 text-sm text-muted">No membership yet.</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={selectedPlanId}
                        onChange={(e) => setSelectedPlanId(e.target.value)}
                        className="rounded-lg border border-edge bg-panel-2 px-3 py-2 text-sm text-white"
                      >
                        <option value="">Select package…</option>
                        {(plans.data ?? []).map((p: any) => (
                          <option key={p.id} value={p.id}>
                            {p.name} — {formatKES(p.annual_price)}/year{p.is_active ? "" : " (inactive)"}
                          </option>
                        ))}
                      </select>
                      {m ? (
                        <Button
                          onClick={() => changeMembership.mutate({ currentId: m.id, customerId: viewing.id, planId: selectedPlanId })}
                          disabled={!selectedPlanId || changeMembership.isPending}
                        >
                          {changeMembership.isPending ? "Changing…" : "Change Package"}
                        </Button>
                      ) : (
                        <Button
                          onClick={() => assignMembership.mutate({ customerId: viewing.id, planId: selectedPlanId })}
                          disabled={!selectedPlanId || assignMembership.isPending}
                        >
                          {assignMembership.isPending ? "Assigning…" : "Assign Membership"}
                        </Button>
                      )}
                    </div>
                    {mutationError && <p className="text-sm text-rose-400">{mutationError.message}</p>}
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </Modal>

      {/* Form */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? "Edit Customer" : "Add Customer"}>
        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
          <Field label="Full Name" error={form.formState.errors.full_name?.message}>
            <Input placeholder="e.g. Alice Nkatha" {...form.register("full_name")} />
          </Field>
          <Field label="Email" error={form.formState.errors.email?.message}>
            <Input type="email" placeholder="customer@email.com" {...form.register("email")} />
          </Field>
          <Field label="Phone" error={form.formState.errors.phone?.message}>
            <Input placeholder="+254 7XX XXX XXX" {...form.register("phone")} />
          </Field>
          <Field label="Notes">
            <Textarea placeholder="Preferences, allergies, VIP notes…" {...form.register("notes")} />
          </Field>
          {save.isError && <p className="text-sm text-rose-400">{(save.error as Error).message}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save Customer"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
