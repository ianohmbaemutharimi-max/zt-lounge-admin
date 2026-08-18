-- ============================================================================
-- ZT LOUNGE MEDIA LIBRARY - PRODUCTION SCHEMA (ACTUAL)
-- Migration: 20260813_create_media_library_tables
-- Status: ALREADY APPLIED TO PRODUCTION (2026-08-13 14:52:11 UTC)
-- ============================================================================

-- IMPORTANT: This migration documents the ACTUAL production schema.
-- The tables already exist in production with these exact column names.
-- This file serves as documentation and should NOT be reapplied.

-- Production database: jczwilrysvnhcjzjztbi
-- Last verified: 2026-08-13 18:28 EAT
-- Data status: 36 media_assets, 35 media_usage, 100% valid paths

-- ============================================================================
-- Phase 1: Create media_assets table
-- ============================================================================

CREATE TABLE IF NOT EXISTS media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Storage reference
  bucket text NOT NULL,
  path text NOT NULL,  -- Storage path within bucket (e.g., "beef-steak.webp")
  public_url text NOT NULL,
  
  -- File metadata
  original_name text,  -- Source table name (e.g., "menu_items", not the filename)
  mime_type text,
  file_size integer,
  width integer,
  height integer,
  
  -- Display metadata
  alt_text text,
  title text,
  
  -- Deduplication
  content_hash text,
  
  -- Tracking
  uploaded_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  
  -- Lifecycle
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Constraints
  UNIQUE(bucket, path)
);

-- ============================================================================
-- Phase 2: Create media_usage table
-- ============================================================================

CREATE TABLE IF NOT EXISTS media_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_asset_id uuid NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  source_table text NOT NULL,
  source_column text NOT NULL,
  source_record_id uuid NOT NULL,
  source_url text,  -- Original URL from source record (production enhancement)
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- Prevent duplicate usage records
  UNIQUE(media_asset_id, source_table, source_record_id, source_column)
);

-- ============================================================================
-- Phase 3: Create indexes for performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_media_assets_bucket ON media_assets(bucket);
CREATE INDEX IF NOT EXISTS idx_media_assets_uploaded_by ON media_assets(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_media_assets_created ON media_assets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_usage_media ON media_usage(media_asset_id);
CREATE INDEX IF NOT EXISTS idx_media_usage_record ON media_usage(source_table, source_record_id);

-- ============================================================================
-- Phase 4: Enable RLS (Row Level Security)
-- ============================================================================

ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_usage ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Phase 5: Create RLS policies
-- ============================================================================

-- Note: Production uses is_admin_or_above() function for policy checks
-- Policy names and logic may differ from this template
-- Refer to actual production policies via Supabase Dashboard

-- media_assets: Admin access policy (template)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'media_assets' 
    AND policyname = 'media_assets_admin_manage'
  ) THEN
    EXECUTE 'CREATE POLICY media_assets_admin_manage
      ON media_assets
      FOR ALL
      TO authenticated
      USING (is_admin_or_above())';
  END IF;
END $$;

-- media_usage: Admin access policy (template)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'media_usage' 
    AND policyname = 'media_usage_admin_manage'
  ) THEN
    EXECUTE 'CREATE POLICY media_usage_admin_manage
      ON media_usage
      FOR ALL
      TO authenticated
      USING (is_admin_or_above())';
  END IF;
END $$;

-- ============================================================================
-- Phase 6: Create updated_at trigger for media_assets
-- ============================================================================

CREATE OR REPLACE FUNCTION update_media_assets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER media_assets_updated_at
  BEFORE UPDATE ON media_assets
  FOR EACH ROW
  EXECUTE FUNCTION update_media_assets_updated_at();

-- ============================================================================
-- Phase 7: Add helpful comments
-- ============================================================================

