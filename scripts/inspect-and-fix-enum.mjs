#!/usr/bin/env node
/**
 * PHASE 4D: INSPECT LIVE SCHEMA AND FIX ENUM MISMATCH
 * 
 * Discovers the actual contact_status enum values from the live database
 * and repairs get_dashboard_stats() accordingly.
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config({ path: join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log('═══════════════════════════════════════════════════════════════');
console.log('PHASE 4D: ENUM INSPECTION AND RPC REPAIR');
console.log('═══════════════════════════════════════════════════════════════\n');

async function main() {
  // PHASE 1: Inspect live schema
  console.log('PHASE 1: INSPECT LIVE SCHEMA\n');
  
  // Query enum values for contact_status
  console.log('Querying contact_status enum values...');
  const { data: enumData, error: enumError } = await supabase.rpc('query', {
    query: `
      SELECT enumlabel 
      FROM pg_enum 
      JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
      WHERE pg_type.typname = 'contact_status'
      ORDER BY enumsortorder;
    `
  }).single();
  
  if (enumError) {
    console.log('⚠️  Cannot query pg_enum directly, trying alternate method...\n');
    
    // Try querying actual table columns
    console.log('Inspecting contact_messages table structure...');
    const { data: tableData, error: tableError } = await supabase
      .from('contact_messages')
      .select('status')
      .limit(10);
    
    if (tableError) {
      console.log('❌ Cannot inspect contact_messages:', tableError.message);
      console.log('\nTrying to get enum from information_schema...');
      
      // Last resort: check local schema
      const schemaPath = join(__dirname, '..', 'src', 'db', 'schema.ts');
      const schemaContent = readFileSync(schemaPath, 'utf8');
      
      // Extract contact_status enum
      const enumMatch = schemaContent.match(/contact_status.*?=.*?pgEnum\([^,]+,\s*\[([^\]]+)\]/s);
      if (enumMatch) {
        const enumValues = enumMatch[1]
          .split(',')
          .map(v => v.trim().replace(/['"]/g, ''));
        
        console.log('✅ Found contact_status enum in local schema:');
        enumValues.forEach(v => console.log(`   - ${v}`));
        
        return await repairRPC(enumValues);
      } else {
        console.log('❌ Could not find contact_status enum definition');
        process.exit(1);
      }
    }
    
    const uniqueStatuses = [...new Set((tableData || []).map(r => r.status))];
    console.log('✅ Found contact_messages status values:');
    uniqueStatuses.forEach(s => console.log(`   - ${s}`));
    
    return await repairRPC(uniqueStatuses);
  }
  
  console.log('✅ contact_status enum values:');
  console.log(enumData);
  
  return await repairRPC([enumData]);
}

async function repairRPC(statusValues) {
  console.log('\n\nPHASE 2: DETERMINE PENDING MESSAGE STATUS\n');
  
  // Determine which status represents "pending/unread"
  let pendingStatus;
  
  if (statusValues.includes('new')) {
    pendingStatus = 'new';
    console.log('✅ Using "new" for pending_messages metric');
  } else if (statusValues.includes('pending')) {
    pendingStatus = 'pending';
    console.log('✅ Using "pending" for pending_messages metric');
  } else if (statusValues.includes('unread')) {
    pendingStatus = 'unread';
    console.log('✅ Enum actually contains "unread"');
  } else {
    pendingStatus = statusValues[0];
    console.log(`⚠️  No obvious pending status, using first enum value: "${pendingStatus}"`);
  }
  
  console.log('\n\nPHASE 3: PREPARE CORRECTED RPC\n');
  
  const correctedSQL = `
-- Fix get_dashboard_stats() with correct enum value
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
        WHERE status = '${pendingStatus}'
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
`;

  console.log('✅ Corrected RPC prepared');
  console.log(`   Using status = '${pendingStatus}' for pending_messages\n`);
  
  console.log('PHASE 4: SAVE CORRECTED MIGRATION\n');
  
  const migrationPath = join(__dirname, '..', 'supabase', 'migrations', '20260815_fix_dashboard_stats_rpc.sql');
  writeFileSync(migrationPath, correctedSQL.trim());
  console.log('✅ Migration file updated:', migrationPath);
  
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('MANUAL APPLICATION REQUIRED');
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log('The corrected SQL has been saved to:');
  console.log('  supabase/migrations/20260815_fix_dashboard_stats_rpc.sql\n');
  console.log('Apply via Supabase Dashboard SQL Editor:\n');
  console.log('1. Navigate to: https://supabase.com/dashboard');
  console.log('2. Select project: ZT Lounge');
  console.log('3. Open: SQL Editor');
  console.log('4. Copy/paste the migration file');
  console.log('5. Execute\n');
  console.log('Then verify with:');
  console.log('  SELECT public.get_dashboard_stats();\n');
  
  return { pendingStatus, correctedSQL };
}

main().catch(error => {
  console.error('\n❌ FATAL ERROR:', error.message);
  process.exit(1);
});
