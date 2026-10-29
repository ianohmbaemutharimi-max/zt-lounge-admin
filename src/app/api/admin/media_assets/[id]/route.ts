/**
 * Media Assets Metadata API
 *
 * PATCH /api/admin/media_assets/[id]   - Update media metadata (super_admin only)
 * DELETE /api/admin/media_assets/[id]  - Delete media asset (super_admin only)
 *
 * Protected operations for managing media asset metadata including:
 * - title
 * - alt_text
 * - description
 */

import { NextRequest, NextResponse } from "next/server";
import { withSuperAdminAuth } from "@/lib/auth/server";
import { Repository } from "@/lib/repository";
import { validateRecordId, validationError, notFoundError } from "@/lib/validation/admin";
import { MEDIA_REFERENCE_TABLES } from "@/lib/media/reference-tables";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/media_assets/[id]
 * Update supported media asset metadata (alt_text, media_type)
 * Requires super_admin role
 */
export const PATCH = withSuperAdminAuth(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }, auth) => {
    try {
      const { id } = await ctx.params;

      if (!validateRecordId(id)) {
        return validationError("Invalid media asset ID format");
      }

      const body = await req.json();
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return validationError("A media metadata object is required");
      }

      const allowedFields = new Set(["alt_text", "media_type"]);
      const unexpectedFields = Object.keys(body).filter((field) => !allowedFields.has(field));
      if (unexpectedFields.length > 0) {
        return validationError("Only alt_text and media_type can be edited on a media asset");
      }

      if (body.alt_text !== undefined && body.alt_text !== null && typeof body.alt_text !== "string") {
        return validationError("alt_text must be a string or null");
      }

      const allowedMediaTypes = new Set([
        "hero", "gallery", "branding", "service", "testimonial",
        "promotion", "menu", "seo", "feature", "general",
      ]);
      if (body.media_type !== undefined && body.media_type !== null &&
          (typeof body.media_type !== "string" || !allowedMediaTypes.has(body.media_type))) {
        return validationError("media_type is not a supported media type");
      }

      if (Object.keys(body).length === 0) {
        return validationError("No media metadata fields were supplied");
      }

      const repo = new Repository(auth.supabase as any);

      // Verify media asset exists
      const existing = await repo.findById("media_assets", id);
      if (!existing) {
        return notFoundError("Media asset not found");
      }

      // Update metadata using repository (enforces allowlist)
      const updated = await repo.update("media_assets", id, body);

      return NextResponse.json(updated);
    } catch (error) {
      console.error("[media_assets] PATCH error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);

/**
 * DELETE /api/admin/media_assets/[id]
 * Delete a media_assets database row after all canonical references are verified absent
 * Requires super_admin role
 * 
 * SAFETY CONTRACT:
 * - Checks all CMS references before deletion
 * - Rejects deletion if asset is in use
 * - Returns 409 Conflict with usage details if referenced
 * - Only deletes database record (storage cleanup deferred)
 */
export const DELETE = withSuperAdminAuth(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }, auth) => {
    try {
      const { id } = await ctx.params;

      if (!validateRecordId(id)) {
        return validationError("Invalid media asset ID format");
      }

      const repo = new Repository(auth.supabase as any);

      // Verify media asset exists. Storage deletion is intentionally deferred.
      const existing = await repo.findById("media_assets", id);
      if (!existing) {
        return notFoundError("Media asset not found");
      }

      // SAFETY CHECK: Detect all CMS references
      const references = await checkMediaReferences(auth.supabase as any, id);
      
      if (references.total > 0) {
        // Asset is in use - reject deletion
        return NextResponse.json(
          {
            error: "Media asset is currently in use",
            message: "Cannot delete media asset that is referenced by active content",
            usage: references,
            suggestion: "Remove all references before deleting this asset"
          },
          { status: 409 } // Conflict
        );
      }

      // Safe to delete - no references found
      // Delete database record (repository handles RLS)
      await repo.delete("media_assets", id);

      // Note: Storage file deletion should be handled by a database trigger
      // or background job to avoid orphaning records if storage deletion fails

      return new NextResponse(null, { status: 204 });
    } catch (error) {
      console.error("[media_assets] DELETE error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }
);

/**
 * Check all CMS references to a media asset
 * Returns detailed usage information for conflict responses
 */
async function checkMediaReferences(
  supabase: any,
  mediaId: string
): Promise<{
  total: number;
  details: Array<{ table: string; count: number; column: string }>;
}> {
  const referenceTables = MEDIA_REFERENCE_TABLES;

  const details: Array<{ table: string; count: number; column: string }> = [];
  let total = 0;

  for (const { table, column } of referenceTables) {
    const { count, error } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true })
      .eq(column, mediaId);

    // Fail closed: a failed reference query must never be interpreted as
    // proof that an asset is unused. Bubble up so DELETE returns 500 instead
    // of allowing a potentially destructive deletion.
    if (error) {
      throw new Error(`Media reference check failed for ${table}.${column}: ${error.message}`);
    }
    if (count === null) {
      throw new Error(`Media reference check returned no count for ${table}.${column}`);
    }
    if (count > 0) {
      details.push({ table, column, count });
      total += count;
    }
  }

  return { total, details };
}