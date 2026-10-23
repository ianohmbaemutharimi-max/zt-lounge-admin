import { NextRequest, NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Canonical pending contact message count.
 * GET /api/admin/contact-messages/pending-count
 * 
 * Returns the total count of contact messages awaiting a reply.
 * Pending messages are those with status 'new' or 'read' (seen but not yet replied).
 */
export const GET = withAdminAuth(async (req: NextRequest, _ctx: any, auth) => {
  try {
    const { count, error } = await auth.supabase
      .from("contact_messages")
      .select("*", { count: "exact", head: true })
      .in("status", ["new", "read"]);

    if (error) {
      console.error("[pending-count] Database error:", error);
      return NextResponse.json(
        { error: "Failed to fetch pending count" },
        { status: 500 }
      );
    }

    return NextResponse.json({ pending: count ?? 0 });
  } catch (error) {
    console.error("[pending-count] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});
