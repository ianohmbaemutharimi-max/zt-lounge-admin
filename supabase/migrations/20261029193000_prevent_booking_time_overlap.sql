-- Prevent overlapping venue bookings across all service categories.
-- This migration mirrors the verified live database guard.
-- Cancelled/rejected bookings release their slot; adjacent bookings are allowed.

CREATE OR REPLACE FUNCTION public.enforce_booking_time_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  -- Cancelled/rejected bookings release the venue slot.
  IF NEW.status IN ('cancelled', 'canceled', 'rejected') THEN
    RETURN NEW;
  END IF;

  IF NEW.booking_date IS NULL
     OR NEW.start_time IS NULL
     OR NEW.end_time IS NULL
     OR NEW.end_time <= NEW.start_time THEN
    RAISE EXCEPTION
      'validation_error: booking must have a same-day end_time after start_time'
      USING ERRCODE = '22007';
  END IF;

  -- Serialize booking writes across every service category.
  PERFORM pg_catalog.pg_advisory_xact_lock(20261029, 9017);

  IF EXISTS (
    SELECT 1
    FROM public.bookings AS b
    WHERE b.booking_date = NEW.booking_date
      AND b.id IS DISTINCT FROM NEW.id
      AND b.status NOT IN ('cancelled', 'canceled', 'rejected')
      AND NEW.start_time < b.end_time
      AND b.start_time < NEW.end_time
  ) THEN
    RAISE EXCEPTION
      'booking_conflict: the venue already has a booking during this time'
      USING ERRCODE = '23P01';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS bookings_prevent_time_overlap ON public.bookings;

CREATE TRIGGER bookings_prevent_time_overlap
BEFORE INSERT OR UPDATE OF booking_date, start_time, end_time, status
ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.enforce_booking_time_no_overlap();

REVOKE ALL ON FUNCTION public.enforce_booking_time_no_overlap()
FROM PUBLIC, anon, authenticated;
