-- Migration: Fix create_booking() RPC contract
-- Date: 2026-08-24
-- Purpose: Correct the create_booking() function to match the public caller contract
-- 
-- CHANGES:
-- 1. Remove required p_end_time parameter (derive from start_time + service duration)
-- 2. Fix return columns to match frontend expectations:
--    - id → booking_id
--    - Add: service_id, booking_date, start_time, end_time, guests
-- 3. Derive end_time from start_time + service.duration_minutes
-- 4. Maintain SECURITY DEFINER for anon access
--
-- CANONICAL INPUT CONTRACT:
-- {
--   fullName: string,
--   phone: string,
--   email: string | null,
--   serviceSlug: string,
--   date: string,          // YYYY-MM-DD
--   time: string,          // HH:MM
--   guests: number,
--   occasion: string,
--   specialRequests: string
-- }
--
-- CANONICAL RETURN CONTRACT:
-- {
--   booking_id: uuid,
--   booking_number: text,
--   customer_id: uuid,
--   service_id: uuid,
--   booking_date: date,
--   start_time: time,
--   end_time: time,
--   guests: integer,
--   status: text
-- }

SET search_path = public;

-- Drop the old function if it exists (will be recreated)
DROP FUNCTION IF EXISTS public.create_booking(
    p_full_name text,
    p_phone text,
    p_email text,
    p_booking_date date,
    p_start_time time,
    p_end_time time,
    p_guests integer DEFAULT 1,
    p_service_slug text DEFAULT NULL,
    p_special_requests text DEFAULT NULL
);

-- Create the corrected function
CREATE OR REPLACE FUNCTION public.create_booking(
    p_full_name text,
    p_phone text,
    p_booking_date date,
    p_start_time time,
    p_guests integer DEFAULT 1,
    p_email text DEFAULT NULL,
    p_service_slug text DEFAULT 'restaurant',
    p_special_requests text DEFAULT NULL
)
RETURNS TABLE(
    booking_id uuid,
    booking_number text,
    customer_id uuid,
    service_id uuid,
    booking_date date,
    start_time time,
    end_time time,
    guests integer,
    status text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_customer_id uuid;
    v_service_id uuid;
    v_service_duration integer;
    v_booking_number text;
    v_end_time time;
    v_now timestamptz := now();
BEGIN
    -- Validate required parameters
    IF p_full_name IS NULL OR trim(p_full_name) = '' THEN
        RAISE EXCEPTION 'Full name is required';
    END IF;
    
    IF p_phone IS NULL OR trim(p_phone) = '' THEN
        RAISE EXCEPTION 'Phone is required';
    END IF;
    
    IF p_booking_date IS NULL THEN
        RAISE EXCEPTION 'Booking date is required';
    END IF;
    
    IF p_start_time IS NULL THEN
        RAISE EXCEPTION 'Start time is required';
    END IF;
    
    -- Resolve service by slug
    SELECT s.id, s.duration_minutes INTO v_service_id, v_service_duration
    FROM public.services s
    WHERE s.slug = COALESCE(p_service_slug, 'restaurant')
      AND s.is_active = true
    LIMIT 1;
    
    IF v_service_id IS NULL THEN
        RAISE EXCEPTION 'Service not found or inactive: %', COALESCE(p_service_slug, 'restaurant');
    END IF;
    
    -- Calculate end_time from start_time + service duration
    v_end_time := p_start_time + (v_service_duration || ' minutes')::interval::time;
    
    -- Lookup existing customer by phone (normalized)
    SELECT c.id INTO v_customer_id 
    FROM public.customers c 
    WHERE c.phone = p_phone 
      AND c.is_active = true
    LIMIT 1;
    
    -- Create customer if not found
    IF v_customer_id IS NULL THEN
        INSERT INTO public.customers (
            full_name, phone, email, source, is_active, created_at, updated_at
        )
        VALUES (
            p_full_name, 
            p_phone, 
            p_email, 
            'lead',  -- Temporary source for pending booking
            true, 
            v_now, 
            v_now
        )
        RETURNING id INTO v_customer_id;
    END IF;
    
    -- Generate booking number (deterministic-enough short token)
    v_booking_number := 'ZT-' || upper(substr(md5(v_now::text || v_customer_id::text || random()::text), 1, 8));
    
    -- Insert booking
    INSERT INTO public.bookings (
        booking_number, 
        customer_id, 
        service_id, 
        booking_date, 
        start_time, 
        end_time, 
        guests, 
        status, 
        special_requests, 
        created_at, 
        updated_at
    )
    VALUES (
        v_booking_number, 
        v_customer_id, 
        v_service_id, 
        p_booking_date, 
        p_start_time, 
        v_end_time, 
        COALESCE(p_guests, 1), 
        'pending', 
        p_special_requests, 
        v_now, 
        v_now
    )
    RETURNING 
        id AS booking_id,
        booking_number,
        customer_id,
        service_id,
        booking_date,
        start_time,
        end_time,
        guests,
        status
    INTO booking_id, booking_number, customer_id, service_id, booking_date, start_time, end_time, guests, status;
    
    RETURN NEXT;
END;
$$;

-- Grant execute to runtime roles that need to call this RPC
GRANT EXECUTE ON FUNCTION public.create_booking(
    p_full_name text,
    p_phone text,
    p_booking_date date,
    p_start_time time,
    p_guests integer DEFAULT 1,
    p_email text DEFAULT NULL,
    p_service_slug text DEFAULT 'restaurant',
    p_special_requests text DEFAULT NULL
) TO anon;

GRANT EXECUTE ON FUNCTION public.create_booking(
    p_full_name text,
    p_phone text,
    p_booking_date date,
    p_start_time time,
    p_guests integer DEFAULT 1,
    p_email text DEFAULT NULL,
    p_service_slug text DEFAULT 'restaurant',
    p_special_requests text DEFAULT NULL
) TO authenticated;

-- Note: This migration fixes the contract mismatch between:
-- - Public caller (BookingRepository.js) which does NOT pass p_end_time
-- - Migration which REQUIRED p_end_time
-- 
-- The function now derives end_time from start_time + service.duration_minutes
-- and returns all columns expected by the frontend.