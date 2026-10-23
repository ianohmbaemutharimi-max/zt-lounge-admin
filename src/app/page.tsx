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
/** snake_case DB row → camelCase public contract for hero slides. */
function mapHeroSlideRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    pageId: row.page_id ?? null,
    mediaId: row.media_id ?? null,
    altText: row.alt_text ?? '',
    href: row.href ?? '',
    displayOrder: Number(row.display_order ?? 0),
    isFeatured: Boolean(row.is_featured ?? false),
    heading: row.heading ?? '',
    subheading: row.subheading ?? '',
    cta_text: row.cta_text ?? '',
    cta_link: row.cta_link ?? '',
  };
}

/** Fetch active hero slides from DB for the public homepage hero section. */
async function fetchHeroSlides() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data, error } = await supabase
      .from('hero_slides')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error || !data) return { data: [] };

    return { data: data.map(mapHeroSlideRow) };
  } catch {
    return { data: [] };
  }
}
/** Fetch branding info from business_settings DB for public website. */
async function fetchBranding() {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/api/public/branding`, {
      cache: "no-store",
    });
    if (!res.ok) return { businessName: "ZT Lounge", city: "Meru", logoUrl: "" };
    return await res.json();
  } catch {
    return { businessName: "ZT Lounge", city: "Meru", logoUrl: "" };
  }
}

/** Fetch active services from DB for public homepage. */
async function fetchServices() {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/api/public/services?limit=6&featured=true`, {
      cache: "no-store",
    });
    if (!res.ok) return { data: [] };
    return await res.json();
  } catch {
    return { data: [] };
  }
}

