import { NextRequest, NextResponse } from "next/server";
import { withAdminAuth } from "@/lib/auth/server";
import { Repository } from "@/lib/repository";
import { MembershipHandler } from "@/lib/membership-handler";
import { logCrudOperation } from "@/lib/audit/logger";
import { validationError, errorResultToResponse } from "@/lib/validation/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Explicit membership renewal.
 * POST /api/admin/customer-memberships/[id]/renew
 *
 * Server-side: extends the annual period from max(current expiry, now),
 * re-snapshots prices from the plan's current pricing, reactivates the
 * membership. No automatic renewal exists anywhere in the system.
 */
export const POST = withAdminAuth(async (req: NextRequest, _ctx: any, auth: any) => {
  // Extract id from the URL path: /api/admin/customer-memberships/<id>/renew
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const id = parts[parts.length - 2];
  if (!id) return validationError("Membership ID is required");

  const repo = new Repository(auth.supabase as any);
  const handler = new MembershipHandler(repo);
  const result = await handler.renew(id);

  if (!result.success) {
    return errorResultToResponse(result);
  }

  await logCrudOperation(
    auth.supabase,
    "customer_memberships",
    "UPDATE",
    id,
    auth.profile.id,
    req,
    "RENEW membership: annual period extended, prices re-snapshotted from plan"
  );

  return NextResponse.json(result.data, { status: 200 });
});
