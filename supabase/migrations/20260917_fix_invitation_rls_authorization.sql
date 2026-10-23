-- LOOP 50 — Team Invitation RLS Authorization Remediation
-- 
-- OBJECTIVE: Restrict invitation mutation operations to super_admin only
-- 
-- CURRENT STATE (verified 2026-09-17):
--   INSERT: admin + super_admin
--   UPDATE: admin + super_admin  
--   DELETE: admin + super_admin
-- 
-- REQUIRED STATE:
--   INSERT: super_admin ONLY
--   UPDATE: super_admin ONLY
--   DELETE: super_admin ONLY
--   SELECT: admin + super_admin (unchanged, read-only access acceptable)
-- 
-- SCOPE: Surgical fix of authorization boundary only
-- - Preserves existing ownership checks (auth.uid() = invited_by)
-- - Preserves existing policy structure
-- - Changes only the role condition: IN ('super_admin', 'admin') → = 'super_admin'

-- Drop existing mutation policies (will be recreated with corrected authorization)
DROP POLICY IF EXISTS "Only admins can create invitations" ON invitations;
DROP POLICY IF EXISTS "Only admins can update invitations" ON invitations;
DROP POLICY IF EXISTS "Only admins can delete invitations" ON invitations;

-- Recreate INSERT policy: super_admin ONLY
CREATE POLICY "Only super_admin can create invitations"
  ON invitations
  FOR INSERT
  WITH CHECK (
    auth.uid() = invited_by
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role_id IN (
        SELECT id FROM roles WHERE name = 'super_admin'
      )
    )
  );

-- Recreate UPDATE policy: super_admin ONLY
CREATE POLICY "Only super_admin can update invitations"
  ON invitations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role_id IN (
        SELECT id FROM roles WHERE name = 'super_admin'
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role_id IN (
        SELECT id FROM roles WHERE name = 'super_admin'
      )
    )
  );

-- Recreate DELETE policy: super_admin ONLY
CREATE POLICY "Only super_admin can delete invitations"
  ON invitations
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role_id IN (
        SELECT id FROM roles WHERE name = 'super_admin'
      )
    )
  );

-- NOTE: SELECT policy "Admins can view all invitations" remains unchanged
-- Both admin and super_admin retain read-only access to invitation records
-- for team directory visibility purposes.
