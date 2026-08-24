-- ============================================================================
-- ZT Lounge — BOOKING/CUSTOMER LIFECYCLE RECONCILIATION  (single forward migration)
-- Author: autonomous remediation → canonical lifecycle contract
--
-- GOAL: enforce the authoritative business invariant:
--   PATH A (PUBLIC): submission → booking 'pending' with customer_id = NULL and
--                    NO customers row. Confirmation → atomic create/link customer
--                    (source='booking') and populate bookings.customer_id.
--   PATH B (MANUAL): explicit admin create → customers.source = 'manual'.
--
-- This migration is a SINGLE forward reconciliation of the previous
-- create_booking()/admin_booking() lifecycle which illegally created customers
-- at SUBMISSION time. It never fabricates live verification and it STOPS
-- (throws) rather than delete or silently merge production customers.
-- ============================================================================

BEGIN;

SET search_path = public;

-- ----------------------------------------------------------------------------
-- 0) SAFETY BASELINE — capture pre-migration state for audit (read-only snapshot)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS booking_customer_reconciliation_audit AS
SELECT
  c.id                                             AS customer_id,
  c.full_name,
  c.phone,
  COALESCE(c.source, 'manual')                     AS source,
  COUNT(b.id)::integer                             AS total_bookings,
  (COUNT(b.id) FILTER (WHERE b.status = 'pending'))::integer                         AS pending_count,
  (COUNT(b.id) FILTER (WHERE b.status IN ('confirmed','completed')))::integer        AS successful_count,
  (COUNT(b.id) FILTER (WHERE b.status = 'cancelled'))::integer                       AS cancelled_count
FROM public.customers c
LEFT JOIN public.bookings b ON b.customer_id = c.id
GROUP BY c.id, c.full_name, c.phone, c.source;

-- ----------------------------------------------------------------------------
-- 1) CUSTOMER PROVENANCE — canonical contract.
--    Allowed: 'manual' | 'booking'. Legacy 'lead' is NOT a legitimate lifecycle
-- 1b. Drop any legacy constraint (guarded) and re-create the canonical CHECK.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conname = 'customers_source_check'
               AND conrelid = 'customers'::regclass) THEN
    ALTER TABLE public.customers DROP CONSTRAINT customers_source_check;
  END IF;
END $$;

ALTER TABLE public.customers
  ADD CONSTRAINT customers_source_check
  CHECK (source IN ('manual'::text, 'booking'::text));
COMMENT ON CONSTRAINT customers_source_check ON public.customers IS
  'Canonical provenance: manual (explicit admin) | booking (established at booking confirmation)';

-- 1c) Reclassify legacy rows deterministically WITHOUT deletion.
--     Pending-only customers were created pre-remediation — not proven booking
--     customers → safest non-destructive label 'manual'.
UPDATE public.customers c
SET source = CASE
  WHEN EXISTS (SELECT 1 FROM public.bookings b
               WHERE b.customer_id = c.id
                 AND b.status IN ('confirmed','completed')) THEN 'booking'
  ELSE 'manual'
END,
    updated_at = now()
WHERE c.source IS DISTINCT FROM CASE
  EXISTS (SELECT 1 FROM public.bookings b
          WHERE b.customer_id = c.id
            AND b.status IN ('confirmed','completed')) THEN 'booking'
  ELSE 'manual'
END;

-- ----------------------------------------------------------------------------
-- 2) CONCURRENCY-SAFE CUSTOMER DEDUPLICATION.
--    Canonical normalized phone representation drives a UNIQUE index.
-- ----------------------------------------------------------------------------
-- 2a) helper: normalize a Kenyan mobile to canonical +2547XXXXXXXX form.
CREATE OR REPLACE FUNCTION public.normalize_customer_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE v_norm text;
BEGIN
  IF p_phone IS NULL OR length(trim(p_phone)) = 0 THEN
    RETURN NULL;
  END IF;
  v_norm := regexp_replace(p_phone, '[^0-9]', '', 'g');
  IF left(v_norm, 1) = '0' THEN
    v_norm := '254' || substring(v_norm from 2);
  END IF;
  IF left(v_norm, 3) != '254' THEN
    v_norm := '254' || v_norm;
  END IF;
  RETURN '+' || v_norm;
