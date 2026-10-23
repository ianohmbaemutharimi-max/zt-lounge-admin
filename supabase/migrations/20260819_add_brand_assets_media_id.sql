-- Add media_id columns to business_settings for centralized brand asset management
-- This enables logo and favicon to use the media_assets system
-- Maintains backward compatibility with existing logo_url and favicon_url fields
--
-- RECONCILED (Loop 43) to the canonical live schema:
--   This migration owns ONLY the columns and indexes.
--   FK ownership belongs to 20260822_add_business_settings_media_fks
--   (named RESTRICT constraints: fk_business_settings_logo_media_id /
--   fk_business_settings_favicon_media_id). The original inline
--   REFERENCES ... ON DELETE SET NULL clauses were removed because they
--   conflict with the canonical named constraints and never existed live.

ALTER TABLE business_settings
ADD COLUMN logo_media_id UUID,
ADD COLUMN favicon_media_id UUID;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_business_settings_logo_media_id ON business_settings(logo_media_id);
CREATE INDEX IF NOT EXISTS idx_business_settings_favicon_media_id ON business_settings(favicon_media_id);

-- Add helpful comment
COMMENT ON COLUMN business_settings.logo_media_id IS 'Reference to media_assets for logo (prioritized over logo_url)';
COMMENT ON COLUMN business_settings.favicon_media_id IS 'Reference to media_assets for favicon (prioritized over favicon_url)';
