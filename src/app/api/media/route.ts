import { NextRequest, NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/auth/server";
import { MEDIA_REFERENCE_TABLES, type MediaReferenceTable } from "@/lib/media/reference-tables";

export const dynamic = "force-dynamic";

/**
 * Resolve human-readable labels for media usage locations.
 *
 * Maps source_table + source_record_id to labels like:
 * - "Home → Hero"
 * - "Gallery"
 * - "Restaurant → Menu"
 * - "Services"
 *
 * @param usageByAsset - Map of media_asset_id -> usage records
 * @param supabase - Supabase client
 * @returns Map of media_asset_id -> array of label strings
 */
async function resolveUsageLabels(
  usageByAsset: Record<string, any[]>,
  supabase: any
): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {};

  // Collect all unique source_record_ids per table
  const tableIds: Record<string, string[]> = {};

  Object.values(usageByAsset).forEach((usages) => {
    usages.forEach((u) => {
      if (!tableIds[u.source_table]) {
        tableIds[u.source_table] = [];
      }
      if (!tableIds[u.source_table].includes(u.source_record_id)) {
        tableIds[u.source_table].push(u.source_record_id);
      }
    });
  });

  // Fetch page info for hero_slides and gallery
  const pageMap: Record<string, { page_key: string; title: string }> = {};
  const heroSlideMap: Record<string, { page_id: string }> = {};
  const galleryMap: Record<string, { page_id: string }> = {};

  // Fetch website_pages
  const { data: pages } = await supabase
    .from("website_pages")
    .select("id, page_key, title")
    .in("id", Object.values(tableIds).flat());

  if (pages) {
    pages.forEach((p: any) => {
      pageMap[p.id] = { page_key: p.page_key, title: p.title };
    });
  }

  // Fetch hero_slides
  if (tableIds["hero_slides"]) {
    const { data: heroSlides } = await supabase
      .from("hero_slides")
      .select("id, page_id")
      .in("id", tableIds["hero_slides"]);

    if (heroSlides) {
      heroSlides.forEach((h: any) => {
        heroSlideMap[h.id] = { page_id: h.page_id };
      });
    }
  }

  // Fetch gallery
  if (tableIds["gallery"]) {
    const { data: galleryItems } = await supabase
      .from("gallery")
      .select("id, page_id")
      .in("id", tableIds["gallery"]);

    if (galleryItems) {
      galleryItems.forEach((g: any) => {
        galleryMap[g.id] = { page_id: g.page_id };
      });
    }
  }

  // Build labels
  Object.entries(usageByAsset).forEach(([assetId, usages]) => {
    const labels: string[] = [];

    usages.forEach((u) => {
      let label = "";

      switch (u.source_table) {
        case "hero_slides": {
          const slide = heroSlideMap[u.source_record_id];
          if (slide) {
            const page = pageMap[slide.page_id];
            label = page ? `${page.page_key.charAt(0).toUpperCase() + page.page_key.slice(1)} → Hero` : "Hero";
          }
          break;
        }
        case "gallery": {
          const item = galleryMap[u.source_record_id];
          if (item) {
            const page = pageMap[item.page_id];
            label = page ? `${page.page_key.charAt(0).toUpperCase() + page.page_key.slice(1)} → Gallery` : "Gallery";
          }
          break;
        }
        case "menu_items": {
          label = "Menu";
          break;
        }
        case "services": {
          label = "Services";
          break;
        }
        case "promotions": {
          label = "Promotions";
          break;
        }
        case "testimonials": {
          label = "Testimonials";
          break;
        }
        case "membership_plans": {
          label = "Memberships";
          break;
        }
        case "business_settings": {
          label = u.source_column === "favicon_media_id" ? "Branding → Favicon" : "Branding → Logo";
          break;
        }
        default: {
          label = u.source_table;
        }
      }

      if (label && !labels.includes(label)) {
        labels.push(label);
      }
    });

    result[assetId] = labels;
  });

  return result;
}

/**
 * GET /api/media
 * 
 * Fetch media assets with usage counts.
 * Admin-only access via withAdminAuth wrapper.
 * 
 * Query params:
 * - summary: if "true", return summary stats only (assets count, usage count, buckets count)
 * - bucket: filter by bucket name
 * - search: search in title, alt_text, path
 * - limit: pagination limit (default 50)
 * - offset: pagination offset (default 0)
 */
