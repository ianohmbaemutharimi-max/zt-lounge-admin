-- Phase 2C: independent page-level visibility switches for the two service
-- sections rendered from services + service_charges.
-- Both default ON so existing pages keep their current public behavior.

ALTER TABLE website_pages
  ADD COLUMN IF NOT EXISTS service_cards_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE website_pages
  ADD COLUMN IF NOT EXISTS service_packages_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN website_pages.service_cards_enabled IS
  'Page-level visibility for the public #services card/category sections (services.page_id -> website_pages.id).';
COMMENT ON COLUMN website_pages.service_packages_enabled IS
  'Page-level visibility for the public #pricing/package sections (services.page_id -> website_pages.id -> service_charges via service_id).';
