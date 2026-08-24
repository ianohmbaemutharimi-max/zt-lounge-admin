/**
 * Media Assets API - Update Endpoint
 * 
 * PATCH /api/admin/media_assets/[id]
 * 
 * Allows authenticated content managers to update media asset metadata.
 * Only title and alt_text are editable. File content and storage paths are immutable.
 * 
 * This endpoint follows the project's established conventions:
 * - Uses withContentManagerAuth for RBAC (manager, admin, super_admin)
 * - Validates UUID format
 * - Returns consistent JSON responses
 * - Proper error handling with appropriate status codes
 */

import { NextRequest, NextResponse } from "next/server";
import { withContentManagerAuth } from "@/lib/auth/server";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * PATCH /api/admin/media_assets/[id]
 * 
 * Updates media asset metadata (title and alt_text only).
 * 
 * Required headers:
 * - Cookie: Supabase session
 * 
 * Request body (JSON):
 * {
 *   "title": string (optional),
 *   "alt_text": string (optional)
 * }
 * 
 * Response (200):
 * {
 *   "id": "uuid",
 *   "title": string,
 *   "alt_text": string,
 *   "updated_at": "timestamp",
 *   ... other media asset fields
 * }
 * 
 * Error responses:
 * - 400: Invalid ID format or invalid request body
 * - 401: Unauthenticated
 * - 403: Unauthorized role
 * - 404: Media asset not found
 * - 500: Server error
 */
export const PATCH = async (
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) => {
  return withContentManagerAuth(async (req, _ctx, auth) => {
    try {
      // Extract and validate ID
      const { id } = await params;
      
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(id)) {
        return NextResponse.json(
          { 
            success: false,
            error: { message: "Invalid media asset ID format" }
          },
          { status: 400 }
        );
      }

      // Parse request body
      let body: any;
      try {
        body = await req.json();
      } catch (error) {
        return NextResponse.json(
          { 
            success: false,
            error: { message: "Invalid JSON in request body" }
          },
          { status: 400 }
        );
      }

      // Validate that only allowed fields are present
      const allowedFields = ["title", "alt_text"];
      const updateData: Record<string, any> = {};

      for (const key of Object.keys(body)) {
        if (!allowedFields.includes(key)) {
          return NextResponse.json(
            { 
              success: false,
              error: { message: `Field '${key}' is not editable. Only title and alt_text can be updated.` }
            },
            { status: 400 }
          );
        }
      }

      // Build update object with only provided fields
      if (body.title !== undefined) {
        updateData.title = body.title;
      }
      if (body.alt_text !== undefined) {
        updateData.alt_text = body.alt_text;
      }

      // Ensure at least one field is being updated
      if (Object.keys(updateData).length === 0) {
        return NextResponse.json(
          { 
            success: false,
            error: { message: "No valid fields to update. Provide title or alt_text." }
          },
          { status: 400 }
        );
      }

      // Add updated_at timestamp
      updateData.updated_at = new Date().toISOString();

      // Use service role client to bypass RLS for the update
      // (Media Library RLS policies require admin role)
      const supabaseAdmin = await getSupabaseAdmin();

      // First verify the asset exists
      const { data: existingAsset, error: fetchError } = await supabaseAdmin
        .from("media_assets")
        .select("id")
        .eq("id", id)
        .single();

      if (fetchError || !existingAsset) {
        return NextResponse.json(
          { 
            success: false,
            error: { message: "Media asset not found" }
          },
          { status: 404 }
        );
      }

      // Perform the update
      const { data, error } = await supabaseAdmin
        .from("media_assets")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("[media_assets] PATCH error:", {
          id,
          error: error.message,
          code: error.code,
        });

        return NextResponse.json(
          { 
            success: false,
            error: { message: "Failed to update media asset" }
          },
          { status: 500 }
        );
      }

      // Return updated asset
      return NextResponse.json(
        {
          success: true,
          data,
        },
        { status: 200 }
      );

    } catch (error) {
      console.error("[media_assets] PATCH unexpected error:", {
        name: error instanceof Error ? error.name : "Unknown",
        message: error instanceof Error ? error.message : String(error),
      });

      return NextResponse.json(
        { 
          success: false,
          error: { message: "Internal server error" }
        },
        { status: 500 }
      );
    }
  })(req, { params });
};
