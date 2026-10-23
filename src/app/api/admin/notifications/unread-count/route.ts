import { NextRequest, NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Canonical unread notification count.
 * GET /api/admin/notifications/unread-count
 * 
 * Returns the count of unread notifications for the authenticated admin.
 * Scoped to the current user's profile_id to prevent cross-admin data access.
 */
export const GET = withAdminAuth(async (req: NextRequest, _ctx: any, auth) => {
  try {
    // Count only notifications belonging to the authenticated admin
    const { count, error } = await auth.supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("profile_id", auth.profile.id)
      .eq("is_read", false);

    if (error) {
      console.error("[unread-count] Database error:", error);
      return NextResponse.json(
        { error: "Failed to fetch unread count" },
        { status: 500 }
      );
    }

    return NextResponse.json({ unreadCount: count ?? 0 });
  } catch (error) {
    console.error("[unread-count] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
