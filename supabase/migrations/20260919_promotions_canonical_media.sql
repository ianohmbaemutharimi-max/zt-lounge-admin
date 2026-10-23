-- Migration: Add canonical media_id and placement columns to promotions table
-- Purpose: Align promotions with canonical media_assets architecture (like gallery, services, menu-items, hero-slides)
-- Preserves: Existing promotion rows and banner_image field (for safe rollback)
-- Adds: media_id (FK to media_assets), page_id (FK to website_pages), show_on_homepage (boolean)

-- Add media_id column (nullable, references media_assets)
ALTER TABLE promotions 
  ADD COLUMN media_id UUID REFERENCES media_assets(id) ON DELETE SET NULL;

-- Add page_id column (nullable, references website_pages for page-specific promotions)
ALTER TABLE promotions 
  ADD COLUMN page_id UUID REFERENCES website_pages(id) ON DELETE SET NULL;

-- Add show_on_homepage column (boolean, default false)
ALTER TABLE promotions 
  ADD COLUMN show_on_homepage BOOLEAN NOT NULL DEFAULT false;

-- Add comment documenting the canonical media path
COMMENT ON COLUMN promotions.media_id IS 'Canonical media asset reference. Resolves through: promotions.media_id → media_assets.id → media_assets.public_url. Legacy banner_image field preserved for migration safety but should not be used.';

-- Update repository selectableColumns and writableColumns via code changes (not SQL)
-- These changes will be reflected in src/lib/repository.ts
