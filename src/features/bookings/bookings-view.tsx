"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CalendarDays,
  Table2,
  Plus,
  Eye,
  Pencil,
  Check,
  X,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { api } from "@/lib/api";
import { bookingValidationSchema, type BookingValidation } from "@/lib/booking-validation";
import {
  PageHeader,
  Card,
  Button,
  Badge,
  Spinner,
  Modal,
  Field,
  Input,
  Select,
  EmptyState,
  Toaster,
} from "@/components/ui";
import { DataTable, type Column } from "@/components/data-table";
import { cn, formatDate, formatTime, timeAgo } from "@/lib/utils";
import { queryKeys } from "@/lib/query-keys";

type BookingForm = BookingValidation;

/** Render a booking's resolved phone (customer OR guest snapshot) safely.
 *  Server enrichment falls back to an em-dash when neither exists; treat any
 *  phone-less/digit-free sentinel (em-dash, mojibake variant, undefined,
 *  null, N/A) as "no phone" so the UI never shows garbage. */
function safePhone(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  if (!v || !/[0-9+]/.test(v)) return "—";
  return v;
}

export function BookingsView() {
  const qc = useQueryClient();
  const [view, setView] = useState<"table" | "calendar">("table");
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [editing, setEditing] = useState<any | null>(null);
  const [viewing, setViewing] = useState<any | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toasts, setToasts] = useState<Array<{ id: number; title: string; description?: string; status?: "success" | "error" }>>([]);

  const addToast = (toast: Omit<typeof toasts[number], "id">) => {
    const id = Date.now() + Math.random(); // eslint-disable-line react-hooks/purity
    setToasts((prev) => [...prev, { id, ...toast }]);
    setTimeout(() => dismissToast(id), 5000);
  };

  const dismissToast = (id: number) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));

  const bookings = useQuery({ 
    queryKey: queryKeys.bookings.all(), 
    queryFn: () => api.list("bookings", { orderBy: "created_at", ascending: "false" }),
    refetchOnWindowFocus: "always", // Override global default to ensure real-time updates
  });
  const customers = useQuery({ queryKey: queryKeys.customers.all(), queryFn: () => api.list("customers") });
  const categories = useQuery({
    queryKey: ["service-categories"],
    // Load all categories so historical bookings still resolve if a category
    // is later deactivated. The create/edit selector filters active categories.
    queryFn: () => api.list("service-categories", {
      orderBy: "display_order",
      ascending: "true",
    }),
  });
  const notes = useQuery({
    queryKey: queryKeys["booking-notes"].all(viewing?.id),
    queryFn: () => api.list("booking-notes"),
    enabled: !!viewing,
  });
  const history = useQuery({
    queryKey: queryKeys["booking-history"].all(viewing?.id),
    queryFn: () => api.list("booking-history"),
    enabled: !!viewing,
  });

  const byId = (list: any[] | undefined, id: string | null) =>
    (list ?? []).find((x) => String(x.id) === String(id));

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.setBookingStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.bookings.all() });
      qc.invalidateQueries({ queryKey: queryKeys.customers.all() });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.stats() });
      addToast({ title: "Booking updated", status: "success" });
    },
    onError: (err: any) => {
      addToast({
        title: "Action failed",
        description: err?.message || "Could not update booking status.",
        status: "error",
      });
    },
  });

  const setConfirm = useMutation({
    mutationFn: ({ id }: { id: number }) => api.confirmBooking(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.bookings.all() });
      qc.invalidateQueries({ queryKey: queryKeys.customers.all() });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.stats() });
      addToast({ title: "Booking confirmed", status: "success" });
    },
    onError: (err: any) => {
      addToast({
        title: "Action failed",
        description: err?.message || "Could not confirm booking.",
        status: "error",
      });
    },
  });

  const save = useMutation({
    mutationFn: (values: BookingForm) => {
      const normalizeOptionalUuid = (value?: string | null) => {
        if (!value || value === "") return null;
        return value;
      };

      // Provide sensible defaults for optional fields that the DB requires
      const today = new Date().toISOString().split("T")[0];

      const payload: any = {
        booking_number: `ZT-${1000 + Date.now() % 100000}`,
        status: values.status || "pending",
        customer_id: normalizeOptionalUuid(values.customerId ?? editing?.customerId),
        service_category_id: values.serviceCategoryId,
        booking_date: values.bookingDate || today,
        start_time: values.startTime || "09:00",
        end_time: values.endTime || "10:00",
        guests: values.guests || 1,
      };

      // Required guest contact fields
      if (values.guest_name && values.guest_name.trim()) payload.guest_name = values.guest_name.trim();
      if (values.guest_phone && values.guest_phone.trim()) payload.guest_phone = values.guest_phone.trim();
      if (values.guest_email && values.guest_email.trim()) payload.guest_email = values.guest_email.trim();

      return editing
        ? api.update("bookings", editing.id, { ...values, ...payload })
        : api.create("bookings", { ...values, ...payload });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.bookings.all() });
      qc.invalidateQueries({ queryKey: queryKeys.dashboard.stats() });
      closeForm();
    },
  });

  const form = useForm<BookingForm>({
    resolver: zodResolver(bookingValidationSchema) as any,
    defaultValues: { status: "pending", guests: 2, customerId: "", serviceCategoryId: "", bookingDate: "", startTime: "", endTime: "", guest_name: "", guest_email: "", guest_phone: "" } as any,
  });

  function openForm(booking?: any) {
    setEditing(booking ?? null);
    form.reset(
      booking
        ? {
            customerId: booking.customerId ?? "",
            serviceCategoryId: booking.serviceCategoryId ?? "",
            bookingDate: booking.bookingDate,
            startTime: booking.startTime?.slice(0, 5) || "",
            endTime: booking.endTime?.slice(0, 5) || "",
            guests: booking.guests,
            status: booking.status,
            guest_name: booking.guestName || "",
            guest_email: booking.guestEmail || "",
            guest_phone: booking.guestPhone || "",
          }
        : { 
            customerId: "", 
            serviceCategoryId: "", 
            bookingDate: "", 
            startTime: "", 
            endTime: "", 
            guests: 2, 
            status: "pending",
            guest_name: "",
            guest_email: "",
            guest_phone: ""
          }
    );
    setFormOpen(true);
  }
  function closeForm() {
    setFormOpen(false);
    setEditing(null);
  }

  const rows = useMemo(
    () =>
      (bookings.data ?? []).map((b: any) => ({
        ...b,
        // Customer identity comes from server (enriched with COALESCE logic)
        // customerName, customerPhone, customerEmail are already populated
        categoryName: byId(categories.data, b.serviceCategoryId)?.name ?? "Unassigned",
      })),
    [bookings.data, categories.data]
  );

  const columns: Column<any>[] = [
    { header: "Booking #", cell: (b) => <span className="font-medium text-gold">{b.bookingNumber}</span> },
    { header: "Customer", cell: (b) => (
      <div className="flex flex-col">
        <span className="font-medium">{b.customerName}</span>
        <span className="text-xs text-stone-400">{b.customerEmail || "—"}</span>
      </div>
    )},
    { header: "Phone", cell: (b) => <span className="text-stone-300">{safePhone(b.customerPhone)}</span> },
    { header: "Service category", cell: (b) => <span className="text-stone-300">{b.categoryName}</span> },
    { header: "Date", cell: (b) => formatDate(b.bookingDate) },
    { header: "Time", cell: (b) => `${formatTime(b.startTime)} - ${formatTime(b.endTime)}` },
    { header: "Status", cell: (b) => <Badge status={b.status}>{b.status}</Badge> },
    {
      header: "Submitted",
      cell: (b) => (
        <div className="flex flex-col" title="Submission timestamp (created_at)">
          <span className="text-stone-300">{b.createdAt ? formatDate(b.createdAt) : "—"}</span>
          <span className="text-xs text-stone-500">{b.createdAt ? timeAgo(b.createdAt) : ""}</span>
        </div>
      ),
    },
    {
      header: "Actions",
      cell: (b) => (
        <div className="flex items-center gap-1">
          <button title="View" aria-label={`View booking ${b.bookingNumber}`} onClick={() => setViewing(b)} className="rounded-lg p-1.5 text-stone-400 hover:bg-panel-2 hover:text-white"><Eye className="h-4 w-4" /></button>
          <button title="Edit" aria-label={`Edit booking ${b.bookingNumber}`} onClick={() => openForm(b)} className="rounded-lg p-1.5 text-stone-400 hover:bg-panel-2 hover:text-white"><Pencil className="h-4 w-4" /></button>
          {b.status === "pending" && (
            <button title="Confirm" aria-label={`Confirm booking ${b.bookingNumber}`} disabled={setConfirm.isPending} onClick={() => setConfirm.mutate({ id: b.id })} className="rounded-lg p-1.5 text-sky-400 hover:bg-sky-500/10 disabled:opacity-50"><Check className="h-4 w-4" /></button>
          )}
          {b.status === "confirmed" && (
            <button title="Complete" aria-label={`Mark booking ${b.bookingNumber} as completed`} disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: b.id, status: "completed" })} className="rounded-lg p-1.5 text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50"><CheckCheck className="h-4 w-4" /></button>
          )}
          {(b.status === "pending" || b.status === "confirmed") && (
            <button title="Cancel" aria-label={`Cancel booking ${b.bookingNumber}`} disabled={setStatus.isPending} onClick={() => setStatus.mutate({ id: b.id, status: "cancelled" })} className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-500/10 disabled:opacity-50"><X className="h-4 w-4" /></button>
          )}
        </div>
      ),
    },
  ];

  // Calendar grid
  const calendarCells = useMemo(() => {
    const first = new Date(month);
    const startDow = (first.getDay() + 6) % 7; // Monday first
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells: Array<{ date: string; day: number } | null> = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      cells.push({ date, day: d });
    }
    return cells;
  }, [month]);

  const bookingsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    rows.forEach((b: any) => {
      (map[b.bookingDate] ??= []).push(b);
    });
    return map;
  }, [rows]);

  if (bookings.isLoading) return <Spinner label="Loading bookings…" />;

  return (
    <div>
      <PageHeader
        title="Bookings"
        subtitle="Manage reservations, confirmations and the booking calendar."
        actions={
          <>
            <div className="flex rounded-xl border border-edge bg-panel p-1">
              <button onClick={() => setView("table")} className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm", view === "table" ? "bg-gold/15 text-gold" : "text-muted hover:text-white")}><Table2 className="h-4 w-4" /> Table</button>
              <button onClick={() => setView("calendar")} className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm", view === "calendar" ? "bg-gold/15 text-gold" : "text-muted hover:text-white")}><CalendarDays className="h-4 w-4" /> Calendar</button>
            </div>
            <Button onClick={() => openForm()}><Plus className="h-4 w-4" /> New Booking</Button>
          </>
        }
      />

      {view === "table" ? (
        <DataTable
          data={rows}
          columns={columns}
          searchKeys={["bookingNumber", "customerName", "categoryName", "status"]}
          searchPlaceholder="Search bookings…"
          emptyTitle="No bookings yet"
          emptyDescription="Create your first booking to see it here."
        />
      ) : (
        <Card className="p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-white">
              {month.toLocaleDateString("en-KE", { month: "long", year: "numeric" })}
            </h3>
            <div className="flex gap-1">
              <button aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded-lg border border-edge p-1.5 text-stone-300 hover:text-gold"><ChevronLeft className="h-4 w-4" /></button>
              <button aria-label="Today" onClick={() => setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} className="rounded-lg border border-edge px-2 py-1 text-xs font-medium text-stone-300 hover:text-gold">Today</button>
              <button aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded-lg border border-edge p-1.5 text-stone-300 hover:text-gold"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium uppercase tracking-wider text-muted">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-2">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarCells.map((cell, i) =>
              cell ? (
                <div key={cell.date} className="min-h-20 rounded-xl border border-edge/60 bg-panel-2/40 p-1.5">
                  <p className="mb-1 text-xs text-muted">{cell.day}</p>
                  <div className="space-y-1">
                    {(bookingsByDate[cell.date] ?? []).slice(0, 3).map((b: any) => (
                      <button key={b.id} onClick={() => setViewing(b)} className={cn("block w-full truncate rounded-md px-1.5 py-0.5 text-left text-[10px]", b.status === "cancelled" ? "bg-rose-500/10 text-rose-400 line-through" : b.status === "completed" ? "bg-emerald-500/10 text-emerald-400" : "bg-gold/10 text-gold")}>
                        {formatTime(b.startTime)} · {b.customerName}
                      </button>
                    ))}
                    {(bookingsByDate[cell.date] ?? []).length > 3 && (
                      <p className="px-1 text-[10px] text-muted">+{bookingsByDate[cell.date].length - 3} more</p>
                    )}
                  </div>
                </div>
              ) : (
                <div key={`empty-${i}`} />
              )
            )}
          </div>
        </Card>
      )}

      {/* View booking */}
      <Modal open={!!viewing} onClose={() => setViewing(null)} title={`Booking ${viewing?.bookingNumber ?? ""}`}>
        {viewing && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-panel-2 p-3"><p className="text-xs text-muted">Customer</p><p className="mt-1 font-medium">{viewing.customerName}</p></div>
              <div className="rounded-xl bg-panel-2 p-3"><p className="text-xs text-muted">Service category</p><p className="mt-1 font-medium">{viewing.categoryName ?? "Unassigned"}</p></div>
              <div className="rounded-xl bg-panel-2 p-3"><p className="text-xs text-muted">Date & Time</p><p className="mt-1 font-medium">{formatDate(viewing.bookingDate)}</p><p className="mt-1 text-sm text-muted">{formatTime(viewing.startTime)} - {formatTime(viewing.endTime)}</p></div>
              <div className="rounded-xl bg-panel-2 p-3"><p className="text-xs text-muted">Guests</p><p className="mt-1 font-medium">{viewing.guests} {viewing.guests === 1 ? 'guest' : 'guests'}</p></div>
              <div className="rounded-xl bg-panel-2 p-3"><p className="text-xs text-muted">Phone</p><p className="mt-1 font-medium">{safePhone(viewing.customerPhone)}</p></div>
              <div className="rounded-xl bg-panel-2 p-3"><p className="text-xs text-muted">Email</p><p className="mt-1 font-medium">{viewing.customerEmail || "—"}</p></div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted">Status:</span> <Badge status={viewing.status}>{viewing.status}</Badge>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Visitor Message</p>
              {viewing.specialRequests ? (
                <p className="whitespace-pre-wrap break-words rounded-lg border border-gold/30 bg-panel-2 px-3 py-2 text-stone-100">{viewing.specialRequests}</p>
              ) : (
                <p className="text-xs text-muted">No message provided by the visitor.</p>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Notes</p>
              {(notes.data ?? []).filter((n: any) => n.bookingId === viewing.id).length === 0 ? (
                <p className="text-xs text-muted">No notes for this booking.</p>
              ) : (
                (notes.data ?? []).filter((n: any) => n.bookingId === viewing.id).map((n: any) => (
                  <p key={n.id} className="mb-1 rounded-lg bg-panel-2 px-3 py-2 text-stone-300">{n.note}</p>
                ))
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Status History</p>
              {(history.data ?? []).filter((h: any) => h.bookingId === viewing.id).length === 0 ? (
                <p className="text-xs text-muted">No status changes recorded.</p>
              ) : (
                (history.data ?? []).filter((h: any) => h.bookingId === viewing.id).map((h: any) => (
                  <p key={h.id} className="mb-1 text-xs text-stone-300">
                    {h.fromStatus ?? "new"} → <span className="text-gold">{h.toStatus}</span>
                    <span className="text-muted"> · {h.changedBy} · {timeAgo(h.createdAt)}</span>
                  </p>
                ))
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Create / edit booking */}
      <Modal open={formOpen} onClose={closeForm} title={editing ? `Edit ${editing.bookingNumber}` : "New Booking"}>
        {(customers.data ?? []).length === 0 ? (
          <EmptyState title="No customers available" description="Add a customer first from the Customers page." />
        ) : (
          <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
            {/* Required fields - shown first to communicate priority */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Customer Name *" error={form.formState.errors.guest_name?.message}>
                <Input {...form.register("guest_name")} placeholder="e.g. Alice Nkatha" />
              </Field>
              <Field label="Customer Phone *" error={form.formState.errors.guest_phone?.message}>
                <Input {...form.register("guest_phone")} placeholder="+254 7XX XXX XXX" />
              </Field>
            </div>
            {/* Optional additional booking information */}
            <Field label="Existing Customer" error={form.formState.errors.customerId?.message}>
              <Select {...form.register("customerId")}>
                <option value={0}>Select customer…</option>
                {(customers.data ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.fullName}</option>)}
              </Select>
              <p className="text-xs text-muted mt-1">
                Optionally link to an existing customer. Name and phone above are required either way.
              </p>
            </Field>
            <Field label="Service category *" error={form.formState.errors.serviceCategoryId?.message}>
              <Select {...form.register("serviceCategoryId")}>
                <option value="">Select service category…</option>
                {(categories.data ?? []).filter((category: any) => category.is_active).map((category: any) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Date" error={form.formState.errors.bookingDate?.message}>
              <Input type="date" {...form.register("bookingDate")} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start Time" error={form.formState.errors.startTime?.message}>
                <Input type="time" {...form.register("startTime")} />
              </Field>
              <Field label="End Time" error={form.formState.errors.endTime?.message}>
                <Input type="time" {...form.register("endTime")} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Guests" error={form.formState.errors.guests?.message}>
                <Input type="number" min={1} max={50} {...form.register("guests")} />
              </Field>
              <Field label="Guest Email" error={form.formState.errors.guest_email?.message}>
                <Input type="email" {...form.register("guest_email")} placeholder="customer@email.com" />
              </Field>
              {editing && (
                <Field label="Status">
                  <Select {...form.register("status")}>
                    {["pending", "confirmed", "completed", "cancelled", "no_show"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </Field>
              )}
            </div>
            {save.isError && <p className="text-sm text-rose-400">{(save.error as Error).message}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={closeForm}>Cancel</Button>
              <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : editing ? "Save Changes" : "Create Booking"}</Button>
            </div>
          </form>
        )}
      </Modal>
      <Toaster toasts={toasts} />
    </div>
  );
}
