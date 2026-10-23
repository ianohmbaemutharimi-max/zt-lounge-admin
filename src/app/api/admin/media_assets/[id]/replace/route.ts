/**
 * Media Asset File Replace API
 *
 * PUT /api/admin/media_assets/[id]/replace
 *
 * Replaces the FILE behind an existing media_assets row while preserving the
 * row's id — every content row that references this asset via media_id keeps
 * resolving to the new image with no data migration (fix loop 1, UI-02).
 *
 * Mirrors the POST /api/admin/upload pipeline (same Sharp processing, same
 * bucket/path conventions, same service-role storage client) and the sibling
 * [id]/route.ts auth/validation pattern (withSuperAdminAuth).
 *
 * Request body (multipart/form-data):
 * - file: Image file (JPEG, PNG, or WebP; max 10MB)
 * - category: Image category for the new object path (hero|gallery|menu|services|testimonials|branding)
 * - deleteOld: "true" to remove the previous storage object after success
 *
 * Response (200): { success: true, data: { id, bucket, path, relativePath, publicUrl, ... } }
 * (same shape as POST /api/admin/upload so the client contract stays uniform)
 *
 * Safety contract:
 * - The media_assets row is UPDATED IN PLACE (id, uploaded_by, alt_text/title/
 *   description preserved) — no new asset is created and no media_id
 *   relationship changes.
 * - Order of operations: upload new object -> update row -> delete old object.
 *   A row-update failure removes the new object, leaving the old asset intact.
 * - A delete-old failure is logged but non-fatal (the row already points at
 *   the new object, so the orphaned old file has no dangling reference).
 */

import { NextRequest, NextResponse } from "next/server";
import { withSuperAdminAuth } from "@/lib/auth/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  sanitizeCategory,
  generateStoragePath,
  PUBLIC_ASSETS_BUCKET,
  type ImageCategory
} from "@/lib/storage/paths";
import { processImage, MAX_FILE_SIZE } from "@/lib/images/processor";
import { validateRecordId } from "@/lib/validation/admin";

/**
 * CRITICAL: Sharp requires Node.js runtime (not Edge) — same as upload.
 */
export const runtime = "nodejs";

