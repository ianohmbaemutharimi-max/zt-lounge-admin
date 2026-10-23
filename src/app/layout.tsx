import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/contexts/AuthContext";
import { Providers } from "@/components/providers";
import { ToastContainer } from "@/components/toast-container";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import "./globals.css";

/**
 * Canonical, CMS-driven admin branding via Media Gateway.
 *
 * Architecture:
 *   business_settings.favicon_media_id → media_assets.id → public_url
 *   business_settings.logo_media_id → media_assets.id → public_url
 *
 * NEVER falls back to legacy logo_url/favicon_url columns.
 * If branding is not configured, browser defaults are used.
 */
export async function generateMetadata(): Promise<Metadata> {
  let icon: string | undefined;
  let apple: string | undefined;

  try {
    const supabase = await getSupabaseAdmin();

    // Step 1: Get media IDs from business_settings
    const { data: settings } = await supabase
      .from("business_settings")
      .select("favicon_media_id, logo_media_id")
      .limit(1)
      .maybeSingle();

    if (settings) {
      const mediaIds: string[] = [];
      if (settings.favicon_media_id) mediaIds.push(settings.favicon_media_id);
      if (settings.logo_media_id) mediaIds.push(settings.logo_media_id);

      // Step 2: Resolve media assets via Media Gateway
      if (mediaIds.length > 0) {
        const { data: mediaAssets } = await supabase
          .from("media_assets")
          .select("id, public_url")
          .in("id", mediaIds);

        if (mediaAssets) {
          const mediaMap = new Map(mediaAssets.map((m) => [m.id, m.public_url]));
          if (settings.favicon_media_id) {
            icon = mediaMap.get(settings.favicon_media_id);
          }
          if (settings.logo_media_id) {
            apple = mediaMap.get(settings.logo_media_id);
          }
        }
      }
    }
  } catch {
    // Branding is cosmetic — never crash the shell if the lookup fails.
  }

  const base: Metadata = {
    title: "ZT Lounge Admin",
    description: "Admin control center for ZT Lounge Meru — bookings, menu, CMS and analytics.",
  };

  if (icon || apple) {
    base.icons = {
      ...(icon ? { icon } : {}),
      ...(apple ? { apple } : {}),
    };
  }

  return base;
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-ink text-stone-100 antialiased">
        <Providers>
          <AuthProvider>
            {children}
            <ToastContainer />
          </AuthProvider>
        </Providers>
      </body>
    </html>
  );
}
