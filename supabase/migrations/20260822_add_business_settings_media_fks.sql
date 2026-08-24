-- ============================================================================
-- Migration: 20260822_add_business_settings_media_fks.sql
-- Adds FK constraints for business_settings branding media references
-- ============================================================================

-- business_settings.logo_media_id -> media_assets.id
ALTER TABLE business_settings
DROP CONSTRAINT IF EXISTS fk_business_settings_logo_media_id;

ALTER TABLE business_settings
ADD CONSTRAINT fk_business_settings_logo_media_id
FOREIGN KEY (logo_media_id) REFERENCES media_assets(id) ON DELETE RESTRICT;

-- business_settings.favicon_media_id -> media_assets.id
ALTER TABLE business_settings
DROP CONSTRAINT IF EXISTS fk_business_settings_favicon_media_id;

ALTER TABLE business_settings
ADD CONSTRAINT fk_business_settings_favicon_media_id
FOREIGN KEY (favicon_media_id) REFERENCES media_assets(id) ON DELETE RESTRICT;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_business_settings_logo_media_id ON business_settings(logo_media_id);
CREATE INDEX IF NOT EXISTS idx_business_settings_favicon_media_id ON business_settings(favicon_media_id);