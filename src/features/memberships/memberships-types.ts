/**
 * Shared row shapes for the membership CMS UI.
 *
 * These mirror the canonical commerce tables managed by the membership editor:
 *   membership_plans         → the plan itself (pricing, slug, media, CTA…)
 *   membership_plan_benefits → per-plan benefit lines
 *
 * The API layer returns untyped rows today, so the CMS container casts to
 * these shapes before handing them to the presentational components.
 */

export interface MembershipPlan {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  annual_price: number | string;
  registration_fee: number | string;
  display_order: number;
  is_active: boolean;
  cta_text?: string | null;
  cta_link?: string | null;
  media_id?: string | null;
  resolved_image_url?: string | null;
}

export interface MembershipBenefit {
  id: string;
  plan_id: string;
  description: string;
  display_order: number;
  is_active: boolean;
}

/** Filter applied to the plan list toolbar. */
export type PlanStatusFilter = "all" | "active" | "inactive";
