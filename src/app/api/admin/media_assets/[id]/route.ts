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
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { parsePublicStorageUrl } from "@/lib/storage/paths";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/media_assets/[id]
 * Update supported media asset metadata (alt_text)
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

      const allowedFields = new Set(["alt_text"]);
      const unexpectedFields = Object.keys(body).filter((field) => !allowedFields.has(field));
      if (unexpectedFields.length > 0) {
        return validationError("Only alt_text can be edited on a media asset; the content role is immutable");
      }

      if (body.alt_text !== undefined && body.alt_text !== null && typeof body.alt_text !== "string") {
        return validationError("alt_text must be a string or null");
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
 * Delete a media_assets row after all canonical references are verified absent.
 * The physical object is removed only when no other media row points to the
 * same bucket/object key. Requires super_admin role.
 *
 * SAFETY CONTRACT:
 * - Fails closed if any canonical reference query fails.
 * - Rejects deletion if the asset is in use.
 * - Retains shared or unrecognized Storage objects.
 */
export const DELETE = withSuperAdminAuth(
  async (req: NextRequest, ctx: { params: Promise<{ id: string }> }, auth) => {
    try {
      const { id } = await ctx.params;

      if (!validateRecordId(id)) {
        return validationError("Invalid media asset ID format");
      }

      const repo = new Repository(auth.supabase as any);
      const supabaseAdmin = await getSupabaseAdmin();

      // Read the live canonical URL from the real table contract.
      const { data: existing, error: loadError } = await supabaseAdmin
        .from("media_assets")
        .select("id, public_url")
        .eq("id", id)
        .maybeSingle();

      if (loadError) {
        throw new Error(`Could not load media asset before deletion: ${loadError.message}`);
      }
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

      // Remove the registry row first. The database trigger and FK constraints
      // remain the final guard if a reference appears between our scan and DELETE.
      await repo.delete("media_assets", id);

      // A physical object may be shared by multiple media_assets rows. Remove it
      // only after confirming no other registry row still points at this URL.
      let storageCleanup: "deleted" | "retained_shared" | "skipped_unrecognized_url" | "failed" = "skipped_unrecognized_url";
      const storageLocation = parsePublicStorageUrl(existing.public_url);
      if (storageLocation) {
        const { data: remaining, error: remainingError } = await supabaseAdmin
          .from("media_assets")
          .select("id, public_url");

        if (remainingError) {
          storageCleanup = "failed";
          console.error("[media_assets] Could not verify remaining object references; retained storage object:", remainingError.message);
        } else if ((remaining ?? []).some((asset: { public_url: string }) => {
          const location = parsePublicStorageUrl(asset.public_url);
          return location?.bucket === storageLocation.bucket && location.path === storageLocation.path;
        })) {
          storageCleanup = "retained_shared";
        } else {
          const { error: storageError } = await supabaseAdmin.storage
            .from(storageLocation.bucket)
            .remove([storageLocation.path]);
          if (storageError) {
            storageCleanup = "failed";
            console.error("[media_assets] Storage cleanup failed; registry row was deleted:", storageError.message);
          } else {
            storageCleanup = "deleted";
          }
        }
      }

      return NextResponse.json({ success: true, storageCleanup }, { status: 200 });
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