export const GET = withAdminAuth(async (req: NextRequest, _ctx, auth) => {
  try {
    const url = new URL(req.url);
    const summary = url.searchParams.get("summary") === "true";

    // Handle summary request
    if (summary) {
      const [assetsResult, usageResult, bucketsResult] = await Promise.all([
        auth.supabase.from("media_assets").select("id", { count: "exact", head: true }),
        auth.supabase.from("media_usage").select("id", { count: "exact", head: true }),
        auth.supabase.from("media_assets").select("bucket"),
      ]);

      const totalAssets = assetsResult.count || 0;
      const totalUsage = usageResult.count || 0;
      const uniqueBuckets = bucketsResult.data
        ? new Set(bucketsResult.data.map((r) => r.bucket)).size
        : 0;

      return NextResponse.json({
        totalAssets,
        totalUsage,
        uniqueBuckets,
      });
    }

        // Handle full list request
    const filter = url.searchParams.get("filter"); // "all", "used", "unused"
    const search = url.searchParams.get("search");
    const bucketFilter = url.searchParams.get("bucket"); // specific bucket name
    const categoryFilter = url.searchParams.get("category"); // category filter (hero, gallery, menu, etc.)
    const altFilter = url.searchParams.get("alt"); // "missing" | "present"
    const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 100);
    const offset = Number(url.searchParams.get("offset")) || 0;

    // Build query for media_assets
    let assetsQuery = auth.supabase
      .from("media_assets")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply search filter (title, alt_text, or path)
    if (search) {
      assetsQuery = assetsQuery.or(
        `title.ilike.%${search}%,alt_text.ilike.%${search}%,path.ilike.%${search}%`
      );
    }

    // Apply bucket filter (server-side, only buckets that actually exist)
    if (bucketFilter) {
      assetsQuery = assetsQuery.eq("bucket", bucketFilter);
    }

    // Apply category filter
    if (categoryFilter) {
      if (categoryFilter === "uncategorized") {
        assetsQuery = assetsQuery.is("category", null);
      } else {
        assetsQuery = assetsQuery.eq("category", categoryFilter);
      }
    }

    // Apply alt_text presence filter (uses existing alt_text column only)
    if (altFilter === "missing") {
      assetsQuery = assetsQuery.or("alt_text.is.null,alt_text.eq.");
    } else if (altFilter === "present") {
      assetsQuery = assetsQuery.not("alt_text", "is", null).not("alt_text", "eq", "");
    }

    const { data: assets, error: assetsError, count } = await assetsQuery;

    if (assetsError) {
      console.error("Error fetching media assets:", assetsError);
      return NextResponse.json(
        { error: "Failed to fetch media assets" },
        { status: 500 }
      );
    }

    // Fetch usage details for all assets.
    //
    // CANONICAL SOURCE: derive usage from the live foreign-key references
    // (content record .media_id -> media_assets.id). The denormalized
    // media_usage table is NOT queried: it is manually maintained, has no
    // writer anywhere in the codebase, and was proven stale (missing
    // hero_slides/promotions/services refs and the entire branding
    // relationship, which made the canonical logo show as "Unused").
    const assetIds = assets?.map((a) => a.id) || [];
    const usageByAsset: Record<string, any[]> = {};

    if (assetIds.length > 0) {
      const inIds = `(${assetIds.join(",")})`; // uuid literals are safe (server-generated)

      // Derive the batch of single-column FK scans from the canonical list.
      // `business_settings` is excluded here because it carries TWO FK columns
      // (logo_media_id, favicon_media_id) on one row; it's queried separately
      // with a single `.or()` below so we don't fetch a customer's id twice.
      const refSources: Array<{ table: string; column: string; select: string }> = MEDIA_REFERENCE_TABLES
        .filter((r) => r.table !== "business_settings")
        .map((r) => ({ table: r.table, column: r.column, select: `id, ${r.column}` }));

      const idOf = new Set(assetIds);
      await Promise.all([
        ...refSources.map(async ({ table, column, select }) => {
          const { data, error } = await auth.supabase.from(table).select(select).in(column, assetIds);
          if (error) {
            console.error(`[media] usage ref query failed for ${table}:`, error.message);
            return;
          }
          for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
            const assetId = String(row[column] ?? "");
            if (!assetId || !idOf.has(assetId)) continue;
            (usageByAsset[assetId] ??= []).push({
              source_table: table,
              source_column: column,
              source_record_id: String(row.id ?? ""),
            });
          }
        }),
        // Branding: business_settings.logo_media_id / favicon_media_id
        (async () => {
          const { data, error } = await auth.supabase
            .from("business_settings")
            .select("id, logo_media_id, favicon_media_id")
            .or(`logo_media_id.in.${inIds},favicon_media_id.in.${inIds}`);
          if (error) {
            console.error("[media] usage ref query failed for business_settings:", error.message);
            return;
          }
          for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
            const logoId = String(row.logo_media_id ?? "");
            const faviconId = String(row.favicon_media_id ?? "");
            if (logoId && idOf.has(logoId)) {
              (usageByAsset[logoId] ??= []).push({
                source_table: "business_settings",
                source_column: "logo_media_id",
                source_record_id: String(row.id ?? ""),
              });
            }
            if (faviconId && idOf.has(faviconId)) {
              (usageByAsset[faviconId] ??= []).push({
                source_table: "business_settings",
                source_column: "favicon_media_id",
                source_record_id: String(row.id ?? ""),
              });
            }
          }
        })(),
      ]);
    }

    // Resolve human-readable labels for usage
    const usageLabels = await resolveUsageLabels(usageByAsset, auth.supabase);

    // Combine assets with usage details
    let assetsWithUsage = assets?.map((asset) => ({
      ...asset,
      usageCount: usageByAsset[asset.id]?.length || 0,
      usageLocations: usageLabels[asset.id] || [],
    }));

    // Apply usage filter
    if (filter === "used") {
      assetsWithUsage = assetsWithUsage?.filter((a) => a.usageCount > 0);
    } else if (filter === "unused") {
      assetsWithUsage = assetsWithUsage?.filter((a) => a.usageCount === 0);
    }

    // Update total count after filtering
    const filteredTotal = assetsWithUsage?.length || 0;

    return NextResponse.json({
      data: assetsWithUsage,
      pagination: {
        limit,
        offset,
        total: filteredTotal,
        hasMore: false, // Client-side filtering, no pagination needed
      },
    });
  } catch (error) {
    console.error("Unexpected error in /api/media:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
