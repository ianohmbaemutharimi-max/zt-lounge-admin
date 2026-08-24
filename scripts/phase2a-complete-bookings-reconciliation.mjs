#!/usr/bin/env node

/**
 * BOOKING PIPELINE LAYER 2 RECONCILIATION
 * PHASE A: READ-ONLY COMPLETE DATABASE INSPECTION
 * 
 * This script performs comprehensive read-only analysis of the live
 * booking infrastructure WITHOUT making any changes.
 */

import { createClient } from '@supabase/supabase-js';
import { writeFile, readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
try {
  const envPath = join(__dirname, '..', '.env.local');
  const envContent = await readFile(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...values] = trimmed.split('=');
      if (key && values.length > 0) {
        process.env[key.trim()] = values.join('=').trim();
      }
    }
  });
} catch (error) {
  console.error('⚠️  Warning: Could not load .env.local file');
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓' : '✗');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const report = {
  timestamp: new Date().toISOString(),
  phase: 'A - READ-ONLY RECONCILIATION',
  findings: {}
};

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  BOOKING PIPELINE LAYER 2 RECONCILIATION                       ║');
console.log('║  PHASE A: READ-ONLY COMPLETE DATABASE INSPECTION               ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// ============================================================
// 1. EXACT public.bookings SCHEMA
// ============================================================
console.log('📋 [1/17] Inspecting public.bookings schema...');
const { data: bookingsColumns, error: colError } = await supabase
  .rpc('exec_sql', {
    sql: `
      SELECT 
        column_name,
        data_type,
        column_default,
        is_nullable,
        character_maximum_length,
        numeric_precision
      FROM information_schema.columns
      WHERE table_schema = 'public' 
        AND table_name = 'bookings'
      ORDER BY ordinal_position;
    `
  });

if (colError) {
  // Try direct query
  const { data: cols } = await supabase.from('bookings').select('*').limit(0);
  report.findings.bookings_schema = {
    method: 'table_structure_inference',
    note: 'Direct schema query failed, inferring from table structure',
    error: colError.message
  };
} else {
  report.findings.bookings_schema = bookingsColumns;
}

console.log(`   ✓ Found ${bookingsColumns?.length || 'unknown'} columns`);

// ============================================================
// 2. ALL BOOKINGS CONSTRAINTS
// ============================================================
console.log('🔒 [2/17] Inspecting bookings constraints...');
const { data: constraints } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT
      con.conname AS constraint_name,
      con.contype AS constraint_type,
      CASE con.contype
        WHEN 'p' THEN 'PRIMARY KEY'
        WHEN 'f' THEN 'FOREIGN KEY'
        WHEN 'u' THEN 'UNIQUE'
        WHEN 'c' THEN 'CHECK'
        WHEN 'x' THEN 'EXCLUSION'
      END AS type_description,
      pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'bookings'
    ORDER BY con.contype, con.conname;
  `
});

report.findings.bookings_constraints = constraints || [];
console.log(`   ✓ Found ${constraints?.length || 0} constraints`);

// ============================================================
// 3. ALL BOOKINGS INDEXES
// ============================================================
console.log('📇 [3/17] Inspecting bookings indexes...');
const { data: indexes } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT
      i.relname AS index_name,
      a.attname AS column_name,
      ix.indisunique AS is_unique,
      ix.indisprimary AS is_primary,
      am.amname AS index_type,
      pg_get_indexdef(ix.indexrelid) AS index_definition
    FROM pg_index ix
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_class t ON t.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
    JOIN pg_am am ON am.oid = i.relam
    WHERE n.nspname = 'public'
      AND t.relname = 'bookings'
    ORDER BY i.relname, a.attnum;
  `
});

report.findings.bookings_indexes = indexes || [];
console.log(`   ✓ Found ${indexes?.length || 0} index entries`);

// ============================================================
// 4. ALL BOOKINGS TRIGGERS
// ============================================================
console.log('⚡ [4/17] Inspecting bookings triggers...');
const { data: triggers } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT
      tgname AS trigger_name,
      tgtype AS trigger_type,
      tgenabled AS is_enabled,
      pg_get_triggerdef(oid) AS trigger_definition
    FROM pg_trigger
    WHERE tgrelid = 'public.bookings'::regclass
      AND tgisinternal = false
    ORDER BY tgname;
  `
});

report.findings.bookings_triggers = triggers || [];
console.log(`   ✓ Found ${triggers?.length || 0} triggers`);

// ============================================================
// 5. ALL BOOKING-RELATED FUNCTIONS
// ============================================================
console.log('⚙️  [5/17] Inspecting booking-related functions...');
const { data: functions } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS arguments,
      pg_get_functiondef(p.oid) AS definition,
      p.prosecdef AS is_security_definer,
      p.provolatile AS volatility,
      array_to_string(p.proconfig, ', ') AS config_settings
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (
        p.proname ILIKE '%booking%'
        OR p.proname ILIKE '%create_booking%'
      )
    ORDER BY p.proname;
  `
});

