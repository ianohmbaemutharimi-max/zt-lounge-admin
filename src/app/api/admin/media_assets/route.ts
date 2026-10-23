import { NextRequest, NextResponse } from "next/server";
import { withSuperAdminAuth } from "@/lib/auth/server";
import { z } from "zod";

/**
 * POST /api/admin/media_assets
 * 
 * Register an existing Supabase Storage object as a media_assets record.
 * 
 * This is the Loop 11 "migration inventory" endpoint: it creates a media_assets
 * row for a Storage object that already exists (e.g. legacy public-assets/images/*)
 * but has no corresponding media_assets record.
 * 
 * Security:
 * - super_admin only
 * - Validates bucket + path exist in Storage
 * - Does NOT upload a new file
 * - Uses existing schema (no new columns)
 * 
 * Body:
 * {
 *   bucket: string (e.g. "public-assets")
 *   path: string (e.g. "images/conference/conference-hall.webp")
 *   original_name?: string
 *   title?: string
 *   alt_text?: string
 *   description?: string
 * }
 */

const RegisterSchema = z.object({
  bucket: z.string().min(1),
  path: z.string().min(1),
  original_name: z.string().optional(),
  title: z.string().optional(),
  alt_text: z.string().optional(),
  description: z.string().optional(),
});

export const POST = withSuperAdminAuth(
  async (req: NextRequest, ctx: Record<string, any>, auth) => {
    try {
      // Authorization: super_admin only (enforced by withSuperAdminAuth wrapper)

      const body = await req.json();
      const validation = RegisterSchema.safeParse(body);

      if (!validation.success) {
        return NextResponse.json(
          { error: "Invalid input", details: validation.error.issues },
          { status: 400 }
        );
      }

      const { bucket, path, original_name, title, alt_text, description } =
        validation.data;

      // Use the auth.supabase client (authenticated with user session)
      // For Storage operations, this is safe because we're only reading/listing
      const supabase = auth.supabase;

      // Verify Storage object exists
      const { data: fileData, error: fileError } = await supabase.storage
        .from(bucket)
        .list(path.includes("/") ? path.split("/").slice(0, -1).join("/") : "", {
          search: path.split("/").pop(),
        });

      if (fileError || !fileData || fileData.length === 0) {
        return NextResponse.json(
          {
            error: `Storage object not found: ${bucket}/${path}`,
            hint: "Ensure the file exists in Supabase Storage before registering it.",
          },
          { status: 404 }
        );
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(path);

      if (!urlData?.publicUrl) {
        return NextResponse.json(
          { error: "Failed to generate public URL" },
          { status: 500 }
        );
      }

      // Check for existing media_assets record with same bucket + path
      const { data: existing, error: existingError } = await supabase
        .from("media_assets")
        .select("id")
        .eq("bucket", bucket)
        .eq("path", path)
        .maybeSingle();

      if (existingError) {
        console.error("Check existing media_assets failed:", existingError);
        return NextResponse.json(
          { error: "Failed to check for existing asset" },
          { status: 500 }
        );
      }

      if (existing) {
        return NextResponse.json(
          {
            error: "Media asset already registered",
            media_id: existing.id,
            hint: "A media_assets record already exists for this Storage object.",
          },
          { status: 409 }
        );
      }

      // Insert media_assets record
      const { data: newAsset, error: insertError } = await supabase
        .from("media_assets")
        .insert({
          bucket,
          path,
          public_url: urlData.publicUrl,
          original_name: original_name || path.split("/").pop() || "unknown",
          title: title || null,
          alt_text: alt_text || null,
          description: description || null,
          uploaded_by: auth.user.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) {
        console.error("Insert media_assets failed:", insertError);
        return NextResponse.json(
          { error: "Failed to register media asset" },
          { status: 500 }
        );
      }

      // Type guard: Ensure newAsset is not null
      if (!newAsset) {
        return NextResponse.json(
          { error: "Failed to register media asset" },
          { status: 500 }
        );
      }

      return NextResponse.json(
        {
          success: true,
          data: {
            id: newAsset.id,
            bucket: newAsset.bucket,
            path: newAsset.path,
            public_url: newAsset.public_url,
            original_name: newAsset.original_name,
            title: newAsset.title,
            alt_text: newAsset.alt_text,
            description: newAsset.description,
            created_at: newAsset.created_at,
          },
          message: "Media asset registered successfully",
        },
        { status: 201 }
      );
    } catch (error) {
      console.error("Register media asset error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);

export const OPTIONS = async () => {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
};
