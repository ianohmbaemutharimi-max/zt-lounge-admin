import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/public/promotions
 * Public, unauthenticated endpoint that serves active promotions
 * for display on the public website.
 *
 * Query params:
 * - limit: number of promotions to return (default: 3)
 * - on_homepage: true to only return promotions marked for homepage display
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "3");
    const onHomepage = searchParams.get("on_homepage") === "true";

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const now = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

    let query = supabase
      .from("promotions")
      .select("id, title, description, media_id, discount_percent, start_date, end_date, display_order")
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .limit(limit);

    // Filter by date range: active promotions are those where today is between start_date and end_date
    // Using lte/gte to handle NULL dates gracefully
    query = query.or(`start_date.is.null,start_date.lte.${now}`);
    query = query.or(`end_date.is.null,end_date.gte.${now}`);

    if (onHomepage) {
      query = query.eq("show_on_homepage", true);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[promotions:public] query error:", error.message);
      return NextResponse.json({ data: [] });
    }

    // Map to camelCase public contract
    const promotions = (data || []).map((row: any) => ({
      id: row.id,
      title: row.title,
      description: row.description || "",
      discountPercent: row.discount_percent ? parseFloat(row.discount_percent) : 0,
      startDate: row.start_date,
      endDate: row.end_date,
      mediaId: row.media_id,
      imageUrl: row.media_id
        ? `https://${process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF || 'jczwilrysvnhcjzjztbi'}.supabase.co/storage/v1/object/public/media/${row.media_id}`
        : "",
      displayOrder: row.display_order || 0,
    }));

    return NextResponse.json({ data: promotions });
  } catch (error) {
    console.error("[promotions:public] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
