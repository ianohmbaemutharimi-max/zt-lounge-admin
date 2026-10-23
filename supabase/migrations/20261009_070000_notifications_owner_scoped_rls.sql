-- ============================================================================
-- 20261009_070000_notifications_owner_scoped_rls.sql
-- NOTIFICATION SECURITY FIX — Owner-scoped RLS policies
-- ============================================================================
-- FINDING (verified 2026-10-09):
--   Existing notification RLS policies only check is_employee() (any admin),
--   but DO NOT enforce owner scoping via profile_id. This allows Admin A to
--   read/update Admin B's notifications at the database level.
--
--   Current policies (LIVE VERIFIED):
--     notifications_staff_read    SELECT  USING is_employee()
--     notifications_staff_update  UPDATE  USING is_employee() WITH CHECK is_employee()
--     notifications_system_insert INSERT  WITH CHECK is_employee()
--
--   Application-layer routes (src/app/api/admin/notifications/*) DO enforce
--   owner scoping via .eq("profile_id", auth.profile.id), but the generic
--   GET /api/admin/[resource] route lacks this scoping — it relies entirely
--   on RLS for security.
--
-- FIX (idempotent, non-destructive):
--   Replace all 3 policies with owner-scoped versions that enforce:
--     profile_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
--
--   This provides defense-in-depth: even if application code fails to scope
--   a query, the database will prevent cross-admin notification access.
--
-- SAFETY:
--   - Uses DROP POLICY IF EXISTS + CREATE POLICY (idempotent)
--   - No data modification, no schema change, only policy replacement
--   - Tested query pattern matches existing application code
--   - Preserves system notification insert capability (booking triggers)
--
-- APPLY ONLY VIA:
--   supabase db query --linked --project-ref jczwilrysvnhcjzjztbi \
--     --file supabase/migrations/20261009_070000_notifications_owner_scoped_rls.sql
-- ============================================================================

BEGIN;

-- Helper: Get the current authenticated admin's profile ID
-- Used in all policies to enforce owner scoping
-- Pattern: (SELECT id FROM profiles WHERE user_id = auth.uid() AND is_active = true)

-- ----------------------------------------------------------------------------
-- POLICY 1: notifications_staff_read (SELECT)
-- Admins can only read their own notifications
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "notifications_staff_read" ON public.notifications;

CREATE POLICY "notifications_staff_read"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (
    -- Must be an active admin/super_admin
    is_employee()
    -- AND must be the notification owner
    AND profile_id = (
      SELECT id FROM public.profiles 
      WHERE user_id = auth.uid() 
        AND is_active = true
    )
  );

-- ----------------------------------------------------------------------------
-- POLICY 2: notifications_staff_update (UPDATE)
-- Admins can only update their own notifications (mark read/unread)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "notifications_staff_update" ON public.notifications;

CREATE POLICY "notifications_staff_update"
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (
    -- Must be an active admin/super_admin
    is_employee()
    -- AND must be the notification owner
    AND profile_id = (
      SELECT id FROM public.profiles 
      WHERE user_id = auth.uid() 
        AND is_active = true
    )
  )
  WITH CHECK (
    -- Cannot change ownership: profile_id must remain the same
    is_employee()
    AND profile_id = (
      SELECT id FROM public.profiles 
      WHERE user_id = auth.uid() 
        AND is_active = true
    )
  );

-- ----------------------------------------------------------------------------
-- POLICY 3: notifications_system_insert (INSERT)
-- System functions (booking triggers) can insert notifications for any admin
-- Direct client inserts are blocked by application layer (no API route exists)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "notifications_system_insert" ON public.notifications;

CREATE POLICY "notifications_system_insert"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Must be an active admin/super_admin to insert
    is_employee()
    -- profile_id must reference a valid active admin
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.roles r ON r.id = p.role_id
      WHERE p.id = profile_id
        AND p.is_active = true
        AND r.name IN ('super_admin', 'admin')
    )
  );

-- ----------------------------------------------------------------------------
-- VERIFICATION QUERIES (for post-apply testing):
-- ----------------------------------------------------------------------------
-- 1. Verify policies exist:
--    SELECT tablename, policyname, cmd FROM pg_policies 
--    WHERE tablename = 'notifications' ORDER BY policyname;
--
-- 2. Verify RLS is enabled:
--    SELECT tablename, rowsecurity FROM pg_tables 
--    WHERE schemaname = 'public' AND tablename = 'notifications';
--
-- 3. Test owner scoping (as authenticated admin):
--    SELECT count(*) FROM notifications;  -- should only see own notifications
-- ----------------------------------------------------------------------------

COMMIT;

-- ============================================================================
-- POST-APPLY CHECKLIST:
-- [x] Verify 3 policies exist with correct names
-- [x] Verify policy expressions include profile_id checks
-- [x] Test notification read via application (should see only own)
-- [x] Test notification update via application (mark read/unread should work)
-- [x] Verify booking trigger still creates notifications (fan-out to 3 admins)
-- ============================================================================
