-- Migration: Make promotions page-scoped
-- Purpose: Enforce page ownership on promotions (page_id NOT NULL)
-- Requires: Existing NULL page_id rows must be backfilled before applying
--           or this migration will fail on NOT NULL constraint.

-- Backfill: assign existing NULL page_id promotions to the first public page
-- (safe default; operators should reassign as needed)
UPDATE promotions SET page_id = (
  SELECT id FROM website_pages WHERE page_key = 'home' LIMIT 1
) WHERE page_id IS NULL;

-- Make page_id NOT NULL (page-scoped)
ALTER TABLE promotions ALTER COLUMN page_id SET NOT NULL;