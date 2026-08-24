#!/usr/bin/env node

/**
 * ZT LOUNGE BOOKING SECURITY REMEDIATION
 * PHASE 1: PRE-REMEDIATION INSPECTION
 * 
 * Inspect LIVE database state before applying any changes.
 * Record current RLS status, policies, grants, and function details.
 */

import { createClient } from '@supabase/supabase-js';
import { writeFile } from 'fs/promises';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const inspection = {
  timestamp: new Date().toISOString(),
  project: 'jczwilrysvnhcjzjztbi',
  phase: 'PHASE 1: PRE-REMEDIATION INSPECTION',
  findings: {}
};

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  PHASE 1: PRE-REMEDIATION INSPECTION                          ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// ============================================================
// 1. CHECK RLS ENABLED STATUS
// ============================================================
console.log('[1/10] Checking RLS enabled status...\n');

let rlsStatus = null;
try {
  const result = await supabase.rpc('exec_sql', {
    sql: `
      SELECT 
        schemaname,
        tablename,
        rowsecurity as rls_enabled
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN ('bookings', 'customers')
      ORDER BY tablename;
    `
  });
  rlsStatus = result.data;
} catch (error) {
  rlsStatus = null;
}

if (rlsStatus) {
  inspection.findings.rls_status = rlsStatus;
  rlsStatus.forEach(t => {
    console.log(`   ${t.tablename}: RLS ${t.rls_enabled ? 'ENABLED ✅' : 'DISABLED ❌'}`);
  });
} else {
  console.log('   ⚠️  Cannot query pg_tables directly');
  // Try alternative method
  const { data: bookingsInfo } = await supabase
    .from('bookings')
    .select('id')
    .limit(0);
  
  const { data: customersInfo } = await supabase
    .from('customers')
    .select('id')
    .limit(0);
  
  inspection.findings.rls_status = {
    note: 'RLS status cannot be queried directly via PostgREST',
    bookings_accessible: !bookingsInfo,
    customers_accessible: !customersInfo
  };
}
console.log();

// ============================================================
// 2. LIST ALL POLICIES ON BOOKINGS
// ============================================================
console.log('[2/10] Listing policies on bookings...\n');

let bookingsPolicies = [];
try {
  const result = await supabase.rpc('exec_sql', {
    sql: `
      SELECT 
        policyname,
        cmd,
        roles::text[],
        qual,
        with_check
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'bookings'
      ORDER BY policyname;
    `
  });
  bookingsPolicies = result.data || [];
} catch (error) {
  bookingsPolicies = [];
}

inspection.findings.bookings_policies = bookingsPolicies || [];
console.log(`   Found ${bookingsPolicies?.length || 0} policies`);
bookingsPolicies?.forEach(p => {
  console.log(`   - ${p.policyname} (${p.cmd}) for ${p.roles}`);
});
console.log();

// ============================================================
// 3. LIST ALL POLICIES ON CUSTOMERS
// ============================================================
console.log('[3/10] Listing policies on customers...\n');

let customersPolicies = [];
try {
  const result = await supabase.rpc('exec_sql', {
    sql: `
      SELECT 
        policyname,
        cmd,
        roles::text[],
        qual,
        with_check
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'customers'
      ORDER BY policyname;
    `
  });
  customersPolicies = result.data || [];
} catch (error) {
  customersPolicies = [];
}

inspection.findings.customers_policies = customersPolicies || [];
console.log(`   Found ${customersPolicies?.length || 0} policies`);
customersPolicies?.forEach(p => {
  console.log(`   - ${p.policyname} (${p.cmd}) for ${p.roles}`);
});
console.log();

// ============================================================
// 4. CHECK TABLE GRANTS
// ============================================================
console.log('[4/10] Checking table grants...\n');

let bookingsGrants = [];
try {
  const result = await supabase.rpc('exec_sql', {
    sql: `
      SELECT 
        grantee,
        privilege_type,
        is_grantable
      FROM information_schema.table_privileges
      WHERE table_schema = 'public'
        AND table_name = 'bookings'
        AND grantee IN ('anon', 'authenticated', 'service_role')
      ORDER BY grantee, privilege_type;
    `
  });
  bookingsGrants = result.data || [];
} catch (error) {
  bookingsGrants = [];
}

inspection.findings.bookings_grants = bookingsGrants || [];
console.log(`   Bookings grants: ${bookingsGrants?.length || 0}`);
bookingsGrants?.forEach(g => {
  console.log(`   - ${g.grantee}: ${g.privilege_type}`);
});
console.log();

let customersGrants = [];
try {
  const result = await supabase.rpc('exec_sql', {
    sql: `
      SELECT 
        grantee,
        privilege_type,
        is_grantable
      FROM information_schema.table_privileges
      WHERE table_schema = 'public'
        AND table_name = 'customers'
        AND grantee IN ('anon', 'authenticated', 'service_role')
      ORDER BY grantee, privilege_type;
    `
  });
  customersGrants = result.data || [];
} catch (error) {
  customersGrants = [];
}

inspection.findings.customers_grants = customersGrants || [];
console.log(`   Customers grants: ${customersGrants?.length || 0}`);
customersGrants?.forEach(g => {
  console.log(`   - ${g.grantee}: ${g.privilege_type}`);
});
console.log();

// ============================================================
// 5. CHECK create_booking() FUNCTION
// ============================================================
console.log('[5/10] Checking create_booking() function...\n');

let functionInfo = [];
try {
  const result = await supabase.rpc('exec_sql', {
    sql: `
      SELECT 
        p.proname as function_name,
        pg_get_function_arguments(p.oid) as arguments,
        pg_get_function_result(p.oid) as return_type,
        p.prosecdef as is_security_definer,
        p.provolatile as volatility,
        array_to_string(p.proconfig, ', ') as config
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'create_booking';
    `
  });
  functionInfo = result.data || [];
} catch (error) {
  functionInfo = [];
}

