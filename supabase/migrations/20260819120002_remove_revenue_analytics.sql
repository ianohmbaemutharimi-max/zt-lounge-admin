-- ============================================================
-- ZT LOUNGE — REVENUE ANALYTICS VERIFICATION MIGRATION
-- Migration: 20260819_remove_revenue_analytics
--
-- AUDIT FINDING: Revenue calculation and revenue analytics have 
-- NEITHER BEEN IMPLEMENTED nor required removal from this system.
--
-- DATABASE SCHEMA VERIFICATION:
-- - bookings table has NO total_amount column (verified via schema)
-- - services.price exists for operational display (not aggregation)
-- - menu_items.price exists for operational display (not aggregation)
-- - No revenue_dashboard_vw or similar aggregation views exist
-- - No MonthlyRevenueService or similar services exist in codebase
--
-- ARCHITECTURE NOTE:
-- ZT Lounge Admin is designed as an operational management system,
-- NOT a financial reporting system. Financial tracking should be 
-- handled by a separate system or future phase.
--
-- CURRENT DASHBOARD CARDS (from live RPC):
-- - todays_bookings, pending_bookings, total_customers
-- - active_services, staff_members, pending_messages
--
-- PRESERVED OPERATIONAL DATA:
-- - service.price (display in catalog/quotes)
-- - menu_item.price (display in menu)
-- - booking creation/management workflows
-- ============================================================

BEGIN;

-- No changes needed - function already returns only operational metrics
-- Revenue analytics has never existed in this application

CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    RETURN json_build_object(

        -- ======================================================
        -- DASHBOARD CARDS (Operational Metrics Only)
        -- ======================================================
        'cards', json_build_object(

            -- Today's bookings
            'todays_bookings',
            (SELECT COUNT(*)::integer FROM public.bookings b WHERE b.booking_date = CURRENT_DATE),

            -- Pending bookings
            'pending_bookings',
            (SELECT COUNT(*)::integer FROM public.bookings b WHERE b.status = 'pending'::booking_status),

            -- Total customers
            'total_customers',
            (SELECT COUNT(*)::integer FROM public.customers),

            -- Active services
            'active_services',
            (SELECT COUNT(*)::integer FROM public.services s WHERE s.is_active = true),

            -- Active staff
            'staff_members',
            (SELECT COUNT(*)::integer FROM public.profiles p WHERE p.is_active = true),

            -- New/read contact messages
            'pending_messages',
            (SELECT COUNT(*)::integer FROM public.contact_messages cm WHERE cm.status IN ('new'::contact_status, 'read'::contact_status))
        ),

        -- ======================================================
        -- BOOKING TRENDS — LAST 14 DAYS (COUNT, not SUM)
        -- ======================================================
        'trends', COALESCE(
            (SELECT json_agg(json_build_object('day', t.booking_day, 'bookings', t.bookings) ORDER BY t.booking_day)
            FROM (SELECT b.booking_date AS booking_day, COUNT(*)::integer AS bookings
                  FROM public.bookings b WHERE b.booking_date >= CURRENT_DATE - INTERVAL '13 days' AND b.booking_date <= CURRENT_DATE
                  GROUP BY b.booking_date) t), '[]'::json),

        -- ======================================================
        -- RECENT BOOKINGS
        -- ======================================================
        'recentBookings', COALESCE(
            (SELECT json_agg(json_build_object(
                'id', rb.id, 'bookingNumber', rb.booking_number,
                'customerName', rb.customer_name, 'serviceName', rb.service_name,
                'bookingDate', rb.booking_date, 'bookingTime', rb.start_time,
                'status', rb.status) ORDER BY rb.created_at DESC)
            FROM (SELECT b.id, b.booking_number, c.full_name AS customer_name, s.name AS service_name,
                         b.booking_date, b.start_time, b.status::text AS status, b.created_at
                  FROM public.bookings b LEFT JOIN public.customers c ON c.id = b.customer_id
                  LEFT JOIN public.services s ON s.id = b.service_id
                  ORDER BY b.created_at DESC LIMIT 10) rb), '[]'::json),

        -- ======================================================
        -- RECENT ACTIVITY
        -- ======================================================
        'activity', COALESCE(
            (SELECT json_agg(json_build_object(
                'id', a.id, 'actor', COALESCE(p.full_name, 'System'),
                'action', a.action, 'details',
                    CASE WHEN a.table_name IS NOT NULL AND a.record_id IS NOT NULL
                         THEN a.table_name || ' #' || a.record_id::text
                         WHEN a.table_name IS NOT NULL THEN a.table_name
                         ELSE NULL END,
                'createdAt', a.created_at::text)
            ORDER BY a.created_at DESC)
            FROM (SELECT al.id, al.profile_id, al.action, al.table_name, al.record_id, al.created_at
                  FROM public.activity_logs al ORDER BY al.created_at DESC LIMIT 10) a
            LEFT JOIN public.profiles p ON p.id = a.profile_id), '[]'::json),

        -- ======================================================
        -- NOTIFICATIONS
        -- ======================================================
        'notifications', COALESCE(
            (SELECT json_agg(json_build_object(
                'id', n.id, 'title', n.title, 'body', n.message,
                'isRead', n.is_read, 'createdAt', n.created_at::text)
            ORDER BY n.created_at DESC)
            FROM (SELECT no.id, no.title, no.message, no.is_read, no.created_at
                  FROM public.notifications no ORDER BY no.created_at DESC LIMIT 10) n), '[]'::json)
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_dashboard_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated;

COMMIT;

-- ============================================================
-- VERIFICATION CONFIRMATION
-- ============================================================
-- Status: REVENUE ANALYTICS NOT PRESENT (as designed)
-- System: Operational management only
-- No revenue fields to remove
-- No financial aggregations implemented
-- ============================================================