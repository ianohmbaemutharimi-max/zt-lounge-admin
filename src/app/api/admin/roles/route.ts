/**
 * Admin Roles API
 * GET /api/admin/roles - List available roles
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/server";

export async function GET(req: NextRequest) {
  try {
    const authResult = await getServerSession(req);
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { session } = authResult;

    // Only admin and super_admin can view roles
    if (!["admin", "super_admin"].includes(session.user.role)) {
      return NextResponse.json(
        { error: "You don't have permission to view roles" },
        { status: 403 }
      );
    }

    // Fetch roles from database
    const { data: roles, error } = await session.supabase
      .from("roles")
      .select("id, name")
      .order("name");

    if (error) throw new Error(`Failed to fetch roles: ${error.message}`);

    return NextResponse.json({ data: roles || [] }, { status: 200 });
  } catch (error: any) {
    console.error("[Roles API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to fetch roles" },
      { status: 500 }
    );
  }
}
