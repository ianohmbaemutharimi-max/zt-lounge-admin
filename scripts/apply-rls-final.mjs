#!/usr/bin/env node

/**
 * ZT LOUNGE BOOKING RLS — SIMPLIFIED APPLICATION AND VERIFICATION
 * Applies RLS migration and runs comprehensive anonymous security tests
 */

import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile } from 'fs/promises';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey || !anonKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
const anonClient = createClient(supabaseUrl, anonKey);

const report = {
  timestamp: new Date().toISOString(),
  project: 'jczwilrysvnhcjzjztbi',
  phases: {},
  verdict: null
};

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  ZT LOUNGE BOOKING RLS — FINAL VERIFICATION                    ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// =============================================================
// PHASE 1: CHECK CURRENT STATE
// =============================================================
console.log('PHASE 1: Current State Check\n');

console.log('[1/2] Test current anonymous access...');
const testBefore = await anonClient.from('bookings').select('id').limit(1);
const wasBlocked = !!testBefore.error;
console.log(`   Result: ${wasBlocked ? '✅ Already blocked' : '⚠️  Currently open'}\n`);
report.phases.before_state = { anonymous_blocked: wasBlocked };

console.log('[2/2] Count existing data...');
const { count: bookingsCount } = await serviceClient
  .from('bookings')
  .select('*', { count: 'exact', head: true });
const { count: customersCount } = await serviceClient
  .from('customers')
  .select('*', { count: 'exact', head: true });
console.log(`   Bookings: ${bookingsCount}, Customers: ${customersCount}\n`);
report.phases.data_counts = { bookings: bookingsCount, customers: customersCount };

// =============================================================
// PHASE 2: APPLY MIGRATION
// =============================================================
console.log('PHASE 2: Apply RLS Migration\n');

console.log('[1/2] Reading migration...');
const migrationSQL = await readFile(
  'supabase/migrations/20260822_enable_booking_rls_security.sql',
  'utf-8'
);
console.log(`   ✓ Loaded ${migrationSQL.length} characters\n`);

