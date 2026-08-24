#!/usr/bin/env node

/**
 * CREATE_BOOKING CONTRADICTION RECONCILIATION
 * 
 * Comprehensive investigation to resolve contradictory reports about
 * whether create_booking() exists in the live Supabase database.
 * 
 * This script performs exhaustive PostgreSQL inspection to establish
 * incontrovertible evidence.
 */

import { createClient } from '@supabase/supabase-js';
import { writeFile } from 'fs/promises';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);

const reconciliation = {
  timestamp: new Date().toISOString(),
  project: 'jczwilrysvnhcjzjztbi',
  investigation: 'CREATE_BOOKING CONTRADICTION RECONCILIATION',
  phases: {}
};

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  CREATE_BOOKING CONTRADICTION RECONCILIATION                  ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// ============================================================
// PHASE 1: DIRECT DATABASE FUNCTION INSPECTION
// ============================================================
console.log('[PHASE 1] Direct PostgreSQL function inspection\n');

// 1.1: Search for ALL functions containing 'booking' in name
console.log('  [1.1] Searching pg_proc for functions with "booking" in name...');

try {
  const { data: allBookingFunctions, error } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT 
        n.nspname as schema_name,
        p.proname as function_name,
        p.oid as function_oid,
        pg_get_function_arguments(p.oid) as arguments,
        pg_get_function_result(p.oid) as return_type,
        p.prosecdef as is_security_definer,
        p.provolatile as volatility,
        pg_get_userbyid(p.proowner) as owner,
        array_to_string(p.proconfig, ', ') as config_settings
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname ILIKE '%booking%'
      ORDER BY p.proname;
    `
  });

  if (error) {
    console.log(`     ⚠️  Cannot query pg_proc: ${error.message}`);
    reconciliation.phases.phase1_direct_inspection = {
      error: error.message,
      method: 'exec_sql / pg_proc',
      accessible: false
    };
  } else {
    console.log(`     ✓ Found ${allBookingFunctions?.length || 0} functions with "booking" in name`);
    reconciliation.phases.phase1_direct_inspection = {
      total_booking_functions: allBookingFunctions?.length || 0,
      functions: allBookingFunctions || []
    };
    
    if (allBookingFunctions && allBookingFunctions.length > 0) {
      console.log('\n     Functions found:');
      allBookingFunctions.forEach(fn => {
        console.log(`       • ${fn.schema_name}.${fn.function_name}(${fn.arguments || ''})`);
        console.log(`         Return: ${fn.return_type}`);
        console.log(`         Security Definer: ${fn.is_security_definer ? 'YES' : 'NO'}`);
        console.log(`         Owner: ${fn.owner}`);
      });
    }
  }
} catch (err) {
  console.log(`     ⚠️  Exception: ${err.message}`);
  reconciliation.phases.phase1_direct_inspection = {
    exception: err.message
  };
}

// 1.2: Specifically check for create_booking
console.log('\n  [1.2] Specifically checking for create_booking...');

try {
  const { data: createBookingFn } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT 
        n.nspname as schema_name,
        p.proname as function_name,
        p.oid as function_oid,
        pg_get_function_arguments(p.oid) as arguments,
        pg_get_function_result(p.oid) as return_type,
        p.prosecdef as is_security_definer,
        pg_get_functiondef(p.oid) as full_definition
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'create_booking';
    `
  });

  if (createBookingFn && createBookingFn.length > 0) {
    console.log(`     ✅ create_booking EXISTS`);
    console.log(`        Arguments: ${createBookingFn[0].arguments}`);
    console.log(`        Returns: ${createBookingFn[0].return_type}`);
    console.log(`        Security Definer: ${createBookingFn[0].is_security_definer ? 'YES' : 'NO'}`);
    
    reconciliation.phases.phase1_create_booking_specific = {
      exists: true,
      details: createBookingFn[0]
    };
  } else {
    console.log(`     ❌ create_booking DOES NOT EXIST in pg_proc`);
    reconciliation.phases.phase1_create_booking_specific = {
      exists: false
    };
  }
} catch (err) {
  console.log(`     ⚠️  Exception: ${err.message}`);
}

// 1.3: Check routine_privileges for create_booking
console.log('\n  [1.3] Checking routine privileges for create_booking...');

