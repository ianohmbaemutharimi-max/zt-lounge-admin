import { NextRequest, NextResponse } from "next/server";
import { withContentManagerAuth } from "@/lib/auth/server";
import { Repository } from "@/lib/repository";
import { BookingHandler, isBookingResource } from "@/lib/booking-handler";
import { validateResource, validationError, notFoundError } from "@/lib/validation/admin";

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
  async (req, ctx, auth) => {
    const id = (ctx.params as any)?.id as string;
    if (!id) return validationError("Booking ID is required");

    const repo = new Repository(auth.supabase as any);
    const handler = new BookingHandler(repo);
    const result = await handler.confirm(id, auth?.user?.id ?? "system");

    if (!result.success) {
      return NextResponse.json({ error: (result as any).error ?? "Failed to confirm booking" }, { status: 400 });
    }
    return NextResponse.json(result.data, { status: 200 });
  }
);