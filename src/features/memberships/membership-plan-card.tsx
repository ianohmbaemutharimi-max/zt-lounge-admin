"use client";

import { Check, Image as ImageIcon, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { cn, formatKES } from "@/lib/utils";
import type { MembershipBenefit, MembershipPlan } from "./memberships-types";

/**
 * Presentational card for a single membership plan.
 *
 * Purely visual: every action is delegated back to the owning container
 * through props so that form state, validation and API behaviour stay in
 * one place.
 */
export function MembershipPlanCard({
  plan,
  benefits,
  onEditPlan,
  onTogglePlan,
  onDeletePlan,
  onChooseImage,
  onAddBenefit,
  onEditBenefit,
  onToggleBenefit,
}: {
  plan: MembershipPlan;
  benefits: MembershipBenefit[];
  onEditPlan: (plan: MembershipPlan) => void;
  onTogglePlan: (plan: MembershipPlan) => void;
  onDeletePlan: (plan: MembershipPlan) => void;
  onChooseImage: (plan: MembershipPlan) => void;
  onAddBenefit: (plan: MembershipPlan) => void;
  onEditBenefit: (plan: MembershipPlan, benefit: MembershipBenefit) => void;
  onToggleBenefit: (benefit: MembershipBenefit) => void;
}) {
  const activeBenefits = benefits.filter((b) => b.is_active).length;

  return (
    <Card className="flex flex-col p-5">
      {/* Header: identity + price */}
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-lg font-semibold text-white">{plan.name}</h3>
            {plan.is_active ? (
              <Badge status="active">active</Badge>
            ) : (
              <Badge status="inactive">inactive</Badge>
            )}
          </div>
          <p className="mt-0.5 truncate font-mono text-xs text-muted">/{plan.slug}</p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-xl font-semibold text-gold">{formatKES(Number(plan.annual_price))}</p>
          <p className="text-xs text-muted">
            + {formatKES(Number(plan.registration_fee))} registration
          </p>
        </div>
      </header>

      {plan.description && (
        <p className="mt-3 line-clamp-2 text-sm text-stone-300">{plan.description}</p>
      )}
      {/* Section: Artwork */}
      <section className="mt-4 rounded-xl border border-edge bg-panel-2/40 p-3">
        <h4 className="text-xs font-medium uppercase tracking-wider text-muted">Artwork</h4>
        <div className="mt-2 flex items-center gap-3">
          {plan.resolved_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={plan.resolved_image_url}
              alt={`${plan.name} artwork`}
              className="h-14 w-14 rounded-lg border border-edge object-cover"
            />
          ) : (
            <span className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-edge text-muted">
              <ImageIcon className="h-4 w-4" />
            </span>
          )}
          <div className="min-w-0">
            <Button variant="outline" onClick={() => onChooseImage(plan)}>
              <ImageIcon className="h-4 w-4" /> {plan.media_id ? "Change image" : "Choose image"}
            </Button>
            <p className="mt-1 truncate text-[11px] text-muted">
              {plan.resolved_image_url
                ? "Shown on the public membership page"
                : "No image selected yet"}
            </p>
          </div>
        </div>
      </section>

      {/* Section: Call to action */}
      <section className="mt-3 rounded-xl border border-edge bg-panel-2/40 p-3">
        <h4 className="text-xs font-medium uppercase tracking-wider text-muted">Call to action</h4>
        <dl className="mt-2 space-y-1 text-sm">
          <div className="flex items-baseline gap-2">
            <dt className="w-20 shrink-0 text-xs text-muted">Button</dt>
            <dd className="truncate text-stone-200">{plan.cta_text || "(default)"}</dd>
          </div>
          <div className="flex items-baseline gap-2">
            <dt className="w-20 shrink-0 text-xs text-muted">Link</dt>
            <dd className="truncate text-stone-200">{plan.cta_link || "(none)"}</dd>
          </div>
        </dl>
      </section>

      {/* Section: Benefits */}
      <section className="mt-3 flex-1 rounded-xl border border-edge bg-panel-2/40 p-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-medium uppercase tracking-wider text-muted">
            Benefits ({activeBenefits} active)
          </h4>
          <button
            onClick={() => onAddBenefit(plan)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-gold hover:bg-gold/10"
          >
            <Plus className="h-3.5 w-3.5" /> Add benefit
          </button>
        </div>

        <ul className="mt-2 space-y-1.5">
          {benefits.length === 0 && <li className="text-xs text-muted">No benefits yet.</li>}
          {benefits.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-2 text-sm">
              <span className={cn("flex items-start gap-2", !b.is_active && "text-muted line-through")}>
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" aria-hidden />
                <span>{b.description}</span>
                <span className="text-[10px] text-muted">#{b.display_order}</span>
              </span>
              <span className="flex shrink-0 gap-1">
                <button
                  title="Edit benefit"
                  aria-label={`Edit benefit for ${plan.name}`}
                  onClick={() => onEditBenefit(plan, b)}
                  className="rounded-lg p-1 text-stone-400 hover:bg-panel-2 hover:text-white"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  title={b.is_active ? "Deactivate benefit" : "Activate benefit"}
                  aria-label={`${b.is_active ? "Deactivate" : "Activate"} benefit for ${plan.name}`}
                  onClick={() => onToggleBenefit(b)}
                  className={cn(
                    "rounded-lg p-1 hover:bg-panel-2",
                    b.is_active ? "text-emerald-400" : "text-stone-500"
                  )}
                >
                  <Power className="h-3.5 w-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Actions: Deactivate is the normal lifecycle (RESTRICT on history) */}
      <footer className="mt-4 flex flex-wrap items-center gap-2 border-t border-edge pt-3">
        <Button variant="outline" onClick={() => onEditPlan(plan)}>
          <Pencil className="h-4 w-4" /> Edit plan
        </Button>
        <Button variant="outline" onClick={() => onTogglePlan(plan)}>
          <Power className="h-4 w-4" /> {plan.is_active ? "Deactivate" : "Activate"}
        </Button>
        <Button variant="danger" onClick={() => onDeletePlan(plan)}>
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
      </footer>
    </Card>
  );
}