try {
  const { data: grants } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT 
        routine_schema,
        routine_name,
        grantee,
        privilege_type
      FROM information_schema.routine_privileges
      WHERE routine_schema = 'public'
        AND routine_name = 'create_booking'
      ORDER BY grantee, privilege_type;
    `
  });

  console.log(`     Found ${grants?.length || 0} privilege grants`);
  
  if (grants && grants.length > 0) {
    grants.forEach(g => {
      console.log(`       • ${g.grantee}: ${g.privilege_type}`);
    });
  }
  
  reconciliation.phases.phase1_grants = grants || [];
} catch (err) {
  console.log(`     ⚠️  Exception: ${err.message}`);
}

console.log();

// ============================================================
// PHASE 2: CHECK ALL POSSIBLE SIGNATURES
// ============================================================
console.log('[PHASE 2] Checking for function overloads\n');

try {
  const { data: allVersions } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT 
        p.proname,
        pg_get_function_identity_arguments(p.oid) as arg_types,
        p.pronargs as num_args
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = 'create_booking';
    `
  });

  console.log(`  Found ${allVersions?.length || 0} version(s) of create_booking`);
  
  reconciliation.phases.phase2_overloads = {
    count: allVersions?.length || 0,
    versions: allVersions || []
  };
  
  if (allVersions && allVersions.length > 0) {
    allVersions.forEach((v, i) => {
      console.log(`    Version ${i + 1}: create_booking(${v.arg_types}) [${v.num_args} args]`);
    });
  }
} catch (err) {
  console.log(`  ⚠️  Exception: ${err.message}`);
}

console.log();

// ============================================================
// PHASE 6: CHECK POSTGREST FUNCTIONS
// ============================================================
console.log('[PHASE 6] Testing PostgREST RPC endpoint\n');

// 6.1: Test with service_role (to check function exists, not security)
console.log('  [6.1] Testing with service_role credentials...');

try {
  const { data, error } = await supabase.rpc('create_booking', {
    p_full_name: 'TEST_RECONCILIATION',
    p_phone: '+254700000000',
    p_booking_date: '2026-12-31',
    p_start_time: '14:00',
    p_guests: 2
  });

  if (error) {
    console.log(`     Error: ${error.message}`);
    console.log(`     Code: ${error.code}`);
    console.log(`     Details: ${error.details}`);
    
    reconciliation.phases.phase6_postgrest_service = {
      success: false,
      error_message: error.message,
      error_code: error.code,
      error_details: error.details
    };
  } else {
    console.log(`     ✅ Function executed successfully`);
    console.log(`     Returned: ${JSON.stringify(data, null, 2)}`);
    
    reconciliation.phases.phase6_postgrest_service = {
      success: true,
      returned_data: data
    };
  }
} catch (err) {
  console.log(`     ⚠️  Exception: ${err.message}`);
  reconciliation.phases.phase6_postgrest_service = {
    exception: err.message
  };
}

// 6.2: Test with anon credentials
console.log('\n  [6.2] Testing with anon credentials...');

try {
  const { data, error } = await supabaseAnon.rpc('create_booking', {
    p_full_name: 'TEST_ANON_RECONCILIATION',
    p_phone: '+254700000001',
    p_booking_date: '2026-12-31',
    p_start_time: '15:00',
    p_guests: 2
  });

  if (error) {
    console.log(`     Error: ${error.message}`);
    console.log(`     Code: ${error.code}`);
    
    reconciliation.phases.phase6_postgrest_anon = {
      success: false,
      error_message: error.message,
      error_code: error.code
    };
  } else {
    console.log(`     ✅ Function executed successfully with anon key`);
    console.log(`     Returned: ${JSON.stringify(data, null, 2)}`);
    
    reconciliation.phases.phase6_postgrest_anon = {
      success: true,
      returned_data: data
    };
  }
} catch (err) {
  console.log(`     ⚠️  Exception: ${err.message}`);
  reconciliation.phases.phase6_postgrest_anon = {
    exception: err.message
  };
}

console.log();

// ============================================================
// PHASE 7: CHECK CURRENT TABLE SCHEMA
// ============================================================
console.log('[PHASE 7] Inspecting current table schemas\n');

// 7.1: Bookings schema
console.log('  [7.1] Bookings table schema...');

try {
  const { data: bookingsSchema } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT 
        column_name,
        data_type,
        column_default,
        is_nullable,
        character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'bookings'
      ORDER BY ordinal_position;
    `
  });

  console.log(`     Found ${bookingsSchema?.length || 0} columns`);
  reconciliation.phases.phase7_bookings_schema = bookingsSchema || [];
} catch (err) {
  console.log(`     ⚠️  Exception: ${err.message}`);
}

// 7.2: Customers schema
console.log('\n  [7.2] Customers table schema...');

try {
  const { data: customersSchema } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT 
        column_name,
        data_type,
        column_default,
        is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'customers'
      ORDER BY ordinal_position;
    `
  });

  console.log(`     Found ${customersSchema?.length || 0} columns`);
  reconciliation.phases.phase7_customers_schema = customersSchema || [];
} catch (err) {
  console.log(`     ⚠️  Exception: ${err.message}`);
}

