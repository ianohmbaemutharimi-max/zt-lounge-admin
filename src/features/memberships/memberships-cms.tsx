"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCheck, DollarSign, Layers, Plus, Search, Sparkles, X } from "lucide-react";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { Button, EmptyState, Input, MetricCard, PageHeader, Spinner } from "@/components/ui";
import { cn, formatKES } from "@/lib/utils";
import { ImageChangeDialog } from "@/features/media/image-change-dialog";
import { MembershipPlanCard } from "./membership-plan-card";
import {
  BenefitFormModal,
  PlanFormModal,
  benefitSchema,
  planSchema,
  type BenefitForm,
  type PlanForm,
} from "./membership-forms";
import type { MembershipBenefit, MembershipPlan, PlanStatusFilter } from "./memberships-types";

/**
 * Membership PRODUCT/CMS editor (SUPER ADMIN ONLY).
 *
 * Manages the canonical commerce definitions the public /membership page
 * consumes:
 *   membership_plans           -> name, slug, description, annual_price,
 *                                  registration_fee, media_id, display_order,
 *                                  is_active, cta_text, cta_link
 *   membership_plan_benefits   -> plan_id, description, display_order, is_active
 *
 * Uses ONLY the existing generic admin APIs:
 *   /api/admin/membership-plans[/:id]
 *   /api/admin/membership-plan-benefits[/:id]
 * (both super_admin-gated server-side since the Loop 26 A-1 fix).
 *
 * Delete semantics: customer_memberships.plan_id is ON DELETE RESTRICT, so the
 * normal lifecycle for plans is Deactivate (is_active=false), which preserves
 * historical memberships. Hard delete is secondary; the server returns
 * 409 DEPENDENT_RECORDS when history exists - surfaced verbatim.
 *
 * Structure: this file is the *container* (state, queries, mutations). The
 * visuals live in `membership-plan-card.tsx` and `membership-forms.tsx`.
 */

/** Upload category for membership plan images. */
const PLAN_UPLOAD_CATEGORY = "memberships" as const;

