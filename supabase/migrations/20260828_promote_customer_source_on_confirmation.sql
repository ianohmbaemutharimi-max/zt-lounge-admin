-- Migration: Promote customer source from 'lead' to 'booking' on booking confirmation
-- Date: 2026-08-24
--
-- PURPOSE:
--   Closes the customer lifecycle invariant gap:
--     - Pending bookings may create customers with source='lead'
--     - A customer becomes a BOOKING-ORIGIN CUSTOMER only when a booking
--       reaches 'confirmed' or 'completed'
--     - Cancelled / no_show bookings MUST NOT promote source
--
-- MECHANISM:
--   Row-level AFTER UPDATE trigger on public.bookings.
--   Runs inside the same transaction as the status UPDATE → atomic.
--   Concurrent confirmations of the same booking serialize on the
--   bookings row lock; the promotion UPDATE is idempotent
--   (WHERE source = 'lead'), so repeated execution is a no-op.
--
-- SAFETY:
--   - Never touches customers with source='manual' or source='booking'
--   - Never deletes or merges data
--   - Rollback: DROP TRIGGER + DROP FUNCTION (see bottom of file)
--
-- STATUS TRANSITION ENFORCEMENT NOTE:
--   Transitions remain application-enforced (src/lib/booking-validation.ts).
--   This trigger does NOT enforce transitions; it only reacts to
--   confirmed/completed statuses, which are only reachable via valid
--   transitions in the application layer.

SET search_path = public;

CREATE OR REPLACE FUNCTION public.promote_customer_source_on_booking_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Only react when a booking reaches confirmed or completed
    IF NEW.status IN ('confirmed', 'completed') THEN
        -- Idempotent promotion: only upgrades 'lead' → 'booking'.
        -- 'manual' and 'booking' sources are never modified.
        UPDATE public.customers c
        SET source = 'booking',
            updated_at = now()
        WHERE c.id = NEW.customer_id
          AND c.source = 'lead';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bookings_promote_customer_source ON public.bookings;

CREATE TRIGGER trg_bookings_promote_customer_source
AFTER UPDATE OF status ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.promote_customer_source_on_booking_status();

-- ============================================================
-- ROLLBACK (run manually if needed):
--
-- DROP TRIGGER IF EXISTS trg_bookings_promote_customer_source ON public.bookings;
-- DROP FUNCTION IF EXISTS public.promote_customer_source_on_booking_status();
-- ============================================================