END;
$$;

-- 2b) add stored normalized phone (nullable until backfilled)
ALTER TABLE public.customers
-- 2d) SAFETY: if duplicates exist → STOP (never delete or silently merge).
DO $$
DECLARE v_dups integer;
BEGIN
  SELECT COUNT(*) INTO v_dups FROM (
    SELECT phone_normalized FROM public.customers
    WHERE phone_normalized IS NOT NULL
    GROUP BY phone_normalized HAVING COUNT(*) > 1
  ) d;
  IF v_dups > 0 THEN
    RAISE EXCEPTION
      'DUPLICATE NORMALIZED PHONES (% group(s)) — manual reconciliation required first. Run: ' ||
      'SELECT phone_normalized, COUNT(*) FROM public.customers WHERE phone_normalized IS NOT NULL GROUP BY phone_normalized HAVING COUNT(*) > 1;';
  END IF;
END $$;

-- 2e) enforce uniqueness on the canonical representation.
ALTER TABLE public.customers
  ADD CONSTRAINT customers_phone_normalized_unique UNIQUE (phone_normalized);
CREATE INDEX IF NOT EXISTS idx_customers_phone_normalized ON public.customers (phone_normalized);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers (phone);

-- ----------------------------------------------------------------------------
-- 3) BOOKINGS — GUEST IDENTITY (required so a pending booking carries guest PII
--    with customer_id NULL, and confirmation can create/link the customer).
-- ----------------------------------------------------------------------------
ALTER TABLE public.bookings
-- ----------------------------------------------------------------------------
-- 4) CANONICAL FUNCTION — create_booking()
--    PUBLIC lifecycle: MUST NOT insert OR update customers. Creates ONLY a
--    pending booking with customer_id = NULL and stores guest identity.
-- ----------------------------------------------------------------------------
-- 4a) Drop obsolete legacy overloads so only the canonical signature remains
--     (no competing RPC contract).
DROP FUNCTION IF EXISTS public.create_booking(text,text,text,date,time,time,integer,text,text);  -- legacy 024/033
DROP FUNCTION IF EXISTS public.create_booking(text,text,date,time,integer,text,text,text);        -- legacy 025

