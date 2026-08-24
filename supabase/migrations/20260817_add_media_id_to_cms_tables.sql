-- ============================================================================
-- ZT LOUNGE MEDIA CENTRALIZATION - PHASE 1C DATABASE MIGRATION
-- Migration: 20260817_add_media_id_to_cms_tables
-- Date: 2026-08-17
-- Purpose: Add nullable media_id foreign key columns to CMS tables
-- Status: BACKWARD COMPATIBLE - All changes are additive, nullable
-- ============================================================================

-- ============================================================================
-- PHASE 1: Add media_id columns to CMS tables (nullable, no defaults)
-- ============================================================================

-- Add media_id to menu_items
ALTER TABLE menu_items ADD COLUMN media_id uuid;

-- Add media_id to services
ALTER TABLE services ADD COLUMN media_id uuid;

-- Add media_id to gallery
ALTER TABLE gallery ADD COLUMN media_id uuid;

-- Add media_id to hero_slides
ALTER TABLE hero_slides ADD COLUMN media_id uuid;

-- ============================================================================
-- PHASE 2: Create foreign key constraints
-- Use ON DELETE RESTRICT to prevent media deletion while referenced
-- A referenced media asset must not silently disappear from its consumer
-- ============================================================================

-- menu_items.media_id -> media_assets.id
ALTER TABLE menu_items
DROP CONSTRAINT IF EXISTS fk_menu_items_media_id;

ALTER TABLE menu_items
ADD CONSTRAINT fk_menu_items_media_id
FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE RESTRICT;

-- services.media_id -> media_assets.id
ALTER TABLE services
DROP CONSTRAINT IF EXISTS fk_services_media_id;

ALTER TABLE services
ADD CONSTRAINT fk_services_media_id
FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE RESTRICT;

-- gallery.media_id -> media_assets.id
ALTER TABLE gallery
DROP CONSTRAINT IF EXISTS fk_gallery_media_id;

ALTER TABLE gallery
ADD CONSTRAINT fk_gallery_media_id
FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE RESTRICT;

-- hero_slides.media_id -> media_assets.id
ALTER TABLE hero_slides
DROP CONSTRAINT IF EXISTS fk_hero_slides_media_id;

ALTER TABLE hero_slides
ADD CONSTRAINT fk_hero_slides_media_id
FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE RESTRICT;

-- ============================================================================
-- PHASE 3: Create indexes on media_id columns for query performance
-- ============================================================================

CREATE INDEX idx_menu_items_media_id ON menu_items(media_id);
CREATE INDEX idx_services_media_id ON services(media_id);
CREATE INDEX idx_gallery_media_id ON gallery(media_id);
CREATE INDEX idx_hero_slides_media_id ON hero_slides(media_id);

-- ============================================================================
-- PHASE 4: Verify data integrity
-- All existing records will have media_id = NULL (no backfill in Phase 1)
-- Verification queries are commented out but available for manual testing
-- ============================================================================

-- Verify media_id columns exist and are nullable:
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name IN ('menu_items', 'services', 'gallery', 'hero_slides')
-- AND column_name = 'media_id';

-- Verify all existing records have media_id = NULL:
-- SELECT COUNT(*) as total, COUNT(media_id) as with_media_id FROM menu_items;
-- SELECT COUNT(*) as total, COUNT(media_id) as with_media_id FROM services;
-- SELECT COUNT(*) as total, COUNT(media_id) as with_media_id FROM gallery;
-- SELECT COUNT(*) as total, COUNT(media_id) as with_media_id FROM hero_slides;

-- Verify foreign key constraints exist:
-- SELECT constraint_name, table_name, column_name
-- FROM information_schema.key_column_usage
-- WHERE constraint_name LIKE 'fk_%_media_id';

-- ============================================================================
-- BACKWARD COMPATIBILITY NOTES
-- ============================================================================

-- ✅ Existing image_url fields remain unchanged and functional
-- ✅ No existing data is deleted or modified
-- ✅ All media_id values are NULL for existing records
-- ✅ Public rendering can continue using image_url as fallback
-- ✅ Existing CRUD operations remain unaffected
-- ✅ RLS policies continue to work (media_id is not restricted by RLS)

-- Future phases will:
-- - Add media_id to repository WRITABLE_FIELDS (Phase 3)
-- - Update admin UI to allow media_id selection (Phase 4)
-- - Implement fallback logic in public rendering (Phase 5)

-- ============================================================================
-- ROLLBACK (if needed)
-- ============================================================================

-- DROP CONSTRAINT IF EXISTS fk_hero_slides_media_id ON hero_slides;
-- DROP CONSTRAINT IF EXISTS fk_gallery_media_id ON gallery;
-- DROP CONSTRAINT IF EXISTS fk_services_media_id ON services;
-- DROP CONSTRAINT IF EXISTS fk_menu_items_media_id ON menu_items;
-- DROP INDEX IF EXISTS idx_hero_slides_media_id;
-- DROP INDEX IF EXISTS idx_gallery_media_id;
-- DROP INDEX IF EXISTS idx_services_media_id;
-- DROP INDEX IF EXISTS idx_menu_items_media_id;
-- ALTER TABLE menu_items DROP COLUMN media_id;
-- ALTER TABLE services DROP COLUMN media_id;
-- ALTER TABLE gallery DROP COLUMN media_id;
-- ALTER TABLE hero_slides DROP COLUMN media_id;

-- ============================================================================
