import { NextRequest, NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/auth/server";
import { MEDIA_REFERENCE_TABLES } from "@/lib/media/reference-tables";

export const dynamic = "force-dynamic";

type UsageRecord = {
  source_table: string;
  source_column: string;
  source_record_id: string;
};

type UsageMap = Record<string, UsageRecord[]>;

function addUsage(usageByAsset: UsageMap, assetId: string, usage: UsageRecord) {
  (usageByAsset[assetId] ??= []).push(usage);
}

/**
 * Read every verified media reference. A failed reference query rejects the
 * whole request; an incomplete scan must never make an asset appear unused.
 */
async function scanMediaUsage(supabase: any, assetIds: string[]): Promise<UsageMap> {
  const usageByAsset: UsageMap = {};
  if (!assetIds.length) return usageByAsset;

  const idSet = new Set(assetIds);
  const sources = MEDIA_REFERENCE_TABLES.filter((ref) => ref.table !== "business_settings");

  await Promise.all([
    ...sources.map(async ({ table, column }) => {
      const { data, error } = await supabase
        .from(table)
        .select(`id, ${column}`)
        .in(column, assetIds);

      if (error) {
        console.error(`[media] usage reference query failed for ${table}.${column}:`, error.message);
        throw new Error(`Could not verify media usage for ${table}.${column}`);
      }

      for (const row of (data ?? []) as Array<Record<string, unknown>>) {
        const assetId = String(row[column] ?? "");
        if (!assetId || !idSet.has(assetId)) continue;
        addUsage(usageByAsset, assetId, {
          source_table: table,
          source_column: column,
          source_record_id: String(row.id ?? ""),
        });
      }
    }),
    (async () => {
      const { data, error } = await supabase
        .from("business_settings")
        .select("id, logo_media_id, favicon_media_id")
        .or(`logo_media_id.in.(${assetIds.join(",")}),favicon_media_id.in.(${assetIds.join(",")})`);

      if (error) {
        console.error("[media] usage reference query failed for business_settings:", error.message);
        throw new Error("Could not verify media usage for business settings");
      }

      for (const row of (data ?? []) as Array<Record<string, unknown>>) {
        const rowId = String(row.id ?? "");
        for (const column of ["logo_media_id", "favicon_media_id"] as const) {
          const assetId = String(row[column] ?? "");
          if (assetId && idSet.has(assetId)) {
            addUsage(usageByAsset, assetId, {
              source_table: "business_settings",
              source_column: column,
              source_record_id: rowId,
            });
          }
        }
      }
    })(),
  ]);

  return usageByAsset;
}

function humanTableLabel(table: string, column: string): string {
  if (table === "business_settings") {
    return column === "favicon_media_id" ? "Branding → Favicon" : "Branding → Logo";
  }
  const labels: Record<string, string> = {
    hero_slides: "Hero",
    gallery: "Gallery",
    menu_items: "Menu",
    services: "Services",
    promotions: "Promotions",
    testimonials: "Testimonials",
    branding_assets: "Branding",
    page_features: "Page features",
    page_seo: "SEO image",
  };
  return labels[table] ?? table.replaceAll("_", " ");
}

async function resolveUsageLabels(
  usageByAsset: UsageMap,
  supabase: any,
): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {};
  const idsByTable: Record<string, string[]> = {};

  for (const usages of Object.values(usageByAsset)) {
    for (const usage of usages) {
      (idsByTable[usage.source_table] ??= []).push(usage.source_record_id);
    }
  }

  const pageNames = new Map<string, string>();
  const pagesResult = await supabase.from("website_pages").select("id, name, slug");
  if (pagesResult.error) {
    console.error("[media] page-label lookup failed:", pagesResult.error.message);
    throw new Error("Could not resolve media usage labels");
  }
  for (const page of (pagesResult.data ?? []) as Array<{ id: string; name: string; slug: string }>) {
    pageNames.set(page.id, page.name);
    pageNames.set(page.slug, page.name);
  }

  const pageIdsByRecord: Record<string, Record<string, string>> = {};
  for (const table of ["hero_slides", "gallery"]) {
    const recordIds = [...new Set(idsByTable[table] ?? [])];
    if (!recordIds.length) continue;
    const { data, error } = await supabase.from(table).select("id, page_id").in("id", recordIds);
    if (error) {
      console.error(`[media] ${table} label lookup failed:`, error.message);
      throw new Error("Could not resolve media usage labels");
    }
    pageIdsByRecord[table] = {};
    for (const row of (data ?? []) as Array<{ id: string; page_id: string | null }>) {
      if (row.page_id) pageIdsByRecord[table][row.id] = row.page_id;
    }
  }

  for (const [assetId, usages] of Object.entries(usageByAsset)) {
    const labels = new Set<string>();
    for (const usage of usages) {
      const base = humanTableLabel(usage.source_table, usage.source_column);
      const pageId = pageIdsByRecord[usage.source_table]?.[usage.source_record_id];
      const pageName = pageId ? pageNames.get(pageId) : undefined;
      labels.add(pageName && ["hero_slides", "gallery"].includes(usage.source_table)
        ? `${pageName} → ${base}`
        : base);
    }
    result[assetId] = [...labels];
  }
  return result;
}

