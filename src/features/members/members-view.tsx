"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, RefreshCw, X, Plus, Search } from "lucide-react";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { PageHeader, Button, Badge, Spinner, Modal, Field, Input } from "@/components/ui";
import { DataTable, type Column } from "@/components/data-table";
import { formatDate, formatKES } from "@/lib/utils";

const newMemberSchema = z.object({
  full_name: z.string().min(2, "Name is required"),
  phone: z.string().min(7, "Phone is required"),
  email: z.string().email("Invalid email").or(z.literal("")),
});
type NewMemberForm = z.infer<typeof newMemberSchema>;

export function MembersView() {
  const qc = useQueryClient();
  const [viewing, setViewing] = useState<any | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newMemberPlanId, setNewMemberPlanId] = useState("");

  // Same explicit cap as Customers view (R-1 sibling fix): the generic API
  // defaults to a 10-row page, which truncated both the member list join and
  // the Add-Member customer search to the 10 newest customers.
  const customers = useQuery({ queryKey: queryKeys.customers.all(), queryFn: () => api.list("customers", { limit: 100, orderBy: "created_at", ascending: false }) });
  const memberships = useQuery({ queryKey: queryKeys["customer-memberships"].all(), queryFn: () => api.list("customer-memberships", { limit: 100, orderBy: "created_at", ascending: false }) });
  const plans = useQuery({ queryKey: queryKeys["membership-plans"].all(), queryFn: () => api.list("membership-plans") });

  const newMemberForm = useForm<NewMemberForm>({ resolver: zodResolver(newMemberSchema) });

  async function postMembershipAction(id: string, action: "renew" | "cancel") {
    const res = await fetch(`/api/admin/customer-memberships/${id}/${action}`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error?.message ?? body?.error ?? `HTTP ${res.status}`);
    }
    return res.json();
  }

  const invalidateMemberships = () => qc.invalidateQueries({ queryKey: queryKeys["customer-memberships"].all() });

  const createCustomerAndMembership = useMutation({
    mutationFn: async (v: { customer: NewMemberForm; planId: string }) => {
      // Transform empty email to field omission (NULL in DB) to satisfy valid_email constraint
      const customerPayload = {
        full_name: v.customer.full_name,
        phone: v.customer.phone,
        ...(v.customer.email?.trim() ? { email: v.customer.email.trim() } : {}),
      };
      const customer = await api.create("customers", customerPayload);
      return api.create("customer-memberships", { customer_id: customer.id, plan_id: v.planId });
    },
    onSuccess: () => {
      invalidateMemberships();
      qc.invalidateQueries({ queryKey: queryKeys.customers.all() });
      closeAddMemberModal();
    },
  });

  const assignMembership = useMutation({
    mutationFn: (v: { customerId: string; planId: string }) =>
      api.create("customer-memberships", { customer_id: v.customerId, plan_id: v.planId }),
    onSuccess: () => {
      invalidateMemberships();
      closeAddMemberModal();
    },
  });

  const renewMembership = useMutation({
    mutationFn: (id: string) => postMembershipAction(id, "renew"),
    onSuccess: invalidateMemberships,
  });

  const cancelMembership = useMutation({
    mutationFn: (id: string) => postMembershipAction(id, "cancel"),
    onSuccess: invalidateMemberships,
  });

  const changeMembership = useMutation({
    mutationFn: async ({ currentId, customerId, planId }: { currentId: string; customerId: string; planId: string }) => {
      // Change package (R-5 rollback-safe): create the replacement FIRST,
      // then cancel the current row. Cancel-first left the member with no
      // active membership when the create failed (cancelled is terminal).
      const created = await api.create("customer-memberships", { customer_id: customerId, plan_id: planId });
      await postMembershipAction(currentId, "cancel");
      return created;
    },
    onSuccess: invalidateMemberships,
  });

  const mutationError = renewMembership.error ?? cancelMembership.error ?? changeMembership.error ?? assignMembership.error ?? createCustomerAndMembership.error;

  function openAddMemberModal() {
    setAddMemberOpen(true);
    setSearchQuery("");
    setSelectedCustomer(null);
    setShowNewCustomerForm(false);
    setNewMemberPlanId("");
    newMemberForm.reset({ full_name: "", phone: "", email: "" });
  }

  function closeAddMemberModal() {
    setAddMemberOpen(false);
    setSearchQuery("");
    setSelectedCustomer(null);
    setShowNewCustomerForm(false);
    setNewMemberPlanId("");
    newMemberForm.reset();
  }

  function handleAddMember() {
    if (showNewCustomerForm) {
      newMemberForm.handleSubmit((v) => {
        if (!newMemberPlanId) return;
        createCustomerAndMembership.mutate({ customer: v, planId: newMemberPlanId });
      })();
    } else if (selectedCustomer) {
      if (!newMemberPlanId) return;
      assignMembership.mutate({ customerId: selectedCustomer.id, planId: newMemberPlanId });
    }
  }

  const memberCustomers = (customers.data ?? []).filter((c: any) => {
    const m = (memberships.data ?? []).find((m: any) => m.customer_id === c.id && m.status === "active");
    return !!m;
  });

  const activeMembership = (id: string) =>
    (memberships.data ?? []).find((m: any) => m.customer_id === id && m.status === "active");

  const daysLeft = (expiresAt: string | null | undefined): number | null => {
    if (!expiresAt) return null;
    const expiry = new Date(expiresAt);
    const today = new Date();
    const diff = expiry.getTime() - today.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  // Filter customers for search (non-members only to avoid duplicates)
  const searchableCustomers = (customers.data ?? []).filter((c: any) => {
    const hasActiveMembership = (memberships.data ?? []).some(
      (m: any) => m.customer_id === c.id && m.status === "active"
    );
    return !hasActiveMembership;
  });

  const filteredSearchResults = searchQuery.trim()
    ? searchableCustomers.filter((c: any) => {
        const query = searchQuery.toLowerCase();
        return (
          c.full_name?.toLowerCase().includes(query) ||
          c.phone?.toLowerCase().includes(query) ||
          c.email?.toLowerCase().includes(query)
        );
      })
    : [];

  const columns: Column<any>[] = [
    {
      header: "Customer",
      cell: (c) => (
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold/10 text-sm font-semibold text-gold">
            {(c.full_name ?? "").split(" ").map((p: string) => p[0]).slice(0, 2).join("")}
          </span>
          <div>
            <div className="font-medium">{c.full_name}</div>
            {c.email && <div className="text-xs text-stone-400">{c.email}</div>}
          </div>
        </div>
      ),
    },
    { header: "Phone", cell: (c) => <span className="text-stone-300">{c.phone ?? "-"}</span> },
    {
      header: "Member Code",
      cell: (c) => {
        const m = activeMembership(c.id);
        return <span className="font-mono text-xs text-stone-300">{m?.member_number ?? "-"}</span>;
      },
    },
    {
      header: "Package",
      cell: (c) => {
        const m = activeMembership(c.id);
        if (!m) return <span className="text-stone-500">-</span>;
        const plan = (plans.data ?? []).find((p: any) => p.id === m.plan_id);
        return <Badge status="success">{plan?.name ?? "Member"}</Badge>;
      },
    },
    {
      header: "Status",
      cell: (c) => {
        const m = activeMembership(c.id);
        if (!m) return <Badge status="secondary">Customer</Badge>;
        if (m.status === "active") return <Badge status="success">Active</Badge>;
        if (m.status === "expired") return <Badge status="warning">Expired</Badge>;
        if (m.status === "cancelled") return <Badge status="error">Cancelled</Badge>;
        return <Badge status="secondary">{m.status}</Badge>;
      },
    },
    {
      header: "Expires",
      cell: (c) => {
        const m = activeMembership(c.id);
        if (!m || !m.expires_at) return <span className="text-stone-500">-</span>;
        return <span className="text-xs text-stone-400">{formatDate(m.expires_at)}</span>;
      },
    },
    {
      header: "Days Left",
      cell: (c) => {
        const m = activeMembership(c.id);
        if (!m || !m.expires_at) return <span className="text-stone-500">-</span>;
        const days = daysLeft(m.expires_at);
        if (days === null) return <span className="text-stone-500">-</span>;
        if (days < 0) return <span className="text-rose-400">Expired</span>;
        if (days < 30) return <span className="text-amber-400">{days}d</span>;
        return <span className="text-emerald-400">{days}d</span>;
      },
    },
    {
      header: "Actions",
      cell: (c) => (
        <div className="flex gap-1">
          <button title="Manage" onClick={() => { setSelectedPlanId(""); setViewing(c); }} className="text-stone-400 hover:text-gold">
            <Eye className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ];

  const loading = customers.isLoading || memberships.isLoading || plans.isLoading;

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Members" 
        subtitle="Manage customers with active memberships" 
        actions={
          <div className="flex items-center gap-3">
            <div className="text-sm text-stone-400">{memberCustomers.length} member{memberCustomers.length !== 1 ? "s" : ""}</div>
            <Button onClick={openAddMemberModal}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add New Member
            </Button>
          </div>
        } 
      />
      {loading ? <div className="flex items-center justify-center py-12"><Spinner /></div> : <DataTable columns={columns} data={memberCustomers} />}
      <Modal open={!!viewing} onClose={() => setViewing(null)} title="Manage Membership">
        {viewing && (
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="text-sm text-muted">Customer</div>
              <div>
                <div className="font-medium text-white">{viewing.full_name}</div>
                {viewing.email && <div className="text-xs text-stone-400">{viewing.email}</div>}
                <div className="text-xs text-stone-400">{viewing.phone}</div>
              </div>
            </div>
            {(() => {
              const m = activeMembership(viewing.id);
              const plan = m ? (plans.data ?? []).find((p: any) => p.id === m.plan_id) : null;
              const days = m ? daysLeft(m.expires_at) : null;
              return (
                <div className="space-y-4">
                  {m ? (
                    <div className="space-y-3 rounded-xl border border-edge bg-panel-2 p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-xs text-muted">Member Number</div>
                          <div className="font-mono text-sm text-gold">{m.member_number}</div>
                        </div>
                        <Badge status={m.status === "active" ? "success" : m.status === "expired" ? "warning" : "error"}>{m.status}</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div><div className="text-xs text-muted">Package</div><div className="text-sm text-white">{plan?.name ?? "-"}</div></div>
                        <div><div className="text-xs text-muted">Annual Price</div><div className="text-sm text-white">{formatKES(m.annual_price_snapshot)}</div></div>
                        <div><div className="text-xs text-muted">Registered</div><div className="text-sm text-white">{formatDate(m.registered_at)}</div></div>
                        <div><div className="text-xs text-muted">Expires</div><div className="text-sm text-white">{formatDate(m.expires_at)}</div></div>
                        {days !== null && <div><div className="text-xs text-muted">Days Left</div><div className={`text-sm ${days < 0 ? "text-rose-400" : days < 30 ? "text-amber-400" : "text-emerald-400"}`}>{days < 0 ? "Expired" : `${days} days`}</div></div>}
                      </div>
                      <div className="flex flex-wrap gap-2 pt-2">
                        {m.status === "active" && (
                          <>
                            <Button variant="outline" onClick={() => renewMembership.mutate(m.id)} disabled={renewMembership.isPending}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />{renewMembership.isPending ? "Renewing..." : "Renew"}</Button>
                            <Button variant="outline" onClick={() => cancelMembership.mutate(m.id)} disabled={cancelMembership.isPending}><X className="mr-1.5 h-3.5 w-3.5" />{cancelMembership.isPending ? "Cancelling..." : "Cancel"}</Button>
                          </>
                        )}
                      </div>
                    </div>
                  ) : <p className="rounded-xl border border-dashed border-edge px-4 py-3 text-sm text-muted">No active membership.</p>}
                  <div className="space-y-3">
                    <div className="text-sm text-muted">Change Package</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select value={selectedPlanId} onChange={(e) => setSelectedPlanId(e.target.value)} className="rounded-lg border border-edge bg-panel-2 px-3 py-2 text-sm text-white">
                        <option value="">Select package...</option>
                        {(plans.data ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name} - {formatKES(p.annual_price)}/year{p.is_active ? "" : " (inactive)"}</option>)}
                      </select>
                      {m && <Button onClick={() => changeMembership.mutate({ currentId: m.id, customerId: viewing.id, planId: selectedPlanId })} disabled={!selectedPlanId || changeMembership.isPending}>{changeMembership.isPending ? "Changing..." : "Change Package"}</Button>}
                    </div>
                    {mutationError && <p className="text-sm text-rose-400">{mutationError.message}</p>}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </Modal>

      {/* Add New Member Modal - Part 1: Customer Selection */}
      <Modal open={addMemberOpen} onClose={closeAddMemberModal} title="Add New Member" wide>
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="text-sm font-medium text-white">1. Select Customer</div>
            {!showNewCustomerForm && !selectedCustomer && (
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                  <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search existing customers..." className="w-full rounded-lg border border-edge bg-panel-2 py-2 pl-10 pr-3 text-sm text-white placeholder:text-stone-500" />
                </div>
                {searchQuery.trim() && (
                  <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-edge bg-panel-2 p-2">
                    {filteredSearchResults.length === 0 ? <p className="px-3 py-2 text-sm text-stone-400">No customers found</p> : filteredSearchResults.map((c: any) => (
                      <button key={c.id} onClick={() => { setSelectedCustomer(c); setSearchQuery(""); }} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-panel-3">
                        <div className="font-medium text-white">{c.full_name}</div>
                        <div className="text-xs text-stone-400">{c.phone} {c.email && `• ${c.email}`}</div>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-3"><div className="h-px flex-1 bg-edge" /><span className="text-xs text-muted">OR</span><div className="h-px flex-1 bg-edge" /></div>
                <Button variant="outline" onClick={() => setShowNewCustomerForm(true)} className="w-full"><Plus className="mr-1.5 h-4 w-4" />Create New Customer</Button>
              </div>
            )}
            {selectedCustomer && (
              <div className="rounded-lg border border-edge bg-panel-2 p-4">
                <div className="flex items-start justify-between">
                  <div><div className="font-medium text-white">{selectedCustomer.full_name}</div><div className="text-xs text-stone-400">{selectedCustomer.phone}{selectedCustomer.email && ` • ${selectedCustomer.email}`}</div></div>
                  <button onClick={() => setSelectedCustomer(null)} className="text-stone-400 hover:text-white"><X className="h-4 w-4" /></button>
                </div>
              </div>
            )}
            {showNewCustomerForm && (
              <div className="space-y-4 rounded-lg border border-edge bg-panel-2 p-4">
                <div className="flex items-center justify-between"><div className="text-sm font-medium text-white">New Customer Details</div><button onClick={() => setShowNewCustomerForm(false)} className="text-stone-400 hover:text-white"><X className="h-4 w-4" /></button></div>
                <Field label="Full Name *" error={newMemberForm.formState.errors.full_name?.message}><Input {...newMemberForm.register("full_name")} placeholder="Enter full name" /></Field>
                <Field label="Phone *" error={newMemberForm.formState.errors.phone?.message}><Input {...newMemberForm.register("phone")} placeholder="Enter phone number" /></Field>
                <Field label="Email (Optional)" error={newMemberForm.formState.errors.email?.message}><Input {...newMemberForm.register("email")} placeholder="Enter email address" /></Field>
              </div>
            )}
          </div>
          {(selectedCustomer || showNewCustomerForm) && (
            <div className="space-y-3">
              <div className="text-sm font-medium text-white">2. Select Membership Package</div>
              <div className="grid gap-3 sm:grid-cols-2">
                {(plans.data ?? []).map((p: any) => (
                  <button key={p.id} onClick={() => setNewMemberPlanId(p.id)} className={`rounded-lg border p-4 text-left transition-colors ${newMemberPlanId === p.id ? "border-gold bg-gold/10" : "border-edge bg-panel-2 hover:border-stone-600"}`}>
                    <div className="flex items-start justify-between">
                      <div><div className="font-medium text-white">{p.name}</div><div className="mt-1 text-sm text-stone-400">{formatKES(p.annual_price)}/year</div>{!p.is_active && <div className="mt-1 text-xs text-amber-400">(Inactive)</div>}</div>
                      {newMemberPlanId === p.id && <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gold"><div className="h-2 w-2 rounded-full bg-black" /></div>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {(selectedCustomer || showNewCustomerForm) && newMemberPlanId && (
            <div className="space-y-3">
              <div className="text-sm font-medium text-white">3. Membership Summary</div>
              <div className="space-y-2 rounded-lg border border-edge bg-panel-2 p-4 text-sm">
                <div className="flex justify-between"><span className="text-stone-400">Package:</span><span className="font-medium text-white">{(plans.data ?? []).find((p: any) => p.id === newMemberPlanId)?.name}</span></div>
                <div className="flex justify-between"><span className="text-stone-400">Annual Fee:</span><span className="text-white">{formatKES((plans.data ?? []).find((p: any) => p.id === newMemberPlanId)?.annual_price ?? 0)}</span></div>
                <div className="flex justify-between"><span className="text-stone-400">Registration Fee:</span><span className="text-white">{formatKES((plans.data ?? []).find((p: any) => p.id === newMemberPlanId)?.registration_fee ?? 0)}</span></div>
                <div className="border-t border-edge pt-2"><div className="flex justify-between"><span className="font-medium text-stone-300">Total:</span><span className="font-semibold text-gold">{formatKES(((plans.data ?? []).find((p: any) => p.id === newMemberPlanId)?.annual_price ?? 0) + ((plans.data ?? []).find((p: any) => p.id === newMemberPlanId)?.registration_fee ?? 0))}</span></div></div>
              </div>
            </div>
          )}
          {mutationError && <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">{mutationError.message}</div>}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={closeAddMemberModal}>Cancel</Button>
            <Button onClick={handleAddMember} disabled={(!selectedCustomer && !showNewCustomerForm) || !newMemberPlanId || assignMembership.isPending || createCustomerAndMembership.isPending}>{assignMembership.isPending || createCustomerAndMembership.isPending ? "Adding..." : "Add Member"}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}