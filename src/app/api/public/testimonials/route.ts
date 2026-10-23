import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/public/testimonials
 *
 * Public, unauthenticated endpoint that serves approved testimonials for the
 * public website (homepage featured section and /reviews page).
 *
 * Query params:
 * - limit: number (default 10, max 100)
 * - offset: number (default 0)
 * - featured_only: boolean (default false) — only is_featured rows
 *
 * The database is snake_case (customer_name / is_featured / created_at);
 * the response is mapped to the camelCase public contract the website
 * components consume. Access runs through the anon key, so Supabase RLS on
 * testimonials is respected — rows the public may not read never appear.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "10", 10) || 10, 100);
    const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);
    const featuredOnly = searchParams.get("featured_only") === "true";

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    let query = supabase
      .from("testimonials")
      .select("*")
      .eq("approved", true);

    if (featuredOnly) {
      query = query.eq("is_featured", true);
    }

    // Random order for featured reviews (homepage rotation)
    const { data, error } = await query
      .order(featuredOnly ? "id" : "created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("[testimonials:public] query error:", error.message);
      return NextResponse.json(
        { error: "Failed to fetch testimonials" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: (data ?? []).map(mapTestimonialRow),
      pagination: {
        limit,
        offset,
        total: (data ?? []).length,
        hasMore: (data ?? []).length === limit,
      },
    });
  } catch (error) {
    console.error("[testimonials:public] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/** snake_case DB row → camelCase public contract. */
function mapTestimonialRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    customerName: row.customer_name ?? "",
    rating: row.rating ?? 5,
    comment: row.comment ?? "",
    isFeatured: row.is_featured ?? false,
    createdAt: row.created_at ?? "",
    source: row.source ?? "manual",
    external_url: row.external_url ?? null,
    author_photo_url: row.author_photo_url ?? null,
  };
}