// 7.3: Services schema
console.log('\n  [7.3] Services table...');

try {
  const { data: services } = await supabase
    .from('services')
    .select('id, name, slug, duration_minutes, is_active')
    .order('name');

  console.log(`     Found ${services?.length || 0} services`);
  reconciliation.phases.phase7_services = services || [];
  
  if (services && services.length > 0) {
    services.forEach(s => {
      console.log(`       • ${s.slug} (${s.name}) - ${s.duration_minutes}min ${s.is_active ? '✓' : '✗'}`);
    });
  }
} catch (err) {
  console.log(`     ⚠️  Exception: ${err.message}`);
}

console.log();

// ============================================================
// PHASE 5: VERIFY PROJECT ROUTING
// ============================================================
console.log('[PHASE 5] Verifying project routing\n');

const projectRef = supabaseUrl?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
console.log(`  Supabase URL: ${supabaseUrl}`);
console.log(`  Project Ref: ${projectRef || 'CANNOT EXTRACT'}`);
console.log(`  Expected: jczwilrysvnhcjzjztbi`);
console.log(`  Match: ${projectRef === 'jczwilrysvnhcjzjztbi' ? '✅ YES' : '❌ NO'}`);

reconciliation.phases.phase5_project_routing = {
  supabase_url: supabaseUrl,
  project_ref_extracted: projectRef,
  expected_project: 'jczwilrysvnhcjzjztbi',
  matches: projectRef === 'jczwilrysvnhcjzjztbi'
};

console.log();

// ============================================================
// SAVE REPORT
// ============================================================
const jsonPath = `CREATE_BOOKING_CONTRADICTION_RECONCILIATION_${Date.now()}.json`;
await writeFile(jsonPath, JSON.stringify(reconciliation, null, 2));

console.log('═══════════════════════════════════════════════════════════════');
console.log('RECONCILIATION INVESTIGATION COMPLETE');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log(`📄 Full JSON report saved: ${jsonPath}\n`);

// ============================================================
// DETERMINATION
// ============================================================
console.log('═══════════════════════════════════════════════════════════════');
console.log('FINAL DETERMINATION');
console.log('═══════════════════════════════════════════════════════════════\n');

const phase1Exists = reconciliation.phases.phase1_create_booking_specific?.exists;
const phase6ServiceWorks = reconciliation.phases.phase6_postgrest_service?.success;
const phase6AnonWorks = reconciliation.phases.phase6_postgrest_anon?.success;

console.log(`PostgreSQL pg_proc shows function exists: ${phase1Exists ? 'YES ✅' : 'NO ❌'}`);
console.log(`PostgREST service_role call works: ${phase6ServiceWorks ? 'YES ✅' : 'NO ❌'}`);
console.log(`PostgREST anon call works: ${phase6AnonWorks ? 'YES ✅' : 'NO ❌'}`);
console.log();

let verdict;

if (phase1Exists && phase6ServiceWorks) {
  verdict = '🟢 FUNCTION EXISTS — DO NOT RECREATE';
  console.log(verdict);
  console.log('\nThe function exists in PostgreSQL and works via PostgREST.');
  
  if (!phase6AnonWorks) {
    console.log('⚠️  Anonymous access is blocked (expected if RLS not yet applied).');
  }
} else if (!phase1Exists && !phase6ServiceWorks) {
  verdict = '🔴 FUNCTION DOES NOT EXIST — RECONSTRUCTION REQUIRED';
  console.log(verdict);
  console.log('\nPostgreSQL confirms: No create_booking function in pg_proc.');
  console.log('PostgREST confirms: RPC endpoint does not resolve.');
} else if (phase1Exists && !phase6ServiceWorks) {
  verdict = '🟠 FUNCTION EXISTS BUT IS BROKEN — REPAIR REQUIRED';
  console.log(verdict);
  console.log('\nPostgreSQL shows function, but it cannot be called via PostgREST.');
} else {
  verdict = '🟣 INCONSISTENT STATE — FURTHER INVESTIGATION REQUIRED';
  console.log(verdict);
}

reconciliation.final_verdict = verdict;

await writeFile(jsonPath, JSON.stringify(reconciliation, null, 2));

console.log(`\n📄 Updated report: ${jsonPath}\n`);

process.exit(phase1Exists ? 0 : 1);
