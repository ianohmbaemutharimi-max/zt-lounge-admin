import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

import { BrandMonogram } from '@/components/brand-monogram';

export const revalidate = 0;

export async function generateMetadata() {
  return {
    title: 'ZT Lounge Club Membership | ZT Lounge Meru',
    description:
      'Join the ZT Lounge Membership Club in Meru. Choose from Bronze, Silver, Gold or Platinum annual memberships with exclusive discounts, priority reservations, VIP lounge access and more.',
  };
}

interface PlanBenefit {
  description: string;
  display_order: number;
}

interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  annual_price: number;
  registration_fee: number;
  display_order: number;
  cta_text: string | null;
  cta_link: string | null;
  benefits: PlanBenefit[];
}

const TIER_COLORS: Record<string, string> = {
  bronze: 'bronze',
  silver: 'silver',
  gold: 'gold',
  platinum: 'platinum',
};

/**
 * Tier presentation mapping for CSS data-tier attribute.
 * Maps plan slug to neutral tier token when unknown.
 * Approved tier tokens: bronze/silver/gold/platinum (presentation only)
 */
function tierToken(slug: string): string {
  return TIER_COLORS[slug] || 'gold';
}

/**
 * Format currency using configured locale and currency symbol.
 * Defaults to KES if no config available.
 */
function formatCurrency(amount: number): string {
  const currency = 'KES'; // Future: read from cfg() if exposed
  return `${currency} ${amount.toLocaleString('en-KE')}`;
}

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '254143542601';

/**
 * Generate enquiry CTA href, preferring configured CTA link over WhatsApp fallback.
 * CTA link takes precedence if present and valid (https:// URL).
 */
