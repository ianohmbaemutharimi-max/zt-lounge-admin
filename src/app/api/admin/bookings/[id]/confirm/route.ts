import { NextRequest, NextResponse } from "next/server";
import { withContentManagerAuth } from "@/lib/auth/server";
import { Repository } from "@/lib/repository";
import { BookingHandler, isBookingResource } from "@/lib/booking-handler";
import { validateResource, validationError, notFoundError, errorResultToResponse } from "@/lib/validation/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Authoritative confirmation endpoint.
 * POST /api/admin/bookings/[id]/confirm
 * Invokes confirm_booking() RPC which ATOMICALLY:
 *   - locks the pending booking,
 *   - creates-or-links the customer (source='booking'),
 *   - sets bookings.customer_id and status='confirmed'.
 * A failed confirmation rolls the entire transaction back (no partial customer).
 */
export const POST = withContentManagerAuth(
  async (req, _ctx, auth) => {
    // Extract id from the URL path: /api/admin/bookings/<id>/confirm
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const id = parts[parts.length - 2];
    if (!id) return validationError("Booking ID is required");

    const repo = new Repository(auth.supabase as any);
    const handler = new BookingHandler(repo);
        const result = await handler.confirm(id, auth?.user?.id ?? "system");
    
    if (!result.success) {
      return errorResultToResponse(result);
    }
    return NextResponse.json(result.data, { status: 200 });
  }
);