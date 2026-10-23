-- ============================================================================
-- Media categorization — single source of truth
-- ============================================================================
-- Adds a first-class, editable `category` column to media_assets so an image
-- is categorized once (at upload) and flows through the entire workflow:
--
--   upload (storage path) → media_assets.category  (SOURCE OF TRUTH)
--     → /api/media (?category= filter)
--     → Library UI (category filter + per-card badge)
--     → MediaEditModal (re-categorize)
--     → image pickers (page-scoped browse)
--
-- The allowlist mirrors src/lib/storage/paths.ts VALID_CATEGORIES:
--   hero | gallery | menu | services | testimonials | branding | promotions | memberships
--
-- Backfill derives category from the existing storage path
-- (assets/images/<category>/…) so historical images are categorized without a
-- manual pass. Paths that don't match a canonical category stay NULL
-- ("Uncategorized") for an admin to set from the Edit dialog.
--
-- Purely additive + guarded by IF NOT EXISTS: safe to re-run, reversible with
--   ALTER TABLE public.media_assets DROP COLUMN category;
-- Does NOT touch RLS, roles, or authorization functions.
-- ============================================================================

-- 1. Add the column (nullable so legacy/unmatched rows stay valid)
ALTER TABLE public.media_assets
  ADD COLUMN IF NOT EXISTS category text;

-- 2. Backfill from the canonical storage path (assets/images/<category>/…).
--    Only writes when the extracted segment is one of the allowlisted values.
UPDATE public.media_assets
SET category = substring(path from '^assets/images/([^/]+)/')
WHERE category IS NULL
  AND substring(path from '^assets/images/([^/]+)/')
      IN ('hero','gallery','menu','services','testimonials',
          'branding','promotions','memberships');

-- 3. Index for fast category filtering on the Library + pickers
CREATE INDEX IF NOT EXISTS idx_media_assets_category
  ON public.media_assets(category);

-- 4. Integrity guard: category is NULL or an allowlisted value. Mirrors the
--    code allowlist so a rogue write can never persist an invalid category.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'media_assets_category_valid'
  ) THEN
    ALTER TABLE public.media_assets
      ADD CONSTRAINT media_assets_category_valid
      CHECK (category IS NULL OR category IN
        ('hero','gallery','menu','services','testimonials',
         'branding','promotions','memberships'));
  END IF;
END $$;
