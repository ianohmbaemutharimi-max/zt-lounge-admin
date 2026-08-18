import { NextRequest, NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/auth/server";
import { internalError } from "@/lib/validation/admin";

export const GET = withAdminAuth(async (_req, _ctx, auth) => {
  try {
    const supabase = auth.supabase;
    const { data, error } = await supabase.rpc("get_dashboard_stats");

    if (error) {
      // Log for debugging, but don't expose SQL errors to client
      console.error("Dashboard stats RPC error:", error);
      return internalError("Failed to fetch dashboard statistics");
    }

    return NextResponse.json({ success: true, data: data ?? {} });
  } catch (e) {
    console.error("Dashboard stats unexpected error:", e);
    return internalError("Internal server error");
  }
});