export const PUT = withSuperAdminAuth(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await ctx.params;

      if (!validateRecordId(id)) {
        return NextResponse.json(
          { success: false, error: "Invalid media asset ID format" },
          { status: 400 }
        );
      }

      // 1. Parse multipart form data (same contract as upload)
      const formData = await req.formData();
      const file = formData.get("file");
      const categoryRaw = formData.get("category");
      const deleteOld = formData.get("deleteOld") === "true";

      if (!file || !(file instanceof File)) {
        return NextResponse.json(
          { success: false, error: "File is required" },
          { status: 400 }
        );
      }
      if (!categoryRaw) {
        return NextResponse.json(
          { success: false, error: "Category is required" },
          { status: 400 }
        );
      }

      // 2. Validate and sanitize category
      let category: ImageCategory;
      try {
        category = sanitizeCategory(categoryRaw);
      } catch (error) {
        return NextResponse.json(
          { success: false, error: error instanceof Error ? error.message : "Invalid category" },
          { status: 400 }
        );
      }

      // 3. Validate file size (before expensive processing)
      if (file.size > MAX_FILE_SIZE) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
        const maxMB = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(0);
        return NextResponse.json(
          { success: false, error: `File too large: ${sizeMB} MB. Maximum: ${maxMB} MB` },
          { status: 413 }
        );
      }

      const supabaseAdmin = await getSupabaseAdmin();

      // 4. Load the existing asset (service role: bypass RLS, same as upload insert)
      const { data: existing, error: loadError } = await supabaseAdmin
        .from("media_assets")
        .select("id, bucket, path, content_hash")
        .eq("id", id)
        .single();

      if (loadError || !existing) {
        return NextResponse.json(
          { success: false, error: "Media asset not found" },
          { status: 404 }
        );
      }

      // 5. Process image with Sharp (identical pipeline to upload)
      const fileBuffer = Buffer.from(await file.arrayBuffer());
      const originalName = file.name;
      const declaredMimeType = file.type;

      let processed;
      try {
        processed = await processImage(fileBuffer, declaredMimeType, originalName, category);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Image processing failed";
        const isFormatError = message.includes("format") || message.includes("corrupted");
        return NextResponse.json(
          { success: false, error: message },
          { status: isFormatError ? 415 : 400 }
        );
      }

      // 6. Duplicate detection mirrors upload: reject replacing with a file
      // identical to a DIFFERENT asset (replacing with the same image is fine).
      if (processed.contentHash !== existing.content_hash) {
        const { data: dupes, error: dupesError } = await supabaseAdmin
          .from("media_assets")
          .select("id, title, original_name")
          .eq("content_hash", processed.contentHash)
          .neq("id", id)
          .limit(1);

        if (!dupesError && dupes && dupes.length > 0) {
          return NextResponse.json(
            {
              success: false,
              error: "An identical image already exists in the Media Library. " +
                "Select it from the library instead of replacing this asset with a duplicate.",
              existingMediaId: dupes[0].id,
              code: "DUPLICATE_MEDIA",
            },
            { status: 409 }
          );
        }
      }

      // 7. Upload NEW object first (row still points at the old one)
      const storagePath = generateStoragePath(category);
      const { error: uploadError } = await supabaseAdmin.storage
        .from(PUBLIC_ASSETS_BUCKET)
        .upload(storagePath, processed.buffer, {
          contentType: "image/webp",
          cacheControl: "3600",
          upsert: false, // Never overwrite existing files
        });

      if (uploadError) {
        console.error("[REPLACE] Storage upload failed:", {
          path: storagePath,
          error: uploadError.message,
        });
        return NextResponse.json(
          { success: false, error: "Failed to upload file to storage" },
          { status: 500 }
        );
      }

      const { data: { publicUrl } } = supabaseAdmin.storage
        .from(PUBLIC_ASSETS_BUCKET)
        .getPublicUrl(storagePath);

      // 8. Update the EXISTING row in place — media_id references stay valid.
      //    Only file-derived fields change; id/uploaded_by/alt_text/title/
      //    description/created_at are preserved.
      const { error: dbError } = await supabaseAdmin
        .from("media_assets")
        .update({
          bucket: PUBLIC_ASSETS_BUCKET,
          path: storagePath,
          public_url: publicUrl,
          original_name: originalName,
          mime_type: declaredMimeType,
          file_size: processed.size,
          width: processed.width,
          height: processed.height,
          content_hash: processed.contentHash,
        })
        .eq("id", id);

      if (dbError) {
        // Row update failed: remove the NEW object, keep the old asset intact.
        console.error("[REPLACE] Row update failed, cleaning up new object:", {
          path: storagePath,
          error: dbError.message,
        });
        const { error: cleanupError } = await supabaseAdmin.storage
          .from(PUBLIC_ASSETS_BUCKET)
          .remove([storagePath]);
        if (cleanupError) {
          console.error("[REPLACE] Cleanup failed - orphaned new object:", {
            path: storagePath,
            error: cleanupError.message,
          });
        }
        return NextResponse.json(
          { success: false, error: "Failed to update media asset record" },
          { status: 500 }
        );
      }

      // 9. Success: optionally remove the OLD object. Non-fatal on failure.
      if (deleteOld && existing.path && existing.path !== storagePath) {
        const oldBucket = existing.bucket || PUBLIC_ASSETS_BUCKET;
        const { error: oldDeleteError } = await supabaseAdmin.storage
          .from(oldBucket)
          .remove([existing.path]);
        if (oldDeleteError) {
          console.error("[REPLACE] Old object cleanup failed (non-fatal):", {
            bucket: oldBucket,
            path: existing.path,
            error: oldDeleteError.message,
          });
        }
      }

      // 10. Return success (same response shape as POST /api/admin/upload)
      return NextResponse.json(
        {
          success: true,
          data: {
            id,
            bucket: PUBLIC_ASSETS_BUCKET,
            path: storagePath,
            relativePath: storagePath, // For AssetUrl compatibility
            publicUrl,
            originalName,
            mimeType: declaredMimeType,
            fileSize: processed.size,
            width: processed.width,
            height: processed.height,
          },
        },
        { status: 200 }
      );
    } catch (error) {
      console.error("[REPLACE] FATAL ERROR:", {
        name: error instanceof Error ? error.name : "Unknown",
        message: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json(
        { success: false, error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);


