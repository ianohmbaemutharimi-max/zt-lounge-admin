import { NextRequest, NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/auth/server";
import { mapArrayToPublicContract } from "@/lib/contract/mapping";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Notification inbox — personal to the authenticated admin.
 * GET /api/admin/notifications
 *
 * Each notification is a per-recipient row (migration 20260915 fan-out: one row
 * per active super_admin/admin profile). The DB RLS is employee-wide
 * (is_employee()), so the APPLICATION layer is the authoritative boundary: only
 * the authenticated admin's own rows are surfaced, derived from the session
 * (auth.profile.id) — never a client-supplied profile_id.
 *
 * Returns the same { data, pagination } contract as the generic resource list
 * so the notification bell/list keeps working. This handler owns the list so that
 * ownership is enforced at query time, mirroring the inline owner-guard already
 * present on PATCH /notifications/:id.
 */
export const GET = withAdminAuth(async (req: NextRequest, _ctx: any, auth) => {
  try {
    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") ?? 50), 100));
    const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0));

    const { data, error, count } = await auth.supabase
      .from("notifications")
      .select("*", { count: "exact" })
      .eq("profile_id", auth.profile.id) // OWNER-SCOPE (DEF-01)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("[notifications] list error:", error);
      return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
    }

    const mapped = mapArrayToPublicContract("notifications", data ?? []);
    const total = count ?? 0;
    const page = Math.floor(offset / limit) + 1;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return NextResponse.json({
      data: mapped,
      pagination: {
        page,
        limit,
        offset,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    }, {
      headers: {
        "X-Total-Count": String(total),
        "Access-Control-Expose-Headers": "X-Total-Count, X-Page, X-Total-Pages",
      },
    });
  } catch (error) {
    console.error("[notifications] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
});
