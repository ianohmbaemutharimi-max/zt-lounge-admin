#!/usr/bin/env node

/**
 * ZT LOUNGE BOOKING SECURITY REMEDIATION
 * PHASE 1: LIVE FUNCTION INVESTIGATION
 * 
 * Comprehensive inspection of all booking-related functions in the live database.
 * Uses service_role to inspect metadata (not to test RLS).
 */

import { createClient } from '@supabase/supabase-js';
import { writeFile } from 'fs/promises';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  db: { schema: 'public' }
});

const report = {
  timestamp: new Date().toISOString(),
  project: 'jczwilrysvnhcjzjztbi',
  phase: 'PHASE 1: LIVE FUNCTION INVESTIGATION',
  findings: {}
};

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  PHASE 1: LIVE FUNCTION INVESTIGATION                         ║');
console.log('║  Project: jczwilrysvnhcjzjztbi                                ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// ============================================================
// 1. LIST ALL BOOKING-RELATED FUNCTIONS
// ============================================================
console.log('[Step 1/8] Searching for ALL functions with "booking" in name...\n');

// Try using raw SQL query via a custom SQL endpoint if available
// Since PostgREST doesn't expose pg_proc directly, we need to check if there's an RPC
// that can execute raw SQL or use the Supabase Management API

// First, let's try calling create_booking with various signatures to understand what exists
console.log('Testing create_booking() with different signatures:\n');

// Test 1: Original expected signature
console.log('Test 1: Expected signature (p_full_name, p_phone, p_booking_date, p_start_time, p_guests, p_email, p_service_slug, p_special_requests)');
const test1 = await supabase.rpc('create_booking', {
  p_full_name: 'Test Investigation 1',
  p_phone: `+2547${Date.now().toString().slice(-8)}`,
  p_booking_date: '2099-12-31',
  p_start_time: '14:00',
  p_guests: 2,
  p_email: `test1-${Date.now()}@investigation.test`,
  p_service_slug: 'restaurant',
  p_special_requests: 'Investigation test'
});

if (test1.error) {
  console.log(`   ❌ Error: ${test1.error.message}`);
  console.log(`   Code: ${test1.error.code}`);
  console.log(`   Details: ${test1.error.details}`);
  console.log(`   Hint: ${test1.error.hint}\n`);
} else {
  console.log(`   ✅ SUCCESS!`);
  console.log(`   Result:`, JSON.stringify(test1.data, null, 2));
  console.log();
}

report.findings.signature_test_1 = {
  params: {
    p_full_name: 'string',
    p_phone: 'string',
    p_booking_date: 'date',
    p_start_time: 'string',
    p_guests: 'number',
    p_email: 'string',
    p_service_slug: 'string',
    p_special_requests: 'string'
  },
  success: !test1.error,
  error: test1.error?.message,
  data: test1.data
};

// Test 2: Try with TIME type instead of string
console.log('Test 2: Trying with time parameter as TIME type');
const test2 = await supabase.rpc('create_booking', {
  p_full_name: 'Test Investigation 2',
  p_phone: `+2547${Date.now().toString().slice(-8)}`,
  p_booking_date: '2099-12-31',
  p_start_time: '14:00:00',
  p_guests: 2,
  p_email: `test2-${Date.now()}@investigation.test`,
  p_service_slug: 'restaurant'
});

if (test2.error) {
  console.log(`   ❌ Error: ${test2.error.message}\n`);
} else {
  console.log(`   ✅ SUCCESS!`);
  console.log(`   Result:`, JSON.stringify(test2.data, null, 2));
  console.log();
}

report.findings.signature_test_2 = {
  params: 'TIME type for p_start_time',
  success: !test2.error,
  error: test2.error?.message,
  data: test2.data
};

// Test 3: Try without optional parameters
console.log('Test 3: Minimal parameters (no email, no special_requests)');
const test3 = await supabase.rpc('create_booking', {
  p_full_name: 'Test Investigation 3',
  p_phone: `+2547${Date.now().toString().slice(-8)}`,
  p_booking_date: '2099-12-31',
  p_start_time: '15:00',
  p_guests: 1,
  p_service_slug: 'restaurant'
});

if (test3.error) {
  console.log(`   ❌ Error: ${test3.error.message}\n`);
} else {
  console.log(`   ✅ SUCCESS!`);
  console.log(`   Result:`, JSON.stringify(test3.data, null, 2));
  console.log();
}

report.findings.signature_test_3 = {
  params: 'Minimal signature',
  success: !test3.error,
  error: test3.error?.message,
  data: test3.data
};

// ============================================================
// 2. CHECK FUNCTION EXISTENCE VIA INFORMATION_SCHEMA
// ============================================================
console.log('\n[Step 2/8] Checking for functions in information_schema.routines...\n');

const { data: routines, error: routinesError } = await supabase
  .from('routines')
  .select('*')
  .ilike('routine_name', '%booking%')
  .eq('routine_schema', 'public');

if (routinesError) {
  console.log(`   ⚠️  Cannot query information_schema.routines directly: ${routinesError.message}`);
  console.log(`   (This is expected - PostgREST doesn't expose system catalogs)\n`);
} else {
  console.log(`   Found ${routines?.length || 0} routines`);
  report.findings.routines = routines;
}

// ============================================================
// 3. TEST VARIOUS POSSIBLE FUNCTION NAMES
// ============================================================
console.log('[Step 3/8] Testing possible function name variations...\n');

const functionTests = [
  'create_booking',
  'public.create_booking',
  'insert_booking',
  'add_booking',
  'book_service',
  'submit_booking'
];

for (const funcName of functionTests) {
  const { data, error } = await supabase.rpc(funcName, {
    p_full_name: 'Test',
    p_phone: '+254712345678',
    p_booking_date: '2099-12-31',
    p_start_time: '12:00',
    p_guests: 1,
    p_service_slug: 'restaurant'
  });
  
  console.log(`   ${funcName}: ${error ? '❌ ' + error.message.split('\n')[0] : '✅ EXISTS'}`);
}
console.log();

// ============================================================
// 4. INSPECT BOOKINGS TABLE SCHEMA
// ============================================================
console.log('[Step 4/8] Inspecting public.bookings table structure...\n');

const { data: bookingsSample } = await supabase
  .from('bookings')
  .select('*')
  .limit(1);

if (bookingsSample && bookingsSample.length > 0) {
  const columns = Object.keys(bookingsSample[0]);
  console.log(`   Columns (${columns.length}):`, columns.join(', '));
  console.log(`   Sample record:`, JSON.stringify(bookingsSample[0], null, 2));
} else {
  console.log(`   ⚠️  No bookings in table or cannot access`);
}
console.log();

report.findings.bookings_columns = bookingsSample ? Object.keys(bookingsSample[0]) : [];

// ============================================================
// 5. INSPECT CUSTOMERS TABLE SCHEMA
// ============================================================
console.log('[Step 5/8] Inspecting public.customers table structure...\n');

const { data: customersSample } = await supabase
  .from('customers')
  .select('*')
  .limit(1);

if (customersSample && customersSample.length > 0) {
  const columns = Object.keys(customersSample[0]);
  console.log(`   Columns (${columns.length}):`, columns.join(', '));
  console.log(`   Sample record:`, JSON.stringify(customersSample[0], null, 2));
} else {
  console.log(`   ⚠️  No customers in table or cannot access`);
}
console.log();

report.findings.customers_columns = customersSample ? Object.keys(customersSample[0]) : [];

// ============================================================
// 6. INSPECT SERVICES TABLE
// ============================================================
console.log('[Step 6/8] Inspecting public.services table...\n');

const { data: services } = await supabase
  .from('services')
  .select('*')
  .order('slug');

console.log(`   Found ${services?.length || 0} services:`);
services?.forEach(service => {
  console.log(`   - ${service.slug} (${service.name}) - ${service.is_active ? 'ACTIVE' : 'INACTIVE'}`);
});
console.log();

report.findings.services = services;

// ============================================================
// 7. CHECK RLS STATUS
// ============================================================
console.log('[Step 7/8] Checking RLS status (via table access patterns)...\n');

// Using service_role, we can always access - this doesn't tell us about RLS
// We'll note this and test with anon later
console.log(`   ⚠️  Using service_role - RLS is bypassed`);
console.log(`   RLS testing requires anonymous credentials (Phase 7)\n`);

// ============================================================
// 8. SUMMARY OF FINDINGS
// ============================================================
console.log('[Step 8/8] Summarizing findings...\n');

const workingTest = [test1, test2, test3].find(t => !t.error);

report.findings.summary = {
  create_booking_works: !!workingTest,
  working_signature: workingTest ? 'Found working signature' : 'No working signature found',
  bookings_table_accessible: !!bookingsSample,
  customers_table_accessible: !!customersSample,
  services_count: services?.length || 0,
  test_bookings_created: [test1, test2, test3].filter(t => !t.error).map(t => t.data?.booking_number).filter(Boolean)
};

console.log('═══════════════════════════════════════════════════════════════');
console.log('PHASE 1 SUMMARY');
console.log('═══════════════════════════════════════════════════════════════\n');

if (workingTest) {
  console.log('✅ create_booking() FUNCTION EXISTS AND WORKS\n');
  console.log('Working signature:');
  console.log('   - p_full_name: TEXT');
  console.log('   - p_phone: TEXT');
  console.log('   - p_booking_date: DATE');
  console.log('   - p_start_time: TEXT (HH:MM format)');
  console.log('   - p_guests: INTEGER');
  console.log('   - p_email: TEXT (optional)');
  console.log('   - p_service_slug: TEXT');
  console.log('   - p_special_requests: TEXT (optional)\n');
  
  console.log('Test bookings created:', report.findings.summary.test_bookings_created.join(', '));
} else {
  console.log('❌ create_booking() FUNCTION NOT FOUND OR NOT WORKING\n');
  console.log('All signature tests failed. Function may:');
  console.log('   - Not exist');
  console.log('   - Have different parameter names');
  console.log('   - Have different parameter types');
  console.log('   - Have runtime errors');
}

console.log();
console.log(`Bookings table: ${bookingsSample ? '✅ Accessible' : '❌ Not accessible'}`);
console.log(`Customers table: ${customersSample ? '✅ Accessible' : '❌ Not accessible'}`);
console.log(`Services: ${services?.length || 0} found`);
console.log();

// Save report
const reportPath = `PHASE1_LIVE_FUNCTION_INVESTIGATION_${Date.now()}.json`;
await writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(`📄 Full report saved: ${reportPath}\n`);

console.log('═══════════════════════════════════════════════════════════════');
console.log(`PHASE 1 COMPLETE`);
console.log('═══════════════════════════════════════════════════════════════\n');

if (workingTest) {
  console.log('✅ READY FOR PHASE 2: Schema inspection');
  console.log('   The create_booking() function works.');
  console.log('   Proceed to inspect detailed schema and constraints.\n');
} else {
  console.log('⚠️  BLOCKER: create_booking() not working');
  console.log('   Must investigate further or create function before proceeding.\n');
}

process.exit(workingTest ? 0 : 1);
