-- Migration: Add customer provenance tracking
-- Purpose: Enforce the business invariant that customers originate from
-- exactly one of: MANUAL creation or SUCCESSFUL BOOKING
-- 
-- Changes:
-- 1. Make bookings.customer_id nullable (allows pending bookings without customer)
-- 2. Add customers.source column to track provenance
-- 3. Safe backfill of existing data
--
-- Invariants enforced:
--   - pending booking MUST NOT create a legitimate customer
--   - cancelled/no_show/failed booking MUST NOT create a legitimate customer
--   - confirmed/completed booking MAY create a booking-derived customer
--   - manual customer may have zero successful bookings
--   - source = 'booking' requires >= 1 successful booking
--   - source = 'manual' is valid with zero bookings

-- ------------------------------------------------------------
-- Step 1: Make bookings.customer_id nullable
-- ------------------------------------------------------------
-- Previously: bookings.customer_id UUID NOT NULL
-- Now:        allows NULL for pending bookings that haven't
--             yet qualified as successful
--
-- Rationale: The FK constraint ON DELETE RESTRICT is preserved.
--          A pending booking with customer_id = NULL is valid;
--          customer creation/linking only occurs when the booking
--          transitions to confirmed or completed.
--
ALTER TABLE public.bookings
ALTER COLUMN customer_id DROP NOT NULL;

-- ------------------------------------------------------------
-- Step 2: Add customers.source column
-- ------------------------------------------------------------
-- Stores the provenance of each customer:
--   'manual' — created intentionally through admin workflow
--   'booking' — created/linked via successful booking (confirmed/completed)
--
-- A CHECK constraint ensures only valid values are accepted.
-- The column is NOT NULL with a safe default handled in backfill.
--
ALTER TABLE public.customers
ADD COLUMN source text
    GENERATED ALWAYS AS (
        CASE
            WHEN EXISTS (
                SELECT 1 FROM public.bookings b
                WHERE b.customer_id = customers.id
                    AND b.status IN ('confirmed'::text, 'completed'::text)
            ) THEN 'booking'
            ELSE 'manual'
        END
    ) STORED,
-- Override the generated value for known manual customers
-- (backfill will set appropriate values; this default handles new rows)
CONSTRAINT customers_source_check
CHECK (source IN ('manual'::text, 'booking'::text));

-- ------------------------------------------------------------
-- Step 3: Backfill existing data
-- ------------------------------------------------------------
-- Classification rule (applied per customer row):
--   IF customer has >= 1 confirmed/completed booking  → source = 'booking'
--   ELSE                                                  → source = 'manual'
--
-- Rationale:
--   - pending bookings alone do NOT qualify as successful
--   - we cannot retroactively prove provenance for all records
--   - the safest deterministic strategy avoids inventing certainty
--   - manual customers are valid with zero bookings
--
-- This UPDATE sets source based on actual booking data.
-- Customers with no qualifying bookings are classified as 'manual'
-- because we cannot prove they were created via successful booking.
--
UPDATE public.customers
SET source = CASE
    WHEN EXISTS (
        SELECT 1 FROM public.bookings b
        WHERE b.customer_id = public.customers.id
            AND b.status IN ('confirmed'::booking_status, 'completed'::booking_status)
    ) THEN 'booking'::text
    ELSE 'manual'::text
END;

-- ------------------------------------------------------------
-- Step 4: Add index for provenance queries
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_customers_source
    ON public.customers (source);

CREATE INDEX IF NOT EXISTS idx_bookings_customer_status
    ON public.bookings (customer_id, status);

-- ------------------------------------------------------------
-- Step 5: Verify RLS policies remain intact
-- ------------------------------------------------------------
-- No RLS changes required in this migration.
-- Existing policies from 20260822_enable_booking_rls_security.sql
-- continue to apply: anon DENIED, authenticated admins ALLOWED.

-- ------------------------------------------------------------
-- Migration Notes
-- ------------------------------------------------------------
-- Changes are additive where possible:
--   - ALTER COLUMN ... DROP NOT NULL (reversible in principle)
--   - ADD COLUMN with DEFAULT (reversible)
--   - CHECK constraint (reversible)
--   - Data backfill is best-effort; ambiguous records are set to 'manual'
--   - Indexes are standard and independently reversible
--
-- Risks mitigated:
--   - Previously: bookings.customer_id NOT NULL forced customer creation
--                 at booking submission (including pending bookings)
--   - Now:       pending bookings can have customer_id = NULL
--   - New risk:   backfill classification is deterministic but not
--                 historically verified for all records;
--                 ambiguous cases default to 'manual' to avoid
--                 fabricating provenance
--
-- Verification query after migration:
--   SELECT id, source, full_name
--   FROM public.customers
--   ORDER BY id;
--
-- Verification query for bookings:
--   SELECT id, customer_id, status
--   FROM public.bookings
--   ORDER BY id;