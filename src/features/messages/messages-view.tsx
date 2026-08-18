"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, MailOpen, Trash2, Phone } from "lucide-react";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { PageHeader, Card, Spinner, EmptyState, Badge, Modal, Button } from "@/components/ui";
import { cn, timeAgo } from "@/lib/utils";

export function MessagesView() {
  const qc = useQueryClient();
  const [viewing, setViewing] = useState<any | null>(null);

  const messages = useQuery({ queryKey: queryKeys.messages.all(), queryFn: () => api.list("contact-messages") });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: any }) => api.update("contact-messages", id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.messages.all() });
      qc.invalidateQueries({ queryKey: queryKeys.stats.all() });
    },
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.remove("contact-messages", id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.messages.all() }); setViewing(null); },
  });

  function openMessage(m: any) {
    setViewing(m);
    if (!m.isRead) patch.mutate({ id: m.id, body: { isRead: true } });
  }

  if (messages.isLoading) return <Spinner label="Loading messages…" />;

  const list = messages.data ?? [];
  const unread = list.filter((m: any) => !m.isRead).length;

  return (
    <div>
      <PageHeader title="Messages" subtitle={`Contact form submissions from the website. ${unread} unread.`} />

      {list.length === 0 ? (
        <EmptyState title="Inbox is empty" description="Messages from the website contact form will appear here." />
      ) : (
        <div className="space-y-3">
          {list.map((m: any) => (
            <Card
              key={m.id}
              className={cn("flex cursor-pointer items-center gap-4 p-4 transition-colors hover:border-gold/40", !m.isRead && "border-gold/30 bg-gold/[0.03]")}
            >
              <button onClick={() => openMessage(m)} className="flex flex-1 items-center gap-4 text-left">
                <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", m.isRead ? "bg-panel-2 text-muted" : "bg-gold/15 text-gold")}>
                  {m.isRead ? <MailOpen className="h-5 w-5" /> : <Mail className="h-5 w-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className={cn("truncate text-sm", m.isRead ? "text-stone-300" : "font-semibold text-white")}>{m.name}</p>
                    {!m.isRead && <Badge status="pending">new</Badge>}
                  </div>
                  <p className="truncate text-sm text-stone-400">{m.subject} — {m.message}</p>
                </div>
                <span className="shrink-0 text-xs text-muted">{timeAgo(m.createdAt)}</span>
              </button>
              <button title="Delete" onClick={() => { if (confirm("Delete this message?")) remove.mutate(m.id); }} className="shrink-0 rounded-lg p-2 text-rose-400 hover:bg-rose-500/10">
                <Trash2 className="h-4 w-4" />
              </button>
            </Card>
          ))}
        </div>
      )}

      <Modal open={!!viewing} onClose={() => setViewing(null)} title={viewing?.subject ?? "Message"}>
        {viewing && (
          <div className="space-y-4 text-sm">
            <div className="rounded-xl bg-panel-2 p-4">
              <p className="font-semibold text-white">{viewing.name}</p>
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
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
