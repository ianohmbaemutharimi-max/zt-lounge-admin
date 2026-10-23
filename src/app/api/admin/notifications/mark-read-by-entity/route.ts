import { NextRequest, NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/auth/server";
import { validationError } from "@/lib/validation/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Mark notification(s) as read by entity reference.
 * POST /api/admin/notifications/mark-read-by-entity
 * 
 * Body: { entityType: string, entityId: string }
 * 
 * Marks all notifications belonging to the authenticated admin that reference
 * the specified entity as read. Used primarily for contact_message notifications.
 * 
 * Security: Only marks notifications owned by the authenticated admin.
 */
export const POST = withAdminAuth(async (req: NextRequest, _ctx, auth) => {
  try {
    const body = await req.json().catch(() => null);
    
    if (!body || typeof body !== "object") {
      return validationError("Invalid request body");
    }

    const { entityType, entityId } = body;

    if (!entityType || typeof entityType !== "string") {
      return validationError("entityType is required and must be a string");
    }

    if (!entityId) {
      return validationError("entityId is required");
    }

    // Mark notifications as read: scoped to authenticated admin + entity
    const { data, error } = await auth.supabase
      .from("notifications")
      .update({ 
        is_read: true, 
        read_at: new Date().toISOString() 
      })
      .eq("profile_id", auth.profile.id)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .select();

    if (error) {
      console.error("[mark-read-by-entity] Database error:", error);
      return NextResponse.json(
        { error: "Failed to mark notifications as read" },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      marked: data?.length ?? 0 
    });
  } catch (error) {
    console.error("[mark-read-by-entity] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