CREATE OR REPLACE FUNCTION public.create_booking(
  p_full_name        text,
  p_phone            text,
  p_booking_date     date,
  p_start_time       time,
  p_guests           integer DEFAULT 1,
  p_email            text    DEFAULT NULL,
  p_service_slug     text    DEFAULT 'restaurant',
  p_special_requests text    DEFAULT NULL
)
RETURNS TABLE(
  booking_id     uuid,
  booking_number text,
  customer_id    uuid,
  service_id     uuid,
  booking_date   date,
  start_time     time,
  end_time       time,
  guests         integer,
  status         text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_service_id       uuid;
  v_duration_minutes integer;
  v_end_time         time;
  v_guests           integer := COALESCE(p_guests, 1);
BEGIN
  -- validation ----------------------------
  IF p_full_name IS NULL OR length(trim(p_full_name)) = 0 THEN
    RAISE EXCEPTION 'validation_error: full_name is required';
  END IF;
  IF p_phone IS NULL OR length(trim(p_phone)) = 0 THEN
    RAISE EXCEPTION 'validation_error: phone is required';
  END IF;
  IF p_phone !~ '^(\+?254|0)?7[0-9]{8}$' THEN
    RAISE EXCEPTION 'validation_error: phone must be a valid Kenyan mobile number';
  END IF;
  IF p_booking_date IS NULL OR p_booking_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'validation_error: booking_date cannot be in the past';
  END IF;
  IF p_booking_date > CURRENT_DATE + INTERVAL '365 days' THEN
    RAISE EXCEPTION 'validation_error: booking_date cannot be more than 365 days in the future';
  END IF;
  IF p_start_time IS NULL THEN
    RAISE EXCEPTION 'validation_error: start_time is required';
  END IF;
  IF v_guests < 1 OR v_guests > 50 THEN
    RAISE EXCEPTION 'validation_error: guests must be between 1 and 50';
  END IF;

  -- resolve service
  SELECT id, COALESCE(duration_minutes, 60)
    INTO v_service_id, v_duration_minutes
  FROM public.services
  WHERE slug = COALESCE(NULLIF(p_service_slug, ''), 'restaurant')
    AND is_active = true
  LIMIT 1;
  IF v_service_id IS NULL THEN
    RAISE EXCEPTION 'not_found: service with slug "%" not found or inactive', p_service_slug;
  END IF;

  -- end_time derived from start_time + service duration
  v_end_time := p_start_time + (v_duration_minutes || ' minutes')::interval;

  -- booking number (deterministic short token)
  SELECT 'ZT-' || upper(substr(md5(now()::text || gen_random_uuid()::text), 1, 8))
    INTO v_booking_number;

  -- INSERT booking ONLY — NO customers read/write. customer_id remains NULL.
  INSERT INTO public.bookings (
    booking_number, service_id, booking_date, start_time, end_time,
    guests, status, special_requests,
    guest_full_name, guest_phone, guest_email,
    created_at, updated_at
  ) VALUES (
    v_booking_number, v_service_id, p_booking_date, p_start_time, v_end_time,
    v_guests, 'pending', NULLIF(trim(COALESCE(p_special_requests, '')), ''),
    trim(p_full_name), trim(p_phone), NULLIF(trim(COALESCE(p_email, '')), ''),
    now(), now()
  )
  RETURNING
    id AS booking_id, booking_number, customer_id, service_id,
    booking_date, start_time, end_time, guests, status
  INTO booking_id, booking_number, customer_id, service_id,
       booking_date, start_time, end_time, guests, status;

  RETURN NEXT;
END;
$$;

-- grants: anon may create a booking through this RPC only (SECURITY DEFINER).
REVOKE ALL ON FUNCTION public.create_booking(text,text,date,time,integer,text,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_booking(text,text,date,time,integer,text,text,text) TO anon;
GRANT  EXECUTE ON FUNCTION public.create_booking(text,text,date,time,integer,text,text,text) TO authenticated;

COMMENT ON FUNCTION public.create_booking IS
  'Public booking RPC — callable by anon. Creates ONLY a pending booking (customer_id NULL). Never reads or writes customers.';
  ADD COLUMN IF NOT EXISTS guest_full_name text,
  ADD COLUMN IF NOT EXISTS guest_phone text,
  ADD COLUMN IF NOT EXISTS guest_email text;

COMMENT ON COLUMN public.bookings.guest_full_name IS
  'Guest name captured at public submission. customer_id stays NULL until confirmation.';
COMMENT ON COLUMN public.bookings.guest_phone IS
  'Guest phone captured at public submission. Used to create/link the customer on confirmation.';
  ADD COLUMN IF NOT EXISTS phone_normalized text;

-- 2c) backfill normalized phone from existing phone values.
UPDATE public.customers
SET phone_normalized = public.normalize_customer_phone(phone)
WHERE phone_normalized IS NULL AND phone IS NOT NULL;
--    state; it only existed because the old RPC created customers at submission.
-- ----------------------------------------------------------------------------
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual' NOT NULL;
-- ----------------------------------------------------------------------------
-- 5) CANONICAL FUNCTION — confirm_booking()   [the confirmation boundary]
--    ATOMIC: lock booking, verify pending, derive guest identity, create OR
--    link the customer (source='booking'), set bookings.customer_id, set status.
--    Runs as one plpgsql transaction → any failure rolls the whole thing back.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.confirm_booking(uuid);

