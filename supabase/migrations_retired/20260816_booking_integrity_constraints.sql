-- ============================================================
-- BOOKING INTEGRITY CONSTRAINTS
-- Created: 2026-08-16
-- Purpose: Add conflict detection and status validation
-- ============================================================

-- Phase 1: Add btree_gist extension for exclusion constraints
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Phase 2: Add booking status enum/constraint
-- First check if there are any invalid statuses in existing data
DO $$
DECLARE
  invalid_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO invalid_count
  FROM bookings
  WHERE status NOT IN ('pending', 'confirmed', 'completed', 'cancelled', 'no_show');
  
  IF invalid_count > 0 THEN
    RAISE WARNING 'Found % bookings with invalid status. Please fix before applying constraint.', invalid_count;
  END IF;
END $$;

-- Add CHECK constraint for booking status
ALTER TABLE bookings
ADD CONSTRAINT bookings_status_check
CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'no_show'));

-- Phase 3: Create tsrange helper function for booking time ranges
-- This combines booking_date + start_time and booking_date + end_time into timestamp ranges
CREATE OR REPLACE FUNCTION booking_timerange(
  booking_date DATE,
  start_time TIME,
  end_time TIME
) RETURNS tsrange AS $$
BEGIN
  RETURN tsrange(
    (booking_date + start_time)::timestamp,
    (booking_date + end_time)::timestamp,
    '[)' -- inclusive start, exclusive end
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Phase 4: Add exclusion constraint to prevent overlapping bookings
-- This ensures that for the same staff member, no two active bookings overlap in time
-- Cancelled bookings are excluded from conflict detection
ALTER TABLE bookings
ADD CONSTRAINT bookings_no_overlap_per_staff
EXCLUDE USING gist (
  staff_id WITH =,
  booking_timerange(booking_date, start_time, end_time) WITH &&
)
WHERE (status NOT IN ('cancelled'));

-- Phase 5: Add indexes for performance
-- Index for filtering by staff and date (common query pattern)
CREATE INDEX IF NOT EXISTS idx_bookings_staff_date 
ON bookings(staff_id, booking_date) 
WHERE status NOT IN ('cancelled');

-- Index for filtering by date range (calendar view)
CREATE INDEX IF NOT EXISTS idx_bookings_date_status 
ON bookings(booking_date, status);

-- Phase 6: Add helpful comments
COMMENT ON CONSTRAINT bookings_status_check ON bookings IS 
'Ensures booking status is one of: pending, confirmed, completed, cancelled, no_show';

COMMENT ON CONSTRAINT bookings_no_overlap_per_staff ON bookings IS 
'Prevents overlapping bookings for the same staff member. Cancelled bookings are excluded.';

COMMENT ON FUNCTION booking_timerange IS 
'Helper function that combines booking_date with start_time and end_time into a timestamp range for conflict detection';

-- Phase 7: Validate existing data
DO $$
DECLARE
  overlap_count INTEGER;
BEGIN
  -- Check for existing overlaps (this would fail the constraint)
  SELECT COUNT(*) INTO overlap_count
  FROM bookings b1
  JOIN bookings b2 ON 
    b1.staff_id = b2.staff_id 
    AND b1.id < b2.id
    AND b1.status NOT IN ('cancelled')
    AND b2.status NOT IN ('cancelled')
    AND booking_timerange(b1.booking_date, b1.start_time, b1.end_time) && 
        booking_timerange(b2.booking_date, b2.start_time, b2.end_time);
  
  IF overlap_count > 0 THEN
    RAISE NOTICE 'Migration applied successfully. Note: % existing booking conflicts detected.', overlap_count;
  ELSE
    RAISE NOTICE 'Migration applied successfully. No existing booking conflicts found.';
  END IF;
END $$;
