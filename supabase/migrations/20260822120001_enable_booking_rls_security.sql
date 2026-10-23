-- ============================================================
-- ZT LOUNGE BOOKING RLS SECURITY
-- Migration: 20260822_enable_booking_rls_security
-- 
-- CRITICAL SECURITY FIX:
-- Enable RLS on bookings and customers tables
-- Block all anonymous direct access
-- Allow only through create_booking() RPC
-- ============================================================

-- Enable RLS on bookings table
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- Enable RLS on customers table
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- BOOKINGS POLICIES
-- ============================================================

-- Drop any existing policies first
DROP POLICY IF EXISTS "bookings_anon_select_deny" ON public.bookings;
DROP POLICY IF EXISTS "bookings_anon_insert_deny" ON public.bookings;
DROP POLICY IF EXISTS "bookings_anon_update_deny" ON public.bookings;
DROP POLICY IF EXISTS "bookings_anon_delete_deny" ON public.bookings;
DROP POLICY IF EXISTS "bookings_admin_all" ON public.bookings;

-- Anonymous users: DENY ALL direct access
CREATE POLICY "bookings_anon_select_deny"
  ON public.bookings
  FOR SELECT
  TO anon
  USING (false);

CREATE POLICY "bookings_anon_insert_deny"
  ON public.bookings
  FOR INSERT
  TO anon
  WITH CHECK (false);

CREATE POLICY "bookings_anon_update_deny"
  ON public.bookings
  FOR UPDATE
  TO anon
  USING (false);

CREATE POLICY "bookings_anon_delete_deny"
  ON public.bookings
  FOR DELETE
  TO anon
  USING (false);

-- Authenticated admin users: ALLOW ALL
-- (Admin users verified through profiles + roles)
CREATE POLICY "bookings_admin_all"
  ON public.bookings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON r.id = p.role_id
      WHERE p.id = auth.uid()
        AND r.name IN ('admin', 'super_admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON r.id = p.role_id
      WHERE p.id = auth.uid()
        AND r.name IN ('admin', 'super_admin', 'manager')
    )
  );

-- ============================================================
-- CUSTOMERS POLICIES
-- ============================================================

-- Drop any existing policies first
DROP POLICY IF EXISTS "customers_anon_select_deny" ON public.customers;
DROP POLICY IF EXISTS "customers_anon_insert_deny" ON public.customers;
DROP POLICY IF EXISTS "customers_anon_update_deny" ON public.customers;
DROP POLICY IF EXISTS "customers_anon_delete_deny" ON public.customers;
DROP POLICY IF EXISTS "customers_admin_all" ON public.customers;

-- Anonymous users: DENY ALL direct access
CREATE POLICY "customers_anon_select_deny"
  ON public.customers
  FOR SELECT
  TO anon
  USING (false);

CREATE POLICY "customers_anon_insert_deny"
  ON public.customers
  FOR INSERT
  TO anon
  WITH CHECK (false);

CREATE POLICY "customers_anon_update_deny"
  ON public.customers
  FOR UPDATE
  TO anon
  USING (false);

CREATE POLICY "customers_anon_delete_deny"
  ON public.customers
  FOR DELETE
  TO anon
  USING (false);

-- Authenticated admin users: ALLOW ALL
CREATE POLICY "customers_admin_all"
  ON public.customers
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON r.id = p.role_id
      WHERE p.id = auth.uid()
        AND r.name IN ('admin', 'super_admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON r.id = p.role_id
      WHERE p.id = auth.uid()
        AND r.name IN ('admin', 'super_admin', 'manager')
    )
  );

-- ============================================================
-- VERIFY create_booking() SECURITY
-- ============================================================

-- The create_booking() function MUST be SECURITY DEFINER
-- This allows anonymous users to call it, but it executes
-- with elevated privileges to insert into protected tables

-- Verify the function exists and has correct security
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'create_booking'
      AND p.prosecdef = true
  ) THEN
    RAISE EXCEPTION 'create_booking() must exist and be SECURITY DEFINER';
  END IF;
END $$;

-- Grant EXECUTE on create_booking to anonymous users
GRANT EXECUTE ON FUNCTION public.create_booking TO anon;
GRANT EXECUTE ON FUNCTION public.create_booking TO authenticated;

-- ============================================================
-- VERIFICATION SUMMARY
-- ============================================================

-- Expected behavior after this migration:
-- 
-- ✅ Anonymous SELECT bookings     → DENIED
-- ✅ Anonymous SELECT customers    → DENIED  
-- ✅ Anonymous INSERT bookings     → DENIED
-- ✅ Anonymous UPDATE bookings     → DENIED
-- ✅ Anonymous DELETE bookings     → DENIED
-- ✅ Anonymous create_booking()    → ALLOWED (via SECURITY DEFINER)
-- ✅ Admin ALL operations          → ALLOWED (via authenticated policies)
--
-- This ensures:
-- 1. Public website can only create bookings via the RPC
-- 2. Anonymous users cannot read sensitive booking/customer data
-- 3. Anonymous users cannot manipulate bookings directly
-- 4. Admin dashboard has full access via authenticated role
-- 5. All booking business logic stays in the RPC function
-- ============================================================