CREATE OR REPLACE FUNCTION public.confirm_booking(p_booking_id uuid)
RETURNS TABLE(
  booking_id      uuid,
  booking_number  text,
  customer_id     uuid,
  status          text,
  customer_source text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_booking_number   text;
  v_customer_id      uuid;
  v_guest_name       text;
  v_guest_phone      text;
  v_guest_email      text;
  v_phone_normalized text;
BEGIN
  -- 1. lock the booking row FOR UPDATE (serializes concurrent confirmations;
  --    the DB status-transition trigger rejects a second confirm).
  SELECT booking_number, customer_id, guest_full_name, guest_phone, guest_email
    INTO v_booking_number, v_customer_id, v_guest_name, v_guest_phone, v_guest_email
  FROM public.bookings
  WHERE id = p_booking_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found or not in a pending state';
  END IF;

  -- 2. guest identity is authoritative (defensive).
  IF v_guest_name IS NULL OR length(trim(v_guest_name)) = 0 OR v_guest_phone IS NULL THEN
    RAISE EXCEPTION 'Cannot confirm: booking is missing guest identity';
  END IF;

  v_phone_normalized := public.normalize_customer_phone(v_guest_phone);
  IF v_phone_normalized IS NULL THEN
    RAISE EXCEPTION 'Cannot confirm: booking has no valid normalized phone';
  END IF;

  -- 3. Concurrency-safe create-or-link. UNIQUE(customers.phone_normalized)
  --    guarantees a single customer per phone even under racing confirms.
  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (full_name, phone, phone_normalized, email, source, is_active)
    VALUES (v_guest_name, v_guest_phone, v_phone_normalized, v_guest_email, 'booking', true)
    ON CONFLICT (phone_normalized) DO UPDATE
      SET full_name = EXCLUDED.full_name,
          email     = COALESCE(EXCLUDED.email, customers.email),
          updated_at = now()
    RETURNING id INTO v_customer_id;
  END IF;

  -- 4. Update booking: link customer + set confirmed, atomically.
  UPDATE public.bookings
     SET customer_id = v_customer_id,
         status      = 'confirmed',
         updated_at  = now()
   WHERE id = p_booking_id;

  -- 5. return result
  RETURN QUERY
    SELECT p_booking_id, v_booking_number, v_customer_id, 'confirmed'::text, 'booking'::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_booking(uuid) TO authenticated;

COMMENT ON FUNCTION public.confirm_booking IS
  'Authoritative confirmation boundary. ATOMIC: creates-or-links the customer (source=booking) and sets bookings.customer_id + status=confirmed in one transaction.';
-- ----------------------------------------------------------------------------
-- 6) CANONICAL FUNCTION — admin_booking()
--    ADMIN lifecycle: consistent with the single lifecycle. NEVER creates a
--    customer from a booking submission. If an explicit customer is supplied it
--    is used (no silent creation); otherwise guest identity is stored on the
--    pending booking and a customer is established at confirmation.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_booking(text,text,text,date,time,time,integer,uuid,uuid,text,uuid);   -- legacy 027
DROP FUNCTION IF EXISTS public.admin_booking(uuid,uuid,date,time,time,integer,text,uuid,uuid);

