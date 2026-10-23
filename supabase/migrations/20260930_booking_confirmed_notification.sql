-- ============================================================================
-- ZT LOUNGE — BOOKING-CONFIRMED NOTIFICATION + BOOKING ENTITY NAVIGATION
-- Surgical fix (Phase 3A) — additive / idempotent / non-destructive
--
-- Fixes from NOTIFICATION_CAPABILITY_AUDIT.md:
--   * FIX #1 booking_confirmed : the live-only producer set profile_id=NULL
--     (orphaned, invisible to the owner-scoped inbox). Replaced with the canonical
--     fan-out to active super_admin/admin profiles — same model as booking_created.
--   * FIX #2 entity navigation : booking_created and booking_confirmed now carry
--     entity_type='booking', entity_id=booking.id (columns already exist live).
--
-- Non-destructive / idempotent:
--   * CREATE OR REPLACE FUNCTION -> replaces same-name live function in place
--   * trigger binding guarded by IF NOT EXISTS -> never duplicates a binding
--   * no columns added (entity_type/entity_id already exist on notifications)
--   * NO rows deleted; NO existing trigger dropped
--
-- Recipient model (mirrors 20260915 create_booking_notification): every ACTIVE
-- super_admin / admin profile. NEVER NEW.created_by (NULL on all live bookings).
-- ============================================================================
BEGIN;
SET search_path = public;

-- ---------------------------------------------------------------------------
-- 1) create_booking_notification() — add entity_type/entity_id so booking
--    notifications are navigable. Otherwise identical to 20260915
--    (same recipient fan-out, same payload, same failure-isolation dead-letter).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_booking_notification()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_recipients uuid[];
  v_service_name text;
BEGIN
  -- Operational recipients: every ACTIVE admin/super_admin profile.
  SELECT COALESCE(array_agg(p.id) FILTER (WHERE p.id IS NOT NULL), ARRAY[]::uuid[])
    INTO v_recipients
    FROM public.profiles p
    JOIN public.roles r ON r.id = p.role_id
    WHERE p.is_active = true
      AND r.name IN ('super_admin', 'admin');

  IF array_length(v_recipients, 1) IS NULL THEN
    v_recipients := ARRAY[NULL::uuid];
  END IF;

  SELECT s.name INTO v_service_name FROM public.services s WHERE s.id = NEW.service_id;

  BEGIN
    INSERT INTO public.notifications
      (profile_id, booking_id, title, message, type, entity_type, entity_id)
    SELECT
      pid,
      NEW.id,
      'New Booking',
      concat_ws(' • ',
        NEW.guest_name,
        NEW.guest_phone,
        v_service_name,
        to_char(NEW.booking_date, 'DD Mon YYYY') || ' at ' || to_char(NEW.start_time, 'HH12:MI AM'),
        NEW.guests::text || CASE WHEN NEW.guests = 1 THEN ' guest' ELSE ' guests' END,
        'status: ' || NEW.status::text,
        'ref: ' || NEW.booking_number,
        CASE
          WHEN NEW.special_requests IS NOT NULL AND btrim(NEW.special_requests) <> ''
            THEN 'Customer message: ' || NEW.special_requests
          ELSE 'Customer message: None'
        END
      ),
      'booking_created',
      'booking',
      NEW.id
    FROM unnest(v_recipients) AS pid;
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.notification_queue
        (booking_id, notification_type, recipient, subject, message, scheduled_at, status, error_message)
      VALUES
        (NEW.id, 'booking_created', 'operational-inbox', 'New Booking',
         'Booking ' || NEW.booking_number || ' notification failed: ' || SQLERRM,
         now(), 'pending', SQLERRM);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2) notify_booking_confirmed() — canonical booking_confirmed producer.
--    Fires only on the transition INTO confirmed (duplicate protection).
--    Row-level dedup: at most one confirmed notification per booking with a
--    real recipient, so a coexistsing legacy producer cannot double-publish a
--    visible row (legacy NULL-recipient rows are invisible to the inbox anyway).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_booking_confirmed()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_recipients uuid[];
  v_service_name text;