inspection.findings.create_booking_function = functionInfo?.[0] || null;
if (functionInfo?.[0]) {
  const fn = functionInfo[0];
  console.log(`   ✅ Function exists`);
  console.log(`   Security definer: ${fn.is_security_definer ? 'YES ✅' : 'NO ❌'}`);
  console.log(`   Config: ${fn.config || 'none'}`);
} else {
  console.log(`   ❌ Function not found`);
}
console.log();

// ============================================================
// 6. CHECK create_booking() GRANTS
// ============================================================
console.log('[6/10] Checking create_booking() EXECUTE grants...\n');

let functionGrants = [];
try {
  const result = await supabase.rpc('exec_sql', {
    sql: `
      SELECT 
        grantee,
        privilege_type
      FROM information_schema.routine_privileges
      WHERE routine_schema = 'public'
        AND routine_name = 'create_booking'
        AND grantee IN ('anon', 'authenticated', 'public')
      ORDER BY grantee;
    `
  });
  functionGrants = result.data || [];
} catch (error) {
  functionGrants = [];
}

inspection.findings.create_booking_grants = functionGrants || [];
console.log(`   Found ${functionGrants?.length || 0} grants`);
functionGrants?.forEach(g => {
  console.log(`   - ${g.grantee}: ${g.privilege_type}`);
});
console.log();

// ============================================================
// 7. CHECK ROLES AND RBAC
// ============================================================
console.log('[7/10] Checking roles for RBAC...\n');

const { data: roles } = await supabase
  .from('roles')
  .select('id, name, description')
  .order('name');

inspection.findings.roles = roles || [];
console.log(`   Found ${roles?.length || 0} roles:`);
roles?.forEach(r => {
  console.log(`   - ${r.name}`);
});
console.log();

// ============================================================
// 8. CHECK PROFILES SCHEMA
// ============================================================
console.log('[8/10] Checking profiles schema...\n');

const { data: profilesSample } = await supabase
  .from('profiles')
  .select('*')
  .limit(1);

if (profilesSample && profilesSample.length > 0) {
  const columns = Object.keys(profilesSample[0]);
  inspection.findings.profiles_columns = columns;
  console.log(`   Columns: ${columns.join(', ')}`);
  console.log(`   Has role_id: ${columns.includes('role_id') ? 'YES ✅' : 'NO ❌'}`);
} else {
  inspection.findings.profiles_columns = [];
  console.log(`   ⚠️  No profiles found or cannot access`);
}
console.log();

// ============================================================
// 9. SAMPLE EXISTING BOOKINGS
// ============================================================
console.log('[9/10] Sampling existing bookings...\n');

const { data: bookingsSample, error: bookingsError } = await supabase
  .from('bookings')
  .select('id, booking_number, status, created_at')
  .order('created_at', { ascending: false })
  .limit(5);

if (bookingsError) {
  console.log(`   ⚠️  Cannot access: ${bookingsError.message}`);
  inspection.findings.bookings_sample = { error: bookingsError.message };
} else {
  inspection.findings.bookings_sample = bookingsSample;
  console.log(`   Found ${bookingsSample?.length || 0} recent bookings`);
}
console.log();

// ============================================================
// 10. SAMPLE EXISTING CUSTOMERS
// ============================================================
console.log('[10/10] Sampling existing customers...\n');

const { data: customersSample, error: customersError } = await supabase
  .from('customers')
  .select('id, full_name, phone, created_at')
  .order('created_at', { ascending: false })
  .limit(5);

if (customersError) {
  console.log(`   ⚠️  Cannot access: ${customersError.message}`);
  inspection.findings.customers_sample = { error: customersError.message };
} else {
  inspection.findings.customers_sample = customersSample;
  console.log(`   Found ${customersSample?.length || 0} recent customers`);
}
console.log();

// ============================================================
// SAVE INSPECTION REPORT
// ============================================================
const reportPath = `PHASE1_PRE_REMEDIATION_INSPECTION_${Date.now()}.json`;
await writeFile(reportPath, JSON.stringify(inspection, null, 2));

console.log('═══════════════════════════════════════════════════════════════');
console.log('PHASE 1 INSPECTION COMPLETE');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log(`📄 Full report saved: ${reportPath}\n`);

// ============================================================
// SUMMARY
// ============================================================
console.log('SUMMARY:\n');

const bookingsRLS = rlsStatus?.find(t => t.tablename === 'bookings')?.rls_enabled;
const customersRLS = rlsStatus?.find(t => t.tablename === 'customers')?.rls_enabled;

console.log(`RLS Status:`);
console.log(`   bookings: ${bookingsRLS ? 'ENABLED ✅' : 'DISABLED ❌'}`);
console.log(`   customers: ${customersRLS ? 'ENABLED ✅' : 'DISABLED ❌'}`);
console.log();

console.log(`Policies:`);
console.log(`   bookings: ${bookingsPolicies?.length || 0} policies`);
console.log(`   customers: ${customersPolicies?.length || 0} policies`);
console.log();

console.log(`create_booking():`);
console.log(`   exists: ${functionInfo?.[0] ? 'YES ✅' : 'NO ❌'}`);
console.log(`   security_definer: ${functionInfo?.[0]?.is_security_definer ? 'YES ✅' : 'NO ❌'}`);
console.log(`   anon grants: ${functionGrants?.some(g => g.grantee === 'anon') ? 'YES ✅' : 'NO ❌'}`);
console.log();

console.log('Ready for Phase 2: Apply RLS migration\n');

process.exit(0);