report.findings.booking_functions = functions || [];
console.log(`   ✓ Found ${functions?.length || 0} booking-related functions`);

// ============================================================
// 6. booking_status ENUM
// ============================================================
console.log('📊 [6/17] Inspecting booking_status enum...');
const { data: enumValues } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT enumlabel
    FROM pg_enum
    WHERE enumtypid = 'booking_status'::regtype
    ORDER BY enumsortorder;
  `
});

report.findings.booking_status_enum = enumValues || [];
console.log(`   ✓ Found ${enumValues?.length || 0} status values`);

// ============================================================
// 7. RLS STATUS
// ============================================================
console.log('🔐 [7/17] Inspecting RLS status...');
const { data: rlsStatus } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT
      relname AS table_name,
      relrowsecurity AS rls_enabled,
      relforcerowsecurity AS rls_forced
    FROM pg_class
    WHERE relname = 'bookings'
      AND relnamespace = 'public'::regnamespace;
  `
});

report.findings.rls_status = rlsStatus?.[0] || {};
console.log(`   ✓ RLS enabled: ${rlsStatus?.[0]?.rls_enabled || false}`);

// ============================================================
// 8. BOOKINGS POLICIES
// ============================================================
console.log('📜 [8/17] Inspecting bookings RLS policies...');
const { data: policies } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT
      polname AS policy_name,
      polcmd AS command,
      polroles::regrole[] AS roles,
      pg_get_expr(polqual, polrelid) AS using_expression,
      pg_get_expr(polwithcheck, polrelid) AS with_check_expression
    FROM pg_policy
    WHERE polrelid = 'public.bookings'::regclass
    ORDER BY polname;
  `
});

report.findings.bookings_policies = policies || [];
console.log(`   ✓ Found ${policies?.length || 0} RLS policies`);

// ============================================================
// 9. BOOKINGS TABLE GRANTS
// ============================================================
console.log('🎫 [9/17] Inspecting bookings table grants...');
const { data: grants } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT
      grantee,
      privilege_type,
      is_grantable
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name = 'bookings'
    ORDER BY grantee, privilege_type;
  `
});

report.findings.bookings_grants = grants || [];
console.log(`   ✓ Found ${grants?.length || 0} grant entries`);

// ============================================================
// 10. create_booking GRANTS
// ============================================================
console.log('🎫 [10/17] Inspecting create_booking function grants...');
const { data: funcGrants } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT
      grantee,
      privilege_type,
      is_grantable
    FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name = 'create_booking'
    ORDER BY grantee, privilege_type;
  `
});

report.findings.create_booking_grants = funcGrants || [];
console.log(`   ✓ Found ${funcGrants?.length || 0} function grant entries`);

// ============================================================
// 11. create_booking EXACT SIGNATURE
// ============================================================
console.log('📝 [11/17] Inspecting create_booking signature...');
const { data: signature } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT
      p.proname AS function_name,
      pg_get_function_arguments(p.oid) AS parameters,
      pg_get_function_result(p.oid) AS return_type
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'create_booking';
  `
});

report.findings.create_booking_signature = signature?.[0] || {};
console.log(`   ✓ Signature captured`);

// ============================================================
// 12. create_booking EXACT IMPLEMENTATION
// ============================================================
console.log('💻 [12/17] Inspecting create_booking implementation...');
const { data: implementation } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT pg_get_functiondef(oid) AS definition
    FROM pg_proc
    WHERE proname = 'create_booking'
      AND pronamespace = 'public'::regnamespace;
  `
});

report.findings.create_booking_implementation = implementation?.[0]?.definition || null;
console.log(`   ✓ Implementation captured (${implementation?.[0]?.definition?.length || 0} chars)`);

// ============================================================
// 13. profiles IDENTITY MODEL
// ============================================================
console.log('👤 [13/17] Inspecting profiles identity model...');
const { data: profilesSchema } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT 
      column_name,
      data_type,
      is_nullable,
      column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' 
      AND table_name = 'profiles'
    ORDER BY ordinal_position;
  `
});

report.findings.profiles_schema = profilesSchema || [];
console.log(`   ✓ Found ${profilesSchema?.length || 0} profile columns`);

// ============================================================
// 14. roles RELATIONSHIP
// ============================================================
console.log('🎭 [14/17] Inspecting roles system...');
const { data: rolesData } = await supabase
  .from('roles')
  .select('id, name, description')
  .order('name');

