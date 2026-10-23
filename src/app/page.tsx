import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';

import { BrandMonogram } from '@/components/brand-monogram';
import { TestimonialsSection } from '@/features/home/testimonials-section';

export const revalidate = 0;

export const metadata = {
  title: 'ZT Lounge Meru | Premium Lounge, AutoSpa & Barbershop',
  description:
    'ZT Lounge Meru — premium hospitality with AutoSpa, Barbershop and exclusive membership club. Join Bronze, Silver, Gold or Platinum memberships.',
};

const TIER_COLORS: Record<string, string> = {
  bronze: 'from-amber-600 to-amber-800',
  silver: 'from-slate-400 to-slate-600',
  gold: 'from-yellow-500 to-yellow-700',
  platinum: 'from-purple-500 to-purple-700',
};

function formatKES(amount: number): string {
  return `KES ${amount.toLocaleString('en-KE')}`;
}

async function fetchActivePlans(): Promise<
  Array<{ id: string; name: string; slug: string; annual_price: number }>
> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data, error } = await supabase
      .from('membership_plans')
      .select('id, name, slug, annual_price')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

/**
 * ZT Lounge Public Homepage
 * 
 * Entry point for public visitors with prominent membership CTA.
 * Admins can access dashboard via login.
 */
export default async function Home() {
  const plans = await fetchActivePlans();
  return (
    <div className="min-h-screen bg-ink text-stone-100">
      {/* Header */}
      <header className="border-b border-stone-800 bg-panel">
        <div className="container mx-auto flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <BrandMonogram />
            <div>
              <h1 className="text-lg font-bold text-white">ZT Lounge</h1>
              <p className="text-xs text-stone-400">Meru</p>
            </div>
          </div>
          <Link
            href="/login"
            className="rounded-lg bg-stone-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-600"
          >
            Admin Login
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-panel via-ink to-panel py-24 sm:py-32">
        <div className="container mx-auto px-4 text-center sm:px-6 lg:px-8">
          <h1 className="mb-6 text-5xl font-bold text-white sm:text-6xl lg:text-7xl">
            Welcome to ZT Lounge
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-xl text-stone-300 sm:text-2xl">
            Experience premium services, exclusive memberships, and exceptional hospitality in Meru
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/membership"
              className="rounded-lg bg-gold px-8 py-4 text-lg font-semibold text-ink transition hover:bg-gold/90"
            >
              Explore Memberships
            </Link>
            <Link
              href="/dashboard"
              className="rounded-lg border border-stone-700 bg-panel px-8 py-4 text-lg font-semibold text-white transition hover:bg-stone-800"
            >
              Staff Dashboard
            </Link>
          </div>
        </div>
      </section>

      {/* Membership Preview Section */}
      <section className="border-t border-stone-800 py-16 sm:py-24">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-12 text-center">
            <h2 className="mb-3 text-3xl font-bold text-white sm:text-4xl">
              ZT Lounge Club
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-stone-400">
              Join our exclusive membership club and enjoy premium benefits across all ZT Lounge services — including AutoSpa, Barbershop, and more
            </p>
          </div>

          {/* Membership Tiers Preview */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => {
              const tierColor = TIER_COLORS[plan.slug] || 'from-stone-500 to-stone-700';

              return (
                <div
                  key={plan.id}
                  className="rounded-xl border border-stone-800 bg-panel transition hover:border-gold/50"
                >
                  <div className={`bg-gradient-to-br ${tierColor} rounded-t-xl p-6 text-center`}>
                    <h3 className="mb-2 text-xl font-bold uppercase tracking-wider text-white">
                      {plan.name}
                    </h3>
                    <div className="text-2xl font-bold text-white">
                      {formatKES(plan.annual_price)}
                    </div>
                    <div className="text-sm text-white/80">per year</div>
                  </div>
                  <div className="p-6">
                    <p className="mb-4 text-sm text-stone-400">
                      Exclusive benefits and privileges
                    </p>
                    <Link
                      href="/membership"
                      className="block w-full rounded-lg border border-gold bg-gold/10 px-4 py-2 text-center font-medium text-gold transition hover:bg-gold/20"
                    >
                      View Details
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-12 text-center">
            <Link
              href="/membership"
              className="inline-flex items-center gap-2 text-lg font-semibold text-gold transition hover:text-gold/80"
            >
              Explore all membership benefits
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <TestimonialsSection />

      {/* Testimonials */}
      <TestimonialsSection />

      {/* Footer */}
      <footer className="border-t border-stone-800 bg-panel py-8">
        <div className="container mx-auto px-4 text-center text-sm text-stone-400 sm:px-6 lg:px-8">
          <p>&copy; {new Date().getFullYear()} ZT Lounge Meru. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
