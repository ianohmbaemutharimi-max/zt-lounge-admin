-- ============================================================
-- 20261001114549_phase2_authorization_reconciliation.sql
-- Phase 2D -- SURGICAL AUTHORIZATION RECONCILIATION
-- ============================================================
-- Approved target (Phase 2A audit -> Phase 2B plan -> Phase 2C OD-4 decision):
--   D1  public.is_manager_or_above()  -> delegate to public.is_admin_or_above()   (super_admin, admin)
--   D3  public.is_employee()          -> delegate to public.is_admin_or_above()   (super_admin, admin)
--   D2  google_connections_read_safe / google_connections_insert -> super_admin only
--
-- Transitively affected (NO per-policy DDL required, policies keep calling the helpers):
--   gallery_content_manager_all, testimonials_admin_manage                (via is_manager_or_above)
--   the 19 is_employee() policies, incl. OD-4:
--     file_uploads_staff_manage, staff_read, staff_availability_read
--
-- Retired roles (manager, receptionist, staff) REMAIN in public.roles / user_role enum.
-- No profiles, roles, bookings, customers, membership or other application data are modified.
-- Idempotent and transactional. Does NOT touch or reuse 20261003_phase2_legacy_role_rls_hardening.sql.
-- Apply ONLY via: supabase db query --linked --project-ref jczwilrysvnhcjzjztbi --file <this file>
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- D1. is_manager_or_above(): stop admitting the retired `manager` role.
--     Function attributes preserved EXACTLY (LANGUAGE sql, SECURITY DEFINER, STABLE,
--     search_path = 'public','pg_temp'). Only the body changes.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_manager_or_above()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT public.is_admin_or_above();
$$;

-- ------------------------------------------------------------
-- D3. is_employee(): stop admitting the retired `staff` role.
--     Function attributes preserved EXACTLY (LANGUAGE sql, SECURITY DEFINER, STABLE,
--     search_path = 'public'). Only the body changes.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_employee()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_admin_or_above();
$$;

-- ------------------------------------------------------------
-- D2. google_connections (OAuth refresh/access tokens) -> super_admin ONLY.
--     Non-role conditions preserved verbatim (p.user_id = auth.uid(), p.is_active = true).
--     Policy name, table, command and TO-role are preserved.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "google_connections_read_safe" ON public.google_connections;
CREATE POLICY "google_connections_read_safe"
  ON public.google_connections
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON r.id = p.role_id
      WHERE p.user_id = auth.uid()
        AND p.is_active = true
        AND r.name IN ('super_admin'::user_role)
    )
  );

DROP POLICY IF EXISTS "google_connections_insert" ON public.google_connections;
CREATE POLICY "google_connections_insert"
  ON public.google_connections
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON r.id = p.role_id
      WHERE p.user_id = auth.uid()
        AND p.is_active = true
        AND r.name IN ('super_admin'::user_role)
    )
  );

-- ------------------------------------------------------------
-- Record this migration in the remote history (idempotent).
-- ------------------------------------------------------------
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20261001114549', 'phase2_authorization_reconciliation', ARRAY[]::text[])
ON CONFLICT (version) DO NOTHING;

COMMIT;