function enquiryHref(plan: Plan): string {
  // Prefer configured CTA link if present
  if (plan.cta_link) {
    try {
      const url = new URL(plan.cta_link);
      if (url.protocol === 'https:') return plan.cta_link;
    } catch {
      // Invalid URL, fall through to WhatsApp
    }
  }
  
  // Fall back to WhatsApp with auto-generated message
  const message = encodeURIComponent(
    `Hi! I'm interested in joining the ZT Lounge ${plan.name} Membership. Can you help with the registration process?`
  );
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${message}`;
}

/**
 * Generate CTA button text, preferring configured cta_text over default.
 */
function ctaText(plan: Plan): string {
  return plan.cta_text || `Join ${plan.name}`;
}

/**
 * Determine if all plans have identical registration fees.
 * Only returns true when every plan has a valid registration_fee and they are all equal.
 * Returns false for empty plans, null/undefined fees, or mixed fees.
 */
function areRegistrationFeesConsistent(plans: Plan[]): boolean {
  if (plans.length === 0) return false;
  
  // Collect all registration fees, filtering out null/undefined
  const fees = plans
    .map(p => p.registration_fee)
    .filter(fee => fee !== null && fee !== undefined);
  
  // All plans must have a fee value
  if (fees.length !== plans.length) return false;
  
  // All fees must be equal
  const firstFee = fees[0];
  return fees.every(fee => fee === firstFee);
}

async function fetchActivePlans(): Promise<Plan[]> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: plans, error: plansError } = await supabase
      .from('membership_plans')
      .select('id, name, slug, description, annual_price, registration_fee, display_order, cta_text, cta_link')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (plansError || !plans) return [];

    const planIds = plans.map((p) => p.id);
    const { data: benefits } = await supabase
      .from('membership_plan_benefits')
      .select('plan_id, description, display_order')
      .in('plan_id', planIds)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    const benefitsMap = new Map<string, PlanBenefit[]>();
    benefits?.forEach((b) => {
      const list = benefitsMap.get(b.plan_id) ?? [];
      list.push({ description: b.description, display_order: b.display_order });
      benefitsMap.set(b.plan_id, list);
    });

    return plans.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      annual_price: p.annual_price,
      registration_fee: p.registration_fee,
      display_order: p.display_order,
      cta_text: p.cta_text,
      cta_link: p.cta_link,
      benefits: benefitsMap.get(p.id) ?? [],
    }));
  } catch {
    return [];
  }
}

export default async function MembershipPage() {
  const plans = await fetchActivePlans();

  return (
    <div className="min-h-screen bg-ink text-stone-100">
      {/* Header */}
      <header className="border-b border-stone-800 bg-panel">
        <div className="container mx-auto flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <BrandMonogram />
            <div>
              <h1 className="text-lg font-bold text-white">ZT Lounge Club</h1>
              <p className="text-xs text-stone-400">Membership</p>
            </div>
          </div>
          <Link href="/" className="rounded-lg border border-stone-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800">
            Back Home
          </Link>
        </div>
      </header>

      {/* Main Section */}
      <section className="border-t border-stone-800 py-16 sm:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="mb-3 text-4xl font-bold text-white sm:text-5xl">
              Membership Plans
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-stone-400">
              Join ZT Lounge and unlock exclusive benefits across all our services — AutoSpa, Barbershop, and premium hospitality
            </p>
          </div>

          {plans.length === 0 && (
            <div className="py-12 text-center text-stone-400">
              No membership plans available at this time.
            </div>
          )}

          {plans.length > 0 && (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {plans.map((plan) => {
                const tier = tierToken(plan.slug);
                const href = enquiryHref(plan);
                const btnText = ctaText(plan);
                
                // Tier-specific gradient backgrounds
                const tierGradients: Record<string, string> = {
                  bronze: 'bg-gradient-to-br from-orange-600 via-orange-500 to-amber-600',
                  silver: 'bg-gradient-to-br from-slate-500 via-slate-400 to-zinc-400',
                  gold: 'bg-gradient-to-br from-amber-500 via-yellow-500 to-amber-600',
                  platinum: 'bg-gradient-to-br from-purple-600 via-purple-500 to-indigo-600',
                };
                
                const tierIcons: Record<string, string> = {
                  bronze: '🥉',
                  silver: '🥈',
                  gold: '🥇',
                  platinum: '💎',
                };

                return (
                  <div
                    key={plan.id}
                    data-tier={tier}
                    className="group relative flex flex-col overflow-hidden rounded-2xl border border-stone-800 bg-panel shadow-xl transition-all duration-300 hover:scale-105 hover:shadow-2xl hover:shadow-gold/20"
                  >
                    {/* Tier Header with diagonal gradient */}
                    <div className={`relative p-8 text-center ${tierGradients[tier] || tierGradients.gold}`}>
                      {/* Diagonal overlay for depth */}
                      <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-black/20"></div>
                      
                      <div className="relative z-10">
                        {/* Tier Icon */}
                        <div className="mb-3 text-5xl opacity-90">
                          {tierIcons[tier] || tierIcons.gold}
                        </div>
                        
                        {/* Tier Name */}
                        <h3 className="mb-3 text-2xl font-bold uppercase tracking-wider text-white drop-shadow-lg">
                          {plan.name}
                        </h3>
                        
                        {/* Price Display - Large and prominent */}
                        <div className="mb-1">
                          <span className="text-5xl font-extrabold text-white drop-shadow-lg">
                            {plan.annual_price.toLocaleString('en-KE')}
                          </span>
                        </div>
                        <div className="text-sm font-medium uppercase tracking-wide text-white/90">
                          KES / year
                        </div>
                      </div>
                    </div>

                    {/* Benefits Section */}
                    <div className="flex-1 space-y-2.5 p-6">
                      {plan.benefits.map((benefit, idx) => (
                        <div key={idx} className="flex items-start gap-2.5 text-sm text-stone-300">
                          <svg
                            className="mt-0.5 h-4 w-4 flex-shrink-0 text-gold"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                              clipRule="evenodd"
                            />
                          </svg>
                          <span className="leading-relaxed">{benefit.description}</span>
                        </div>
                      ))}
                    </div>

                    {/* CTA Button - Outlined style */}
                    <div className="p-6 pt-0">
                      <a
                        href={href}
                        target={href.startsWith('https://wa.me') ? '_blank' : undefined}
                        rel={href.startsWith('https://wa.me') ? 'noopener noreferrer' : undefined}
                        className="block w-full rounded-lg border-2 border-gold bg-transparent px-4 py-3 text-center font-semibold text-gold transition-all duration-300 hover:bg-gold hover:text-ink"
                      >
                        {btnText}
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {plans.length > 0 && (
            <div className="mt-12 text-center">
              <p className="text-stone-400">
                {areRegistrationFeesConsistent(plans) ? (
                  <>
                    Registration fee:{' '}
                    <span className="font-semibold text-gold">
                      {formatCurrency(plans[0].registration_fee)}
                    </span>{' '}
                    (one-time, applies to all membership tiers)
                  </>
                ) : (
                  <>
                    Registration fee:{' '}
                    <span className="font-semibold text-gold">
                      see each tier for details
                    </span>
                  </>
                )}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-stone-800 bg-panel py-8">
        <div className="container mx-auto px-4 text-center text-sm text-stone-400 sm:px-6 lg:px-8">
          <p>&copy; {new Date().getFullYear()} ZT Lounge Meru. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}