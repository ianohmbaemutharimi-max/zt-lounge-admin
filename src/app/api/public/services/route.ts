import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/public/services
 * Public, unauthenticated endpoint that serves active services
 * for display on the public website.
 *
 * Query params:
 * - limit: number of services to return (default: 6)
 * - featured: true to only return featured services
 * - type: filter by service type (service|experience|feature)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "6");
    const featuredOnly = searchParams.get("featured") === "true";
    const type = searchParams.get("type");

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    let query = supabase
      .from("services")
      .select("id, name, slug, description, price, media_id, alt_text, type, featured, display_order")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("display_order", { ascending: true })
      .limit(limit);

    if (featuredOnly) {
      query = query.eq("featured", true);
    }

    if (type) {
      query = query.eq("type", type);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[services:public] query error:", error.message);
      return NextResponse.json({ data: [] });
    }

    // Map to camelCase public contract
    const services = (data || []).map((row: any) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description || "",
      price: row.price ? parseFloat(row.price) : 0,
      mediaId: row.media_id,
      imageUrl: row.media_id
        ? `https://${process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF || 'jczwilrysvnhcjzjztbi'}.supabase.co/storage/v1/object/public/media/${row.media_id}`
        : "",
      altText: row.alt_text || "",
      type: row.type || "service",
      featured: row.featured || false,
      displayOrder: row.display_order || 0,
    }));

    return NextResponse.json({ data: services });
  } catch (error) {
    console.error("[services:public] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
