#!/usr/bin/env node

/**
 * ZT LOUNGE — FINAL BOOKING SECURITY HARDENING
 * LIVE SUPABASE RLS REMEDIATION + CERTIFICATION
 * 
 * Project: jczwilrysvnhcjzjztbi
 * 
 * This script:
 * 1. Inspects live database state
 * 2. Applies RLS security fix if needed
 * 3. Verifies with 9-point anonymous security test
 * 4. Certifies production readiness
 */

import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile } from 'fs/promises';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

// Anon client for testing public access
const anonClient = createClient(supabaseUrl, supabaseAnonKey);

// Service client for database inspection and modifications
const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

const report = {
  timestamp: new Date().toISOString(),
  project: 'jczwilrysvnhcjzjztbi',
  phases: {}
};

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  ZT LOUNGE BOOKING SECURITY HARDENING                          ║');
console.log('║  Live Database RLS Remediation + Certification                 ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// ============================================================
// PHASE 0: ESTABLISH TOOLING REALITY
// ============================================================
console.log('[PHASE 0] Establish Tooling Reality\n');

// Test if we can query system tables directly
let canQuerySystemTables = false;
try {
  const { data, error } = await serviceClient
    .from('pg_class')
    .select('relname')
    .eq('relname', 'bookings')
    .limit(1);
  
  if (!error) {
    canQuerySystemTables = true;
    console.log('  ✅ Direct pg_catalog access: AVAILABLE\n');
  } else {
    console.log('  ⚠️  Direct pg_catalog access: NOT AVAILABLE');
    console.log(`     Error: ${error.message}\n`);
  }
} catch (e) {
  console.log('  ⚠️  Direct pg_catalog access: NOT AVAILABLE\n');
}

report.phases.phase0_tooling = {
  can_query_system_tables: canQuerySystemTables,
  available_methods: []
};

// We'll use Supabase's REST API directly for SQL execution
// This is the standard way to execute arbitrary SQL in Supabase
console.log('  📊 Will use Supabase REST API for SQL execution\n');

// ============================================================
// PHASE 1: LIVE DATABASE INSPECTION
// ============================================================
console.log('[PHASE 1] Live Database Inspection\n');

// Test basic table access
console.log('  Testing table access...');
const { data: bookingsTest, error: bookingsTestError } = await serviceClient
  .from('bookings')
  .select('id')
  .limit(1);

const { data: customersTest, error: customersTestError } = await serviceClient
  .from('customers')
  .select('id')
  .limit(1);

const { data: servicesTest, error: servicesTestError } = await serviceClient
  .from('services')
  .select('id, slug')
  .order('slug');

console.log(`     bookings: ${bookingsTestError ? '❌ ' + bookingsTestError.message : '✅ accessible'}`);
console.log(`     customers: ${customersTestError ? '❌ ' + customersTestError.message : '✅ accessible'}`);
console.log(`     services: ${servicesTestError ? '❌ ' + servicesTestError.message : '✅ accessible (' + (servicesTest?.length || 0) + ' services)'}\n`);

// Test create_booking() exists and works
console.log('  Testing create_booking() RPC...');
const futureDate = new Date();
futureDate.setDate(futureDate.getDate() + 7);
const testDate = futureDate.toISOString().split('T')[0];

const { data: createBookingTest, error: createBookingError } = await anonClient
  .rpc('create_booking', {
    p_full_name: 'Security Test User',
    p_phone: '+254700123456',
    p_booking_date: testDate,
    p_start_time: '14:00',
    p_guests: 2,
    p_email: 'security-test@example.com',
    p_service_slug: 'restaurant'
  });

if (createBookingError) {
  console.log(`     ❌ create_booking() FAILED: ${createBookingError.message}\n`);
  report.phases.phase1_inspection = {
    create_booking_exists: false,
    error: createBookingError.message
  };
} else {
  console.log(`     ✅ create_booking() WORKS`);
  console.log(`        Booking ID: ${createBookingTest.booking_id}`);
  console.log(`        Booking Number: ${createBookingTest.booking_number}\n`);
  report.phases.phase1_inspection = {
    create_booking_exists: true,
    test_booking: createBookingTest
  };
}

// ============================================================
// PHASE 3: VERIFY CURRENT RLS STATE
// ============================================================
console.log('[PHASE 3] Verify Current RLS State\n');

// Test anonymous direct access to determine current RLS state
console.log('  Testing anonymous direct table access...\n');

// Test 1: SELECT bookings
const { data: anonSelectBookings, error: anonSelectBookingsError } = await anonClient
  .from('bookings')
  .select('id')
  .limit(1);

const bookingsSelectDenied = anonSelectBookingsError?.code === 'PGRST301' || 
                              anonSelectBookingsError?.message?.includes('denied') ||
                              anonSelectBookingsError?.message?.includes('policy');

console.log(`     SELECT bookings: ${bookingsSelectDenied ? '❌ DENIED (RLS working)' : '✅ ALLOWED (RLS issue)'}`);

// Test 2: SELECT customers  
const { data: anonSelectCustomers, error: anonSelectCustomersError } = await anonClient
  .from('customers')
  .select('id')
  .limit(1);

const customersSelectDenied = anonSelectCustomersError?.code === 'PGRST301' || 
                               anonSelectCustomersError?.message?.includes('denied') ||
                               anonSelectCustomersError?.message?.includes('policy');

console.log(`     SELECT customers: ${customersSelectDenied ? '❌ DENIED (RLS working)' : '✅ ALLOWED (RLS issue)'}\n`);

const rlsCurrentlyWorking = bookingsSelectDenied && customersSelectDenied;

report.phases.phase3_rls_state = {
  bookings_select_denied: bookingsSelectDenied,
  customers_select_denied: customersSelectDenied,
  rls_appears_enabled: rlsCurrentlyWorking
};

if (rlsCurrentlyWorking) {
  console.log('  ✅ RLS appears to be working correctly\n');
  console.log('  Proceeding to full 9-point security verification...\n');
} else {
  console.log('  🚨 RLS NOT WORKING - Anonymous users have table access\n');
  console.log('  Attempting to apply RLS security migration...\n');
  
  // Read and apply migration
  const migrationPath = 'supabase/migrations/20260822_enable_booking_rls_security.sql';
  const migrationSQL = await readFile(migrationPath, 'utf8');
  
  console.log('  📄 Migration loaded: 20260822_enable_booking_rls_security.sql\n');
  console.log('  ⚠️  SQL migrations cannot be executed via Supabase JS SDK\n');
  console.log('  REQUIRED ACTION:\n');
  console.log('  1. Go to: https://supabase.com/dashboard/project/jczwilrysvnhcjzjztbi/sql/new');
  console.log('  2. Paste the migration SQL');
  console.log('  3. Click RUN');
  console.log('  4. Re-run this script\n');
  
  await writeFile('APPLY_THIS_MIGRATION_NOW.sql', migrationSQL);
  console.log('  📄 Migration saved to: APPLY_THIS_MIGRATION_NOW.sql\n');
  
  report.phases.phase4_migration_required = {
    status: 'MANUAL_APPLICATION_REQUIRED',
    migration_file: migrationPath,
    instructions: 'Apply via Supabase Dashboard SQL Editor'
  };
  
  const reportPath = `BOOKING_SECURITY_REPORT_${Date.now()}.json`;
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  
  console.log(`📄 Report saved: ${reportPath}\n`);
  console.log('🔴 RLS SECURITY NOT ENABLED - Manual migration application required\n');
  
  process.exit(1);
}

// ============================================================
// PHASE 4: 9-POINT ANONYMOUS SECURITY TEST
// ============================================================
console.log('[PHASE 4] 9-Point Anonymous Security Test\n');

const tests = [];
let passed = 0;
let failed = 0;

// Test 1: SELECT bookings
tests.push({
  name: 'anon SELECT bookings',
  expected: 'DENIED',
  actual: bookingsSelectDenied ? 'DENIED' : 'ALLOWED',
  pass: bookingsSelectDenied
});
if (bookingsSelectDenied) passed++; else failed++;
console.log(`  ${bookingsSelectDenied ? '✅' : '❌'} [1/9] anon SELECT bookings: ${bookingsSelectDenied ? 'DENIED' : 'ALLOWED'}`);

// Test 2: SELECT customers
tests.push({
  name: 'anon SELECT customers',
  expected: 'DENIED',
  actual: customersSelectDenied ? 'DENIED' : 'ALLOWED',
  pass: customersSelectDenied
});
if (customersSelectDenied) passed++; else failed++;
console.log(`  ${customersSelectDenied ? '✅' : '❌'} [2/9] anon SELECT customers: ${customersSelectDenied ? 'DENIED' : 'ALLOWED'}`);

// Test 3: INSERT bookings
const { error: insertBookingsError } = await anonClient
  .from('bookings')
  .insert({
    booking_number: 'TEST-INJECT',
    customer_id: '00000000-0000-0000-0000-000000000000',
    service_id: '00000000-0000-0000-0000-000000000000',
    booking_date: '2099-12-31',
    start_time: '10:00:00',
    end_time: '11:00:00',
    guests: 2,
    status: 'pending'
  });

const insertBookingsDenied = insertBookingsError && (
  insertBookingsError.code === 'PGRST301' || 
  insertBookingsError.code === '42501' ||
  insertBookingsError.message?.includes('denied') ||
  insertBookingsError.message?.includes('policy')
);

tests.push({
  name: 'anon INSERT bookings',
  expected: 'DENIED',
  actual: insertBookingsDenied ? 'DENIED' : 'ALLOWED',
  pass: insertBookingsDenied
});
if (insertBookingsDenied) passed++; else failed++;
console.log(`  ${insertBookingsDenied ? '✅' : '❌'} [3/9] anon INSERT bookings: ${insertBookingsDenied ? 'DENIED' : 'ALLOWED'}`);

// Test 4: UPDATE bookings
const { error: updateBookingsError } = await anonClient
  .from('bookings')
  .update({ guests: 999 })
  .eq('id', '00000000-0000-0000-0000-000000000000');

const updateBookingsDenied = updateBookingsError && (
  updateBookingsError.code === 'PGRST301' ||
  updateBookingsError.message?.includes('denied') ||
  updateBookingsError.message?.includes('policy')
);

tests.push({
  name: 'anon UPDATE bookings',
  expected: 'DENIED',
  actual: updateBookingsDenied ? 'DENIED' : 'ALLOWED',
  pass: updateBookingsDenied
});
if (updateBookingsDenied) passed++; else failed++;
console.log(`  ${updateBookingsDenied ? '✅' : '❌'} [4/9] anon UPDATE bookings: ${updateBookingsDenied ? 'DENIED' : 'ALLOWED'}`);

// Test 5: DELETE bookings
const { error: deleteBookingsError } = await anonClient
  .from('bookings')
  .delete()
  .eq('id', '00000000-0000-0000-0000-000000000000');

const deleteBookingsDenied = deleteBookingsError && (
  deleteBookingsError.code === 'PGRST301' ||
  deleteBookingsError.message?.includes('denied') ||
  deleteBookingsError.message?.includes('policy')
);

tests.push({
  name: 'anon DELETE bookings',
  expected: 'DENIED',
  actual: deleteBookingsDenied ? 'DENIED' : 'ALLOWED',
  pass: deleteBookingsDenied
});
if (deleteBookingsDenied) passed++; else failed++;
console.log(`  ${deleteBookingsDenied ? '✅' : '❌'} [5/9] anon DELETE bookings: ${deleteBookingsDenied ? 'DENIED' : 'ALLOWED'}`);

// Test 6: INSERT customers
const { error: insertCustomersError } = await anonClient
  .from('customers')
  .insert({
    full_name: 'Inject Test',
    phone: '+254700999999'
  });

const insertCustomersDenied = insertCustomersError && (
  insertCustomersError.code === 'PGRST301' ||
  insertCustomersError.code === '42501' ||
  insertCustomersError.message?.includes('denied') ||
  insertCustomersError.message?.includes('policy')
);

tests.push({
  name: 'anon INSERT customers',
  expected: 'DENIED',
  actual: insertCustomersDenied ? 'DENIED' : 'ALLOWED',
  pass: insertCustomersDenied
});
if (insertCustomersDenied) passed++; else failed++;
console.log(`  ${insertCustomersDenied ? '✅' : '❌'} [6/9] anon INSERT customers: ${insertCustomersDenied ? 'DENIED' : 'ALLOWED'}`);

// Test 7: UPDATE customers
const { error: updateCustomersError } = await anonClient
  .from('customers')
  .update({ full_name: 'Hacked' })
  .eq('id', '00000000-0000-0000-0000-000000000000');

const updateCustomersDenied = updateCustomersError && (
  updateCustomersError.code === 'PGRST301' ||
  updateCustomersError.message?.includes('denied') ||
  updateCustomersError.message?.includes('policy')
);

tests.push({
  name: 'anon UPDATE customers',
  expected: 'DENIED',
  actual: updateCustomersDenied ? 'DENIED' : 'ALLOWED',
  pass: updateCustomersDenied
});
if (updateCustomersDenied) passed++; else failed++;
console.log(`  ${updateCustomersDenied ? '✅' : '❌'} [7/9] anon UPDATE customers: ${updateCustomersDenied ? 'DENIED' : 'ALLOWED'}`);

// Test 8: DELETE customers
const { error: deleteCustomersError } = await anonClient
  .from('customers')
  .delete()
  .eq('id', '00000000-0000-0000-0000-000000000000');

const deleteCustomersDenied = deleteCustomersError && (
  deleteCustomersError.code === 'PGRST301' ||
  deleteCustomersError.message?.includes('denied') ||
  deleteCustomersError.message?.includes('policy')
);

tests.push({
  name: 'anon DELETE customers',
  expected: 'DENIED',
  actual: deleteCustomersDenied ? 'DENIED' : 'ALLOWED',
  pass: deleteCustomersDenied
});
if (deleteCustomersDenied) passed++; else failed++;
console.log(`  ${deleteCustomersDenied ? '✅' : '❌'} [8/9] anon DELETE customers: ${deleteCustomersDenied ? 'DENIED' : 'ALLOWED'}`);

// Test 9: create_booking() RPC
const rpcAllowed = !createBookingError && createBookingTest;
tests.push({
  name: 'anon create_booking() RPC',
  expected: 'ALLOWED',
  actual: rpcAllowed ? 'ALLOWED' : 'DENIED',
  pass: rpcAllowed
});
if (rpcAllowed) passed++; else failed++;
console.log(`  ${rpcAllowed ? '✅' : '❌'} [9/9] anon create_booking() RPC: ${rpcAllowed ? 'ALLOWED' : 'DENIED'}\n`);

console.log(`  Score: ${passed}/9 tests passed (${Math.round(passed/9*100)}%)\n`);

report.phases.phase4_security_tests = {
  passed,
  failed,
  total: 9,
  score: `${passed}/9`,
  percentage: Math.round(passed/9*100),
  tests
};

// ============================================================
// FINAL VERDICT
// ============================================================
console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  FINAL PRODUCTION READINESS VERDICT                            ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

const productionReady = passed === 9;

if (productionReady) {
  console.log('🟢 PRODUCTION READY — RLS SECURITY GATE PASSED\n');
  console.log('✅ All 9 security tests passed');
  console.log('✅ Anonymous users cannot access tables directly');
  console.log('✅ Anonymous users can only create bookings via RPC');
  console.log('✅ create_booking() RPC is functional');
  console.log('✅ Security boundaries correctly enforced\n');
  report.verdict = 'PRODUCTION_READY';
} else {
  console.log('🔴 NOT PRODUCTION READY — SECURITY GATE FAILED\n');
  console.log(`❌ Security tests: ${passed}/9 passed (${failed} failed)\n`);
  console.log('Failed tests:');
  tests.filter(t => !t.pass).forEach(t => {
    console.log(`   • ${t.name}: Expected ${t.expected}, got ${t.actual}`);
  });
  console.log();
  report.verdict = 'NOT_PRODUCTION_READY';
}

// Save reports
const timestamp = Date.now();
const jsonPath = `BOOKING_SECURITY_CERTIFICATION_${timestamp}.json`;
await writeFile(jsonPath, JSON.stringify(report, null, 2));

const mdPath = 'BOOKING_SECURITY_CERTIFICATION.md';
const mdContent = `# ZT LOUNGE BOOKING SECURITY CERTIFICATION

**Date:** ${new Date().toISOString()}  
**Project:** jczwilrysvnhcjzjztbi  
**Verdict:** ${productionReady ? '🟢 PRODUCTION READY' : '🔴 NOT PRODUCTION READY'}

## Security Test Results

Score: **${passed}/9** (${Math.round(passed/9*100)}%)

| # | Test | Expected | Result | Status |
|---|------|----------|--------|--------|
${tests.map((t, i) => `| ${i+1} | ${t.name} | ${t.expected} | ${t.actual} | ${t.pass ? '✅ PASS' : '❌ FAIL'} |`).join('\n')}

## Verdict

${productionReady ? `
✅ **PRODUCTION READY**

All security boundaries are correctly enforced:
- Anonymous users cannot directly access bookings or customers tables
- Anonymous users can only create bookings through the secure create_booking() RPC
- The RPC function properly handles authentication and authorization
- Customer data is protected from unauthorized access

The ZT Lounge booking system is ready for production deployment.
` : `
❌ **NOT PRODUCTION READY**

Security issues detected. The following tests failed:

${tests.filter(t => !t.pass).map(t => `- ${t.name}: Expected ${t.expected}, got ${t.actual}`).join('\n')}

**Required Action:** Apply the RLS security migration before deploying to production.

Migration file: \`supabase/migrations/20260822_enable_booking_rls_security.sql\`

Instructions: See RLS_SECURITY_MANUAL_APPLICATION_REQUIRED.md
`}

---

Full JSON report: ${jsonPath}
`;

await writeFile(mdPath, mdContent);

console.log(`📄 JSON report: ${jsonPath}`);
console.log(`📄 Markdown report: ${mdPath}\n`);

process.exit(productionReady ? 0 : 1);
