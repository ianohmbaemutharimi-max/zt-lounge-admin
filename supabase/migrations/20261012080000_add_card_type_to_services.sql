-- ============================================================================
-- Migration: Add card_type to services table
-- Phase 2 of Service Card Classification Fix
-- 
-- Problem: services.type contains 'service'/'experience'/'informational' which
-- represents service KIND, not card PRESENTATION type. The business needs
-- explicit control over Navigation/Information/Package card types.
--
-- Solution:
-- 1. Rename type → service_kind (clarifies semantics)
-- 2. Add card_type column with explicit values
-- 3. Backfill from existing href presence
-- ============================================================================

-- Step 1: Rename type to service_kind
ALTER TABLE services RENAME COLUMN type TO service_kind;

-- Step 2: Add card_type column with CHECK constraint
ALTER TABLE services 
ADD COLUMN card_type text 
CHECK (card_type IN ('navigation', 'information', 'package'));

-- Step 3: Backfill card_type based on current href presence
-- Navigation: has href (appears in Home/Contact discovery)
-- Information: no href (page-scoped only)
-- Package: initially none (packages are service_charges, not service rows)
UPDATE services 
SET card_type = CASE 
  WHEN href IS NOT NULL AND href != '' THEN 'navigation'
  ELSE 'information'
END
WHERE card_type IS NULL;

-- Step 4: Make card_type NOT NULL after backfill
ALTER TABLE services ALTER COLUMN card_type SET NOT NULL;

-- Step 5: Set default for new services
ALTER TABLE services ALTER COLUMN card_type SET DEFAULT 'information';

-- Step 6: Add index for efficient filtering
CREATE INDEX idx_services_card_type ON services(card_type);

-- Step 7: Add comment for documentation
COMMENT ON COLUMN services.service_kind IS 'Service category/kind: service, experience, or informational content';
COMMENT ON COLUMN services.card_type IS 'Card presentation type: navigation (global discovery), information (page-scoped), package (pricing display)';

-- ============================================================================
-- Rollback (for reference, do not execute)
-- ============================================================================
-- ALTER TABLE services DROP COLUMN card_type;
-- ALTER TABLE services RENAME COLUMN service_kind TO type;
