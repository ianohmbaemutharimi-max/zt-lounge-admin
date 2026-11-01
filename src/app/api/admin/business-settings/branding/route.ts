import { NextRequest, NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/business-settings/branding
 * 
 * Update branding assets (dark logo, light logo, and favicon media IDs).
 * 
 * Security:
 * - Admin-only via withAdminAuth
 * - Only mutates branding fields (logo_media_id, logo_light_media_id, favicon_media_id)
 * - Validates media asset exists and is an image
 * 
 * Contract:
 * - Request body: { logo_media_id?: string | null, favicon_media_id?: string | null }
 * - Response: Updated business_settings row
 * 
 * Architecture:
 * - Canonical source: business_settings.logo_media_id / logo_light_media_id / favicon_media_id
 * - Referenced table: media_assets.id (FK RESTRICT)
 * - Legacy fields (logo_url, favicon_url) are NOT updated by this endpoint
 */
export const PATCH = withAdminAuth(async (req: NextRequest, auth) => {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "A branding update object is required" }, { status: 400 });
    }

    const allowedFields = new Set(["logo_media_id", "logo_light_media_id", "favicon_media_id"]);
    if (Object.keys(body).some((field) => !allowedFields.has(field))) {
      return NextResponse.json({ error: "Only logo_media_id, logo_light_media_id, and favicon_media_id can be updated" }, { status: 400 });
    }

    const { logo_media_id, logo_light_media_id, favicon_media_id } = body;

    // These branding references are required by the application contract.
    if (logo_media_id === null || favicon_media_id === null) {
      return NextResponse.json({ error: "Logo and favicon references cannot be cleared" }, { status: 400 });
    }

    // Validate at least one field is provided
    if (logo_media_id === undefined && logo_light_media_id === undefined && favicon_media_id === undefined) {
      return NextResponse.json(
        { error: "At least one branding media reference must be provided" },
        { status: 400 }
      );
    }

    // Build update payload
    const updates: Record<string, string | null> = {};

    if (logo_media_id !== undefined) {
      // Validate media asset exists and is an image
      if (logo_media_id !== null) {
        const { data: asset, error: assetError } = await auth.supabase
          .from("media_assets")
          .select("id, mime_type")
          .eq("id", logo_media_id)
          .maybeSingle();

        if (assetError || !asset) {
          return NextResponse.json(
            { error: "Logo media asset not found" },
            { status: 404 }
          );
        }

        if (!asset.mime_type?.startsWith("image/")) {
          return NextResponse.json(
            { error: "Logo media asset must be an image" },
            { status: 400 }
          );
        }
      }

      updates.logo_media_id = logo_media_id;
    }

    if (logo_light_media_id !== undefined) {
      if (logo_light_media_id !== null) {
        const { data: asset, error: assetError } = await auth.supabase
          .from("media_assets")
          .select("id, mime_type")
          .eq("id", logo_light_media_id)
          .maybeSingle();

        if (assetError || !asset) {
          return NextResponse.json({ error: "Light logo media asset not found" }, { status: 404 });
        }
        if (!asset.mime_type?.startsWith("image/")) {
          return NextResponse.json({ error: "Light logo media asset must be an image" }, { status: 400 });
        }
      }
      updates.logo_light_media_id = logo_light_media_id;
    }

    if (favicon_media_id !== undefined) {
      // Validate media asset exists and is an image
      if (favicon_media_id !== null) {
        const { data: asset, error: assetError } = await auth.supabase
          .from("media_assets")
          .select("id, mime_type")
          .eq("id", favicon_media_id)
          .maybeSingle();

        if (assetError || !asset) {
          return NextResponse.json(
            { error: "Favicon media asset not found" },
            { status: 404 }
          );
        }

        if (!asset.mime_type?.startsWith("image/")) {
          return NextResponse.json(
            { error: "Favicon media asset must be an image" },
            { status: 400 }
          );
        }
      }

      updates.favicon_media_id = favicon_media_id;
    }

    // Get business_settings ID
    const { data: settings, error: fetchError } = await auth.supabase
      .from("business_settings")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (fetchError || !settings) {
      return NextResponse.json(
        { error: "Business settings not found" },
        { status: 404 }
      );
    }

    // Update branding fields
    const { data: updated, error: updateError } = await auth.supabase
      .from("business_settings")
      .update(updates)
      .eq("id", settings.id)
      .select()
      .single();

    if (updateError) {
      console.error("[branding] Update failed:", updateError);
      return NextResponse.json(
        { error: "Failed to update branding" },
        { status: 500 }
      );
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[branding] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