report.findings.roles = rolesData || [];
console.log(`   ✓ Found ${rolesData?.length || 0} roles`);

// ============================================================
// 15. customers CONSTRAINTS
// ============================================================
console.log('👥 [15/17] Inspecting customers constraints...');
const { data: customerConstraints } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT
      con.conname AS constraint_name,
      CASE con.contype
        WHEN 'p' THEN 'PRIMARY KEY'
        WHEN 'f' THEN 'FOREIGN KEY'
        WHEN 'u' THEN 'UNIQUE'
        WHEN 'c' THEN 'CHECK'
      END AS type,
      pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'customers'
      AND rel.relnamespace = 'public'::regnamespace
    ORDER BY con.contype, con.conname;
  `
});

report.findings.customers_constraints = customerConstraints || [];
console.log(`   ✓ Found ${customerConstraints?.length || 0} customer constraints`);

// ============================================================
// 16. customers PHONE FORMATS (SAMPLE)
// ============================================================
console.log('📱 [16/17] Sampling customer phone formats...');
const { data: phoneSamples } = await supabase
  .from('customers')
  .select('phone')
  .not('phone', 'is', null)
  .limit(100);

const phoneFormats = {};
phoneSamples?.forEach(({ phone }) => {
  if (!phone) return;
  
  // Categorize phone format
  let format = 'unknown';
  if (phone.startsWith('+254')) format = 'international (+254)';
  else if (phone.startsWith('07') || phone.startsWith('01')) format = 'local (07/01)';
  else if (phone.startsWith('254')) format = 'country-code (254)';
  else if (phone.startsWith('7') || phone.startsWith('1')) format = 'short (7/1)';
  
  phoneFormats[format] = (phoneFormats[format] || 0) + 1;
});

report.findings.customer_phone_formats = {
  sample_size: phoneSamples?.length || 0,
  formats: phoneFormats,
  examples: phoneSamples?.slice(0, 10).map(p => p.phone)
};
console.log(`   ✓ Sampled ${phoneSamples?.length || 0} phone numbers`);

// ============================================================
// 17. customers EMAIL UNIQUENESS
// ============================================================
console.log('📧 [17/17] Inspecting customer email uniqueness...');
const { data: emailStats } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT
      COUNT(*) AS total_customers,
      COUNT(DISTINCT email) AS unique_emails,
      COUNT(email) AS non_null_emails,
      COUNT(*) - COUNT(email) AS null_emails
    FROM public.customers;
  `
});

const { data: duplicateEmails } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT email, COUNT(*) as count
    FROM public.customers
    WHERE email IS NOT NULL
    GROUP BY email
    HAVING COUNT(*) > 1
    ORDER BY count DESC
    LIMIT 10;
  `
});

report.findings.customer_email_analysis = {
  stats: emailStats?.[0] || {},
  duplicate_emails: duplicateEmails || [],
  has_unique_constraint: customerConstraints?.some(c => 
    c.constraint_name?.includes('email') && c.type === 'UNIQUE'
  ) || false
};
console.log(`   ✓ Email analysis complete`);

// ============================================================
// SAVE REPORT
// ============================================================
console.log('\n💾 Saving complete reconciliation report...');
const reportPath = `BOOKING_PIPELINE_PHASE_A_RECONCILIATION_${Date.now()}.json`;
await writeFile(reportPath, JSON.stringify(report, null, 2));

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║  PHASE A: READ-ONLY RECONCILIATION COMPLETE                    ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

console.log(`📄 Full report saved: ${reportPath}\n`);

// ============================================================
// SUMMARY
// ============================================================
console.log('📊 QUICK SUMMARY:');
console.log(`   • Bookings columns: ${bookingsColumns?.length || 'unknown'}`);
console.log(`   • Constraints: ${constraints?.length || 0}`);
console.log(`   • Indexes: ${indexes?.length || 0}`);
console.log(`   • Triggers: ${triggers?.length || 0}`);
console.log(`   • Functions: ${functions?.length || 0}`);
console.log(`   • Status enum values: ${enumValues?.length || 0}`);
console.log(`   • RLS enabled: ${rlsStatus?.[0]?.rls_enabled || false}`);
console.log(`   • RLS policies: ${policies?.length || 0}`);
console.log(`   • Roles: ${rolesData?.length || 0}`);
console.log(`   • Phone format variety: ${Object.keys(phoneFormats).length} types`);
console.log(`   • Email duplicates found: ${duplicateEmails?.length || 0}`);

console.log('\n✅ Phase A complete. No changes made to database.');
console.log('📋 Review report before proceeding to Phase B.\n');

process.exit(0);
