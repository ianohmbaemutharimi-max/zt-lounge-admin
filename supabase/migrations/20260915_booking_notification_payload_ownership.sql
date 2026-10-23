-- ============================================================================
-- ZT LOUNGE — BOOKING NOTIFICATION: PAYLOAD + OWNERSHIP + FAILURE ISOLATION
-- Loop 30 (2026-09-15)
--
-- Evidence basis (forensic audit, this loop):
--   * Producer: public.create_booking_notification() — extracted from
--     supabase/migrations/012_booking_functions.sql ("Extracted from live
--     PostgreSQL"); live payload matches it byte-for-byte.
--   * Payload defect: title='New Booking', message='Booking ZT-X has been
--     created.' — no customer name/phone (L27-3). Live bookings populate
--     guest_name/guest_phone on 80/80 rows, so the trigger can use them.
--   * Ownership defect: function sets profile_id = NEW.created_by, but
--     created_by is NULL on 80/80 live bookings (20260824 lifecycle: public
--     submissions never set created_by). Admin notification APIs are
--     explicitly profile-scoped (unread-count / mark-all-read /
--     mark-read-by-entity), so with profile_id NULL the unread badge is always
--     0 and mark-read marks 0 rows while the unscoped list shows everything
--     (L27-2). Fix: fan out one notification per ACTIVE operational profile
--     (roles: super_admin, admin) — preserves the documented per-admin
--     isolation guarantees with zero application-code changes.
--   * Transaction coupling: the trigger runs inside the booking INSERT
--     transaction, so a notification failure would roll back the booking
--     (L27-4). Fix: exception isolation — on failure, best-effort dead-letter
--     into the existing notification_queue (008 schema; currently unused,
--     outbox-shaped) and never re-raise. The booking always persists.
--   * Migration gap: the trigger BINDING exists live but is not source-
--     controlled. This migration binds it idempotently: it creates the trigger
--     ONLY if no non-internal trigger on public.bookings already executes
--     create_booking_notification(), so applying it to the live database does
--     NOT create a duplicate trigger / duplicate notifications.
--
-- Idempotent: safe to run multiple times and on a fresh database.
-- ============================================================================

BEGIN;
SET search_path = public;

-- ---------------------------------------------------------------------------
-- 1) Replace the producer function (same name/signature as the live function,
--    so the existing live binding picks up the new behaviour automatically).
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
    -- No active operational profiles: keep a single unowned (shared) row so
    -- the notification is still visible in the operational list.
    v_recipients := ARRAY[NULL::uuid];
  END IF;

  SELECT s.name INTO v_service_name FROM public.services s WHERE s.id = NEW.service_id;


  -- FAILURE ISOLATION: notification problems must never roll back the booking.
  BEGIN
    INSERT INTO public.notifications (profile_id, booking_id, title, message, type)
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
        -- Customer message (Phase 5, Loop 61): the canonical public-request
        -- field is bookings.special_requests (forms.js -> create_booking
        -- p_special_requests -> bookings.special_requests). internal_notes is
        -- deliberately NOT exposed here (internal only).
        CASE
          WHEN NEW.special_requests IS NOT NULL AND btrim(NEW.special_requests) <> ''
            THEN 'Customer message: ' || NEW.special_requests
          ELSE 'Customer message: None'
        END
      ),
      'booking_created'
    FROM unnest(v_recipients) AS pid;
  EXCEPTION WHEN OTHERS THEN
    -- Best-effort dead-letter into the existing notification_queue (outbox-
    -- shaped, currently unused). Even this fallback must never break booking.
    BEGIN
      INSERT INTO public.notification_queue
        (booking_id, notification_type, recipient, subject, message, scheduled_at, status, error_message)
      VALUES
        (NEW.id,
         'booking_created',
         'operational-inbox',
         'New Booking',
         'Booking ' || NEW.booking_number || ' notification failed: ' || SQLERRM,
         now(),
         'pending',
         SQLERRM);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2) Idempotent trigger binding (source-controls the previously live-only
--    binding; does NOT duplicate an existing binding).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace cn ON cn.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE cn.nspname = 'public'
      AND c.relname  = 'bookings'
      AND p.proname  = 'create_booking_notification'
      AND NOT t.tgisinternal
  ) THEN
    CREATE TRIGGER trg_booking_notification
      AFTER INSERT ON public.bookings
      FOR EACH ROW
      EXECUTE FUNCTION public.create_booking_notification();
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- OPERATOR NOTES
-- ============================================================================
-- APPLY: requires a valid database credential (Supabase SQL editor, supabase
--        CLI, or pooler connection). The stored DB_PASSWORD in .env.local was
--        rejected by the live pooler during this loop, so application of this
--        file is an explicit operator step.
-- AFTER APPLY (runtime checks):
--   1. Submit a test booking via the public form -> expect ONE notification
--      per active operational profile, containing guest name, +254 phone,
--      service, date/time, guests, status and the ZT- booking reference.
--   2. Admin bell: unread badge increments; "Mark all read" marks >0 rows.
--   3. To simulate notification failure isolation: temporarily rename the
--      notifications table in a NON-PRODUCTION database, insert a booking,
--      verify the booking persists and a notification_queue row appears.
-- ============================================================================
