import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/public/hero_slides
 *
 * Public, unauthenticated endpoint that serves active hero slides for the
 * public homepage hero section.
 *
 * Query params:
 *   - limit: number (default 1, max 10)
 *   - page_id: string (filter slides by website page)
 *   - is_active: boolean (default true — only active slides returned)
 *
 * The database is snake_case (page_id / alt_text / href / display_order / is_active);
 * the response is mapped to the camelCase public contract the website
 * components consume. Access runs through the anon key, so Supabase RLS on
 * hero_slides is respected — rows the public may not read never appear.
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(
      parseInt(searchParams.get("limit") ?? "1", 10) || 1,
      10
    );
    const offset = Math.max(
      parseInt(searchParams.get("offset") ?? "0", 10) || 0,
      0
    );
    const pageId = searchParams.get("page_id") ?? null;
    const isActive = searchParams.get("is_active") === "true";

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    let query = supabase.from("hero_slides").select("*").eq("is_active", true);

    if (pageId) {
      query = query.eq("page_id", pageId);
    }

    const { data, error } = await query
      .order("display_order", { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("[hero_slides:public] query error:", error.message);
      return NextResponse.json(
        { error: "Failed to fetch hero slides" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: (data ?? []).map(mapHeroSlideRow),
      pagination: {
        limit,
        offset,
        total: (data ?? []).length,
      },
    });
  } catch (error) {
    console.error("[hero_slides:public] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/** snake_case DB row → camelCase public contract. */
function mapHeroSlideRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    pageId: row.page_id ?? null,
    mediaId: row.media_id ?? null,
    altText: row.alt_text ?? "",
    href: row.href ?? "",
    displayOrder: Number(row.display_order ?? 0),
    isFeatured: Boolean(row.is_featured ?? false),
    createdAt: row.created_at ?? null,
  };
}
