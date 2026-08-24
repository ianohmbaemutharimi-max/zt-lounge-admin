#!/usr/bin/env node

/**
 * PHASE 1 — RLS ROOT CAUSE INVESTIGATION
 * Read-only authoritative database inspection
 * 
 * This script uses service_role to inspect the ACTUAL database state
 * without making any changes.
 */

import { createClient } from '@supabase/supabase-js';
import { writeFile } from 'fs/promises';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  PHASE 1: RLS ROOT CAUSE INVESTIGATION                         ║');
console.log('║  Project: jczwilrysvnhcjzjztbi                                 ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

const report = {
  timestamp: new Date().toISOString(),
  project: 'jczwilrysvnhcjzjztbi',
  phase: '1-root-cause-investigation',
  findings: {}
};

// ============================================================
// 1. RLS STATUS - AUTHORITATIVE CHECK
// ============================================================
console.log('[1/9] Checking RLS status on bookings and customers...');
// Note: Cannot query pg_class directly via PostgREST, will need alternative approach
const { data: rlsStatus, error: rlsError } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT relname, relrowsecurity, relforcerowsecurity
    FROM pg_class
    WHERE relname IN ('bookings', 'customers')
      AND relnamespace = 'public'::regnamespace;
  `
}).catch(() => ({ data: null, error: { message: 'exec_sql RPC not available' } }));

if (rlsError || !rlsStatus) {
  console.log(`   ⚠️  ${rlsError?.message || 'No data returned'}`);
  report.findings.rls_status = {
    error: rlsError?.message || 'No data',
    note: 'Will use alternative method'
  };
} else {
  report.findings.rls_status = rlsStatus;
  console.log('   ✓ RLS Status:');
  rlsStatus?.forEach(row => {
    console.log(`     ${row.relname}: ${row.relrowsecurity ? 'ENABLED' : 'DISABLED'}`);
  });
}
console.log();

// ============================================================
// 2. POLICIES - WHAT ACTUALLY EXISTS
// ============================================================
console.log('[2/9] Checking actual RLS policies...');
let policies = null;
let polError = { message: 'exec_sql RPC not available' };

if (polError) {
  console.log(`   ⚠️  Cannot access pg_policies: ${polError.message}`);
  report.findings.policies = { error: polError.message };
} else {
  report.findings.policies = policies;
  console.log(`   ✓ Found ${policies?.length || 0} policies`);
  policies?.forEach(pol => {
    console.log(`     - ${pol.tablename}.${pol.policyname} [${pol.cmd}] for ${pol.roles}`);
  });
}
console.log();

// ============================================================
// 3. TABLE GRANTS
// ============================================================
console.log('[3/9] Checking table grants for anon/authenticated/service_role...');
let grants = null;
let grantsError = { message: 'exec_sql RPC not available' };

if (grantsError) {
  console.log(`   ⚠️  Cannot access grants: ${grantsError.message}`);
  report.findings.grants = { error: grantsError.message };
} else {
  report.findings.grants = grants;
  console.log(`   ✓ Found ${grants?.length || 0} grants`);
  
  const byRole = {};
  grants?.forEach(g => {
    if (!byRole[g.grantee]) byRole[g.grantee] = {};
    if (!byRole[g.grantee][g.table_name]) byRole[g.grantee][g.table_name] = [];
    byRole[g.grantee][g.table_name].push(g.privilege_type);
  });
  
  Object.entries(byRole).forEach(([role, tables]) => {
    console.log(`     ${role}:`);
    Object.entries(tables).forEach(([table, privs]) => {
      console.log(`       ${table}: ${privs.join(', ')}`);
    });
  });
}
console.log();

// ============================================================
// 4. create_booking() FUNCTION METADATA
// ============================================================
console.log('[4/9] Inspecting create_booking() function...');
let funcMeta = null;
let funcError = { message: 'exec_sql RPC not available' };

if (funcError) {
  console.log(`   ⚠️  Cannot access pg_proc: ${funcError.message}`);
  report.findings.create_booking_meta = { error: funcError.message };
} else {
  report.findings.create_booking_meta = funcMeta?.[0];
  const func = funcMeta?.[0];
  if (func) {
    console.log(`   ✓ Function exists`);
    console.log(`     Security: ${func.prosecdef ? 'DEFINER' : 'INVOKER'}`);
    console.log(`     Owner OID: ${func.proowner}`);
    console.log(`     Definition length: ${func.definition?.length || 0} chars`);
  } else {
    console.log(`   ❌ Function NOT FOUND`);
  }
}
console.log();

// ============================================================
// 5. FUNCTION GRANTS
// ============================================================
console.log('[5/9] Checking EXECUTE grants on create_booking()...');
let funcGrants = null;
let fgError = { message: 'exec_sql RPC not available' };

if (fgError) {
  console.log(`   ⚠️  Cannot access routine_privileges: ${fgError.message}`);
  report.findings.function_grants = { error: fgError.message };
} else {
  report.findings.function_grants = funcGrants;
  console.log(`   ✓ Found ${funcGrants?.length || 0} function grants`);
  funcGrants?.forEach(g => {
    console.log(`     ${g.grantee}: ${g.privilege_type}`);
  });
}
console.log();

// ============================================================
// 6. MIGRATION HISTORY
// ============================================================
console.log('[6/9] Checking if RLS migration was applied...');
let migrations = null;
let migError = { message: 'exec_sql RPC not available' };

if (migError) {
  console.log(`   ⚠️  Cannot check migrations: ${migError.message}`);
  report.findings.migration_history = { error: migError.message };
} else {
  report.findings.migration_history = migrations;
  console.log(`   ${migrations?.length ? '✓' : '❌'} Found ${migrations?.length || 0} migrations from 2026-08-22`);
  migrations?.forEach(m => {
    console.log(`     Version: ${m.version}`);
  });
}
console.log();

// ============================================================
// 7. SAMPLE ANONYMOUS TEST (via anon key)
// ============================================================
console.log('[7/9] Testing actual anonymous access...');
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!anonKey) {
  console.log('   ⚠️  NEXT_PUBLIC_SUPABASE_ANON_KEY not found');
  report.findings.anonymous_test = { error: 'anon key missing' };
} else {
  const anonClient = createClient(supabaseUrl, anonKey);
  
  // Test SELECT bookings
  const { data: anonBookings, error: anonBookError } = await anonClient
    .from('bookings')
    .select('id')
    .limit(1);
  
  // Test SELECT customers  
  const { data: anonCustomers, error: anonCustError } = await anonClient
    .from('customers')
    .select('id')
    .limit(1);
  
  report.findings.anonymous_test = {
    bookings_query: {
      error: anonBookError?.message || null,
      error_code: anonBookError?.code || null,
      rows_returned: anonBookings?.length || 0,
      blocked: !!anonBookError
    },
    customers_query: {
      error: anonCustError?.message || null,
      error_code: anonCustError?.code || null,
      rows_returned: anonCustomers?.length || 0,
      blocked: !!anonCustError
    }
  };
  
  console.log(`   Bookings SELECT: ${anonBookError ? `❌ ${anonBookError.code}` : `✓ Allowed (${anonBookings?.length || 0} rows)`}`);
  console.log(`   Customers SELECT: ${anonCustError ? `❌ ${anonCustError.code}` : `✓ Allowed (${anonCustomers?.length || 0} rows)`}`);
}
console.log();

// ============================================================
// 8. SAMPLE AUTHENTICATED TEST
// ============================================================
console.log('[8/9] Checking service_role access (for comparison)...');
const { data: serviceBookings } = await supabase
  .from('bookings')
  .select('id')
  .limit(1);

const { data: serviceCustomers } = await supabase
  .from('customers')
  .select('id')
  .limit(1);

report.findings.service_role_test = {
  bookings_accessible: !!serviceBookings,
  customers_accessible: !!serviceCustomers,
  note: 'service_role bypasses RLS'
};

console.log(`   Service role bookings: ${serviceBookings ? '✓ Accessible' : '❌ Not accessible'}`);
console.log(`   Service role customers: ${serviceCustomers ? '✓ Accessible' : '❌ Not accessible'}`);
console.log();

// ============================================================
// 9. EXISTING BOOKINGS COUNT
// ============================================================
console.log('[9/9] Counting existing records...');
const { count: bookingsCount } = await supabase
  .from('bookings')
  .select('*', { count: 'exact', head: true });

const { count: customersCount } = await supabase
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
console.log('📊 PRELIMINARY ANALYSIS:\n');

const anonTest = report.findings.anonymous_test;
if (anonTest && !anonTest.error) {
  const bookingsBlocked = anonTest.bookings_query.blocked;
  const customersBlocked = anonTest.customers_query.blocked;
  
  if (bookingsBlocked && customersBlocked) {
    console.log('✅ GOOD: Anonymous access is actually BLOCKED');
    console.log('   Previous test may have used wrong credentials.');
  } else {
    console.log('❌ PROBLEM: Anonymous access is NOT properly blocked');
    console.log(`   Bookings blocked: ${bookingsBlocked}`);
    console.log(`   Customers blocked: ${customersBlocked}`);
  }
} else {
  console.log('⚠️  Could not verify anonymous access (anon key missing)');
}

console.log('\n📋 Next: Review JSON report for detailed findings\n');

process.exit(0);
