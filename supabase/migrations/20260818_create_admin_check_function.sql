-- ============================================================================
-- Migration: 20260818_create_admin_check_function
-- Purpose: Create is_admin_or_above() function for RLS policies
-- 
-- ROOT CAUSE FIX for 500 errors on /api/admin/menu-items and /api/admin/hero-slides
-- 
-- The media_assets RLS policies reference is_admin_or_above() which didn't exist,
-- causing all admin queries to fail with permission denied errors.
-- ============================================================================

-- Create the is_admin_or_above() function
-- This function checks if the current user has admin role or above
CREATE OR REPLACE FUNCTION is_admin_or_above()
RETURNS boolean AS $$
BEGIN
  -- Check if current user has admin or above role
  RETURN (
    SELECT role IN ('admin', 'super_admin')
    FROM profiles
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create RLS policies for media_assets table
-- Allow admins to select all media_assets
CREATE POLICY "media_assets_admin_select"
  ON media_assets
  FOR SELECT
  TO authenticated
  USING (is_admin_or_above());

-- Allow admins to insert media_assets
CREATE POLICY "media_assets_admin_insert"
  ON media_assets
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_above());

-- Allow admins to update media_assets
CREATE POLICY "media_assets_admin_update"
  ON media_assets
  FOR UPDATE
  TO authenticated
  USING (is_admin_or_above())
  WITH CHECK (is_admin_or_above());

-- Allow admins to delete media_assets
CREATE POLICY "media_assets_admin_delete"
  ON media_assets
  FOR DELETE
  TO authenticated
  USING (is_admin_or_above());

-- Create RLS policies for media_usage table
-- Allow admins to select all media_usage
CREATE POLICY "media_usage_admin_select"
  ON media_usage
  FOR SELECT
  TO authenticated
  USING (is_admin_or_above());

-- Allow admins to insert media_usage
CREATE POLICY "media_usage_admin_insert"
  ON media_usage
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_above());

-- Allow admins to update media_usage
CREATE POLICY "media_usage_admin_update"
  ON media_usage
  FOR UPDATE
  TO authenticated
  USING (is_admin_or_above())
  WITH CHECK (is_admin_or_above());

-- Allow admins to delete media_usage
CREATE POLICY "media_usage_admin_delete"
  ON media_usage
  FOR DELETE
  TO authenticated
  USING (is_admin_or_above());

-- ============================================================================
-- Verification
-- ============================================================================
-- 
-- To verify the fix:
-- 1. SELECT * FROM pg_proc WHERE proname = 'is_admin_or_above';
-- 2. SELECT * FROM pg_policies WHERE tablename IN ('media_assets', 'media_usage');
-- 3. Test: GET /api/admin/menu-items (should return 200)
-- 4. Test: GET /api/admin/hero-slides (should return 200)
--
-- ============================================================================