CREATE OR REPLACE FUNCTION public.admin_booking(
  p_customer_id      uuid,
  p_service_id       uuid,
  p_booking_date     date,
  p_start_time       time,
  p_end_time         time,
  p_full_name        text    DEFAULT NULL,
  p_phone            text    DEFAULT NULL,
  p_email            text    DEFAULT NULL,
  p_guests           integer DEFAULT 1,
  p_special_requests text    DEFAULT NULL,
  p_staff_id         uuid    DEFAULT NULL,
  p_created_by       uuid    DEFAULT NULL,
  p_booking_number   text    DEFAULT NULL
)
RETURNS TABLE(
  booking_id     uuid,
  booking_number text,
  customer_id    uuid,
  status         text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_booking_number text;
BEGIN
  IF p_service_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.services WHERE id = p_service_id AND is_active = true) THEN
    RAISE EXCEPTION 'Invalid or inactive service_id';
  END IF;
  IF p_booking_date IS NULL OR p_booking_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'validation_error: booking_date cannot be in the past';
  END IF;
  IF p_start_time IS NULL OR p_end_time IS NULL OR p_end_time <= p_start_time THEN
    RAISE EXCEPTION 'validation_error: end_time must be after start_time';
  END IF;
  -- An explicit customer must exist (no silent creation at submission).
  IF p_customer_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.customers WHERE id = p_customer_id AND is_active = true) THEN
    RAISE EXCEPTION 'not_found: referenced customer does not exist or is inactive';
  END IF;

  SELECT COALESCE(p_booking_number, 'ZT-' || upper(substr(md5(now()::text || gen_random_uuid()::text), 1, 8)))
    INTO v_booking_number;

  INSERT INTO public.bookings (
    booking_number, service_id, customer_id, staff_id, booking_date, start_time, end_time,
    guests, status, special_requests, created_by,
    guest_full_name, guest_phone, guest_email,
    created_at, updated_at
  ) VALUES (
    v_booking_number, p_service_id, p_customer_id, p_staff_id, p_booking_date, p_start_time, p_end_time,
    COALESCE(p_guests,1), 'pending', p_special_requests, p_created_by,
    NULLIF(trim(COALESCE(p_full_name,'')), ''), NULLIF(trim(COALESCE(p_phone,'')), ''), NULLIF(trim(COALESCE(p_email,'')), ''),
    now(), now()
  )
  RETURNING id AS booking_id, booking_number, customer_id, status
  INTO booking_id, booking_number, customer_id, status;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_booking(uuid,uuid,date,time,time,text,text,text,integer,text,uuid,uuid,text) TO authenticated;

COMMENT ON FUNCTION public.admin_booking IS
  'Admin booking RPC — never creates a customer from submission. Uses an existing customer_id if supplied; otherwise stores guest identity and stays pending with customer_id NULL (established at confirmation).';

-- ----------------------------------------------------------------------------
-- 7) CLEANUP — remove obsolete/stale lifecycle artifacts (idempotent).
--    The old promote trigger assumed customers already existed from submission;
--    the canonical confirm_booking() now owns provenance atomically. Remove the
--    competing implementation and its stale function.
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_bookings_promote_customer_source ON public.bookings;
DROP FUNCTION IF EXISTS public.promote_customer_source_on_booking_status();
DROP FUNCTION IF EXISTS public.create_booking(text,text,text,date,time,time,integer,text,text);
DROP FUNCTION IF EXISTS public.create_booking(text,text,date,time,integer,text,text,text);
-- ----------------------------------------------------------------------------
-- 8) SECURITY — canonical RLS on bookings & customers (idempotent).
--    anon: DENY direct SELECT/INSERT/UPDATE/DELETE. Public booking MUST go
--    through the SECURITY DEFINER create_booking() RPC alone.
--    authenticated (super_admin/admin/manager): manage bookings/customers.
-- ----------------------------------------------------------------------------
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bookings_anon_deny ON public.bookings;
DROP POLICY IF EXISTS customers_anon_deny ON public.customers;
DROP POLICY IF EXISTS bookings_admin_all ON public.bookings;
DROP POLICY IF EXISTS customers_admin_all ON public.customers;

CREATE POLICY bookings_anon_deny ON public.bookings FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY customers_anon_deny ON public.customers FOR ALL TO anon
  USING (false) WITH CHECK (false);

