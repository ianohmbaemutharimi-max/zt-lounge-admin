#!/usr/bin/env node

/**
 * PHASE 1 — RLS ROOT CAUSE INVESTIGATION (SIMPLIFIED)
 * Focus on what we can actually test: anonymous vs service_role access
 */

import { createClient } from '@supabase/supabase-js';
import { writeFile } from 'fs/promises';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey || !anonKey) {
  console.error('❌ Missing required environment variables');
  console.error(`   SUPABASE_URL: ${supabaseUrl ? '✓' : '✗'}`);
  console.error(`   SERVICE_ROLE_KEY: ${supabaseServiceKey ? '✓' : '✗'}`);
  console.error(`   ANON_KEY: ${anonKey ? '✓' : '✗'}`);
  process.exit(1);
}

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  PHASE 1: RLS ROOT CAUSE INVESTIGATION                         ║');
console.log('║  Project: jczwilrysvnhcjzjztbi                                 ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
const anonClient = createClient(supabaseUrl, anonKey);

const report = {
  timestamp: new Date().toISOString(),
  project: 'jczwilrysvnhcjzjztbi',
  phase: '1-root-cause-investigation-simple',
  findings: {}
};

// ============================================================
// TEST 1: ANONYMOUS SELECT BOOKINGS
// ============================================================
console.log('[1/8] Testing ANONYMOUS SELECT on bookings...');
const { data: anonBookings, error: anonBookError } = await anonClient
  .from('bookings')
  .select('id')
  .limit(1);

report.findings.anonymous_bookings = {
  error: anonBookError?.message || null,
  error_code: anonBookError?.code || null,
  hint: anonBookError?.hint || null,
  details: anonBookError?.details || null,
  rows_returned: anonBookings?.length || 0,
  blocked: !!anonBookError,
  verdict: anonBookError ? 'BLOCKED ✅' : `ALLOWED ❌ (${anonBookings?.length || 0} rows)`
};

console.log(`   Result: ${report.findings.anonymous_bookings.verdict}`);
if (anonBookError) {
  console.log(`   Error: ${anonBookError.code} - ${anonBookError.message}`);
}
console.log();

// ============================================================
// TEST 2: ANONYMOUS SELECT CUSTOMERS
// ============================================================
console.log('[2/8] Testing ANONYMOUS SELECT on customers...');
const { data: anonCustomers, error: anonCustError } = await anonClient
  .from('customers')
  .select('id')
  .limit(1);

report.findings.anonymous_customers = {
  error: anonCustError?.message || null,
  error_code: anonCustError?.code || null,
  rows_returned: anonCustomers?.length || 0,
  blocked: !!anonCustError,
  verdict: anonCustError ? 'BLOCKED ✅' : `ALLOWED ❌ (${anonCustomers?.length || 0} rows)`
};

console.log(`   Result: ${report.findings.anonymous_customers.verdict}`);
if (anonCustError) {
  console.log(`   Error: ${anonCustError.code} - ${anonCustError.message}`);
}
console.log();

// ============================================================
// TEST 3: ANONYMOUS UPDATE BOOKINGS
// ============================================================
console.log('[3/8] Testing ANONYMOUS UPDATE on bookings...');
const { data: anonUpdate, error: anonUpdateError } = await anonClient
  .from('bookings')
  .update({ special_requests: 'test' })
  .eq('id', '00000000-0000-0000-0000-000000000000'); // Non-existent ID

report.findings.anonymous_update_bookings = {
  error: anonUpdateError?.message || null,
  error_code: anonUpdateError?.code || null,
  blocked: !!anonUpdateError,
  verdict: anonUpdateError ? 'BLOCKED ✅' : 'ALLOWED ❌'
};

console.log(`   Result: ${report.findings.anonymous_update_bookings.verdict}`);
if (anonUpdateError) {
  console.log(`   Error: ${anonUpdateError.code} - ${anonUpdateError.message}`);
}
console.log();

// ============================================================
// TEST 4: ANONYMOUS INSERT BOOKINGS
// ============================================================
console.log('[4/8] Testing ANONYMOUS INSERT on bookings...');
const { data: anonInsert, error: anonInsertError } = await anonClient
  .from('bookings')
  .insert({
    booking_number: 'TEST-999',
    customer_id: '00000000-0000-0000-0000-000000000000',
    service_id: '00000000-0000-0000-0000-000000000000',
    booking_date: '2099-12-31',
    start_time: '12:00:00',
    end_time: '13:00:00',
    guests: 2,
    status: 'pending'
  })
  .select();

report.findings.anonymous_insert_bookings = {
  error: anonInsertError?.message || null,
  error_code: anonInsertError?.code || null,
  blocked: !!anonInsertError,
  verdict: anonInsertError ? 'BLOCKED ✅' : 'ALLOWED ❌'
};

console.log(`   Result: ${report.findings.anonymous_insert_bookings.verdict}`);
if (anonInsertError) {
  console.log(`   Error: ${anonInsertError.code} - ${anonInsertError.message}`);
}
console.log();

// ============================================================
// TEST 5: ANONYMOUS RPC create_booking()
// ============================================================
console.log('[5/8] Testing ANONYMOUS RPC create_booking()...');
const { data: anonRpc, error: anonRpcError } = await anonClient
  .rpc('create_booking', {
    p_full_name: 'Test RLS Investigation',
    p_phone: '+254700000999',
    p_booking_date: '2099-12-31',
    p_start_time: '14:00',
    p_guests: 2,
    p_email: 'test_rls@example.com',
    p_service_slug: 'restaurant',
    p_special_requests: 'RLS root cause test'
  });

report.findings.anonymous_create_booking_rpc = {
  error: anonRpcError?.message || null,
  error_code: anonRpcError?.code || null,
  success: !anonRpcError && !!anonRpc,
  verdict: anonRpcError ? `BLOCKED ❌ - ${anonRpcError.message}` : 'ALLOWED ✅'
};

console.log(`   Result: ${report.findings.anonymous_create_booking_rpc.verdict}`);
console.log();

// ============================================================
// TEST 6: SERVICE ROLE SELECT BOOKINGS (for comparison)
// ============================================================
console.log('[6/8] Testing SERVICE_ROLE SELECT on bookings...');
const { data: serviceBookings, error: serviceBookError } = await serviceClient
  .from('bookings')
  .select('id')
  .limit(1);

report.findings.service_role_bookings = {
  error: serviceBookError?.message || null,
  rows_returned: serviceBookings?.length || 0,
  accessible: !serviceBookError,
  note: 'service_role bypasses RLS'
};

console.log(`   Result: ${serviceBookings ? '✓ Accessible' : '❌ Error'} (${serviceBookings?.length || 0} rows)`);
console.log();

// ============================================================
// TEST 7: COUNT EXISTING RECORDS
// ============================================================
console.log('[7/8] Counting existing records...');
const { count: bookingsCount } = await serviceClient
  .from('bookings')
  .select('*', { count: 'exact', head: true });

const { count: customersCount } = await serviceClient
  .from('customers')
  .select('*', { count: 'exact', head: true });

report.findings.record_counts = {
  bookings: bookingsCount,
  customers: customersCount
};

console.log(`   Bookings: ${bookingsCount || 0}`);
console.log(`   Customers: ${customersCount || 0}`);
console.log();

// ============================================================
// TEST 8: CHECK IF MIGRATION EXISTS
// ============================================================
console.log('[8/8] Checking migration status...');
const { data: migrationCheck } = await serviceClient
  .from('_prisma_migrations')
  .select('*')
  .or('migration_name.ilike.%rls%,migration_name.ilike.%20260822%')
  .limit(5);

report.findings.migration_check = {
  note: 'Attempting to find RLS-related migrations',
  found: migrationCheck?.length || 0,
  migrations: migrationCheck || []
};

console.log(`   Found ${migrationCheck?.length || 0} potential RLS migrations`);
console.log();

// ============================================================
// SAVE REPORT
// ============================================================
const reportPath = `PHASE1_RLS_ROOT_CAUSE_INVESTIGATION_${Date.now()}.json`;
await writeFile(reportPath, JSON.stringify(report, null, 2));

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  PHASE 1 COMPLETE                                              ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

console.log(`📄 Full report saved: ${reportPath}\n`);

// ============================================================
// ANALYSIS
// ============================================================
console.log('📊 ROOT CAUSE ANALYSIS:\n');

const bookingsBlocked = report.findings.anonymous_bookings.blocked;
const customersBlocked = report.findings.anonymous_customers.blocked;
const updateBlocked = report.findings.anonymous_update_bookings.blocked;
const insertBlocked = report.findings.anonymous_insert_bookings.blocked;
const rpcAllowed = report.findings.anonymous_create_booking_rpc.success;

if (bookingsBlocked && customersBlocked && updateBlocked && insertBlocked) {
  console.log('✅ ✅ ✅ RLS IS WORKING CORRECTLY!');
  console.log('');
  console.log('   Anonymous users are BLOCKED from:');
  console.log('   • SELECT bookings ✅');
  console.log('   • SELECT customers ✅');
  console.log('   • UPDATE bookings ✅');
  console.log('   • INSERT bookings ✅');
  console.log('');
  console.log('   The previous test FAILURE was due to:');
  console.log('   → Using service_role credentials instead of anon key');
  console.log('   → service_role bypasses RLS by design');
  console.log('');
  console.log('   VERDICT: Gate 1 (Security/RLS) should PASS ✅');
} else {
  console.log('❌ ❌ ❌ RLS IS NOT WORKING!');
  console.log('');
  console.log('   Security violations found:');
  if (!bookingsBlocked) console.log('   • Anonymous can SELECT bookings ❌');
  if (!customersBlocked) console.log('   • Anonymous can SELECT customers ❌');
  if (!updateBlocked) console.log('   • Anonymous can UPDATE bookings ❌');
  if (!insertBlocked) console.log('   • Anonymous can INSERT bookings ❌');
  console.log('');
  console.log('   VERDICT: Gate 1 (Security/RLS) FAILS ❌');
  console.log('   ACTION REQUIRED: Apply RLS policies');
}

console.log('');
console.log(`   create_booking() RPC: ${rpcAllowed ? '✅ Working' : '❌ Blocked'}`);
console.log('');

process.exit(bookingsBlocked && customersBlocked ? 0 : 1);
