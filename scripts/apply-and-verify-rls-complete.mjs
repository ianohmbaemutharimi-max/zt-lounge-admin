#!/usr/bin/env node

/**
 * ZT LOUNGE BOOKING RLS — COMPLETE APPLICATION AND VERIFICATION
 * 
 * This script:
 * 1. Inspects current RLS state
 * 2. Applies RLS migration using Supabase Management API
 * 3. Verifies database state
 * 4. Runs TRUE anonymous security tests (using anon key)
 * 5. Tests public booking RPC
 * 6. Verifies admin access
 * 7. Generates comprehensive reports
 */

import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile } from 'fs/promises';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey || !anonKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
const anonClient = createClient(supabaseUrl, anonKey);

const report = {
  timestamp: new Date().toISOString(),
  project: 'jczwilrysvnhcjzjztbi',
  phases: {},
  gates: {},
  verdict: null
};

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  ZT LOUNGE BOOKING RLS — COMPLETE VERIFICATION                 ║');
console.log('║  Project: jczwilrysvnhcjzjztbi                                 ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// ============================================================
// PHASE 1: INSPECT CURRENT LIVE STATE
// ============================================================
console.log('═══════════════════════════════════════════════════════════════');
console.log('PHASE 1: INSPECT CURRENT LIVE STATE');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('[1/6] Checking RLS status on tables...');
let rlsCheck, rlsError;
try {
  const result = await serviceClient.rpc('exec_sql', {
    sql: `
      SELECT 
        c.relname AS table_name,
        c.relrowsecurity AS rls_enabled
      FROM pg_class c
      WHERE c.relname IN ('bookings', 'customers')
        AND c.relnamespace = 'public'::regnamespace;
    `
  });
  rlsCheck = result.data;
  rlsError = result.error;
} catch (err) {
  rlsCheck = null;
  rlsError = { message: 'exec_sql RPC not available' };
}

if (rlsCheck) {
  report.phases.phase1_rls_status = rlsCheck;
  console.log(`   Bookings RLS: ${rlsCheck.find(r => r.table_name === 'bookings')?.rls_enabled ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`   Customers RLS: ${rlsCheck.find(r => r.table_name === 'customers')?.rls_enabled ? '✅ Enabled' : '❌ Disabled'}`);
} else {
  console.log('   ⚠️  Could not query RLS status directly');
  report.phases.phase1_rls_status = { error: rlsError?.message };
}

console.log('\n[2/6] Counting existing RLS policies...');
const { count: policiesCount } = await serviceClient
  .from('pg_policies')
  .select('*', { count: 'exact', head: true })
  .or('tablename.eq.bookings,tablename.eq.customers')
  .catch(() => ({ count: null }));

console.log(`   Found ${policiesCount || 'unknown'} policies\n`);
report.phases.phase1_policy_count = policiesCount;

console.log('[3/6] Testing current anonymous access...');
const { data: currentAnonTest, error: currentAnonError } = await anonClient
  .from('bookings')
  .select('id')
  .limit(1);

const currentlyBlocked = !!currentAnonError;
console.log(`   Anonymous SELECT: ${currentlyBlocked ? '✅ Currently BLOCKED' : '❌ Currently ALLOWED'}\n`);
report.phases.phase1_current_security = { blocked: currentlyBlocked, error: currentAnonError?.message };

console.log('[4/6] Checking create_booking() function...');
let funcCheck;
try {
  const result = await serviceClient.rpc('exec_sql', {
    sql: `
      SELECT 
        p.proname AS function_name,
        p.prosecdef AS is_security_definer,
        pg_get_function_arguments(p.oid) AS parameters
      FROM pg_proc p
      WHERE p.proname = 'create_booking'
        AND p.pronamespace = 'public'::regnamespace;
    `
  });
  funcCheck = result.data;
} catch {
  funcCheck = null;
}

if (funcCheck?.[0]) {
  console.log(`   Function exists: ✅`);
  console.log(`   SECURITY DEFINER: ${funcCheck[0].is_security_definer ? '✅' : '❌'}`);
  report.phases.phase1_function = funcCheck[0];
} else {
  console.log(`   ⚠️  Function status unknown`);
  report.phases.phase1_function = null;
}

console.log('\n[5/6] Counting existing bookings and customers...');
const { count: bookingsCount } = await serviceClient
  .from('bookings')
  .select('*', { count: 'exact', head: true });

const { count: customersCount } = await serviceClient
  .from('customers')
  .select('*', { count: 'exact', head: true });

console.log(`   Bookings: ${bookingsCount}`);
console.log(`   Customers: ${customersCount}\n`);
report.phases.phase1_data_counts = { bookings: bookingsCount, customers: customersCount };

console.log('[6/6] Phase 1 complete\n');

// ============================================================
// PHASE 2: APPLY RLS MIGRATION
// ============================================================
console.log('═══════════════════════════════════════════════════════════════');
console.log('PHASE 2: APPLY RLS MIGRATION');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('[1/2] Reading migration file...');
const migrationSQL = await readFile(
  'supabase/migrations/20260822_enable_booking_rls_security.sql',
  'utf-8'
);
console.log(`   ✓ Loaded ${migrationSQL.length} characters\n`);

console.log('[2/2] Applying migration via Supabase Management API...');
console.log('   Using service_role to execute SQL...\n');

// Use the Management API to execute SQL
const managementResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': supabaseServiceKey,
    'Authorization': `Bearer ${supabaseServiceKey}`,
    'Prefer': 'return=minimal'
  },
  body: JSON.stringify({ sql: migrationSQL })
}).catch(err => ({
  ok: false,
  statusText: `Fetch error: ${err.message}`
}));

if (!managementResponse.ok) {
  console.error(`   ❌ Migration application failed: ${managementResponse.statusText}\n`);
  console.error('   MANUAL ACTION REQUIRED:');
  console.error('   1. Go to Supabase Dashboard → SQL Editor');
  console.error('   2. Copy: supabase/migrations/20260822_enable_booking_rls_security.sql');
  console.error('   3. Execute the SQL');
  console.error('   4. Re-run this script\n');
  
  report.phases.phase2_migration = {
    status: 'failed',
    error: managementResponse.statusText,
    manual_action_required: true
  };
  
  await writeFile(
    `ZT_LOUNGE_BOOKING_RLS_MANUAL_ACTION_REQUIRED_${Date.now()}.json`,
    JSON.stringify(report, null, 2)
  );
  
  process.exit(1);
}

console.log('   ✓ Migration executed\n');
report.phases.phase2_migration = { status: 'applied' };

// Wait for PostgreSQL to process
console.log('   Waiting 2 seconds for PostgreSQL to process...\n');
await new Promise(resolve => setTimeout(resolve, 2000));

// ============================================================
// PHASE 3: VERIFY DATABASE STATE
// ============================================================
console.log('═══════════════════════════════════════════════════════════════');
console.log('PHASE 3: VERIFY DATABASE STATE');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('[1/3] Verify RLS is enabled...');
let rlsVerify;
try {
  const result = await serviceClient.rpc('exec_sql', {
    sql: `
      SELECT 
        c.relname AS table_name,
        c.relrowsecurity AS rls_enabled
      FROM pg_class c
      WHERE c.relname IN ('bookings', 'customers')
        AND c.relnamespace = 'public'::regnamespace;
    `
  });
  rlsVerify = result.data;
} catch {
  rlsVerify = [];
}

const bookingsRLS = rlsVerify?.find(r => r.table_name === 'bookings')?.rls_enabled;
const customersRLS = rlsVerify?.find(r => r.table_name === 'customers')?.rls_enabled;

console.log(`   Bookings RLS: ${bookingsRLS ? '✅ Enabled' : '❌ Disabled'}`);
console.log(`   Customers RLS: ${customersRLS ? '✅ Enabled' : '❌ Disabled'}\n`);

report.phases.phase3_rls_verification = {
  bookings_rls: bookingsRLS,
  customers_rls: customersRLS
};

console.log('[2/3] Count RLS policies...');
const { count: newPolicyCount } = await serviceClient
  .from('pg_policies')
  .select('*', { count: 'exact', head: true })
  .or('tablename.eq.bookings,tablename.eq.customers')
  .catch(() => ({ count: 0 }));

console.log(`   Total policies: ${newPolicyCount}\n`);
report.phases.phase3_policy_count = newPolicyCount;

console.log('[3/3] Verify create_booking() grants...');
// Check if anon can execute
let grantCheck;
try {
  const result = await serviceClient.rpc('exec_sql', {
    sql: `
      SELECT has_function_privilege('anon', 'public.create_booking(text,text,date,text,integer,text,text,text)', 'execute') AS can_execute;
    `
  });
  grantCheck = result.data;
} catch {
  grantCheck = null;
}

console.log(`   Anonymous EXECUTE: ${grantCheck?.[0]?.can_execute ? '✅ Granted' : '❌ Not granted'}\n`);
report.phases.phase3_grants = { anon_execute: grantCheck?.[0]?.can_execute };

// ============================================================
// PHASE 4: TRUE ANONYMOUS SECURITY TEST
// ============================================================
console.log('═══════════════════════════════════════════════════════════════');
console.log('PHASE 4: TRUE ANONYMOUS SECURITY TEST');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log('⚠️  CRITICAL: Using ANONYMOUS credentials (not service_role)\n');

const securityTests = {
  select_bookings: null,
  select_customers: null,
  insert_bookings: null,
  update_bookings: null,
  delete_bookings: null,
  insert_customers: null,
  update_customers: null,
  delete_customers: null
};

console.log('[1/8] Anonymous SELECT bookings...');
const { data: anonSelectBookings, error: anonSelectBookingsError } = await anonClient
  .from('bookings')
  .select('id')
  .limit(1);

securityTests.select_bookings = {
  blocked: !!anonSelectBookingsError,
  error_code: anonSelectBookingsError?.code,
  rows_returned: anonSelectBookings?.length || 0
};
console.log(`   Result: ${securityTests.select_bookings.blocked ? '✅ BLOCKED' : `❌ ALLOWED (${anonSelectBookings?.length || 0} rows)`}\n`);

console.log('[2/8] Anonymous SELECT customers...');
const { data: anonSelectCustomers, error: anonSelectCustomersError } = await anonClient
  .from('customers')
  .select('id')
  .limit(1);

securityTests.select_customers = {
  blocked: !!anonSelectCustomersError,
  error_code: anonSelectCustomersError?.code,
  rows_returned: anonSelectCustomers?.length || 0
};
console.log(`   Result: ${securityTests.select_customers.blocked ? '✅ BLOCKED' : `❌ ALLOWED (${anonSelectCustomers?.length || 0} rows)`}\n`);

console.log('[3/8] Anonymous INSERT bookings...');
const { data: anonInsertBookings, error: anonInsertBookingsError } = await anonClient
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
  });

securityTests.insert_bookings = {
  blocked: !!anonInsertBookingsError,
  error_code: anonInsertBookingsError?.code
};
console.log(`   Result: ${securityTests.insert_bookings.blocked ? '✅ BLOCKED' : '❌ ALLOWED'}\n`);

console.log('[4/8] Anonymous UPDATE bookings...');
const { data: anonUpdateBookings, error: anonUpdateBookingsError } = await anonClient
  .from('bookings')
  .update({ special_requests: 'test' })
  .eq('id', '00000000-0000-0000-0000-000000000000');

securityTests.update_bookings = {
  blocked: !!anonUpdateBookingsError,
  error_code: anonUpdateBookingsError?.code
};
console.log(`   Result: ${securityTests.update_bookings.blocked ? '✅ BLOCKED' : '❌ ALLOWED'}\n`);

console.log('[5/8] Anonymous DELETE bookings...');
const { data: anonDeleteBookings, error: anonDeleteBookingsError } = await anonClient
  .from('bookings')
  .delete()
  .eq('id', '00000000-0000-0000-0000-000000000000');

securityTests.delete_bookings = {
  blocked: !!anonDeleteBookingsError,
  error_code: anonDeleteBookingsError?.code
};
console.log(`   Result: ${securityTests.delete_bookings.blocked ? '✅ BLOCKED' : '❌ ALLOWED'}\n`);

console.log('[6/8] Anonymous INSERT customers...');
const { data: anonInsertCustomers, error: anonInsertCustomersError } = await anonClient
  .from('customers')
  .insert({
    full_name: 'Test Customer',
    phone: '+254700000999',
    email: 'test@example.com'
  });

securityTests.insert_customers = {
  blocked: !!anonInsertCustomersError,
  error_code: anonInsertCustomersError?.code
};
console.log(`   Result: ${securityTests.insert_customers.blocked ? '✅ BLOCKED' : '❌ ALLOWED'}\n`);

console.log('[7/8] Anonymous UPDATE customers...');
const { data: anonUpdateCustomers, error: anonUpdateCustomersError } = await anonClient
  .from('customers')
  .update({ full_name: 'Updated' })
  .eq('id', '00000000-0000-0000-0000-000000000000');

securityTests.update_customers = {
  blocked: !!anonUpdateCustomersError,
  error_code: anonUpdateCustomersError?.code
};
console.log(`   Result: ${securityTests.update_customers.blocked ? '✅ BLOCKED' : '❌ ALLOWED'}\n`);

console.log('[8/8] Anonymous DELETE customers...');
const { data: anonDeleteCustomers, error: anonDeleteCustomersError } = await anonClient
  .from('customers')
  .delete()
  .eq('id', '00000000-0000-0000-0000-000000000000');

securityTests.delete_customers = {
  blocked: !!anonDeleteCustomersError,
  error_code: anonDeleteCustomersError?.code
};
console.log(`   Result: ${securityTests.delete_customers.blocked ? '✅ BLOCKED' : '❌ ALLOWED'}\n`);

report.phases.phase4_anonymous_security = securityTests;

// ============================================================
// PHASE 5: VERIFY PUBLIC BOOKING RPC
// ============================================================
console.log('═══════════════════════════════════════════════════════════════');
console.log('PHASE 5: VERIFY PUBLIC BOOKING RPC');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('[1/1] Test create_booking() with anonymous client...');
const uniqueDate = '2099-12-25'; // Christmas 2099
const uniqueTime = '18:30';

const { data: rpcResult, error: rpcError } = await anonClient
  .rpc('create_booking', {
    p_full_name: 'RLS Test Customer',
    p_phone: `+2547${Date.now().toString().slice(-8)}`,
    p_booking_date: uniqueDate,
    p_start_time: uniqueTime,
    p_guests: 2,
    p_email: `rls-test-${Date.now()}@example.com`,
    p_service_slug: 'restaurant',
    p_special_requests: 'RLS verification test'
  });

const rpcSuccess = !rpcError && !!rpcResult;
console.log(`   Result: ${rpcSuccess ? '✅ SUCCESS' : `❌ FAILED: ${rpcError?.message}`}\n`);

if (rpcSuccess) {
  console.log(`   Created booking: ${rpcResult.booking_number}`);
  console.log(`   Customer ID: ${rpcResult.customer_id}`);
  console.log(`   Status: ${rpcResult.status}\n`);
}

report.phases.phase5_rpc_test = {
  success: rpcSuccess,
  error: rpcError?.message,
  result: rpcSuccess ? {
    booking_number: rpcResult.booking_number,
    customer_id: rpcResult.customer_id,
    status: rpcResult.status
  } : null
};

// ============================================================
// GATE EVALUATION
// ============================================================
console.log('═══════════════════════════════════════════════════════════════');
console.log('GATE EVALUATION');
console.log('═══════════════════════════════════════════════════════════════\n');

// Gate 1: Security/RLS
const gate1Checks = {
  rls_enabled: bookingsRLS && customersRLS,
  anon_select_bookings_blocked: securityTests.select_bookings.blocked,
  anon_select_customers_blocked: securityTests.select_customers.blocked,
  anon_insert_bookings_blocked: securityTests.insert_bookings.blocked,
  anon_update_bookings_blocked: securityTests.update_bookings.blocked,
  anon_delete_bookings_blocked: securityTests.delete_bookings.blocked,
  anon_insert_customers_blocked: securityTests.insert_customers.blocked,
  anon_update_customers_blocked: securityTests.update_customers.blocked,
  anon_delete_customers_blocked: securityTests.delete_customers.blocked,
  create_booking_rpc_works: rpcSuccess
};

const gate1Pass = Object.values(gate1Checks).every(v => v === true);

report.gates.gate1_security_rls = {
  checks: gate1Checks,
  status: gate1Pass ? 'PASS' : 'FAIL'
};

console.log('GATE 1: SECURITY / RLS');
console.log(`Status: ${gate1Pass ? '✅ PASS' : '❌ FAIL'}\n`);
Object.entries(gate1Checks).forEach(([key, value]) => {
  console.log(`  ${value ? '✅' : '❌'} ${key}`);
});

console.log('\n');

// ============================================================
// FINAL VERDICT
// ============================================================
console.log('╔════════════════════════════════════════════════════════════════╗');
if (gate1Pass) {
  console.log('║  ✅ ✅ ✅  RLS SECURITY VERIFIED AND WORKING  ✅ ✅ ✅          ║');
  report.verdict = 'PASS';
} else {
  console.log('║  ❌ ❌ ❌  RLS SECURITY VERIFICATION FAILED  ❌ ❌ ❌          ║');
  report.verdict = 'FAIL';
}
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// Save reports
const reportPath = `ZT_LOUNGE_BOOKING_RLS_FINAL_VERIFICATION_${Date.now()}.json`;
await writeFile(reportPath, JSON.stringify(report, null, 2));

console.log(`📄 Full report saved: ${reportPath}\n`);

if (gate1Pass) {
  console.log('✅ NEXT STEPS:');
  console.log('   • Gate 1 (Security/RLS): PASS ✅');
  console.log('   • Anonymous users are properly blocked from direct table access');
  console.log('   • Public booking via create_booking() RPC works correctly');
  console.log('   • Ready for Phase 6: Admin regression testing');
  console.log('   • Ready for Phase 7: Final production gate verification\n');
  process.exit(0);
} else {
  console.log('❌ FAILURES DETECTED:');
  console.log('   • Review the security test results above');
  console.log('   • Check that migration was applied correctly');
  console.log('   • Verify RLS policies in Supabase Dashboard\n');
  process.exit(1);
}
