"use client";

import { useEffect, useState } from "react";
import { Star, ExternalLink, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

interface Testimonial {
  id: string;
  customerName: string;
  rating: number;
  comment: string;
  createdAt: string;
  source?: string;
  external_url?: string;
  author_photo_url?: string;
}

/**
 * Public /reviews page — every approved testimonial, paginated, plus a
 * Google Maps CTA that links to the canonical Google Maps reviews URL
 * (business_settings.google_maps_reviews_url, falling back to google_maps_url).
 */
export default function ReviewsPage() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [googleMapsUrl, setGoogleMapsUrl] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    fetch("/api/public/testimonials?limit=100")
      .then((r) => r.json())
      .then((d) => setTestimonials(Array.isArray(d?.data) ? d.data : []))
      .catch((e) => console.error("Failed to fetch reviews:", e))
      .finally(() => setLoading(false));

    // Google Maps CTA target, read from the canonical business_settings row
    // with the anon key (same public-read pattern as the homepage). Any
    // failure — columns not yet migrated, RLS, network — just hides the CTA.
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      void supabase
        .from("business_settings")
        .select("*")
        .limit(1)
        .maybeSingle()
        .then(({ data }) => {
          const url = data?.google_maps_reviews_url || data?.google_maps_url || null;
          if (url) setGoogleMapsUrl(url);
        });
    } catch {
      // CTA stays hidden
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-stone-900 py-12">
        <div className="container mx-auto px-4 text-center">
          <p className="text-stone-400">Loading reviews...</p>
        </div>
      </main>
    );
  }

  const startIndex = (page - 1) * itemsPerPage;
  const visible = testimonials.slice(startIndex, startIndex + itemsPerPage);
  const totalPages = Math.ceil(testimonials.length / itemsPerPage);

  return (
    <main className="min-h-screen bg-stone-900">
      <section className="border-b border-stone-800 py-12">
        <div className="container mx-auto px-4">
          <Link href="/" className="text-gold hover:text-gold/80 text-sm mb-4 inline-block">
            &larr; Back Home
          </Link>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-3">Customer Reviews</h1>
          <p className="text-stone-400 text-lg">
            Read what our customers have to say about our services
          </p>
          {googleMapsUrl && (
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-gold px-6 py-3 font-semibold text-ink transition hover:bg-gold/90"
            >
              <MapPin className="h-4 w-4" />
              See more reviews on Google Maps
            </a>
          )}
        </div>
      </section>
      <section className="py-12">
        <div className="container mx-auto px-4">
          {testimonials.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-stone-400">No reviews yet.</p>
            </div>
          ) : (
            <>
              <div className="grid gap-6 mb-8">
                {visible.map((t) => (
                  <ReviewCard key={t.id} t={t} />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => setPage(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="px-4 py-2 rounded border border-stone-700 text-stone-300 hover:border-gold hover:text-gold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <span className="text-stone-400 text-sm">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(Math.min(totalPages, page + 1))}
                    disabled={page === totalPages}
                    className="px-4 py-2 rounded border border-stone-700 text-stone-300 hover:border-gold hover:text-gold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function ReviewCard({ t }: { t: Testimonial }) {
  return (
    <div className="bg-stone-800 border border-stone-700 rounded-lg p-6 hover:border-gold/50 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-4">
          {t.author_photo_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.author_photo_url} alt={t.customerName} className="h-12 w-12 rounded-full object-cover" />
          )}
          <div>
            <p className="font-semibold text-white text-lg">{t.customerName}</p>
            {t.source === "google" ? (
              <span className="text-sm text-gold font-medium">Google Review</span>
            ) : (
              <span className="text-sm text-stone-500">Customer Review</span>
            )}
          </div>
        </div>
        {t.external_url && (
          <a
            href={t.external_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gold hover:text-gold/80 transition-colors"
            title="View original review"
          >
            <ExternalLink className="h-5 w-5" />
          </a>
        )}
      </div>

      <div className="flex gap-1 mb-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={cn("h-4 w-4", i < t.rating ? "text-gold fill-gold" : "text-stone-600")}
          />
        ))}
      </div>

      <p className="text-stone-300 mb-3 leading-relaxed">&ldquo;{t.comment}&rdquo;</p>
      <p className="text-xs text-stone-500">
        {new Date(t.createdAt).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
      </p>
    </div>
  );
}
