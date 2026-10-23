import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/public/branding
 * Public, unauthenticated endpoint that serves business branding info
 * from the business_settings table for the public website.
 *
 * The database is snake_case (business_name / logo_media_id / favicon_media_id);
 * the response is mapped to the camelCase public contract the website components consume.
 * Access runs through the anon key, so Supabase RLS on business_settings is respected.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data, error } = await supabase
      .from("business_settings")
      .select("*")
      .single();

    if (error) {
      console.error("[branding:public] query error:", error.message);
      // Return defaults if no branding config exists
      return NextResponse.json({
        businessName: "ZT Lounge",
        logoUrl: "",
        faviconUrl: "",
      });
    }

    // Map logo media ID to public URL if present
    let logoUrl = "";
    let faviconUrl = "";

    if (data?.logo_media_id) {
      logoUrl = `https://${process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF || 'jczwilrysvnhcjzjztbi'}.supabase.co/storage/v1/object/public/media/${data.logo_media_id}`;
    }

    if (data?.favicon_media_id) {
      faviconUrl = `https://${process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF || 'jczwilrysvnhcjzjztbi'}.supabase.co/storage/v1/object/public/media/${data.favicon_media_id}`;
    }

    return NextResponse.json({
      businessName: data?.business_name ?? "ZT Lounge",
      city: data?.city ?? "Meru",
      logoUrl,
      faviconUrl,
      address: data?.address,
      phone: data?.phone,
      email: data?.email,
      whatsapp: data?.whatsapp,
      facebook: data?.facebook,
      instagram: data?.instagram,
      googleMapsUrl: data?.google_maps_url,
    });
  } catch (error) {
    console.error("[branding:public] error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}