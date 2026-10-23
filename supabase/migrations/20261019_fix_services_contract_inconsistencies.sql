-- ============================================================================
-- Migration: Fix services layer contract inconsistencies
-- Addresses audit findings: C-1, C-3, T-1, T-3, T-4, T-6
-- ============================================================================

-- 1. services: add deleted_at for soft-delete support
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 2. service_categories: add page_id for page-scoping
ALTER TABLE public.service_categories
  ADD COLUMN IF NOT EXISTS page_id uuid REFERENCES public.website_pages(id) ON DELETE SET NULL;

-- 3. service_charges: add is_active boolean to unify with services.is_active
ALTER TABLE public.service_charges
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true NOT NULL;

-- 4. Index for soft-delete queries on services
CREATE INDEX IF NOT EXISTS idx_services_deleted_at ON public.services(deleted_at);

-- 5. Index for page-scoped category queries
CREATE INDEX IF NOT EXISTS idx_service_categories_page_id ON public.service_categories(page_id);

-- 6. Backfill is_active on service_charges from status text column
UPDATE public.service_charges
SET is_active = (status = 'active')
WHERE is_active IS DISTINCT FROM (status = 'active');

-- 7. Trigger: cascade services.is_active=false to service_charges
CREATE OR REPLACE FUNCTION cascade_service_is_active_to_charges()
RETURNS TRIGGER AS $$
BEGIN
  -- When a service is deactivated, deactivate all its charges
  IF OLD.is_active = true AND NEW.is_active = false THEN
    UPDATE public.service_charges
    SET is_active = false, status = 'inactive', updated_at = now()
    WHERE service_id = NEW.id AND is_active = true;
  END IF;
  -- When a service is reactivated, optionally leave charges as-is
  -- (admin must explicitly reactivate packages)
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cascade_service_is_active_to_charges ON public.services;
CREATE TRIGGER trigger_cascade_service_is_active_to_charges
  BEFORE UPDATE ON public.services
  FOR EACH ROW
  EXECUTE FUNCTION cascade_service_is_active_to_charges();

-- 8. Trigger: prevent assigning service to an inactive category
CREATE OR REPLACE FUNCTION validate_service_category_is_active()
RETURNS TRIGGER AS $$
DECLARE
  cat_is_active boolean;
BEGIN
  IF NEW.category_id IS NOT NULL THEN
    SELECT is_active INTO cat_is_active
    FROM public.service_categories
    WHERE id = NEW.category_id;
    IF cat_is_active IS NULL THEN
      RAISE EXCEPTION 'service_categories.id % does not exist', NEW.category_id
        USING ERRCODE = '23503';
    END IF;
    IF cat_is_active = false THEN
      RAISE EXCEPTION 'Cannot assign service to inactive category %', NEW.category_id
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validate_service_category_is_active ON public.services;
CREATE TRIGGER trigger_validate_service_category_is_active
  BEFORE INSERT OR UPDATE ON public.services
  FOR EACH ROW
  EXECUTE FUNCTION validate_service_category_is_active();

-- ============================================================================
-- End of migration
-- ============================================================================