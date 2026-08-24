#!/usr/bin/env node

/**
 * PHASE 0 — READ-ONLY LIVE DATABASE INVESTIGATION
 * 
 * Inspect the AUTHORITATIVE LIVE Supabase database state
 * Project: jczwilrysvnhcjzjztbi
 * 
 * DO NOT modify anything. Just observe and document.
 */

import { createClient } from '@supabase/supabase-js';
import { writeFile } from 'fs/promises';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false }
});

const baseline = {
  timestamp: new Date().toISOString(),
  project: 'jczwilrysvnhcjzjztbi',
  database: {},
  rls: {},
  functions: {},
  application: {}
};

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  PHASE 0: LIVE DATABASE BASELINE INSPECTION                    ║');
console.log('║  Project: jczwilrysvnhcjzjztbi                                 ║');
console.log('║  READ-ONLY MODE                                                ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// ============================================================
// 1. TABLE EXISTENCE & STRUCTURE
// ============================================================
console.log('═══ 1. TABLE EXISTENCE & STRUCTURE ═══\n');

const tables = ['bookings', 'customers', 'services', 'profiles', 'roles'];

for (const table of tables) {
  console.log(`[${table}]`);
  
  // Check existence and get sample
  const { data: sample, error } = await supabase
    .from(table)
    .select('*')
    .limit(1)
    .single();
  
  const { count } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });
  
  baseline.database[table] = {
    exists: !error || error.code !== '42P01',
    rowCount: count || 0,
    columns: sample ? Object.keys(sample) : [],
    sampleRow: sample || null,
    error: error?.message || null
  };
  
  if (baseline.database[table].exists) {
    console.log(`   ✅ EXISTS (${count || 0} rows)`);
    if (sample) {
      console.log(`   Columns: ${Object.keys(sample).join(', ')}`);
    }
  } else {
    console.log(`   ❌ MISSING`);
  }
  console.log('');
}

// ============================================================
// 2. SERVICES INSPECTION
// ============================================================
console.log('═══ 2. SERVICES DATA ═══\n');

const { data: services } = await supabase
  .from('services')
  .select('*')
  .order('slug');

baseline.database.services.allServices = services || [];

console.log(`Found ${services?.length || 0} services:\n`);
services?.forEach(s => {
  console.log(`   • ${s.slug}`);
  console.log(`     Name: ${s.name}`);
  console.log(`     Active column exists: ${s.hasOwnProperty('active')}`);
  console.log(`     Active value: ${s.active}`);
  console.log(`     All fields: ${Object.keys(s).join(', ')}`);
  console.log('');
});

// ============================================================
// 3. RLS STATUS
// ============================================================
console.log('═══ 3. RLS STATUS ═══\n');

for (const table of ['bookings', 'customers']) {
  console.log(`[${table}] RLS Test`);
  
  // Test with anon client
  const { data: anonData, error: anonError } = await supabaseAnon
    .from(table)
    .select('*')
    .limit(1);
  
  const anonBlocked = !!anonError && anonError.code === '42501';
  const anonReturnsZero = !anonError && (!anonData || anonData.length === 0);
  
  baseline.rls[table] = {
    anonSelectError: anonError?.message || null,
    anonSelectCode: anonError?.code || null,
    anonReturned: anonData?.length || 0,
    rlsBlocked: anonBlocked,
    rlsWarning: anonReturnsZero ? 'Returns 0 rows without error - RLS may not be properly blocking' : null
  };
  
  if (anonBlocked) {
    console.log(`   ✅ RLS BLOCKS anonymous SELECT (code: ${anonError.code})`);
  } else if (anonReturnsZero) {
    console.log(`   ⚠️  RLS ALLOWS SELECT but returns 0 rows - SECURITY CONCERN`);
  } else {
    console.log(`   ❌ RLS ALLOWS SELECT (returned ${anonData?.length || 0} rows) - CRITICAL`);
  }
  console.log('');
}

// ============================================================
// 4. FUNCTION DEFINITIONS
// ============================================================
console.log('═══ 4. FUNCTION DEFINITIONS ═══\n');