/** Fetch active promotions from DB for public homepage. */
async function fetchPromotions() {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/api/public/promotions?on_homepage=true&limit=3`, {
      cache: "no-store",
    });
    if (!res.ok) return { data: [] };
    return await res.json();
  } catch {
    return { data: [] };
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
  const heroSlides = await fetchHeroSlides();
  const branding = await fetchBranding();
  const services = await fetchServices();
  const promotions = await fetchPromotions();

  return (
    <div className="min-h-screen bg-ink text-stone-100">
      {/* Header */}
      <header className="border-b border-stone-800 bg-panel">
        <div className="container mx-auto flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <BrandMonogram />
            <div>
              <h1 className="text-lg font-bold text-white">{branding.businessName}</h1>
              <p className="text-xs text-stone-400">{branding.city || 'Meru'}</p>
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
      <section className="relative overflow-hidden bg-gray-900 min-h-[500px]">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          {/* Hero background media */}
          {heroSlides.data.length > 0 && (
            <div className="relative w-full h-[400px] md:h-[500px] bg-center bg-cover flex items-center justify-center">
              {heroSlides.data[0].mediaId && (
                <img
                  src={`https://${process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF || 'jczwilrysvnhcjzjztbi'}.supabase.co/storage/v1/object/public/media/${heroSlides.data[0].mediaId}`}
                  alt={heroSlides.data[0].altText || 'ZT Lounge hero'}
                  className="object-cover w-full h-full rounded-t-lg"
                />
              )}
              <div className="absolute inset-0 bg-black/30"></div>
              <div className="relative z-10 w-full max-w-2xl mx-auto text-center px-4">
                <h1 className="mb-6 text-5xl font-bold text-white sm:text-6xl lg:text-7xl">
                  {heroSlides.data[0].heading || 'Welcome to ZT Lounge'}
                </h1>
                <p className="mx-auto mb-8 max-w-2xl text-xl text-stone-300 sm:text-2xl">
                  {heroSlides.data[0].subheading ||
                    'Experience premium services, exclusive memberships, and exceptional hospitality in Meru'}
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  {heroSlides.data[0].cta_text && (
                    <Link
                      href={heroSlides.data[0].cta_link || '/membership'}
                      className="rounded-lg bg-gold px-8 py-4 text-lg font-semibold text-ink transition hover:bg-gold/90"
                    >
                      {heroSlides.data[0].cta_text}
                    </Link>
                  )}
                  <Link
                    href="/membership"
                    className="rounded-lg border border-stone-700 bg-panel px-8 py-4 text-lg font-semibold text-white transition hover:bg-stone-800"
                  >
                    Explore Memberships
                  </Link>
                </div>
              </div>
            </div>
          )}
          {/* Fallback hero if no slides in DB */}
          {!heroSlides.data.length > 0 && (
            <div className="relative py-24 sm:py-32 bg-gradient-to-br from-panel via-ink to-panel">
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
            </div>
          )}
        </div>
      </section>

      {/* Promotions Section */}
      {promotions.data.length > 0 && (
        <section className="border-t border-stone-800 bg-gradient-to-br from-panel/50 to-ink py-16">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mb-12 text-center">
              <h2 className="mb-3 text-3xl font-bold text-white sm:text-4xl">
                Special Offers
              </h2>
              <p className="mx-auto max-w-2xl text-lg text-stone-400">
                Don't miss out on our exclusive promotions and limited-time deals
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {promotions.data.map((promo: any) => (
                <div
                  key={promo.id}
                  className="relative overflow-hidden rounded-xl border border-stone-800 bg-panel transition hover:border-gold/50"
                >
                  {promo.imageUrl && (
                    <div className="relative h-48 w-full">
                      <img
                        src={promo.imageUrl}
                        alt={promo.title}
                        className="h-full w-full object-cover"
                      />
                      {promo.discountPercent > 0 && (
                        <div className="absolute right-4 top-4 rounded-full bg-gold px-4 py-2 font-bold text-ink">
                          {promo.discountPercent}% OFF
                        </div>
                      )}
                    </div>
                  )}
                  <div className="p-6">
                    <h3 className="mb-2 text-xl font-bold text-white">{promo.title}</h3>
                    <p className="mb-4 text-sm text-stone-400">{promo.description}</p>
                    {(promo.startDate || promo.endDate) && (
                      <p className="text-xs text-stone-500">
                        Valid: {promo.startDate || 'Now'} - {promo.endDate || 'Limited time'}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

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

      {/* Services Section */}
      {services.data.length > 0 && (
        <section className="border-t border-stone-800 py-16 sm:py-24">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mb-12 text-center">
              <h2 className="mb-3 text-3xl font-bold text-white sm:text-4xl">
                Our Services
              </h2>
              <p className="mx-auto max-w-2xl text-lg text-stone-400">
                Discover our range of premium services designed to elevate your experience
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {services.data.map((service: any) => (
                <div
                  key={service.id}
                  className="group overflow-hidden rounded-xl border border-stone-800 bg-panel transition hover:border-gold/50"
                >
                  {service.imageUrl && (
                    <div className="relative h-64 w-full overflow-hidden">
                      <img
                        src={service.imageUrl}
                        alt={service.altText || service.name}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                    </div>
                  )}
                  <div className="p-6">
                    <h3 className="mb-2 text-xl font-bold text-white">{service.name}</h3>
                    {service.description && (
                      <p className="mb-4 text-sm text-stone-400">{service.description}</p>
                    )}
                    {service.price > 0 && (
                      <p className="mb-4 text-lg font-semibold text-gold">
                        {formatKES(service.price)}
                      </p>
                    )}
                    <div className="flex items-center gap-2 text-sm text-stone-500">
                      <span className="capitalize">{service.type}</span>
                      {service.featured && (
                        <span className="rounded-full bg-gold/20 px-2 py-1 text-xs font-medium text-gold">
                          Featured
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Testimonials */}
      <TestimonialsSection />

      {/* Footer */}
      <footer className="border-t border-stone-800 bg-panel py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-3">
            {/* Business Info */}
            <div>
              <h3 className="mb-4 text-lg font-bold text-white">{branding.businessName}</h3>
              {branding.address && (
                <p className="mb-2 text-sm text-stone-400">{branding.address}</p>
              )}
              {branding.city && (
                <p className="mb-2 text-sm text-stone-400">{branding.city}</p>
              )}
            </div>

            {/* Contact Info */}
            <div>
              <h3 className="mb-4 text-lg font-bold text-white">Contact</h3>
              {branding.phone && (
                <p className="mb-2 text-sm text-stone-400">
                  <a href={`tel:${branding.phone}`} className="hover:text-gold transition">
                    {branding.phone}
                  </a>
                </p>
              )}
              {branding.email && (
                <p className="mb-2 text-sm text-stone-400">
                  <a href={`mailto:${branding.email}`} className="hover:text-gold transition">
                    {branding.email}
                  </a>
                </p>
              )}
              {branding.whatsapp && (
                <p className="mb-2 text-sm text-stone-400">
                  <a 
                    href={`https://wa.me/${branding.whatsapp.replace(/\D/g, '')}`} 
                    className="hover:text-gold transition"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    WhatsApp
                  </a>
                </p>
              )}
            </div>

            {/* Social & Links */}
            <div>
              <h3 className="mb-4 text-lg font-bold text-white">Follow Us</h3>
              <div className="flex gap-4">
                {branding.facebook && (
                  <a 
                    href={branding.facebook} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-stone-400 hover:text-gold transition"
                  >
                    Facebook
                  </a>
                )}
                {branding.instagram && (
                  <a 
                    href={branding.instagram} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-stone-400 hover:text-gold transition"
                  >
                    Instagram
                  </a>
                )}
              </div>
              {branding.googleMapsUrl && (
                <div className="mt-4">
                  <a 
                    href={branding.googleMapsUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-stone-400 hover:text-gold transition"
                  >
                    View on Google Maps
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Copyright */}
          <div className="mt-8 border-t border-stone-800 pt-8 text-center text-sm text-stone-400">
            <p>&copy; {new Date().getFullYear()} {branding.businessName}. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
