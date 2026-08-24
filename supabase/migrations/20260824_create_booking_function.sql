-- Migration: Create create_booking() RPC
-- Date: 2026-08-24
-- Purpose: Version-control the database function used by the public website to create bookings.
-- Behavior summary:
--  - Finds or creates a customer by phone
--  - Resolves a service by slug if provided
--  - Inserts a booking with status = 'pending' and returns key fields
--  - Designed to be SECURITY DEFINER and callable by anon/authenticated (granted below)

SET search_path = public;

CREATE OR REPLACE FUNCTION public.create_booking(
  p_full_name text,
  p_phone text,
  p_email text,
  p_booking_date date,
  p_start_time time,
  p_end_time time,
  p_guests integer DEFAULT 1,
  p_service_slug text DEFAULT NULL,
  p_special_requests text DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  booking_number text,
  status text,
  customer_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_customer_id uuid;
  v_service_id uuid;
  v_booking_number text;
  v_now timestamptz := now();
BEGIN
  -- Resolve service by slug if provided
  IF p_service_slug IS NOT NULL THEN
    SELECT s.id INTO v_service_id FROM public.services s WHERE s.slug = p_service_slug LIMIT 1;
  END IF;

  -- Lookup existing customer by phone (best-effort: phone may be normalized by caller)
  IF p_phone IS NOT NULL AND length(trim(p_phone)) > 0 THEN
    SELECT c.id INTO v_customer_id FROM public.customers c WHERE c.phone = p_phone LIMIT 1;
  END IF;

  -- Create customer if not found
  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (full_name, phone, email, created_at, updated_at)
    VALUES (p_full_name, p_phone, p_email, v_now, v_now)
    RETURNING id INTO v_customer_id;
  END IF;

  -- Generate booking number (deterministic-enough short token)
  v_booking_number := 'ZT-' || upper(substr(md5(v_now::text || v_customer_id::text || random()::text), 1, 8));

  -- Insert booking
  INSERT INTO public.bookings (booking_number, customer_id, service_id, booking_date, start_time, end_time, guests, status, special_requests, created_at, updated_at)
  VALUES (v_booking_number, v_customer_id, v_service_id, p_booking_date, p_start_time, p_end_time, COALESCE(p_guests, 1), 'pending', p_special_requests, v_now, v_now)
  RETURNING id, booking_number, status, customer_id INTO id, booking_number, status, customer_id;

  RETURN NEXT;
END;
$$;

-- Grant execute to runtime roles that need to call this RPC
GRANT EXECUTE ON FUNCTION public.create_booking(text, text, text, date, time, time, integer, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.create_booking(text, text, text, date, time, time, integer, text, text) TO authenticated;

-- Note: This migration intentionally implements the server-side behavior observed in production.
-- It does NOT create a UNIQUE constraint on customers.phone here; if you wish to enforce deduplication
-- at the database level, add a separate migration that creates a UNIQUE INDEX/CONSTRAINT after
-- ensuring there are no existing duplicates in production data.
