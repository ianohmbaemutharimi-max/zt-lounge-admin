-- Fix get_dashboard_stats() with correct contact_messages status logic
-- ERROR: invalid input value for enum contact_status: "unread"
-- CONFIRMED ENUM: contact_status = {new, read, replied, archived}
-- SOLUTION: Count messages where status IN ('new', 'read')
--
-- MIGRATION SAFETY: Using CREATE OR REPLACE (atomic operation)
-- If this migration fails, any existing function remains intact

CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(

    'cards', json_build_object(
      'todays_bookings',
      (
        SELECT COUNT(*)::integer
        FROM public.bookings
        WHERE DATE(booking_date) = CURRENT_DATE
      ),

      'pending_bookings',
      (
        SELECT COUNT(*)::integer
        FROM public.bookings
        WHERE status = 'pending'
      ),

      'total_customers',
      (
        SELECT COUNT(*)::integer
        FROM public.customers
      ),

      'active_services',
      (
        SELECT COUNT(*)::integer
        FROM public.services
        WHERE is_active = true
      ),

      'staff_members',
      (
        SELECT COUNT(*)::integer
        FROM public.profiles
        WHERE is_active = true
      ),

      'pending_messages',
      (
        SELECT COUNT(*)::integer
        FROM public.contact_messages
        WHERE status IN ('new', 'read')
      ),

      'monthly_revenue',
      (
        SELECT COALESCE(SUM(total_amount), 0)::numeric
        FROM public.bookings
        WHERE status = 'completed'
          AND DATE_TRUNC('month', booking_date)
              = DATE_TRUNC('month', CURRENT_DATE)
      )
    ),

    'revenue',
    (
      SELECT COALESCE(
        json_agg(
          json_build_object(
            'month', TO_CHAR(month_date, 'Mon'),
            'revenue', COALESCE(revenue, 0)
          )
          ORDER BY month_date
        ),
        '[]'::json
      )
      FROM (
        SELECT
          DATE_TRUNC('month', booking_date)::date AS month_date,
          SUM(total_amount) AS revenue
        FROM public.bookings
        WHERE status = 'completed'
          AND booking_date >= CURRENT_DATE - INTERVAL '6 months'
        GROUP BY DATE_TRUNC('month', booking_date)
      ) revenue_data
    ),

    'trends',
    (
      SELECT COALESCE(
        json_agg(
          json_build_object(
            'day', TO_CHAR(day_date, 'Mon DD'),
            'bookings', booking_count
          )
          ORDER BY day_date
        ),
        '[]'::json
      )
      FROM (
        SELECT
          DATE(booking_date) AS day_date,
          COUNT(*)::integer AS booking_count
        FROM public.bookings
        WHERE booking_date >= CURRENT_DATE - INTERVAL '14 days'
        GROUP BY DATE(booking_date)
      ) trend_data
    ),

    'recentBookings',
    (
      SELECT COALESCE(
        json_agg(
          json_build_object(
            'id', b.id,
            'bookingNumber', b.booking_number,
            'customerName', c.full_name,
            'serviceName', s.name,
            'bookingDate', b.booking_date::text,
            'bookingTime', b.start_time::text,
            'totalAmount', b.total_amount,
            'status', b.status
          )
          ORDER BY b.created_at DESC
        ),
        '[]'::json
      )
      FROM (
        SELECT *
        FROM public.bookings
        ORDER BY created_at DESC
        LIMIT 10
      ) b
      LEFT JOIN public.customers c
        ON b.customer_id = c.id
      LEFT JOIN public.services s
        ON b.service_id = s.id
    ),

    'activity',
    (
      SELECT COALESCE(
        json_agg(
          json_build_object(
            'id', a.id,
            'actor', COALESCE(p.email, 'System'),
            'action', a.action,
            'details', a.details,
            'createdAt', a.created_at::text
          )
          ORDER BY a.created_at DESC
        ),
        '[]'::json
      )
      FROM (
        SELECT *
        FROM public.activity_logs
        ORDER BY created_at DESC
        LIMIT 10
      ) a
      LEFT JOIN public.profiles p
        ON a.profile_id = p.id
    ),

    'notifications',
    (
      SELECT COALESCE(
        json_agg(
          json_build_object(
            'id', n.id,
            'title', n.title,
            'body', n.message,
            'isRead', n.is_read,
            'createdAt', n.created_at::text
          )
          ORDER BY n.is_read ASC, n.created_at DESC
        ),
        '[]'::json
      )
      FROM (
        SELECT *
        FROM public.notifications
        ORDER BY is_read ASC, created_at DESC
        LIMIT 10
      ) n
    )

  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_stats() TO authenticated;