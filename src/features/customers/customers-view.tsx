"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Eye, Pencil, Mail, Phone } from "lucide-react";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { PageHeader, Button, Badge, Spinner, Modal, Field, Input, Textarea } from "@/components/ui";
import { DataTable, type Column } from "@/components/data-table";
import { formatDate, formatKES, formatTime } from "@/lib/utils";

const customerSchema = z.object({
  fullName: z.string().min(2, "Name is required"),
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

  const customers = useQuery({ queryKey: queryKeys.customers.all(), queryFn: () => api.list("customers") });
  const bookings = useQuery({ queryKey: queryKeys.bookings.all(), queryFn: () => api.list("bookings") });
  const services = useQuery({ queryKey: queryKeys.services.all(), queryFn: () => api.list("services") });

  const form = useForm<CustomerForm>({ resolver: zodResolver(customerSchema) });

  const save = useMutation({
    mutationFn: (v: CustomerForm) =>
      editing ? api.update("customers", editing.id, v) : api.create("customers", v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.customers.all() });
      setFormOpen(false);
      setEditing(null);
    },
  });

  function openForm(c?: any) {
    setEditing(c ?? null);
    form.reset(c ? { fullName: c.fullName, email: c.email ?? "", phone: c.phone ?? "", notes: c.notes ?? "" } : { fullName: "", email: "", phone: "", notes: "" });
    setFormOpen(true);
  }

  const customerBookings = (id: number) =>
    (bookings.data ?? []).filter((b: any) => b.customerId === id);

  const columns: Column<any>[] = [
    { header: "Customer", cell: (c) => (
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold/10 text-sm font-semibold text-gold">
          {c.fullName.split(" ").map((p: string) => p[0]).slice(0, 2).join("")}
        </span>
        <span className="font-medium">{c.fullName}</span>
      </div>
    )},
    { header: "Email", cell: (c) => <span className="text-stone-300">{c.email ?? "—"}</span> },
    { header: "Phone", cell: (c) => <span className="text-stone-300">{c.phone ?? "—"}</span> },
    { header: "Visits", cell: (c) => <span className="text-gold">{c.totalVisits}</span> },
    { header: "Bookings", cell: (c) => customerBookings(c.id).length },
    { header: "Joined", cell: (c) => <span className="text-stone-400">{formatDate(c.createdAt)}</span> },
    { header: "Actions", cell: (c) => (
      <div className="flex gap-1">
        <button title="Profile" onClick={() => setViewing(c)} className="rounded-lg p-1.5 text-stone-400 hover:bg-panel-2 hover:text-white"><Eye className="h-4 w-4" /></button>
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
        actions={<Button onClick={() => openForm()}><Plus className="h-4 w-4" /> Add Customer</Button>}
      />

      <DataTable
        data={customers.data ?? []}
        columns={columns}
        searchKeys={["fullName", "email", "phone"]}
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
                {viewing.fullName.split(" ").map((p: string) => p[0]).slice(0, 2).join("")}
              </span>
              <div>
                <p className="text-lg font-semibold text-white">{viewing.fullName}</p>
                <div className="mt-1 flex flex-wrap gap-3 text-sm text-muted">
                  {viewing.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {viewing.email}</span>}
                  {viewing.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {viewing.phone}</span>}
                </div>
              </div>
              <div className="ml-auto rounded-xl bg-panel-2 px-4 py-2 text-center">
                <p className="text-xl font-semibold text-gold">{viewing.totalVisits}</p>
                <p className="text-xs text-muted">visits</p>
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
                    const svc = (services.data ?? []).find((s: any) => s.id === b.serviceId);
                    return (
                      <div key={b.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-panel-2 px-4 py-3 text-sm">
                        <span className="font-medium text-gold">{b.bookingNumber}</span>
                        <span className="text-stone-300">{svc?.name ?? "—"}</span>
                        <span className="text-muted">{formatDate(b.bookingDate)} · {formatTime(b.bookingTime)}</span>
                        <span className="ml-auto">{formatKES(b.totalAmount)}</span>
                        <Badge status={b.status}>{b.status}</Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Form */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? "Edit Customer" : "Add Customer"}>
        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
          <Field label="Full Name" error={form.formState.errors.fullName?.message}>
            <Input placeholder="e.g. Alice Nkatha" {...form.register("fullName")} />
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
