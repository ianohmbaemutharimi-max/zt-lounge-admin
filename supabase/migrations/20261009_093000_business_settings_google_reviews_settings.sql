-- ============================================================================
-- Migration: 20261009_093000_business_settings_google_reviews_settings.sql
-- ----------------------------------------------------------------------------
-- Adds the Google Reviews settings surface to the canonical
-- public.business_settings table so the public /reviews page and the admin
-- Settings screen can render the Google Maps reviews CTA + API key:
--
--   google_maps_reviews_url   TEXT  - canonical Google Maps reviews URL
--   google_reviews_api_key    TEXT  - Google Reviews API key (server-side only)
--
-- PostgREST introspection (anon READ) confirmed both columns do NOT exist
-- today:
--   business_settings.google_maps_reviews_url       -> 400 "column does not exist"
--   business_settings.google_reviews_api_key        -> 400 "column does not exist"
--
-- Safety: IF NOT EXISTS + idempotent application (safe to re-run).
-- After applying, consider column-level grants so the anon role cannot read
-- the API key even through the public REST surface:
--
--   REVOKE SELECT (google_reviews_api_key)
--     ON public.business_settings
--     FROM anon;
-- ============================================================================

BEGIN;

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS google_maps_reviews_url text,
  ADD COLUMN IF NOT EXISTS google_reviews_api_key text;

COMMENT ON COLUMN public.business_settings.google_maps_reviews_url IS
  'Canonical Google Maps reviews URL (e.g. https://maps.app.goo.gl/...).
   Displayed as a "See reviews on Google Maps" CTA on the public /reviews page.';

COMMENT ON COLUMN public.business_settings.google_reviews_api_key IS
  'Google Reviews API key used by the site reviews integration.
   Keep this value server-side only; never expose it in public/CMS surfaces.';

COMMIT;

-- Optional verification (run with psql): show stored values so the integrator
-- can confirm the migration landed with data.
-- DO $$
-- DECLARE
--   v_url text;
--   v_key text;
-- BEGIN
--   SELECT google_maps_reviews_url, google_reviews_api_key
--     INTO v_url, v_key
--     FROM public.business_settings
--    WHERE id = 1;
--   RAISE NOTICE 'google_maps_reviews_url: %', v_url;
--   RAISE NOTICE 'google_reviews_api_key: %', v_key;
-- END;
-- $$;
