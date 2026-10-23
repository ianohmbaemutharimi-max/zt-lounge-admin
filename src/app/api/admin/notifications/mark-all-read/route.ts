import { NextRequest, NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Mark all notifications as read for the authenticated admin.
 * POST /api/admin/notifications/mark-all-read
 * 
 * Body: {} (empty)
 * 
 * Marks all unread notifications belonging to the authenticated admin as read.
 * 
 * Security: Only marks notifications owned by the authenticated admin.
 * Admin A can never mark Admin B's notifications as read.
 */
export const POST = withAdminAuth(async (req: NextRequest, _ctx, auth) => {
  try {
    // Mark all unread notifications for this admin as read
    const { data, error } = await auth.supabase
      .from("notifications")
      .update({ 
        is_read: true, 
        read_at: new Date().toISOString() 
      })
      .eq("profile_id", auth.profile.id)
      .eq("is_read", false)
      .select();

    if (error) {
      console.error("[mark-all-read] Database error:", error);
      return NextResponse.json(
        { error: "Failed to mark all notifications as read" },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      marked: data?.length ?? 0 
    });
  } catch (error) {
    console.error("[mark-all-read] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
