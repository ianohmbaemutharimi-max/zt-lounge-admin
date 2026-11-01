/**
 * Replace one media asset without changing its stable media ID.
 *
 * The replacement stays in the asset's existing content role. The old object
 * is removed only when no other media_assets row points at its public URL.
 * Storage identity is parsed from public_url because the live media_assets
 * table does not contain bucket/path columns.
 */
import { NextRequest, NextResponse } from "next/server";
import { withSuperAdminAuth } from "@/lib/auth/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  extractCategoryFromPath,
  generateStoragePath,
  parsePublicStorageUrl,
  FAVICONS_BUCKET,
  PUBLIC_ASSETS_BUCKET,
  type ImageCategory,
} from "@/lib/storage/paths";
import { processImage, MAX_FILE_SIZE } from "@/lib/images/processor";
import { validateRecordId } from "@/lib/validation/admin";

export const runtime = "nodejs";

const CATEGORY_BY_MEDIA_TYPE: Record<string, ImageCategory> = {
  hero: "hero",
  gallery: "gallery",
  menu: "menu",
  service: "services",
  testimonial: "testimonials",
  branding: "branding",
  promotion: "promotions",
  seo: "seo",
  feature: "feature",
};

export const PUT = withSuperAdminAuth(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    let supabaseAdmin: Awaited<ReturnType<typeof getSupabaseAdmin>> | null = null;
    let uploadedBucket: string | null = null;
    let uploadedPath: string | null = null;
    let databaseUpdated = false;

    try {
      const { id } = await ctx.params;
      if (!validateRecordId(id)) {
        return NextResponse.json({ success: false, error: "Invalid media asset ID format" }, { status: 400 });
      }

      const formData = await req.formData();
      const file = formData.get("file");
      const deleteOld = formData.get("deleteOld") === "true";
      if (!file || !(file instanceof File)) {
        return NextResponse.json({ success: false, error: "File is required" }, { status: 400 });
      }
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ success: false, error: "File exceeds the 10 MB limit" }, { status: 413 });
      }

      supabaseAdmin = await getSupabaseAdmin();
      const { data: existing, error: loadError } = await supabaseAdmin
        .from("media_assets")
        .select("id, public_url, content_hash, media_type, file_name")
        .eq("id", id)
        .single();

      if (loadError || !existing) {
        return NextResponse.json({ success: false, error: "Media asset not found" }, { status: 404 });
      }

      const oldLocation = parsePublicStorageUrl(existing.public_url);
      const pathCategory = oldLocation ? extractCategoryFromPath(oldLocation.path) : null;
      const typeCategory = CATEGORY_BY_MEDIA_TYPE[String(existing.media_type ?? "")];

      if (pathCategory && typeCategory && pathCategory !== typeCategory) {
        return NextResponse.json({
          success: false,
          error: "The stored path category conflicts with this asset's media type. Upload a new asset in the correct role and relink it instead of replacing this record.",
        }, { status: 409 });
      }

      const category = pathCategory ?? typeCategory;

      if (!category) {
        return NextResponse.json({
          success: false,
          error: "This legacy asset has no reliable role mapping. Upload a new asset in the correct category and relink it instead of replacing it.",
        }, { status: 409 });
      }

      const fileBuffer = Buffer.from(await file.arrayBuffer());
      let processed;
      try {
        processed = await processImage(fileBuffer, file.type, file.name, category);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Image processing failed";
        const formatError = message.toLowerCase().includes("format") || message.toLowerCase().includes("corrupt");
        return NextResponse.json({ success: false, error: message }, { status: formatError ? 415 : 400 });
      }

      const isIco = processed.format === "ico";
      uploadedBucket = isIco ? FAVICONS_BUCKET : PUBLIC_ASSETS_BUCKET;
      uploadedPath = generateStoragePath(category, isIco ? "ico" : "webp");

      const { error: uploadError } = await supabaseAdmin.storage
        .from(uploadedBucket)
        .upload(uploadedPath, processed.buffer, {
          contentType: isIco ? "image/x-icon" : "image/webp",
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        console.error("[MEDIA_REPLACE] Storage upload failed:", uploadError.message);
        return NextResponse.json({ success: false, error: "Failed to upload replacement image" }, { status: 500 });
      }

      const { data: publicUrlData } = supabaseAdmin.storage
        .from(uploadedBucket)
        .getPublicUrl(uploadedPath);

      const { error: updateError } = await supabaseAdmin
        .from("media_assets")
        .update({
          public_url: publicUrlData.publicUrl,
          file_name: file.name,
          mime_type: isIco ? "image/x-icon" : "image/webp",
          file_size: processed.size,
          content_hash: processed.contentHash,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (updateError) {
        const { error: cleanupError } = await supabaseAdmin.storage.from(uploadedBucket).remove([uploadedPath]);
        if (cleanupError) console.error("[MEDIA_REPLACE] New object cleanup failed:", cleanupError.message);
        uploadedPath = null;
        return NextResponse.json({ success: false, error: "Failed to update media asset record" }, { status: 500 });
      }

      databaseUpdated = true;

      // Old objects are shared by some existing role-specific registry rows.
      // Never remove an object while another media_assets row still points to it.
      if (deleteOld && oldLocation && existing.public_url !== publicUrlData.publicUrl) {
        const { data: otherAssets, error: referenceError } = await supabaseAdmin
          .from("media_assets")
          .select("id")
          .eq("public_url", existing.public_url)
          .neq("id", id)
          .limit(1);

        if (referenceError) {
          console.error("[MEDIA_REPLACE] Old-object reference check failed; retained old object:", referenceError.message);
        } else if (!otherAssets?.length) {
          const { error: removeError } = await supabaseAdmin.storage
            .from(oldLocation.bucket)
            .remove([oldLocation.path]);
          if (removeError) console.error("[MEDIA_REPLACE] Old-object cleanup failed:", removeError.message);
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          id,
          bucket: uploadedBucket,
          path: uploadedPath,
          relativePath: uploadedPath,
          publicUrl: publicUrlData.publicUrl,
          originalName: file.name,
          mimeType: isIco ? "image/x-icon" : "image/webp",
          fileSize: processed.size,
          contentHash: processed.contentHash,
        },
      });
    } catch (error) {
      if (!databaseUpdated && supabaseAdmin && uploadedBucket && uploadedPath) {
        const { error: cleanupError } = await supabaseAdmin.storage.from(uploadedBucket).remove([uploadedPath]);
        if (cleanupError) console.error("[MEDIA_REPLACE] Error cleanup failed:", cleanupError.message);
      }
      console.error("[MEDIA_REPLACE] Unexpected error:", error);
      return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
  },
);
