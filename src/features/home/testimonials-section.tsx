"use client";

import { useEffect, useState } from "react";
import { Star, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface Testimonial {
  id: string;
  customerName: string;
  rating: number;
  comment: string;
  isFeatured: boolean;
  createdAt: string;
  source?: string;
  external_url?: string;
  author_photo_url?: string;
}

/**
 * Featured testimonials preview for the public homepage.
 *
 * Fetches the 2 most recent FEATURED approved testimonials from the public
 * /api/public/testimonials endpoint. Renders nothing when no featured
 * testimonials exist, so the section is safe to mount unconditionally.
 */
export function TestimonialsSection() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [googleMapsUrl, setGoogleMapsUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch 3 random featured testimonials
        const res = await fetch("/api/public/testimonials?limit=3&featured_only=true");
        const data = await res.json();
        setTestimonials(Array.isArray(data?.data) ? data.data : []);

        // Fetch Google Maps URL for "Leave Review" button
        try {
          const { createClient } = await import("@supabase/supabase-js");
          const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { auth: { autoRefreshToken: false, persistSession: false } }
          );
          const { data: settings } = await supabase
            .from("business_settings")
            .select("google_maps_reviews_url")
            .limit(1)
            .maybeSingle();
          if (settings?.google_maps_reviews_url) {
            setGoogleMapsUrl(settings.google_maps_reviews_url);
          }
        } catch (e) {
          console.error("Failed to fetch Google Maps URL:", e);
        }
      } catch (error) {
        console.error("Failed to fetch testimonials:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <section className="py-12 md:py-16 bg-stone-900">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <p className="text-stone-400">Loading reviews...</p>
          </div>
        </div>
      </section>
    );
  }

  if (testimonials.length === 0) {
    return null; // Don't show section if no testimonials
  }

  return (
    <section className="py-12 md:py-16 bg-stone-900 border-t border-stone-800">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">
            What Our Customers Say
          </h2>
          <p className="text-stone-400 max-w-2xl mx-auto">
            Real reviews from our valued clients
          </p>
        </div>

        {/* Testimonials Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {testimonials.map((testimonial) => (
            <div
              key={testimonial.id}
              className="bg-stone-800 border border-stone-700 rounded-lg p-6 hover:border-gold/50 transition-colors"
            >
              {/* Rating */}
              <div className="flex gap-1 mb-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={cn(
                      "h-4 w-4",
                      i < testimonial.rating
                        ? "text-gold fill-gold"
                        : "text-stone-600"
                    )}
                  />
                ))}
              </div>

              {/* Comment */}
              <p className="text-stone-300 mb-4 line-clamp-3">
                &ldquo;{testimonial.comment}&rdquo;
              </p>

              {/* Author */}
              <div className="flex items-center gap-3">
                {testimonial.author_photo_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={testimonial.author_photo_url}
                    alt={testimonial.customerName}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                )}
                <div>
                  <p className="font-semibold text-white text-sm">
                    {testimonial.customerName}
                  </p>
                  {testimonial.source === "google" && (
                    <p className="text-xs text-gold">Google Review</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA Buttons */}
        <div className="text-center flex justify-center gap-4 flex-wrap">
          {googleMapsUrl && (
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-3 bg-stone-800 text-gold border border-gold font-semibold rounded-lg hover:bg-gold hover:text-stone-900 transition-colors"
            >
              <MapPin className="h-5 w-5" />
              Leave a Review on Google
            </a>
          )}
          <Link
            href="/reviews"
            className="inline-block px-8 py-3 bg-gold text-stone-900 font-semibold rounded-lg hover:bg-gold/90 transition-colors"
          >
            View All Reviews
          </Link>
        </div>
      </div>
    </section>
  );
}
