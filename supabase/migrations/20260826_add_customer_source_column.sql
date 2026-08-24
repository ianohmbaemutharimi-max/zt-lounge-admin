-- Migration: Add customer source column for provenance tracking
-- Date: 2026-08-24
-- Purpose: Track customer origin (manual vs booking) without invalid GENERATED column syntax
--
-- CHANGES:
-- 1. Add customers.source column (text, not GENERATED - invalid PostgreSQL syntax)
-- 2. Add CHECK constraint for valid values: 'manual', 'lead', 'booking'
-- 3. Backfill existing data based on booking status
-- 4. Add indexes for provenance queries
--
-- SOURCE VALUES:
--   'manual'  - Created explicitly through admin workflow
--   'lead'    - Created from pending booking (not yet confirmed)
--   'booking' - Created/linked via confirmed or completed booking
--
-- BUSINESS RULE:
--   - Pending bookings create customers with source='lead'
--   - Confirmed/completed bookings update source to 'booking'
--   - Manual customers have source='manual'

SET search_path = public;

-- Step 1: Add source column with default
-- Using a regular column instead of GENERATED ALWAYS AS (which doesn't support subqueries)
ALTER TABLE public.customers
ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual';

-- Step 2: Add CHECK constraint for valid source values
-- NOTE: PostgreSQL does NOT support "ADD CONSTRAINT IF NOT EXISTS".
-- Use a DO block guarded by pg_constraint lookup for idempotency.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'customers_source_check'
          AND conrelid = 'public.customers'::regclass
    ) THEN
        ALTER TABLE public.customers
        ADD CONSTRAINT customers_source_check
        CHECK (source IN ('manual'::text, 'lead'::text, 'booking'::text));
    END IF;
END $$;

-- Step 3: Backfill existing data
-- Classification rule:
--   IF customer has >= 1 confirmed/completed booking → source = 'booking'
--   ELSE IF customer has only pending bookings → source = 'lead'
--   ELSE → source = 'manual'

-- First, set customers with confirmed/completed bookings to 'booking'
UPDATE public.customers
SET source = 'booking'
WHERE id IN (
    SELECT DISTINCT b.customer_id
    FROM public.bookings b
    WHERE b.customer_id IS NOT NULL
      AND b.status IN ('confirmed', 'completed')
);

-- Then, set customers with only pending bookings to 'lead'
UPDATE public.customers
SET source = 'lead'
WHERE source = 'manual'
  AND id IN (
    SELECT DISTINCT b.customer_id
    FROM public.bookings b
    WHERE b.customer_id IS NOT NULL
      AND b.status = 'pending'
  )
  AND id NOT IN (
    SELECT DISTINCT b.customer_id
    FROM public.bookings b
    WHERE b.customer_id IS NOT NULL
      AND b.status IN ('confirmed', 'completed')
  );

-- Step 4: Add indexes for provenance queries
CREATE INDEX IF NOT EXISTS idx_customers_source ON public.customers (source);
CREATE INDEX IF NOT EXISTS idx_bookings_customer_status ON public.bookings (customer_id, status);

-- Step 5: Make source NOT NULL after backfill
ALTER TABLE public.customers
ALTER COLUMN source SET NOT NULL;

-- Verification queries:
-- SELECT id, full_name, source, phone FROM public.customers ORDER BY id;
-- SELECT id, customer_id, status FROM public.bookings ORDER BY id;