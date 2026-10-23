import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';

/**
 * Public Membership Plans API
 * 
 * Returns active membership plans with benefits for public display.
 * No authentication required — this is public marketing data served through
 * the PUBLIC (anon) Supabase client — the same safe-read path as /api/branding.
 * 
 * Security:
 * - Uses anon client (RLS-gated); NO service-role key exposure
 * - Only returns active plans (is_active = true)
 * - Only returns active benefits (is_active = true)
 * - Read-only — no mutations allowed
 * - No customer/pricing manipulation data exposed
 * 
 * Response:
 * [
 *   {
 *     id: string,
 *     name: string,
 *     slug: string,
 *     description: string | null,
 *     annual_price: number,
 *     registration_fee: number,
 *     display_order: number,
 *     benefits: [
 *       { description: string, display_order: number }
 *     ]
 *   }
 * ]
 */
export async function GET() {
  try {
    const supabase = await getSupabaseServer();

    // Fetch active membership plans
    const { data: plans, error: plansError } = await supabase
      .from('membership_plans')
      .select('id, name, slug, description, annual_price, registration_fee, display_order')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (plansError) {
      console.error('Error fetching membership plans:', plansError);
      return NextResponse.json(
        { error: 'Failed to load membership plans' },
        { status: 500 }
      );
    }

    if (!plans || plans.length === 0) {
      return NextResponse.json([]);
    }

    // Fetch active benefits for all active plans
    const planIds = plans.map(p => p.id);
    const { data: benefits, error: benefitsError } = await supabase
      .from('membership_plan_benefits')
      .select('plan_id, description, display_order')
      .in('plan_id', planIds)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (benefitsError) {
      console.error('Error fetching benefits:', benefitsError);
      // Continue without benefits rather than failing entirely
    }

    // Group benefits by plan_id
    const benefitsMap = new Map<string, Array<{ description: string; display_order: number }>>();
    
    if (benefits) {
      benefits.forEach(b => {
        if (!benefitsMap.has(b.plan_id)) {
          benefitsMap.set(b.plan_id, []);
        }
        benefitsMap.get(b.plan_id)!.push({
          description: b.description,
          display_order: b.display_order,
        });
      });
    }

    // Combine plans with their benefits
    const plansWithBenefits = plans.map(plan => ({
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      description: plan.description,
      annual_price: plan.annual_price,
      registration_fee: plan.registration_fee,
      display_order: plan.display_order,
      benefits: benefitsMap.get(plan.id) || [],
    }));

    return NextResponse.json(plansWithBenefits, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('Unexpected error in membership plans API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
