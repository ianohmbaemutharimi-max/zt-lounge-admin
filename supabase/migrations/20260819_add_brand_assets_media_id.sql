-- Add media_id columns to business_settings for centralized brand asset management
-- This enables logo and favicon to use the media_assets system
-- Maintains backward compatibility with existing logo_url and favicon_url fields

ALTER TABLE business_settings
ADD COLUMN logo_media_id UUID REFERENCES media_assets(id) ON DELETE SET NULL,
ADD COLUMN favicon_media_id UUID REFERENCES media_assets(id) ON DELETE SET NULL;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_business_settings_logo_media_id ON business_settings(logo_media_id);
CREATE INDEX IF NOT EXISTS idx_business_settings_favicon_media_id ON business_settings(favicon_media_id);

-- Add helpful comment
COMMENT ON COLUMN business_settings.logo_media_id IS 'Reference to media_assets for logo (prioritized over logo_url)';
COMMENT ON COLUMN business_settings.favicon_media_id IS 'Reference to media_assets for favicon (prioritized over favicon_url)';
