-- ============================================================================
-- Migration: Add / normalise services.type (public website contract)
--
-- CONTRACT (read from live public source, D:\zt lounge\zt-lounge-demo\zt-lounge\
-- assets\js\repositories\ServicesRepository.js, v2.1.0):
--   getServices / getByCategory  .eq('type', 'service')     -> services list
--   getExperiences               .eq('type', 'experience')  -> experiences
--   getFeatures                  .eq('type', 'feature')     -> features
--   getPackages                  .eq('type', 'packages')    -> packages  (PLURAL!)
--   mapToUI                      type || 'service'          -> NULL renders as 'service'
--
-- LIVE EVIDENCE (2026-10-19, project jczwilrysvnhcjzjztbi, read-only queries):
--   - services.type EXISTS, nullable, default NULL, NO index, NO CHECK.
--     NOTE: 20261012080000 (RENAME type -> service_kind) was NEVER applied —
--     service_kind does NOT exist on live; type still carries the legacy
--     service-kind semantics.
--   - Value distribution (45 rows): informational=32, service=5, experience=5,
--     packages=3, NULL=0.
--   - 'packages' and 'informational' are LIVE, in-use values. 'packages' is
--     part of the public contract (getPackages). 'informational' is legacy —
--     the public site renders such rows only via getAll()/page config, never
--     via the service/experience/feature/packages lists.
--
-- *** NON-DESTRUCTIVE BY DESIGN ***
--   An earlier draft normalised every out-of-enum value to 'service'. That
--   would have (a) destroyed the 3 'packages' rows (breaking getPackages)
--   and (b) pushed the 32 'informational' rows INTO the public services list.
--   This version preserves every existing non-null value; it only fills
--   NULL/'' with the contract default 'service'.
--
-- Increments (all idempotent):
--   1. Add type column if missing
--   2. Backfill NULL / '' -> 'service' (matches mapToUI default)
--   3. Apply DEFAULT 'service' + NOT NULL
--   4. Idempotent CHECK constraint enumerating the full observed contract
--   5. Index for the public list filters
-- ============================================================================

-- Step 1: Add type column if it does not exist
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS type text;

-- Step 2: Backfill only NULL / '' -> 'service'.
-- All existing non-null values (service / experience / feature / packages /
-- informational) are intentionally preserved.
UPDATE public.services
SET type = 'service'
WHERE type IS NULL
   OR type = '';

-- Step 3: Enforce default + NOT NULL
ALTER TABLE public.services ALTER COLUMN type SET DEFAULT 'service';
ALTER TABLE public.services ALTER COLUMN type SET NOT NULL;

-- Step 4: CHECK constraint (idempotent). Enumerates the full contract plus
-- the legacy 'informational' value so the 32 existing rows remain writable.
-- Dropping 'informational' later requires a reclassification migration first.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'services_type_check'
      AND conrelid = 'public.services'::regclass
  ) THEN
    ALTER TABLE public.services
      ADD CONSTRAINT services_type_check
      CHECK (type IN ('service', 'experience', 'feature', 'packages', 'informational'));
  END IF;
END $$;

-- Step 5: Add index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_services_type ON public.services(type);

-- Step 6: Comment for documentation
COMMENT ON COLUMN public.services.type IS
  'Public display type consumed by the website ServicesRepository.js:
   ''service'' (services list) | ''experience'' (experiences) | ''feature'' (features)
   | ''packages'' (packages list, getPackages) | ''informational'' (legacy, page config only).';

-- ============================================================================
-- Rollback (for reference, do not execute)
-- ============================================================================
-- ALTER TABLE public.services DROP CONSTRAINT services_type_check;
-- ALTER TABLE public.services DROP COLUMN type;
-- (Do NOT rename service_kind -> type: on live, service_kind does not exist
--  and type is a distinct column — see LIVE EVIDENCE above.)
