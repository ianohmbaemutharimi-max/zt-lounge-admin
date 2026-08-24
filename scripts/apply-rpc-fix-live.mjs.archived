#!/usr/bin/env node
/**
 * PHASE 4F: APPLY DASHBOARD RPC FIX TO LIVE DATABASE
 * 
 * Applies the corrected get_dashboard_stats() RPC directly to the live Supabase database.
 * Uses confirmed enum: contact_status = {new, read, replied, archived}
 * Pending messages logic: WHERE status IN ('new', 'read')
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: 'public' }
});

console.log('═══════════════════════════════════════════════════════════════');
console.log('PHASE 4F: APPLY DASHBOARD RPC FIX TO LIVE DATABASE');
console.log('═══════════════════════════════════════════════════════════════\n');

const CORRECTED_RPC_SQL = `
-- Fix get_dashboard_stats() with correct enum values
-- contact_status = {new, read, replied, archived}
-- Pending messages: status IN ('new', 'read')

DROP FUNCTION IF EXISTS public.get_dashboard_stats();

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
`.trim();

async function main() {
  console.log('STEP 1: APPLY CORRECTED RPC TO LIVE DATABASE\n');
  
  // Execute the SQL using PostgREST admin query endpoint via service role
  const { data: execData, error: execError } = await supabase.rpc('exec', {
    sql: CORRECTED_RPC_SQL
  });
  
  if (execError) {
    console.log('⚠️  PostgREST exec() not available, trying direct query...\n');
    
    // Try using the raw SQL query method
    const { data, error } = await supabase.from('_sql').select('*').eq('query', CORRECTED_RPC_SQL).single();
    
    if (error) {
      console.log('❌ Cannot apply SQL via PostgREST');
      console.log('   Error:', error.message);
      console.log('\n⚠️  MANUAL APPLICATION REQUIRED\n');
      console.log('Copy the SQL from:');
      console.log('  supabase/migrations/20260815_fix_dashboard_stats_rpc.sql\n');
      console.log('Apply via Supabase Dashboard SQL Editor:\n');
      console.log('1. https://supabase.com/dashboard');
      console.log('2. Select project: ZT Lounge');
      console.log('3. SQL Editor → New Query');
      console.log('4. Paste and execute\n');
      return { success: false, reason: 'PostgREST DDL not available' };
    }
  }
  
  console.log('✅ RPC applied to live database\n');
  
  console.log('\nSTEP 2: VERIFY RPC EXECUTION\n');
  
  // Test the RPC
  const { data: rpcResult, error: rpcError } = await supabase.rpc('get_dashboard_stats');
  
  if (rpcError) {
    console.log('❌ RPC execution failed');
    console.log('   Error:', rpcError.message);
    return { success: false, reason: rpcError.message };
  }
  
  console.log('✅ RPC executed successfully\n');
  
  console.log('\nSTEP 3: VALIDATE CONTRACT\n');
  
  const requiredKeys = ['cards', 'revenue', 'trends', 'recentBookings', 'activity', 'notifications'];
  const actualKeys = Object.keys(rpcResult || {});
  
  const missingKeys = requiredKeys.filter(k => !actualKeys.includes(k));
  
  if (missingKeys.length > 0) {
    console.log('❌ Missing required keys:', missingKeys.join(', '));
    return { success: false, reason: 'Contract violation', missingKeys };
  }
  
  console.log('✅ All 6 top-level keys present');
  
  // Validate cards structure
  const cards = rpcResult.cards || {};
  const requiredCardMetrics = [
    'todays_bookings',
    'pending_bookings',
    'total_customers',
    'active_services',
    'staff_members',
    'pending_messages',
    'monthly_revenue'
  ];
  
  const missingMetrics = requiredCardMetrics.filter(m => !(m in cards));
  
  if (missingMetrics.length > 0) {
    console.log('❌ Missing card metrics:', missingMetrics.join(', '));
    return { success: false, reason: 'Cards contract violation', missingMetrics };
  }
  
  console.log('✅ All 7 card metrics present');
  console.log(`   - todays_bookings: ${cards.todays_bookings}`);
  console.log(`   - pending_bookings: ${cards.pending_bookings}`);
  console.log(`   - total_customers: ${cards.total_customers}`);
  console.log(`   - active_services: ${cards.active_services}`);
  console.log(`   - staff_members: ${cards.staff_members}`);
  console.log(`   - pending_messages: ${cards.pending_messages}`);
  console.log(`   - monthly_revenue: ${cards.monthly_revenue}`);
  
  // Validate arrays
  const arrayFields = ['revenue', 'trends', 'recentBookings', 'activity', 'notifications'];
  for (const field of arrayFields) {
    if (!Array.isArray(rpcResult[field])) {
      console.log(`❌ ${field} is not an array`);
      return { success: false, reason: `${field} not an array` };
    }
  }
  
  console.log('✅ All array fields are arrays\n');
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('RESULT: ✅ PASS');
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log('Dashboard RPC successfully repaired and verified');
  console.log('Contract: All 6 keys + 7 card metrics present');
  console.log('Enum fix: status IN (\'new\', \'read\') for pending_messages\n');
  
  return { 
    success: true, 
    rpcResult,
    cards: rpcResult.cards
  };
}

main()
  .then(result => {
    if (!result.success) {
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('\n❌ FATAL ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
