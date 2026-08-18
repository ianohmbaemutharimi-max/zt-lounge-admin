"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, X, Star } from "lucide-react";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { PageHeader, Card, Badge, Spinner, EmptyState, Button } from "@/components/ui";
import { cn, timeAgo } from "@/lib/utils";

export function TestimonialsView() {
  const qc = useQueryClient();
  const testimonials = useQuery({ queryKey: queryKeys.testimonials.all(), queryFn: () => api.list("testimonials") });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api.update("testimonials", id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.testimonials.all() }),
  });

  if (testimonials.isLoading) return <Spinner label="Loading testimonials…" />;

  const list = testimonials.data ?? [];
  const pending = list.filter((t: any) => t.status === "pending");

  return (
    <div>
      <PageHeader
        title="Testimonials"
        subtitle={`Moderate customer reviews before they appear on the website. ${pending.length} awaiting review.`}
      />

      {list.length === 0 ? (
        <EmptyState title="No testimonials yet" description="Customer reviews submitted on the website will appear here." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((t: any) => (
            <Card key={t.id} className={cn("p-5", t.status === "pending" && "border-gold/40")}>
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
                  <Badge status={t.status}>{t.status}</Badge>
                </div>
              </div>
              <p className="mt-3 text-sm text-stone-300">&ldquo;{t.comment}&rdquo;</p>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                {t.status !== "approved" && (
                  <Button variant="outline" onClick={() => patch.mutate({ id: t.id, body: { status: "approved" } })}>
                    <Check className="h-4 w-4" /> Approve
                  </Button>
                )}
                {t.status !== "rejected" && (
                  <Button variant="danger" onClick={() => patch.mutate({ id: t.id, body: { status: "rejected", is_featured: false } })}>
                    <X className="h-4 w-4" /> Reject
                  </Button>
                )}
                {t.status === "approved" && (
                  <Button variant={t.is_featured ? "gold" : "outline"} onClick={() => patch.mutate({ id: t.id, body: { is_featured: !t.is_featured } })}>
                    <Star className="h-4 w-4" /> {t.is_featured ? "Unfeature" : "Feature"}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
