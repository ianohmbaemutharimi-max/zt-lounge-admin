-- ============================================================
-- 20261003_phase2_legacy_role_rls_hardening.sql
-- Phase 2 FINAL -- legacy role (manager) DB-RLS isolation
-- ============================================================
-- AUDIT FINDING (verified evidence, NOT applied this session - see report):
--   Live DB-layer role gates still admit the OBSOLETE `manager` role into
--   admin-only RLS, contradicting the canonical app model
--   ADMIN_ROLES = ["super_admin","admin"] (src/lib/auth/server.ts):
--     google_connections (read_safe/insert)  r.name IN ('super_admin','admin','manager')
--     google_review_sync_runs (manager_read) is_manager_or_above()   [DB-only fn]
--     bookings (admin_all)                  r.name IN ('admin','super_admin','manager')
--     customers (admin_all)                 r.name IN ('super_admin','admin','manager')
--   is_manager_or_above() is a DB-only function: no repo migration defines
--   its body (only 033 calls it as a black box). is_admin_or_above() and
--   current_role() ARE live (rpc exists). google_reviews_is_manager_or_above()
--   (038) is NOT installed live -> 038 was never applied; 033 is the live model.
--
-- FIX (idempotent, NON-destructive to super_admin/admin/customer data):
--   1. Redefine is_manager_or_above() to delegate to the live is_admin_or_above()
--      (super_admin/admin). One change repairs every call site atomically.
--   2. Narrow google_connections SELECT/INSERT policies -> super_admin,admin.
--   3. Replace the manager_read policy on google_review_sync_runs with an
--      admin-only read policy (drop IF EXISTS + new name -> no collision).
--   4. Narrow bookings_admin_all + customers_admin_all -> super_admin,admin.
-- Every DROP uses IF EXISTS; every CREATE re-creates the canonical name.
-- No enum change, no role-row delete, no profile role mutation, no data writes.
-- manager is DENIED at the DB gate, not deleted (preserves the 2 active manager
-- profiles per Hard Rule: do not delete).
-- ============================================================

BEGIN;

-- ---------------------------------------------------------------
-- 1. is_manager_or_above(): DB-only, body unknown. Recreate to delegate
--    to the verified live is_admin_or_above() so ALL call sites are
--    repaired by a single atomic definition. Mirrors the sibling admin
--    predicate; manager is no longer "or above".
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_manager_or_above()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_admin_or_above()
$$;

-- ---------------------------------------------------------------
-- 2. google_connections (OAuth refresh/access tokens - sensitive).
--    Drop the manager-admitting policies and recreate admin-only.
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "google_connections_read_safe" ON public.google_connections;
CREATE POLICY "google_connections_read_safe"
  ON public.google_connections
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON r.id = p.role_id
      WHERE p.user_id = auth.uid()
        AND p.is_active = true
        AND r.name IN ('super_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "google_connections_insert" ON public.google_connections;
CREATE POLICY "google_connections_insert"
  ON public.google_connections
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON r.id = p.role_id
      WHERE p.user_id = auth.uid()
        AND p.is_active = true
        AND r.name IN ('super_admin', 'admin')
    )
  );

-- ---------------------------------------------------------------
-- 3. google_review_sync_runs: replace the manager_read policy with an
--    admin-only read policy. The old policy was live under 033.
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "google_sync_runs_manager_read" ON public.google_review_sync_runs;
CREATE POLICY "google_sync_runs_admin_read"
  ON public.google_review_sync_runs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON r.id = p.role_id
      WHERE p.user_id = auth.uid()
        AND p.is_active = true
        AND r.name IN ('super_admin', 'admin')
    )
  );

-- ---------------------------------------------------------------
-- 4. bookings / customers: legacy admin_all admitted manager.
--    Narrow to super_admin/admin. admin access preserved exactly.
-- ---------------------------------------------------------------
DROP POLICY IF EXISTS "bookings_admin_all" ON public.bookings;
CREATE POLICY "bookings_admin_all"
  ON public.bookings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON r.id = p.role_id
      WHERE p.id = auth.uid()
        AND r.name IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON r.id = p.role_id
      WHERE p.id = auth.uid()
        AND r.name IN ('super_admin', 'admin')
    )
  );

DROP POLICY IF EXISTS "customers_admin_all" ON public.customers;
CREATE POLICY "customers_admin_all"
  ON public.customers
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON r.id = p.role_id
      WHERE p.id = auth.uid()
        AND r.name IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON r.id = p.role_id
      WHERE p.id = auth.uid()
        AND r.name IN ('super_admin', 'admin')
    )
  );

COMMIT;