// Test create_booking
console.log('[create_booking]');
const { data: bookingTest, error: bookingError } = await supabase
  .rpc('create_booking', {
    p_full_name: 'BASELINE TEST',
    p_phone: `+254700${Date.now().toString().slice(-6)}`,
    p_booking_date: '2026-12-31',
    p_start_time: '23:59',
    p_guests: 1,
    p_service_slug: 'restaurant'
  });

baseline.functions.create_booking = {
  exists: !bookingError || bookingError.code !== '42883',
  callable: !bookingError,
  testResult: bookingTest,
  testError: bookingError?.message || null,
  testErrorCode: bookingError?.code || null
};

if (baseline.functions.create_booking.exists) {
  console.log(`   ✅ EXISTS`);
  if (baseline.functions.create_booking.callable) {
    console.log(`   ✅ CALLABLE`);
    console.log(`   Test booking created: ${bookingTest?.booking_id}`);
  } else {
    console.log(`   ❌ NOT CALLABLE: ${bookingError.message}`);
  }
} else {
  console.log(`   ❌ MISSING`);
}
console.log('');

// Test get_dashboard_stats
console.log('[get_dashboard_stats]');
const { data: statsTest, error: statsError } = await supabase
  .rpc('get_dashboard_stats');

baseline.functions.get_dashboard_stats = {
  exists: !statsError || statsError.code !== '42883',
  callable: !statsError,
  result: statsTest,
  error: statsError?.message || null
};

if (baseline.functions.get_dashboard_stats.exists) {
  console.log(`   ✅ EXISTS`);
  if (baseline.functions.get_dashboard_stats.callable) {
    console.log(`   ✅ CALLABLE`);
    console.log(`   Total Bookings: ${statsTest?.total_bookings || 0}`);
    console.log(`   Total Customers: ${statsTest?.total_customers || 0}`);
    
    // Compare with actual counts
    const actualBookings = baseline.database.bookings?.rowCount || 0;
    const actualCustomers = baseline.database.customers?.rowCount || 0;
    
    if (statsTest?.total_bookings === 0 && actualBookings > 0) {
      console.log(`   ⚠️  DISCREPANCY: Returns 0 bookings but ${actualBookings} exist`);
    }
    if (statsTest?.total_customers === 0 && actualCustomers > 0) {
      console.log(`   ⚠️  DISCREPANCY: Returns 0 customers but ${actualCustomers} exist`);
    }
  } else {
    console.log(`   ❌ NOT CALLABLE: ${statsError.message}`);
  }
} else {
  console.log(`   ❌ MISSING`);
}
console.log('');

// ============================================================
// 5. BOOKING CONFLICT DETECTION
// ============================================================
console.log('═══ 5. BOOKING CONFLICT DETECTION ═══\n');

console.log('Testing conflict logic with multiple services at same time...\n');

const testTime = '18:00';
const testDate = '2027-01-15';
const testPhone = `+254799${Date.now().toString().slice(-6)}`;

const conflictTests = {};

for (const slug of ['restaurant', 'lounge-bar', 'vip-cabins']) {
  const { data, error } = await supabase
    .rpc('create_booking', {
      p_full_name: `Conflict Test ${slug}`,
      p_phone: `${testPhone}${slug[0]}`, // Unique phone per service
      p_booking_date: testDate,
      p_start_time: testTime,
      p_guests: 2,
      p_service_slug: slug
    });
  
  conflictTests[slug] = {
    success: !error,
    bookingId: data?.booking_id || null,
    error: error?.message || null
  };
  
  if (error) {
    console.log(`   ❌ ${slug}: REJECTED - ${error.message}`);
  } else {
    console.log(`   ✅ ${slug}: ACCEPTED (booking: ${data.booking_id})`);
  }
}

baseline.functions.conflict_detection = conflictTests;

// Analyze pattern
const successCount = Object.values(conflictTests).filter(t => t.success).length;
if (successCount === 0) {
  console.log(`\n   ⚠️  ALL SERVICES REJECTED - Global time lock issue`);
} else if (successCount === 1) {
  console.log(`\n   ⚠️  ONLY FIRST SERVICE ACCEPTED - Overly broad conflict rule`);
} else if (successCount === 3) {
  console.log(`\n   ✅ ALL SERVICES ACCEPTED - Conflict rules properly scoped`);
}
console.log('');

