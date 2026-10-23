-- Migration: Add first-class category column to media_assets
-- Phase: Media category unification
-- Date: 2026-10-11 06:43 UTC
-- 
-- OBJECTIVE: Make category a queryable, editable field independent of path.
-- 
-- SCOPE:
--   - Add nullable category column with CHECK constraint
--   - Backfill from path pattern (assets/images/{category}/)
--   - Index on category for filtering
-- 
-- SAFETY:
--   - Column is nullable: legacy/unmatched paths get NULL
--   - CHECK constraint matches code allowlist (VALID_CATEGORIES from paths.ts)
--   - Purely additive: no data loss, rollback = DROP COLUMN
-- 
-- EVIDENCE (pre-apply):
--   - 53 total assets
--   - 7 with canonical paths (assets/images/{hero|gallery|menu|...}/)
--   - 46 with legacy paths (various formats, uploaded before Phase 3 standardization)

-- Step 1: Add column with CHECK constraint matching code allowlist
ALTER TABLE public.media_assets 
ADD COLUMN IF NOT EXISTS category TEXT 
CHECK (
  category IS NULL OR 
  category IN (
    'hero',
    'gallery', 
    'menu',
    'services',
    'testimonials',
    'branding',
    'promotions',
    'memberships'
  )
);

-- Step 2: Backfill from path pattern
-- Pattern: assets/images/{category}/{uuid}.{ext}
-- Unmatched paths remain NULL for admin triage
UPDATE public.media_assets 
SET category = CASE
  WHEN path ~ '^assets/images/hero/' THEN 'hero'
  WHEN path ~ '^assets/images/gallery/' THEN 'gallery'
  WHEN path ~ '^assets/images/menu/' THEN 'menu'
  WHEN path ~ '^assets/images/services/' THEN 'services'
  WHEN path ~ '^assets/images/testimonials/' THEN 'testimonials'
  WHEN path ~ '^assets/images/branding/' THEN 'branding'
  WHEN path ~ '^assets/images/promotions/' THEN 'promotions'
  WHEN path ~ '^assets/images/memberships/' THEN 'memberships'
  ELSE NULL
END
WHERE category IS NULL; -- idempotent: only touch rows without category

-- Step 3: Index for filtering (WHERE clause excludes NULL for smaller index)
CREATE INDEX IF NOT EXISTS idx_media_assets_category 
ON public.media_assets(category) 
WHERE category IS NOT NULL;

-- Expected distribution (2026-10-11 live data):
--   - 7 rows categorized (canonical paths)
--   - 46 rows NULL (legacy paths)