BEGIN
  -- Duplicate protection: only act on a transition into 'confirmed'.
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status <> 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- Operational recipients: every ACTIVE admin/super_admin profile.
  SELECT COALESCE(array_agg(p.id) FILTER (WHERE p.id IS NOT NULL), ARRAY[]::uuid[])
    INTO v_recipients
    FROM public.profiles p
    JOIN public.roles r ON r.id = p.role_id
    WHERE p.is_active = true
      AND r.name IN ('super_admin', 'admin');

  IF array_length(v_recipients, 1) IS NULL THEN
    v_recipients := ARRAY[NULL::uuid];
  END IF;

  SELECT s.name INTO v_service_name FROM public.services s WHERE s.id = NEW.service_id;

  -- Row-level dedup: do not double-publish a visible confirmed notification.
  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE booking_id = NEW.id
      AND type = 'booking_confirmed'
      AND profile_id IS NOT NULL
  ) THEN
    RETURN NEW;
  END IF;

  BEGIN
    INSERT INTO public.notifications
      (profile_id, booking_id, title, message, type, entity_type, entity_id, is_read, read_at)
    SELECT
      pid,
      NEW.id,
      'Booking Confirmed',
      concat_ws(' • ',
        NEW.guest_name,
        NEW.guest_phone,
        v_service_name,
        to_char(NEW.booking_date, 'DD Mon YYYY') || ' at ' || to_char(NEW.start_time, 'HH12:MI AM'),
        NEW.guests::text || CASE WHEN NEW.guests = 1 THEN ' guest' ELSE ' guests' END,
        'ref: ' || NEW.booking_number
      ),
      'booking_confirmed',
      'booking',
      NEW.id,
      false,
      null
    FROM unnest(v_recipients) AS pid;
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.notification_queue
        (booking_id, notification_type, recipient, subject, message, scheduled_at, status, error_message)
      VALUES
        (NEW.id, 'booking_confirmed', 'operational-inbox', 'Booking Confirmed',
         'Booking ' || NEW.booking_number || ' confirmation notification failed: ' || SQLERRM,
         now(), 'pending', SQLERRM);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Idempotent trigger bindings.
-- ---------------------------------------------------------------------------
-- booking_created: binding already exists from 20260915 (AFTER INSERT). We bound
-- it there; here we only guarantee it is present (no-op if already bound).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace cn ON cn.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE cn.nspname = 'public'
      AND c.relname = 'bookings'
      AND p.proname = 'create_booking_notification'
      AND NOT t.tgisinternal
  ) THEN
    CREATE TRIGGER trg_booking_notification
      AFTER INSERT ON public.bookings
      FOR EACH ROW
      EXECUTE FUNCTION public.create_booking_notification();
  END IF;
END $$;

-- booking_confirmed: AFTER UPDATE OF status, idempotent binding.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace cn ON cn.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE cn.nspname = 'public'
      AND c.relname = 'bookings'
      AND p.proname = 'notify_booking_confirmed'
      AND NOT t.tgisinternal
  ) THEN
    CREATE TRIGGER trg_booking_confirmed_notification
      AFTER UPDATE OF status ON public.bookings
      FOR EACH ROW
      EXECUTE FUNCTION public.notify_booking_confirmed();
  END IF;
END $$;

COMMIT;
-- ============================================================================
-- OPERATOR NOTE (Phase 3A)
-- This migration is source-only for this pass. Applying it to the live database
-- requires a Supabase SQL-editor / pooler connection (the same credential
-- barrier documented for 20260915). It is safe to apply idempotently and does
-- not drop or duplicate existing triggers. The two pre-existing orphaned
-- booking_confirmed rows (profile_id=NULL) are intentionally left in place
-- (no data is deleted). Running this replaces/creates the producers; future
-- confirmations fan out to operational admins and carry entity_type='booking'.
-- ============================================================================
