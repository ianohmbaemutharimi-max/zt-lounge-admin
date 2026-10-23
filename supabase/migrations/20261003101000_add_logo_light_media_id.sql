-- ============================================================================
-- Migration: 20261003101000_add_logo_light_media_id.sql
-- Purpose:  Additive, backward-compatible nullable FK enabling separate
--           dark/light public logos (Option B, approved).
--
-- Canonical Supabase project: jczwilrysvnhcjzjztbi
--
-- The existing dark logo is preserved UNTOUCHED:
--   business_settings.logo_media_id
--       -> logos/logo.webp (DARK colorway)
--       -> rendered on .logo-light  (white / light header)
--
-- New light colorway reference:
--   business_settings.logo_light_media_id
--       -> logos/logo-white.webp (LIGHT colorway, registered via the media
--          pipeline in Phase 6)
--       -> rendered on .logo-dark  (dark header)
--
-- ON DELETE SET NULL matches the Drizzle `onDelete: "set null"` declared for
-- this FK in src/db/schema.ts. The public pipeline (resolveBranding /
-- branding-init) already handles a null/unresolvable media_id by falling
-- back to the static per-theme colorway, so a NULL logo_light_media_id never
-- breaks rendering.
--
-- NOTE: the pre-existing logo_media_id / favicon_media_id FKs use
--       ON DELETE RESTRICT (per the 20260822 migration) while schema.ts
--       declares onDelete "set null" for them. That drift is PRE-EXISTING
--       and OUT OF SCOPE for this task — it is surfaced, not fixed.
-- ============================================================================

ALTER TABLE business_settings
    ADD COLUMN IF NOT EXISTS logo_light_media_id uuid
        REFERENCES media_assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_business_settings_logo_light_media_id
    ON business_settings(logo_light_media_id);
