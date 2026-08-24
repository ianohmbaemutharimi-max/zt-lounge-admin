-- Migration: Create admin_booking() RPC for admin booking creation
-- Date: 2026-08-24
-- Purpose: Provide an admin-specific booking creation RPC that shares the same
--          core booking logic as the public create_booking() but supports
--          additional admin fields like staff_id, created_by, etc.
--
-- ARCHITECTURE:
--   PUBLIC: create_booking() → uses serviceSlug resolution
--   ADMIN:  admin_booking() → uses service_id (admin knows the service)
--
-- Both RPCs share the same customer lifecycle rules:
--   - Pending bookings create customers with source='lead'
--   - Confirmed/completed bookings update source to 'booking'
--   - Manual customers have source='manual'

SET search_path = public;

-- Create the admin booking function
CREATE OR REPLACE FUNCTION public.admin_booking(
    p_full_name text,
    p_phone text,
    p_booking_date date,
    p_start_time time,
    p_end_time time,
    p_guests integer DEFAULT 1,
    p_email text DEFAULT NULL,
    p_service_id uuid DEFAULT NULL,
    p_staff_id uuid DEFAULT NULL,
    p_special_requests text DEFAULT NULL,
    p_created_by uuid DEFAULT NULL,
    p_customer_id uuid DEFAULT NULL
)
RETURNS TABLE(
    booking_id uuid,
    booking_number text,
    customer_id uuid,
    service_id uuid,
    staff_id uuid,
    booking_date date,
    start_time time,
    end_time time,
    guests integer,
    status text,
    special_requests text,
    created_by uuid,
    created_at timestamptz,
    updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_customer_id uuid;
    v_service_id uuid;
    v_service_duration integer;
    v_booking_number text;
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
    
    IF p_end_time IS NULL THEN
        RAISE EXCEPTION 'End time is required';
    END IF;
    
    -- Resolve service by ID (admin provides service_id directly)
    IF p_service_id IS NOT NULL THEN
        SELECT s.id, s.duration_minutes INTO v_service_id, v_service_duration
        FROM public.services s
        WHERE s.id = p_service_id
          AND s.is_active = true
        LIMIT 1;
        
        IF v_service_id IS NULL THEN
            RAISE EXCEPTION 'Service not found or inactive: %', p_service_id;
        END IF;
    END IF;
    
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
        staff_id, 
        booking_date, 
        start_time, 
        end_time, 
        guests, 
        status, 
        special_requests, 
        created_by, 
        created_at, 
        updated_at
    )
    VALUES (
        v_booking_number, 
        v_customer_id, 
        v_service_id, 
        p_staff_id, 
        p_booking_date, 
        p_start_time, 
        p_end_time, 
        COALESCE(p_guests, 1), 
        'pending', 
        p_special_requests, 
        p_created_by, 
        v_now, 
        v_now
    )
    RETURNING 
        id AS booking_id,
        booking_number,
        customer_id,
        service_id,
        staff_id,
        booking_date,
        start_time,
        end_time,
        guests,
        status,
        special_requests,
        created_by,
        created_at,
        updated_at
    INTO booking_id, booking_number, customer_id, service_id, staff_id, 
         booking_date, start_time, end_time, guests, status, special_requests,
         created_by, created_at, updated_at;
    
    RETURN NEXT;
END;
$$;

-- Grant execute to authenticated admin users
GRANT EXECUTE ON FUNCTION public.admin_booking(
    p_full_name text,
    p_phone text,
    p_booking_date date,
    p_start_time time,
    p_end_time time,
    p_guests integer DEFAULT 1,
    p_email text DEFAULT NULL,
    p_service_id uuid DEFAULT NULL,
    p_staff_id uuid DEFAULT NULL,
    p_special_requests text DEFAULT NULL,
    p_created_by uuid DEFAULT NULL,
    p_customer_id uuid DEFAULT NULL
) TO authenticated;

-- Note: This RPC is for admin use only. It requires authentication.
-- The anon role should NOT have access to this function.