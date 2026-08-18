import { NextRequest, NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

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
    const bucket = url.searchParams.get("bucket");
    const search = url.searchParams.get("search");
    const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 100);
    const offset = Number(url.searchParams.get("offset")) || 0;

    // Build query for media_assets
    let assetsQuery = auth.supabase
      .from("media_assets")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // Apply bucket filter
    if (bucket) {
      assetsQuery = assetsQuery.eq("bucket", bucket);
    }

    // Apply search filter (title, alt_text, or path)
    if (search) {
      assetsQuery = assetsQuery.or(
        `title.ilike.%${search}%,alt_text.ilike.%${search}%,path.ilike.%${search}%`
      );
    }

    const { data: assets, error: assetsError, count } = await assetsQuery;

    if (assetsError) {
      console.error("Error fetching media assets:", assetsError);
      return NextResponse.json(
        { error: "Failed to fetch media assets" },
        { status: 500 }
      );
    }

    // Fetch usage counts for all assets in one query
    const assetIds = assets?.map((a) => a.id) || [];
    let usageCounts: Record<string, number> = {};

    if (assetIds.length > 0) {
      const { data: usageData, error: usageError } = await auth.supabase
        .from("media_usage")
        .select("media_asset_id")
        .in("media_asset_id", assetIds);

      if (usageError) {
        console.error("Error fetching usage counts:", usageError);
        // Non-fatal: continue without usage counts
      } else {
        // Count occurrences
        usageData?.forEach((u) => {
          usageCounts[u.media_asset_id] = (usageCounts[u.media_asset_id] || 0) + 1;
        });
      }
    }

    // Combine assets with usage counts
    const assetsWithUsage = assets?.map((asset) => ({
      ...asset,
      usageCount: usageCounts[asset.id] || 0,
    }));

    return NextResponse.json({
      data: assetsWithUsage,
      pagination: {
        limit,
        offset,
        total: count || 0,
        hasMore: (offset + limit) < (count || 0),
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