CREATE POLICY bookings_admin_all ON public.bookings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p JOIN public.roles r ON r.id = p.role_id
                 WHERE p.id = auth.uid() AND r.name IN ('super_admin','admin','manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p JOIN public.roles r ON r.id = p.role_id
                      WHERE p.id = auth.uid() AND r.name IN ('super_admin','admin','manager')));

CREATE POLICY customers_admin_all ON public.customers FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p JOIN public.roles r ON r.id = p.role_id
                 WHERE p.id = auth.uid() AND r.name IN ('super_admin','admin','manager')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p JOIN public.roles r ON r.id = p.role_id
                      WHERE p.id = auth.uid() AND r.name IN ('super_admin','admin','manager')));

REVOKE ALL ON public.bookings FROM anon;
REVOKE ALL ON public.customers FROM anon;

-- ----------------------------------------------------------------------------
-- 9) DASHBOARD METRIC — total_customers.
--    Definition: legitimate customers = manual-sourced customers PLUS
--    booking-sourced customers who have >=1 confirmed/completed booking.
--    Pending-only public bookings do NOT inflate the count.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN json_build_object(
    'cards', json_build_object(
      'todays_bookings', (SELECT COUNT(*)::integer FROM public.bookings b WHERE b.booking_date = CURRENT_DATE),
      'pending_bookings', (SELECT COUNT(*)::integer FROM public.bookings b WHERE b.status = 'pending'),
      'total_customers', (
        SELECT COUNT(*)::integer FROM public.customers c
        WHERE c.source = 'manual'
           OR (c.source = 'booking' AND EXISTS (SELECT 1 FROM public.bookings b
                                                WHERE b.customer_id = c.id
                                                  AND b.status IN ('confirmed','completed')))
      ),
      'active_services', (SELECT COUNT(*)::integer FROM public.services s WHERE s.is_active = true),
      'staff_members', (SELECT COUNT(*)::integer FROM public.profiles p WHERE p.is_active = true)
    ),
    'recentBookings', COALESCE((
      SELECT json_agg(json_build_object(
        'id', b.id, 'bookingNumber', b.booking_number,
        'customerName', c.full_name, 'serviceName', s.name,
        'bookingDate', b.booking_date, 'bookingTime', b.start_time,
        'status', b.status::text)
        ORDER BY b.created_at DESC)
      FROM public.bookings b
      LEFT JOIN public.customers c ON c.id = b.customer_id
      LEFT JOIN public.services s  ON s.id = b.service_id
      LIMIT 10), '[]'::json)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated;
REVOKE ALL ON FUNCTION public.get_dashboard_stats() FROM anon;

-- ----------------------------------------------------------------------------
-- 10) SPAM / RATE LIMIT
--     prevent_public_booking_spam was REFERENCED in migration 033 but never
--     created in any migration. This remediation does NOT invent a trigger to
--     satisfy a comment. Rate limiting is documented as SEPARATE work (see README
--     note below); it is not part of the lifecycle invariant being repaired here.
-- ----------------------------------------------------------------------------

COMMIT;

-- ============================================================================
-- README / OPERATOR NOTES
-- ----------------------------------------------------------------------------
-- APPLY:            apply this single forward migration via your DB tooling.
-- DEDUP STOP:       if the migration aborts with "DUPLICATE NORMALIZED PHONES",
--                    reconcile those customers manually FIRST (never delete), then
--                    re-apply. The migration never deletes or merges customers.
-- LEGACY 'lead':    no longer a valid source; reclassified to 'manual' unless the
--                    customer already has a confirmed/completed booking.
-- CONFIRMATION:     managers use POST /api/admin/bookings/:id/confirm (app) which
--                    invokes confirm_booking() — atomic customer create/link + status.
-- RATE LIMIT:       public-booking rate limiting intentionally out of scope for this
--                    migration; treat as a separate security work item.
-- ============================================================================