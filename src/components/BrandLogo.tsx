"use client";

import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

/**
 * Canonical brand logo / mark.
 *
 * Used in BOTH the Admin Dashboard (sidebar, login, auth pages) and anywhere
 * a logo component is needed. Resolves through the single canonical branding
 * source-of-truth:
 *
 *   business_settings.logo_media_id
 *     → media_assets.id → public_url
 *
 * Resolution priority:
 *   1. Canonical media_id → media_assets.public_url  (CMS-configured)
 *   2. /api/branding public endpoint (works pre-auth / anonymous)
 *   3. null  — caller renders a neutral "ZT" monogram; NO hardcoded image.
 *
 * NEVER falls back to legacy logo_url/favicon_url columns or any /public asset.
 */
async function fetchPublicBranding(): Promise<{
  logoUrl: string | null;
  businessName: string | null;
}> {
  try {
    const res = await fetch("/api/branding", {
      // Pre-auth pages: no session needed (endpoint is public/unauthenticated).
      cache: "no-store",
    });
    if (!res.ok) return { logoUrl: null, businessName: null };
    const json = await res.json();
    return {
      logoUrl: json.logoUrl ?? null,
      businessName: json.businessName ?? null,
    };
  } catch {
    return { logoUrl: null, businessName: null };
  }
}

export function BrandLogo({ className, imgClassName }: { className?: string; imgClassName?: string }) {
  const { data: branding } = useQuery({
    queryKey: ["branding-public"],
    queryFn: fetchPublicBranding,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const logoUrl = branding?.logoUrl ?? null;
  const businessName = branding?.businessName ?? "ZT Lounge";

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={businessName}
        className={cn("rounded object-contain", imgClassName)}
      />
    );
  }

  // No canonical logo configured — render a neutral monogram.
  // Branding can never drift from the CMS.
  return (
    <span
      className={cn(
        "flex items-center justify-center rounded bg-gold font-serif text-lg font-bold text-black",
        imgClassName ?? "h-10 w-10"
      )}
      aria-label={businessName}
    >
      ZT
    </span>
  );
}

export default BrandLogo;