export function MembershipsCms() {
  const qc = useQueryClient();

  const [planEditing, setPlanEditing] = useState<MembershipPlan | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [mediaPlan, setMediaPlan] = useState<MembershipPlan | null>(null);
  const [mediaOpen, setMediaOpen] = useState(false);
  // Benefits manager is scoped to one plan at a time.
  const [benefitsPlan, setBenefitsPlan] = useState<MembershipPlan | null>(null);
  const [benefitEditing, setBenefitEditing] = useState<MembershipBenefit | null>(null);
  const [benefitOpen, setBenefitOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // List toolbar (view-only; never affects what is saved)
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<PlanStatusFilter>("all");

  const plans = useQuery({
    queryKey: queryKeys["membership-plans"].all(),
    queryFn: () => api.list("membership-plans", { limit: 100, orderBy: "display_order", order: "asc" }),
  });
  const benefits = useQuery({
    queryKey: queryKeys["membership-plan-benefits"].all(),
    queryFn: () => api.list("membership-plan-benefits", { limit: 999, orderBy: "display_order", order: "asc" }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys["membership-plans"].all() });
    qc.invalidateQueries({ queryKey: queryKeys["membership-plan-benefits"].all() });
  };

  const planForm = useForm<PlanForm>({ resolver: zodResolver(planSchema) as any });
  const benefitForm = useForm<BenefitForm>({ resolver: zodResolver(benefitSchema) as any });

  const savePlan = useMutation({
    mutationFn: (v: PlanForm) =>
      planEditing
        ? api.update("membership-plans", planEditing.id, { ...v })
        : api.create("membership-plans", { ...v }),
    onSuccess: () => {
      invalidate();
      setPlanOpen(false);
      setPlanEditing(null);
    },
    onError: (e: Error) => setActionError(e.message),
  });

  const togglePlanActive = useMutation({
    mutationFn: (row: MembershipPlan) =>
      api.update("membership-plans", row.id, { is_active: !row.is_active }),
    onSuccess: invalidate,
    onError: (e: Error) => setActionError(e.message),
  });

  const removePlan = useMutation({
    mutationFn: (row: MembershipPlan) => api.remove("membership-plans", row.id),
    onSuccess: () => {
      invalidate();
      setActionError(null);
    },
    onError: (e: Error) => setActionError(e.message),
  });

  const saveBenefit = useMutation({
    mutationFn: (v: BenefitForm) => {
      const payload = { ...v, plan_id: benefitsPlan?.id };
      return benefitEditing
        ? api.update("membership-plan-benefits", benefitEditing.id, payload)
        : api.create("membership-plan-benefits", payload);
    },
    onSuccess: () => {
      invalidate();
      setBenefitOpen(false);
      setBenefitEditing(null);
    },
    onError: (e: Error) => setActionError(e.message),
  });

  const toggleBenefitActive = useMutation({
    mutationFn: (row: MembershipBenefit) =>
      api.update("membership-plan-benefits", row.id, { is_active: !row.is_active }),
    onSuccess: invalidate,
    onError: (e: Error) => setActionError(e.message),
  });

  function openPlan(plan?: MembershipPlan) {
    setPlanEditing(plan ?? null);
    setActionError(null);
    planForm.reset({
      name: plan?.name ?? "",
      slug: plan?.slug ?? "",
      description: plan?.description ?? "",
      annual_price: Number(plan?.annual_price ?? 0),
      registration_fee: Number(plan?.registration_fee ?? 0),
      display_order: plan?.display_order ?? 0,
      cta_text: plan?.cta_text ?? "",
      cta_link: plan?.cta_link ?? "",
    });
    setPlanOpen(true);
  }

  function openBenefit(plan: MembershipPlan, benefit?: MembershipBenefit) {
    setBenefitsPlan(plan);
    setBenefitEditing(benefit ?? null);
    setActionError(null);
    benefitForm.reset({
      description: benefit?.description ?? "",
      display_order: benefit?.display_order ?? 0,
    });
    setBenefitOpen(true);
  }

  const planList: MembershipPlan[] = useMemo(
    () => (plans.data ?? []) as MembershipPlan[],
    [plans.data]
  );
  const benefitList: MembershipBenefit[] = useMemo(
    () => (benefits.data ?? []) as MembershipBenefit[],
    [benefits.data]
  );
  const benefitsFor = (planId: string) =>
    benefitList
      .filter((b) => b.plan_id === planId)
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));

  // Toolbar filtering (view-only)
  const visiblePlans = useMemo(() => {
    const q = search.trim().toLowerCase();
    return planList.filter((plan) => {
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" ? plan.is_active : !plan.is_active);
      if (!matchesStatus) return false;
      if (!q) return true;
      return (
        plan.name.toLowerCase().includes(q) ||
        plan.slug.toLowerCase().includes(q) ||
        (plan.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [planList, search, statusFilter]);

  if (plans.isLoading || benefits.isLoading) {
    return <Spinner label="Loading memberships..." />;
  }

  // Summary metrics
  const activePlanCount = planList.filter((p) => p.is_active).length;
  const activeBenefitCount = benefitList.filter((b) => b.is_active).length;
  const cheapestPlan = planList.reduce<MembershipPlan | null>(
    (min, p) => (min === null || Number(p.annual_price) < Number(min.annual_price) ? p : min),
    null
  );

  return (
    <div>
      <PageHeader
        title="Memberships"
        subtitle="Membership plans and benefits shown on the public membership page."
        actions={
          <Button onClick={() => openPlan()}>
            <Plus className="h-4 w-4" /> New Plan
          </Button>
        }
      />

      {actionError && (
        <div
          role="alert"
          className="mx-4 mb-4 flex items-start justify-between gap-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
        >
          <span>{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            aria-label="Dismiss error"
            className="text-rose-300 hover:text-rose-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {planList.length === 0 ? (
        <EmptyState
          title="No membership plans"
          description="Create your first plan to publish it on the public membership page."
          action={
            <Button onClick={() => openPlan()}>
              <Plus className="h-4 w-4" /> New Plan
            </Button>
          }
        />
      ) : (
        <>
          {/* Summary strip */}
          <div className="mx-4 mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Plans"
              value={planList.length}
              icon={Layers}
              hint={`${activePlanCount} active`}
            />
            <MetricCard
              title="Active benefits"
              value={activeBenefitCount}
              icon={CheckCheck}
              hint={`${benefitList.length} total lines`}
            />
            <MetricCard
              title="Entry price"
              value={cheapestPlan ? formatKES(Number(cheapestPlan.annual_price)) : "n/a"}
              icon={DollarSign}
              hint={cheapestPlan ? cheapestPlan.name : "No plans yet"}
            />
            <MetricCard
              title="Published"
              value={`${activePlanCount}/${planList.length}`}
              icon={Sparkles}
              hint="Visible on the public page"
            />
          </div>

          {/* Toolbar: search + status filter */}
          <div className="mx-4 mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search plans by name, slug or description..."
                aria-label="Search membership plans"
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-1 rounded-xl border border-edge bg-panel p-1">
              {(
                [
                  { key: "all", label: "All" },
                  { key: "active", label: "Active" },
                  { key: "inactive", label: "Inactive" },
                ] as { key: PlanStatusFilter; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setStatusFilter(opt.key)}
                  aria-pressed={statusFilter === opt.key}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                    statusFilter === opt.key
                      ? "bg-gold text-black"
                      : "text-stone-300 hover:bg-panel-2 hover:text-white"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {visiblePlans.length === 0 ? (
            <EmptyState
              title="No plans match your filters"
              description="Adjust the search text or status filter to see your plans."
              action={
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch("");
                    setStatusFilter("all");
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <div className="mx-4 grid gap-4 pb-8 md:grid-cols-2">
              {visiblePlans.map((plan) => (
                <MembershipPlanCard
                  key={plan.id}
                  plan={plan}
                  benefits={benefitsFor(plan.id)}
                  onEditPlan={openPlan}
                  onTogglePlan={(p) => togglePlanActive.mutate(p)}
                  onDeletePlan={(p) => {
                    if (
                      confirm(
                        `Permanently delete "${p.name}"? Plans with member history are protected by the database.`
                      )
                    )
                      removePlan.mutate(p);
                  }}
                  onChooseImage={(p) => {
                    setMediaPlan(p);
                    setMediaOpen(true);
                  }}
                  onAddBenefit={(p) => openBenefit(p)}
                  onEditBenefit={openBenefit}
                  onToggleBenefit={(b) => toggleBenefitActive.mutate(b)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Plan form */}
      <PlanFormModal
        open={planOpen}
        onClose={() => {
          setPlanOpen(false);
          setPlanEditing(null);
        }}
        isEditing={!!planEditing}
        form={planForm}
        onSubmit={(v) => savePlan.mutate(v)}
        isSaving={savePlan.isPending}
        error={savePlan.isError ? (savePlan.error as Error).message : undefined}
      />

      {/* Benefit form (scoped to the plan opened from) */}
      <BenefitFormModal
        open={benefitOpen}
        onClose={() => {
          setBenefitOpen(false);
          setBenefitEditing(null);
        }}
        planName={benefitsPlan?.name}
        isEditing={!!benefitEditing}
        form={benefitForm}
        onSubmit={(v) => {
          if (!benefitsPlan) return;
          saveBenefit.mutate({ ...v, plan_id: benefitsPlan.id } as BenefitForm);
        }}
        isSaving={saveBenefit.isPending}
        error={saveBenefit.isError ? (saveBenefit.error as Error).message : undefined}
      />

      {/* Canonical media picker (media_id -> media_assets -> public_url) */}
      {mediaPlan && (
        <ImageChangeDialog
          open={mediaOpen}
          onClose={() => {
            setMediaOpen(false);
            setMediaPlan(null);
          }}
          currentMediaId={mediaPlan.media_id ?? null}
          currentImageUrl={mediaPlan.resolved_image_url ?? null}
          title={`Choose image - ${mediaPlan.name}`}
          uploadCategory={PLAN_UPLOAD_CATEGORY}
          onSave={async ({ media_id }) => {
            await api.update("membership-plans", mediaPlan.id, { media_id });
            invalidate();
            setMediaOpen(false);
            setMediaPlan(null);
          }}
        />
      )}
    </div>
  );
}