COMMENT ON TABLE media_assets IS 'Centralized media library for all website images';
COMMENT ON TABLE media_usage IS 'Tracks which content records reference which media assets';
COMMENT ON COLUMN media_assets.bucket IS 'Supabase Storage bucket name (e.g., menu-images, gallery-images)';
COMMENT ON COLUMN media_assets.path IS 'Storage path within bucket (e.g., beef-steak.webp)';
COMMENT ON COLUMN media_assets.public_url IS 'Complete public URL for direct access';
COMMENT ON COLUMN media_assets.original_name IS 'Source table name for tracking (e.g., menu_items)';
COMMENT ON COLUMN media_assets.content_hash IS 'SHA-256 hash for duplicate detection';
COMMENT ON COLUMN media_usage.source_url IS 'Original URL value from content table for audit trail';

-- ============================================================================
-- PRODUCTION STATUS
-- ============================================================================

-- ✅ Tables created: 2026-08-13 14:52:11 UTC
-- ✅ Data backfilled: 2026-08-13 14:52:46 UTC (36 assets, 35 usage)
-- ✅ RLS enabled: YES
-- ✅ PostgREST access: WORKING (after grants fix)
-- ✅ Data quality: 100% valid paths, zero integrity issues
-- ⚠️  Known issue: 1 missing usage record (business_settings.logo_url)

-- ============================================================================
-- DESIGN NOTES
-- ============================================================================

-- Production schema differences from common patterns:
--
-- 1. Uses `path` instead of `storage_path` (clearer, storage implied by context)
-- 2. Uses `media_asset_id` instead of `media_id` (more explicit)
-- 3. Uses `source_table/source_column/source_record_id` instead of
--    `table_name/field_name/record_id` (clearer intent)
-- 4. NO `category` column - categorization is implicit via bucket names
--    (menu-images bucket → menu category, gallery-images → gallery, etc.)
-- 5. NO `filename` column - redundant with `path`
-- 6. NO `description` column - not currently used (YAGNI principle)
-- 7. NO `deleted_at` column - soft deletes not implemented
-- 8. INCLUDES `source_url` - production enhancement for audit trail

-- These design choices follow YAGNI principle and provide a simpler,
-- cleaner schema that's working well in production.

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify tables exist:
-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' AND table_name IN ('media_assets', 'media_usage');

-- Verify indexes:
-- SELECT indexname FROM pg_indexes WHERE tablename IN ('media_assets', 'media_usage');

-- Check data counts:
-- SELECT COUNT(*) FROM media_assets;  -- Expected: 36
-- SELECT COUNT(*) FROM media_usage;   -- Expected: 35 (or 36 after logo fix)

-- Verify path quality:
-- SELECT COUNT(*) FROM media_assets WHERE path IS NULL OR path = 'undefined';
-- -- Expected: 0

-- Check bucket/path consistency:
-- SELECT bucket, path, public_url FROM media_assets LIMIT 5;

-- ============================================================================
-- ROLLBACK (NOT RECOMMENDED - PRODUCTION DATA EXISTS)
-- ============================================================================

-- ⚠️  WARNING: The following rollback commands will DELETE PRODUCTION DATA
-- Only execute if you understand the consequences and have backups

-- DROP TRIGGER IF EXISTS media_assets_updated_at ON media_assets;
-- DROP FUNCTION IF EXISTS update_media_assets_updated_at();
-- DROP POLICY IF EXISTS "media_usage_admin_manage" ON media_usage;
-- DROP POLICY IF EXISTS "media_assets_admin_manage" ON media_assets;
-- DROP TABLE IF EXISTS media_usage CASCADE;
-- DROP TABLE IF EXISTS media_assets CASCADE;

-- ============================================================================
-- MIGRATION HISTORY
-- ============================================================================

-- This migration was originally created with different column names
-- (storage_path, filename, original_filename, media_id, table_name, etc.)
-- but production was deployed with simplified names documented above.
--
-- This file has been RECONCILED to match production reality as of
-- 2026-08-13 18:30 EAT following migration drift investigation.
--
-- See: MEDIA_LIBRARY_MIGRATION_DRIFT_INVESTIGATION.md for full analysis.
