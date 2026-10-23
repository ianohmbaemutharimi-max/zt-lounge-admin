"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Mail, MailOpen, Trash2, Phone } from "lucide-react";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { PageHeader, Card, Spinner, EmptyState, Badge, Modal, Button } from "@/components/ui";
import { cn, timeAgo } from "@/lib/utils";

/**
 * CONTACT INBOX — the canonical operational home for contact notifications.
 *
 * Backed by the `contact_messages` table. The unread/awaiting-reply concept is
 * derived from the existing status lifecycle:
 *   status === 'new'      → awaiting reply (unread)
 *   status === 'read'     → seen, awaiting reply
 *   status === 'replied'  → resolved
 *
 * READ ≠ RESOLVED: opening a message marks its linked notification read but
 * does NOT change the message status (so it stays in the pending count).
 * Resolution happens via the explicit "Mark as Replied" action.
 *
 * Supports the canonical bell navigation: /dashboard/messages?message=<id>
 */
export function MessagesView() {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const [viewing, setViewing] = useState<any | null>(null);

  const messages = useQuery({ queryKey: queryKeys.messages.all(), queryFn: () => api.list("contact-messages") });

  // Canonical pending count: total messages awaiting a reply (status new OR read).
  // Drives the header badge and is the same source the sidebar badge uses.
  const pending = useQuery({
    queryKey: queryKeys.messages.pending(),
    queryFn: () => api.pendingContactCount(),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.remove("contact-messages", id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.messages.all() }); qc.invalidateQueries({ queryKey: queryKeys.messages.pending() }); setViewing(null); },
  });

  function openMessage(m: any) {
    setViewing(m);
    // READ ≠ RESOLVED: mark the linked notification read (seen), but leave
    // the message status untouched so it still counts as awaiting a reply.
    api.markContactNotificationRead(m.id).catch(() => {});
  }

  // Deep-link from the notification bell: /dashboard/messages?message=<id>
  // Open/focus the exact message once the Inbox data has loaded.
  useEffect(() => {
    const targetId = searchParams.get("message");
    if (!targetId || viewing) return;
    const list = messages.data ?? [];
    const found = list.find((m: any) => String(m.id) === targetId);
    if (found) {
      openMessage(found);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.data, searchParams]);

  function resolveMessage(m: any) {
    if (!confirm("Mark this message as replied/resolved?")) return;
    api.replyContactMessage(m.id).then(() => {
      qc.invalidateQueries({ queryKey: queryKeys.messages.all() });
      qc.invalidateQueries({ queryKey: queryKeys.messages.pending() });
      qc.invalidateQueries({ queryKey: queryKeys.notifications.unread() });
      setViewing(null);
    });
  }

  if (messages.isLoading) return <Spinner label="Loading messages…" />;

  const list = messages.data ?? [];
  // "Awaiting reply" = status new (unread) OR read (seen but unanswered).
  const pendingCount = pending.data ?? 0;
  const unreadCount = list.filter((m: any) => m.status === "new").length;

  return (
    <div>
      <PageHeader
        title="Contact Inbox"
        subtitle="Contact form submissions from the website."
        actions={
          <Badge status="pending">
            {pendingCount > 0 ? `${pendingCount} pending` : `${unreadCount} unread`}
          </Badge>
        }
      />

      {list.length === 0 ? (
        <EmptyState title="Inbox is empty" description="Messages from the website contact form will appear here." />
      ) : (
        <div className="space-y-3">
                    {list.map((m: any) => {
            const status = m.status;
            const isNew = status === "new";          // unread, awaiting reply
            const isPending = status === "read";      // seen, still awaiting reply
            const isResolved = status === "replied";  // handled
            return (
            <Card
              key={m.id}
              className={cn(
                "flex cursor-pointer items-center gap-4 p-4 transition-colors hover:border-gold/40",
                isNew && "border-gold/30 bg-gold/[0.03]",
                isPending && "border-edge",
                isResolved && "opacity-65"
              )}
            >
              <button onClick={() => openMessage(m)} className="flex flex-1 items-center gap-4 text-left">
                <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", isNew ? "bg-gold/15 text-gold" : "bg-panel-2 text-muted")}>
                  {isNew ? <Mail className="h-5 w-5" /> : <MailOpen className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className={cn("truncate text-sm", isNew ? "font-semibold text-white" : "text-stone-300")}>{m.fullName ?? m.name ?? "—"}</p>
                    {isNew && <Badge status="pending">● NEW</Badge>}
                    {isPending && <Badge status="active">pending reply</Badge>}
                    {isResolved && <Badge status="completed">resolved</Badge>}
                  </div>
                  <p className="truncate text-sm text-stone-400">{m.subject ?? "Website contact form"} — {m.message}</p>
                  <p className="mt-0.5 text-xs text-muted">status: {status}</p>
                </div>
                <span className="shrink-0 text-xs text-muted">{timeAgo(m.createdAt)}</span>
              </button>
              <button title="Delete" onClick={() => { if (confirm("Delete this message?")) remove.mutate(m.id); }} className="shrink-0 rounded-lg p-2 text-rose-400 hover:bg-rose-500/10">
                <Trash2 className="h-4 w-4" />
              </button>
            </Card>
            );
          })}
        </div>
      )}

      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.subject ?? "Message"}>
        {viewing && (
          <div className="space-y-4 text-sm">
            <div className="rounded-xl bg-panel-2 p-4">
              <p className="font-semibold text-white">{viewing.fullName ?? viewing.name}</p>
              <div className="mt-1 flex flex-wrap gap-3 text-muted">
                {viewing.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {viewing.email}</span>}
                {viewing.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {viewing.phone}</span>}
              </div>
            </div>
                        <p className="whitespace-pre-wrap leading-relaxed text-stone-200">{viewing.message}</p>
            <div className="flex justify-end gap-2 border-t border-edge pt-4">
              <Button variant="danger" onClick={() => { if (confirm("Delete this message?")) remove.mutate(viewing.id); }}>
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
              {viewing.email && (
                <a href={`mailto:${viewing.email}?subject=Re: ${viewing.subject ?? ""}`}>
                  <Button>Reply via Email</Button>
                </a>
              )}
              {viewing.status !== "replied" && (
                <Button variant="outline" onClick={() => resolveMessage(viewing)}>
                  Mark as Replied
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
