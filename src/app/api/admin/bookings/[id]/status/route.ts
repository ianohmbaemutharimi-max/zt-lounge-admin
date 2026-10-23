import { NextRequest, NextResponse } from "next/server";
import { withContentManagerAuth } from "@/lib/auth/server";
import { Repository } from "@/lib/repository";
import { BookingHandler } from "@/lib/booking-handler";
import { validateResource, validationError, errorResultToResponse } from "@/lib/validation/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Booking status transition endpoint.
 * PATCH /api/admin/bookings/[id]/status
 *
 * Delegates to BookingHandler.updateStatus() which enforces the canonical
 * status-transition state machine (pending→confirmed/cancelled/no_show,
 * confirmed→completed/cancelled/no_show) and records booking_history.
 *
 * Confirmation (pending→confirmed) is routed through confirm() internally.
 * This endpoint handles the remaining transitions (completed, cancelled,
 * no_show) invoked by the Complete and Cancel buttons in the bookings table.
 */
export const PATCH = withContentManagerAuth(
  async (req: NextRequest, _ctx: any, auth: any) => {
    // Extract id from the URL path: /api/admin/bookings/<id>/status
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const id = parts[parts.length - 2]; // <id> sits two segments before "status"
    if (!id) return validationError("Booking ID is required");

    const body = await req.json().catch(() => ({}));
    const status = body?.status;
    if (!status) return validationError("Status is required");

    const repo = new Repository(auth.supabase as any);
    const handler = new BookingHandler(repo);

    const result = await handler.updateStatus(id, status, auth?.user?.id ?? "system");

    if (!result.success) {
      return errorResultToResponse(result);
    }
    return NextResponse.json(result.data, { status: 200 });
  }
);