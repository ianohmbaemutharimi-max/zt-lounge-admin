"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  CalendarCheck,
  Users,
  Sparkles,
  UserRound,
  Inbox,
  Activity,
  Bell,
  Image,
  ArrowRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { Card, PageHeader, Spinner, EmptyState, Badge, MetricCard } from "@/components/ui";
import { formatKES, formatDate, formatTime, timeAgo } from "@/lib/utils";

const tooltipStyle = {
  backgroundColor: "#171717",
  border: "1px solid #2a2a2a",
  borderRadius: "12px",
  color: "#f5f5f4",
  fontSize: "12px",
};

interface RecentBooking {
  id: string;
  bookingNumber: string;
  customerName: string;
  serviceName: string;
  bookingDate: string;
  bookingTime: string;
  status: string;
}

interface ActivityItem {
  id: string;
  actor: string;
  action: string;
  details?: string;
  createdAt: string;
}

interface NotificationItem {
  id: string;
  title: string;
  body?: string;
  isRead: boolean;
  createdAt: string;
}

function MediaLibraryCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["media", "summary"],
    queryFn: async () => {
      const res = await fetch("/api/media?summary=true");
      if (!res.ok) throw new Error("Failed to fetch media summary");
      return res.json();
    },
  });

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image className="h-5 w-5 text-gold" />
            <h3 className="text-sm font-semibold text-white">Media Library</h3>
          </div>
          <p className="text-xs text-muted mb-4">
            Manage images and media used across your CMS
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center">
            <div className="h-8 w-16 bg-panel-2 animate-pulse rounded mx-auto mb-1" />
            <p className="text-xs text-muted">Assets</p>
          </div>
          <div className="text-center">
            <div className="h-8 w-16 bg-panel-2 animate-pulse rounded mx-auto mb-1" />
            <p className="text-xs text-muted">Usage</p>
          </div>
          <div className="text-center">
            <div className="h-8 w-16 bg-panel-2 animate-pulse rounded mx-auto mb-1" />
            <p className="text-xs text-muted">Buckets</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-gold">{data?.totalAssets ?? 0}</p>
            <p className="text-xs text-muted">Assets</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gold">{data?.totalUsage ?? 0}</p>
            <p className="text-xs text-muted">Usage</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gold">{data?.uniqueBuckets ?? 0}</p>
            <p className="text-xs text-muted">Buckets</p>
          </div>
        </div>
      )}

      <Link
        href="/dashboard/media"
        className="flex items-center justify-center gap-2 rounded-xl bg-gold/10 px-4 py-2.5 text-sm font-medium text-gold transition-colors hover:bg-gold/20"
      >
        Open Media Library
        <ArrowRight className="h-4 w-4" />
      </Link>
    </Card>
  );
}

export function DashboardOverview() {
  const { data, isLoading, isError } = useQuery({ queryKey: queryKeys.stats.all(), queryFn: () => api.stats() });

  if (isLoading) return <Spinner label="Loading today's overview…" />;
  if (isError || !data)
    return <EmptyState title="Could not load dashboard" description="Please refresh the page to try again." />;

  const c = data.cards ?? {};

  return (
    <div className="space-y-6">
      <PageHeader
        title="Today's Overview"
        subtitle="Everything happening at ZT Lounge Meru, at a glance."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard title="Today's Bookings" value={c.todays_bookings ?? 0} icon={CalendarCheck} hint={`${c.pending_bookings ?? 0} pending overall`} />
        <MetricCard title="Total Customers" value={c.total_customers ?? 0} icon={Users} />
        <MetricCard title="Active Services" value={c.active_services ?? 0} icon={Sparkles} />
        <MetricCard title="Staff Members" value={c.staff_members ?? 0} icon={UserRound} />
        <MetricCard title="Pending Messages" value={c.pending_messages ?? 0} icon={Inbox} />
      </div>

      <MediaLibraryCard />

      <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-white">Booking Trends <span className="ml-1 text-xs font-normal text-muted">last 14 days</span></h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.trends ?? []}>
                <CartesianGrid stroke="#242424" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" stroke="#6b6b6b" fontSize={10} tickLine={false} axisLine={false} interval={2} />
                <YAxis stroke="#6b6b6b" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(212,175,55,0.06)" }} />
                <Bar dataKey="bookings" fill="#D4AF37" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-edge px-5 py-4">
          <h3 className="text-sm font-semibold text-white">Recent Bookings</h3>
        </div>
        {(data.recentBookings ?? []).length === 0 ? (
          <EmptyState title="No bookings yet" description="New reservations will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Recent bookings at ZT Lounge</caption>
              <thead>
                <tr className="border-b border-edge bg-panel-2/60 text-xs uppercase tracking-wider text-muted">
                  <th className="px-5 py-3">Booking</th>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Service</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Time</th>
                  
                  <th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge/60">
                {(data.recentBookings ?? []).map((b: RecentBooking) => (
                  <tr key={b.id} className="hover:bg-panel-2/40">
                    <td className="whitespace-nowrap px-5 py-3 font-medium text-gold">{b.bookingNumber}</td>
                    <td className="whitespace-nowrap px-5 py-3">{b.customerName ?? "—"}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-stone-300">{b.serviceName ?? "—"}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-stone-300">{formatDate(b.bookingDate)}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-stone-300">{formatTime(b.bookingTime)}</td>
                    
                    <td className="whitespace-nowrap px-5 py-3"><Badge status={b.status}>{b.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
            <Activity className="h-4 w-4 text-gold" /> Recent Admin Activity
          </h3>
          {(data.activity ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">No activity recorded yet.</p>
          ) : (
            <ul className="space-y-3">
              {(data.activity ?? []).map((a: ActivityItem) => (
                <li key={a.id} className="flex items-start gap-3 rounded-xl bg-panel-2/50 px-3 py-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                  <div className="min-w-0">
                    <p className="text-sm text-stone-200">
                      <span className="font-medium text-white">{a.actor}</span> {a.action}
                    </p>
                    {a.details && <p className="truncate text-xs text-muted">{a.details}</p>}
                  </div>
                  <span className="ml-auto shrink-0 text-xs text-muted">{timeAgo(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
            <Bell className="h-4 w-4 text-gold" /> Notifications
          </h3>
          {(data.notifications ?? []).length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">You&#39;re all caught up.</p>
          ) : (
            <ul className="space-y-3">
              {(data.notifications ?? []).map((n: NotificationItem) => (
                <li key={n.id} className="flex items-start gap-3 rounded-xl bg-panel-2/50 px-3 py-2.5">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${n.isRead ? "bg-edge" : "bg-gold"}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-200">{n.title}</p>
                    {n.body && <p className="truncate text-xs text-muted">{n.body}</p>}
                  </div>
                  <span className="ml-auto shrink-0 text-xs text-muted">{timeAgo(n.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
