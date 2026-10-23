import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { resolveImageUrls } from "@/lib/media/resolver";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/branding
 *
 * Public, unauthenticated endpoint for pre-auth pages (login, error shells,
 * public-site embed). Resolves the canonical CMS branding once:
 *
  *   business_settings.logo_media_id / logo_light_media_id / favicon_media_id
 *     → media_assets.id → public_url
 *
 * NEVER falls back to legacy logo_url/favicon_url columns.
 * Returns null URLs when branding is not configured so callers render a
 * neutral mark rather than a stale hardcoded asset.
 */
export async function GET() {
  try {
        const supabase = await getSupabaseServer();

    const { data: settings, error } = await supabase
      .from("business_settings")
            .select("id, business_name, logo_media_id, logo_light_media_id, favicon_media_id")
      .limit(1)
      .maybeSingle();

    if (error || !settings) {
      return NextResponse.json(
                {
          logoUrl: null,
          logoLightUrl: null,
          faviconUrl: null,
          businessName: null,
        },
        { status: 200 }
      );
    }

        // Resolve canonical media assets in one batch query.
    // Order is fixed: logo (dark), logo_light, favicon.
    const rows = [];
    if (settings.logo_media_id) {
      rows.push({ media_id: settings.logo_media_id });
    }
    if (settings.logo_light_media_id) {
      rows.push({ media_id: settings.logo_light_media_id });
    }
    if (settings.favicon_media_id) {
      rows.push({ media_id: settings.favicon_media_id });
    }

    let logoUrl: string | null = null;
    let logoLightUrl: string | null = null;
    let faviconUrl: string | null = null;

    if (rows.length > 0) {
      const resolved = await resolveImageUrls(supabase as any, rows);
      // resolveImageUrls keeps input order; assign by role order above.
      let idx = 0;
      if (settings.logo_media_id) {
        logoUrl = resolved[idx].resolved_image_url;
        idx++;
      }
      if (settings.logo_light_media_id) {
        logoLightUrl = resolved[idx].resolved_image_url;
        idx++;
      }
      if (settings.favicon_media_id) {
        faviconUrl = resolved[idx].resolved_image_url;
      }
    }

    return NextResponse.json({
      logoUrl,
      logoLightUrl,
      faviconUrl,
      businessName: settings.business_name || null,
    });
  } catch (error) {
    console.error("[branding] public resolution error:", error);
    return NextResponse.json(
            { logoUrl: null, logoLightUrl: null, faviconUrl: null, businessName: null },
      { status: 200 }
    );
  }
}