// ============================================================
// 6. PHONE DEDUPLICATION TEST
// ============================================================
console.log('═══ 6. PHONE DEDUPLICATION TEST ===\n');

const dedupPhone = `+254799${Date.now().toString().slice(-6)}`;

const { data: booking1 } = await supabase
  .rpc('create_booking', {
    p_full_name: 'Dedup Test User',
    p_phone: dedupPhone,
    p_booking_date: '2027-02-01',
    p_start_time: '10:00',
    p_guests: 2,
    p_service_slug: 'restaurant'
  });

const { data: booking2 } = await supabase
  .rpc('create_booking', {
    p_full_name: 'Dedup Test User',
    p_phone: dedupPhone,
    p_booking_date: '2027-02-02',
    p_start_time: '11:00',
    p_guests: 3,
    p_service_slug: 'lounge-bar'
  });

const dedupWorks = booking1?.customer_id === booking2?.customer_id;

baseline.functions.customer_deduplication = {
  testPhone: dedupPhone,
  booking1CustomerId: booking1?.customer_id,
  booking2CustomerId: booking2?.customer_id,
  deduplicationWorks: dedupWorks
};

console.log(`Test phone: ${dedupPhone}`);
console.log(`Booking 1 customer_id: ${booking1?.customer_id}`);
console.log(`Booking 2 customer_id: ${booking2?.customer_id}`);

if (dedupWorks) {
  console.log(`\n   ✅ DEDUPLICATION WORKS - Same customer_id`);
} else {
  console.log(`\n   ❌ DEDUPLICATION BROKEN - Different customer_ids`);
}
console.log('');

// ============================================================
// SAVE BASELINE
// ============================================================
const reportPath = `PHASE0_LIVE_DATABASE_BASELINE_${Date.now()}.json`;
await writeFile(reportPath, JSON.stringify(baseline, null, 2));

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  PHASE 0 COMPLETE                                              ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

console.log(`📄 Baseline saved: ${reportPath}\n`);

// ============================================================
// SUMMARY
// ============================================================
console.log('BASELINE SUMMARY:\n');

const issues = [];
const passes = [];

// Check RLS
if (!baseline.rls.bookings?.rlsBlocked) {
  issues.push('❌ Bookings RLS not properly blocking anonymous SELECT');
} else {
  passes.push('✅ Bookings RLS blocks anonymous SELECT');
}

if (!baseline.rls.customers?.rlsBlocked) {
  issues.push('❌ Customers RLS not properly blocking anonymous SELECT');
} else {
  passes.push('✅ Customers RLS blocks anonymous SELECT');
}

// Check functions
if (!baseline.functions.create_booking?.callable) {
  issues.push('❌ create_booking() not callable');
} else {
  passes.push('✅ create_booking() works');
}

if (!baseline.functions.get_dashboard_stats?.callable) {
  issues.push('❌ get_dashboard_stats() not callable');
} else {
  passes.push('✅ get_dashboard_stats() works');
}

// Check stats accuracy
if (baseline.functions.get_dashboard_stats?.result?.total_bookings === 0 && 
    baseline.database.bookings?.rowCount > 0) {
  issues.push('⚠️  Dashboard stats return 0 despite data existing');
}

// Check conflict detection
const conflictSuccess = Object.values(baseline.functions.conflict_detection || {})
  .filter(t => t.success).length;
if (conflictSuccess <= 1) {
  issues.push(`⚠️  Booking conflicts too strict (only ${conflictSuccess}/3 services work)`);
} else {
  passes.push(`✅ Booking conflict detection (${conflictSuccess}/3 services work)`);
}

// Check deduplication
if (!baseline.functions.customer_deduplication?.deduplicationWorks) {
  issues.push('❌ Customer deduplication broken');
} else {
  passes.push('✅ Customer deduplication works');
}

passes.forEach(p => console.log(p));
console.log('');
issues.forEach(i => console.log(i));

console.log(`\n${issues.length} ISSUES FOUND\n`);

process.exit(issues.length > 0 ? 1 : 0);