async function getUsageSummary(supabase: any): Promise<number> {
  const columns = MEDIA_REFERENCE_TABLES.map(({ table, column }) => ({ table, column }));
  const counts = await Promise.all(columns.map(async ({ table, column }) => {
    const { count, error } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .not(column, "is", null);
    if (error) {
      console.error(`[media] usage summary failed for ${table}.${column}:`, error.message);
      throw new Error("Could not calculate media usage summary");
    }
    return count ?? 0;
  }));
  return counts.reduce((sum, count) => sum + count, 0);
}

export const GET = withAdminAuth(async (req: NextRequest, _ctx, auth) => {
  try {
    const url = new URL(req.url);
    const summary = url.searchParams.get("summary") === "true";

    if (summary) {
      const [{ count: totalAssets, error: assetsError }, totalUsage] = await Promise.all([
        auth.supabase.from("media_assets").select("id", { count: "exact", head: true }),
        getUsageSummary(auth.supabase),
      ]);
      if (assetsError) throw new Error("Could not count media assets");
      const { count: mediaTypesCount, error: typesError } = await auth.supabase
        .from("media_assets")
        .select("media_type", { count: "exact", head: true });
      if (typesError) throw new Error("Could not summarize media types");

      return NextResponse.json({
        totalAssets: totalAssets ?? 0,
        totalUsage,
        totalMediaAssets: mediaTypesCount ?? 0,
      });
    }

    const filter = url.searchParams.get("filter") ?? "all";
    const search = url.searchParams.get("search")?.trim() ?? "";
    const categoryFilter = url.searchParams.get("category");
    const altFilter = url.searchParams.get("alt");
    const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 50, 100));
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

    // Usage filters are applied before pagination. The current registry is small,
    // and this avoids returning a misleading page/total for used/unused assets.
    let assetsQuery = auth.supabase
      .from("media_assets")
      .select("id, content_hash, public_url, file_size, mime_type, created_at, updated_at, created_by, updated_by, file_name, alt_text, media_type, display_id, page_id", { count: "exact" })
      .order("created_at", { ascending: false });

    if (search) {
      const safeSearch = search.replace(/[,%()]/g, " ").trim();
      if (safeSearch) {
        assetsQuery = assetsQuery.or(
          `file_name.ilike.%${safeSearch}%,alt_text.ilike.%${safeSearch}%,public_url.ilike.%${safeSearch}%`
        );
      }
    }

    if (categoryFilter) {
      assetsQuery = categoryFilter === "uncategorized"
        ? assetsQuery.is("media_type", null)
        : assetsQuery.eq("media_type", categoryFilter);
    }

    if (altFilter === "missing") {
      assetsQuery = assetsQuery.or("alt_text.is.null,alt_text.eq.");
    } else if (altFilter === "present") {
      assetsQuery = assetsQuery.not("alt_text", "is", null).not("alt_text", "eq", "");
    }

    const { data: assets, error: assetsError, count } = await assetsQuery;
    if (assetsError) {
      console.error("[media] asset query failed:", assetsError.message);
      return NextResponse.json({ error: "Failed to fetch media assets" }, { status: 500 });
    }

    const assetRows = assets ?? [];
    const usageByAsset = await scanMediaUsage(auth.supabase, assetRows.map((asset: { id: string }) => asset.id));
    const usageLabels = await resolveUsageLabels(usageByAsset, auth.supabase);

    let assetsWithUsage = assetRows.map((asset: Record<string, any>) => ({
      ...asset,
      usageCount: usageByAsset[asset.id]?.length ?? 0,
      usageLocations: usageLabels[asset.id] ?? [],
    }));

    if (filter === "used") assetsWithUsage = assetsWithUsage.filter((asset: { usageCount: number }) => asset.usageCount > 0);
    if (filter === "unused") assetsWithUsage = assetsWithUsage.filter((asset: { usageCount: number }) => asset.usageCount === 0);

    const filteredTotal = assetsWithUsage.length;
    const page = assetsWithUsage.slice(offset, offset + limit);

    // Never expose content_hash in the Media Library response.
    const safePage = page.map(({ content_hash: _contentHash, ...asset }: Record<string, any>) => asset);

    return NextResponse.json({
      data: safePage,
      pagination: {
        limit,
        offset,
        total: filteredTotal,
        hasMore: offset + safePage.length < filteredTotal,
      },
    });
  } catch (error) {
    console.error("[media] GET failed:", error);
    return NextResponse.json(
      { error: "Unable to verify media data. Please retry; no assets were marked unused." },
      { status: 500 },
    );
  }
});