console.log('[2/2] Executing migration...');
try {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`
    },
    body: JSON.stringify({ sql: migrationSQL })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  console.log('   ✅ Migration applied successfully\n');
  report.phases.migration = { status: 'applied' };
} catch (error) {
  console.error(`   ❌ Migration failed: ${error.message}\n`);
  console.error('MANUAL ACTION REQUIRED:');
  console.error('1. Go to Supabase Dashboard → SQL Editor');
  console.error('2. Execute: supabase/migrations/20260822_enable_booking_rls_security.sql\n');
  
  report.phases.migration = { status: 'failed', error: error.message };
  await writeFile(`RLS_MIGRATION_FAILED_${Date.now()}.json`, JSON.stringify(report, null, 2));
  process.exit(1);
}

// Wait for database
console.log('Waiting 2 seconds for PostgreSQL...\n');
await new Promise(resolve => setTimeout(resolve, 2000));

// =============================================================
// PHASE 3: ANONYMOUS SECURITY TESTS
// =============================================================
console.log('PHASE 3: Anonymous Security Verification\n');
console.log('⚠️  CRITICAL: Using ANONYMOUS credentials (not service_role)\n');

const tests = {};

console.log('[1/8] SELECT bookings...');
const t1 = await anonClient.from('bookings').select('id').limit(1);
tests.select_bookings = { blocked: !!t1.error, error: t1.error?.code };
console.log(`   ${tests.select_bookings.blocked ? '✅ BLOCKED' : '❌ ALLOWED'}\n`);

console.log('[2/8] SELECT customers...');
const t2 = await anonClient.from('customers').select('id').limit(1);
tests.select_customers = { blocked: !!t2.error, error: t2.error?.code };
console.log(`   ${tests.select_customers.blocked ? '✅ BLOCKED' : '❌ ALLOWED'}\n`);

console.log('[3/8] INSERT bookings...');
const t3 = await anonClient.from('bookings').insert({
  booking_number: 'TEST', customer_id: '00000000-0000-0000-0000-000000000000',
  service_id: '00000000-0000-0000-0000-000000000000', booking_date: '2099-12-31',
  start_time: '12:00', end_time: '13:00', guests: 2, status: 'pending'
});
tests.insert_bookings = { blocked: !!t3.error, error: t3.error?.code };
console.log(`   ${tests.insert_bookings.blocked ? '✅ BLOCKED' : '❌ ALLOWED'}\n`);

console.log('[4/8] UPDATE bookings...');
const t4 = await anonClient.from('bookings')
  .update({ special_requests: 'test' })
  .eq('id', '00000000-0000-0000-0000-000000000000');
tests.update_bookings = { blocked: !!t4.error, error: t4.error?.code };
console.log(`   ${tests.update_bookings.blocked ? '✅ BLOCKED' : '❌ ALLOWED'}\n`);

console.log('[5/8] DELETE bookings...');
const t5 = await anonClient.from('bookings').delete()
  .eq('id', '00000000-0000-0000-0000-000000000000');
tests.delete_bookings = { blocked: !!t5.error, error: t5.error?.code };
console.log(`   ${tests.delete_bookings.blocked ? '✅ BLOCKED' : '❌ ALLOWED'}\n`);

console.log('[6/8] INSERT customers...');
const t6 = await anonClient.from('customers').insert({
  full_name: 'Test', phone: '+254700000999', email: 'test@example.com'
});
tests.insert_customers = { blocked: !!t6.error, error: t6.error?.code };
console.log(`   ${tests.insert_customers.blocked ? '✅ BLOCKED' : '❌ ALLOWED'}\n`);

console.log('[7/8] UPDATE customers...');
const t7 = await anonClient.from('customers')
  .update({ full_name: 'Updated' })
  .eq('id', '00000000-0000-0000-0000-000000000000');
tests.update_customers = { blocked: !!t7.error, error: t7.error?.code };
console.log(`   ${tests.update_customers.blocked ? '✅ BLOCKED' : '❌ ALLOWED'}\n`);

console.log('[8/8] DELETE customers...');
const t8 = await anonClient.from('customers').delete()
  .eq('id', '00000000-0000-0000-0000-000000000000');
tests.delete_customers = { blocked: !!t8.error, error: t8.error?.code };
console.log(`   ${tests.delete_customers.blocked ? '✅ BLOCKED' : '❌ ALLOWED'}\n`);

report.phases.anonymous_security = tests;

// =============================================================
// PHASE 4: PUBLIC RPC TEST
// =============================================================
console.log('PHASE 4: Public Booking RPC Test\n');

console.log('[1/1] Test create_booking() with anonymous credentials...');
const rpcTest = await anonClient.rpc('create_booking', {
  p_full_name: 'RLS Verification Customer',
  p_phone: `+2547${Date.now().toString().slice(-8)}`,
  p_booking_date: '2099-12-25',
  p_start_time: '18:30',
  p_guests: 2,
  p_email: `rls-test-${Date.now()}@example.com`,
  p_service_slug: 'restaurant',
  p_special_requests: 'RLS verification test booking'
});

const rpcSuccess = !rpcTest.error && !!rpcTest.data;
console.log(`   Result: ${rpcSuccess ? '✅ SUCCESS' : `❌ FAILED: ${rpcTest.error?.message}`}\n`);

if (rpcSuccess) {
  console.log(`   Booking: ${rpcTest.data.booking_number}`);
  console.log(`   Customer: ${rpcTest.data.customer_id}`);
  console.log(`   Status: ${rpcTest.data.status}\n`);
}

report.phases.rpc_test = {
  success: rpcSuccess,
  error: rpcTest.error?.message,
  booking_number: rpcTest.data?.booking_number
};

// =============================================================
// FINAL GATE EVALUATION
// =============================================================
console.log('═══════════════════════════════════════════════════════════════');
console.log('GATE 1: SECURITY / RLS');
console.log('═══════════════════════════════════════════════════════════════\n');

const allSecurityChecks = [
  tests.select_bookings.blocked,
  tests.select_customers.blocked,
  tests.insert_bookings.blocked,
  tests.update_bookings.blocked,
  tests.delete_bookings.blocked,
  tests.insert_customers.blocked,
  tests.update_customers.blocked,
  tests.delete_customers.blocked,
  rpcSuccess
];

const gate1Pass = allSecurityChecks.every(check => check === true);

console.log(`${gate1Pass ? '✅' : '❌'} Anonymous SELECT bookings: ${tests.select_bookings.blocked ? 'BLOCKED' : 'ALLOWED'}`);
console.log(`${gate1Pass ? '✅' : '❌'} Anonymous SELECT customers: ${tests.select_customers.blocked ? 'BLOCKED' : 'ALLOWED'}`);
console.log(`${gate1Pass ? '✅' : '❌'} Anonymous INSERT bookings: ${tests.insert_bookings.blocked ? 'BLOCKED' : 'ALLOWED'}`);
console.log(`${gate1Pass ? '✅' : '❌'} Anonymous UPDATE bookings: ${tests.update_bookings.blocked ? 'BLOCKED' : 'ALLOWED'}`);
console.log(`${gate1Pass ? '✅' : '❌'} Anonymous DELETE bookings: ${tests.delete_bookings.blocked ? 'BLOCKED' : 'ALLOWED'}`);
console.log(`${gate1Pass ? '✅' : '❌'} Anonymous INSERT customers: ${tests.insert_customers.blocked ? 'BLOCKED' : 'ALLOWED'}`);
console.log(`${gate1Pass ? '✅' : '❌'} Anonymous UPDATE customers: ${tests.update_customers.blocked ? 'BLOCKED' : 'ALLOWED'}`);
console.log(`${gate1Pass ? '✅' : '❌'} Anonymous DELETE customers: ${tests.delete_customers.blocked ? 'BLOCKED' : 'ALLOWED'}`);
console.log(`${gate1Pass ? '✅' : '❌'} Public create_booking() RPC: ${rpcSuccess ? 'WORKS' : 'FAILED'}`);

console.log('\n═══════════════════════════════════════════════════════════════\n');

report.verdict = gate1Pass ? 'PASS' : 'FAIL';

const reportPath = `ZT_RLS_VERIFICATION_FINAL_${Date.now()}.json`;
await writeFile(reportPath, JSON.stringify(report, null, 2));

console.log('╔════════════════════════════════════════════════════════════════╗');
if (gate1Pass) {
  console.log('║  ✅ ✅ ✅  RLS SECURITY VERIFIED — PRODUCTION READY  ✅ ✅ ✅  ║');
} else {
  console.log('║  ❌ ❌ ❌  RLS SECURITY VERIFICATION FAILED  ❌ ❌ ❌          ║');
}
console.log('╚════════════════════════════════════════════════════════════════╝\n');

console.log(`📄 Report: ${reportPath}\n`);

if (gate1Pass) {
  console.log('✅ PRODUCTION READY:');
  console.log('   • All anonymous direct table access properly blocked');
  console.log('   • Public booking RPC working correctly');
  console.log('   • Security gate passed\n');
  process.exit(0);
} else {
  console.log('❌ NOT READY:');
  console.log('   • Review security test failures above');
  console.log('   • Verify RLS policies in Supabase Dashboard\n');
  process.exit(1);
}
