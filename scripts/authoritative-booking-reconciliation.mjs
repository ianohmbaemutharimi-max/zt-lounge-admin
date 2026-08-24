#!/usr/bin/env node

/**
 * AUTHORITATIVE BOOKING PIPELINE RECONCILIATION AUDIT
 * MODE: STRICT READ-ONLY
 * 
 * Purpose: Resolve conflicting audit reports by querying live database directly
 * 
 * RULES:
 * - NO code modifications
 * - NO database writes
 * - NO migrations
 * - NO assumptions
 * - Query PostgreSQL directly for every claim
 */

import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓' : '✗');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const audit = {
  timestamp: new Date().toISOString(),
  mode: 'AUTHORITATIVE RECONCILIATION - READ ONLY',
  sections: {}
};

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║  AUTHORITATIVE BOOKING PIPELINE RECONCILIATION                   ║');
console.log('║  STRICT READ-ONLY - RESOLVING CONFLICTING REPORTS                ║');
console.log('╚══════════════════════════════════════════════════════════════════╝\n');

// ============================================================
// RULE 1: VERIFY SUPABASE PROJECT IDENTITY
// ============================================================
console.log('[RULE 1] Verifying Supabase Project Identity...\n');

audit.sections.projectIdentity = {
  supabaseUrl,
  projectRef: supabaseUrl?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || 'UNKNOWN',
  envFileChecked: '.env.local',
  connectionMethod: 'Service Role Key (full access)'
};

// Read .env.local to confirm match
try {
  const envContent = await readFile('.env.local', 'utf-8');
  const envUrl = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();
  audit.sections.projectIdentity.envUrlMatches = envUrl === supabaseUrl;
  audit.sections.projectIdentity.envUrl = envUrl;
} catch (error) {
  audit.sections.projectIdentity.envError = error.message;
}

console.log(`   Project URL: ${supabaseUrl}`);
console.log(`   Project Ref: ${audit.sections.projectIdentity.projectRef}`);
console.log(`   ENV Match: ${audit.sections.projectIdentity.envUrlMatches}\n`);

// ============================================================
// RULE 2: VERIFY create_booking() DIRECTLY
// ============================================================
console.log('[RULE 2] Verifying create_booking() Function...\n');

const createBookingQuery = `
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS result_type,
  p.prosecdef AS security_definer,
  p.provolatile AS volatility,
  array_to_string(p.proconfig, ', ') AS config_settings,
  pg_get_functiondef(p.oid) AS full_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'create_booking'
ORDER BY p.oid;
`;

const { data: createBookingResults, error: cbError } = await supabase.rpc('exec_sql', {
  sql: createBookingQuery
});

if (cbError) {
  audit.sections.createBooking = {
    error: cbError.message,
    exists: 'UNKNOWN - Query failed'
  };
  console.log(`   ❌ Query failed: ${cbError.message}\n`);
} else if (!createBookingResults || createBookingResults.length === 0) {
  audit.sections.createBooking = {
    exists: false,
    overloads: 0,
    queryResult: 'No rows returned'
  };
  console.log(`   ❌ DOES NOT EXIST (0 overloads found)\n`);
} else {
  audit.sections.createBooking = {
    exists: true,
    overloads: createBookingResults.length,
    functions: createBookingResults.map(f => ({
      schema: f.schema_name,
      name: f.function_name,
      arguments: f.arguments,
      returnType: f.result_type,
      securityDefiner: f.security_definer,
      volatility: f.volatility,
      configSettings: f.config_settings,
      definitionLength: f.full_definition?.length || 0,
      definitionPreview: f.full_definition?.substring(0, 500) + '...'
    }))
  };
  
  console.log(`   ✅ EXISTS (${createBookingResults.length} overload(s))`);
  createBookingResults.forEach((f, i) => {
    console.log(`   
   Overload ${i + 1}:
     Arguments: ${f.arguments || '(none)'}
     Returns: ${f.result_type}
     Security Definer: ${f.security_definer}
     Config: ${f.config_settings || '(none)'}`);
  });
  console.log();
}

// Check grants on create_booking
const grantsQuery = `
SELECT
  grantee,
  privilege_type,
  is_grantable
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name = 'create_booking'
ORDER BY grantee, privilege_type;
`;

const { data: grants } = await supabase.rpc('exec_sql', { sql: grantsQuery });
audit.sections.createBooking.grants = grants || [];
console.log(`   Grants: ${grants?.length || 0} found\n`);

// ============================================================
// RULE 3: VERIFY bookings RLS DIRECTLY
// ============================================================
console.log('[RULE 3] Verifying Bookings RLS...\n');

const rlsQuery = `
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled,
  forcerowsecurity AS rls_forced
FROM pg_tables
WHERE schemaname='public'
  AND tablename IN ('bookings','customers')
ORDER BY tablename;
`;

const { data: rlsStatus } = await supabase.rpc('exec_sql', { sql: rlsQuery });

const policiesQuery = `
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('bookings','customers')
ORDER BY tablename, policyname;
`;

const { data: policies } = await supabase.rpc('exec_sql', { sql: policiesQuery });

audit.sections.rls = {
  tables: rlsStatus || [],
  policies: policies || [],
  bookingsRlsEnabled: rlsStatus?.find(t => t.tablename === 'bookings')?.rls_enabled || false,
  customersRlsEnabled: rlsStatus?.find(t => t.tablename === 'customers')?.rls_enabled || false,
  bookingsPolicyCount: policies?.filter(p => p.tablename === 'bookings').length || 0,
  customersPolicyCount: policies?.filter(p => p.tablename === 'customers').length || 0
};

console.log(`   Bookings RLS: ${audit.sections.rls.bookingsRlsEnabled ? '✅ ENABLED' : '❌ DISABLED'}`);
console.log(`   Bookings Policies: ${audit.sections.rls.bookingsPolicyCount}`);
console.log(`   Customers RLS: ${audit.sections.rls.customersRlsEnabled ? '✅ ENABLED' : '❌ DISABLED'}`);
console.log(`   Customers Policies: ${audit.sections.rls.customersPolicyCount}\n`);

// ============================================================
// RULE 4: VERIFY CUSTOMER METRIC DIRECTLY
// ============================================================
console.log('[RULE 4] Verifying Customer Metric Implementation...\n');

const dashboardFunctionsQuery = `
SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS result_type,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
  AND (
    p.proname ILIKE '%dashboard%'
    OR p.proname ILIKE '%stats%'
    OR p.proname ILIKE '%metric%'
  )
ORDER BY p.proname;
`;

const { data: dashboardFunctions } = await supabase.rpc('exec_sql', { sql: dashboardFunctionsQuery });

audit.sections.customerMetric = {
  dashboardFunctionsFound: dashboardFunctions?.length || 0,
  functions: dashboardFunctions || []
};

// Check if any function counts distinct customers by status
const customerConversionLogicFound = dashboardFunctions?.some(f => {
  const def = f.definition?.toLowerCase() || '';
  return (
    def.includes('count(distinct') &&
    def.includes('customer_id') &&
    (def.includes('confirmed') || def.includes('completed'))
  );
});

audit.sections.customerMetric.hasCustomerConversionLogic = customerConversionLogicFound || false;

console.log(`   Dashboard Functions Found: ${dashboardFunctions?.length || 0}`);
console.log(`   Customer Conversion Logic: ${customerConversionLogicFound ? '✅ FOUND' : '❌ NOT FOUND'}\n`);

// ============================================================
// RULE 5: VERIFY CURRENT DATA
// ============================================================
console.log('[RULE 5] Verifying Current Data...\n');

const { data: bookingsByStatus } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT status, COUNT(*) as count
    FROM public.bookings
    GROUP BY status
    ORDER BY status;
  `
});

const { data: bookingsCount } = await supabase.rpc('exec_sql', {
  sql: 'SELECT COUNT(*) as total FROM public.bookings;'
});

const { data: customersCount } = await supabase.rpc('exec_sql', {
  sql: 'SELECT COUNT(*) as total FROM public.customers;'
});

const { data: orphanedBookings } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT COUNT(*) as orphaned
    FROM public.bookings b
    LEFT JOIN public.customers c ON c.id=b.customer_id
    WHERE c.id IS NULL;
  `
});

audit.sections.currentData = {
  totalBookings: bookingsCount?.[0]?.total || 0,
  totalCustomers: customersCount?.[0]?.total || 0,
  orphanedBookings: orphanedBookings?.[0]?.orphaned || 0,
  bookingsByStatus: bookingsByStatus || []
};

console.log(`   Total Bookings: ${audit.sections.currentData.totalBookings}`);
console.log(`   Total Customers: ${audit.sections.currentData.totalCustomers}`);
console.log(`   Orphaned Bookings: ${audit.sections.currentData.orphanedBookings}`);
console.log(`   Status Distribution:`);
bookingsByStatus?.forEach(s => {
  console.log(`     ${s.status}: ${s.count}`);
});
console.log();

// ============================================================
// RULE 6: VERIFY CUSTOMER DEDUPLICATION
// ============================================================
console.log('[RULE 6] Verifying Customer Deduplication...\n');

const customerConstraintsQuery = `
SELECT
  conname AS constraint_name,
  contype AS constraint_type,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid='public.customers'::regclass
ORDER BY contype, conname;
`;

const { data: customerConstraints } = await supabase.rpc('exec_sql', { sql: customerConstraintsQuery });

const phoneUniqueConstraint = customerConstraints?.find(c => 
  c.definition?.toLowerCase().includes('phone') && c.constraint_type === 'u'
);

audit.sections.customerDeduplication = {
  constraints: customerConstraints || [],
  phoneIsUnique: !!phoneUniqueConstraint,
  phoneConstraint: phoneUniqueConstraint || null
};

console.log(`   Phone UNIQUE Constraint: ${phoneUniqueConstraint ? '✅ EXISTS' : '❌ MISSING'}`);
if (phoneUniqueConstraint) {
  console.log(`   Constraint: ${phoneUniqueConstraint.definition}`);
}
console.log();

// ============================================================
// RULE 7: VERIFY FRONTEND CONTRACT
// ============================================================
console.log('[RULE 7] Verifying Frontend Contract...\n');

const publicWebsiteRoot = 'd:/zt lounge/zt-lounge-demo/zt-lounge';

// Read BookingRepository.js
let repositoryContent = '';
try {
  const repoPath = join(publicWebsiteRoot, 'assets/js/repositories/BookingRepository.js');
  repositoryContent = await readFile(repoPath, 'utf-8');
  
  // Extract create_booking invocation
  const createBookingMatch = repositoryContent.match(/\.rpc\s*\(\s*['"`]create_booking['"`]/);
  const hasCreateBookingCall = !!createBookingMatch;
  
  // Extract parameters
  const paramsMatch = repositoryContent.match(/create_booking['"`]\s*,\s*\{([^}]+)\}/s);
  
  audit.sections.frontendContract = {
    repositoryFound: true,
    repositorySize: repositoryContent.length,
    hasExplicitRpcCall: hasCreateBookingCall,
    parametersExtracted: paramsMatch ? paramsMatch[1].trim() : 'Could not extract',
    callPattern: createBookingMatch ? createBookingMatch[0] : 'Not found'
  };
  
  console.log(`   BookingRepository.js: ✅ FOUND (${repositoryContent.length} bytes)`);
  console.log(`   Explicit .rpc('create_booking'): ${hasCreateBookingCall ? '✅ YES' : '❌ NO'}`);
} catch (error) {
  audit.sections.frontendContract = {
    repositoryFound: false,
    error: error.message
  };
  console.log(`   BookingRepository.js: ❌ ERROR - ${error.message}`);
}

console.log();

// ============================================================
// RULE 8: VERIFY ALL SIX SERVICES
// ============================================================
console.log('[RULE 8] Verifying All Six Services...\n');

const services = [
  { name: 'restaurant', paths: ['pages/experiences/restaurant.html', 'restaurant.html'] },
  { name: 'lounge-bar', paths: ['pages/experiences/lounge.html', 'lounge.html'] },
  { name: 'vip-cabins', paths: ['pages/experiences/vip-cabins.html', 'vip-cabins.html', 'pages/experiences/vip.html'] },
  { name: 'events', paths: ['pages/business/events.html', 'events.html'] },
  { name: 'conference', paths: ['pages/business/conference.html', 'conference.html'] },
  { name: 'auto-spa', paths: ['pages/experiences/auto-spa.html', 'auto-spa.html', 'pages/experiences/auto.html'] }
];

audit.sections.sixServices = {
  services: []
};

for (const service of services) {
  const svcAudit = {
    name: service.name,
    found: false,
    path: null,
    formId: null,
    formsJsLoaded: false
  };
  
  for (const path of service.paths) {
    try {
      const fullPath = join(publicWebsiteRoot, path);
      const content = await readFile(fullPath, 'utf-8');
      svcAudit.found = true;
      svcAudit.path = path;
      svcAudit.formsJsLoaded = content.includes('forms.js');
      
      // Extract form ID
      const formMatch = content.match(/<form[^>]*id=["']([^"']+)["']/);
      svcAudit.formId = formMatch ? formMatch[1] : null;
      break;
    } catch (error) {
      // Try next path
      continue;
    }
  }
  
  console.log(`   ${service.name}: ${svcAudit.found ? '✅ FOUND' : '❌ MISSING'}`);
  if (svcAudit.found) {
    console.log(`     Path: ${svcAudit.path}`);
    console.log(`     Form ID: ${svcAudit.formId || 'Not found'}`);
  }
  
  audit.sections.sixServices.services.push(svcAudit);
}

const servicesFoundCount = audit.sections.sixServices.services.filter(s => s.found).length;
audit.sections.sixServices.summary = {
  total: 6,
  found: servicesFoundCount,
  missing: 6 - servicesFoundCount
};

console.log(`\n   Summary: ${servicesFoundCount}/6 services found\n`);

// ============================================================
// RULE 9: VERIFY ADMIN CONFIRMATION
// ============================================================
console.log('[RULE 9] Verifying Admin Confirmation Path...\n');

try {
  const genericRoutePath = join('d:/zt lounge/zt-lounge-demo/zt-lounge-admin', 'src/app/api/admin/[resource]/[id]/route.ts');
  const routeContent = await readFile(genericRoutePath, 'utf-8');
  
  const hasPatchExport = /export\s+async\s+function\s+PATCH/.test(routeContent);
  const hasStatusValidation = routeContent.includes('status') && (routeContent.includes('pending') || routeContent.includes('confirmed'));
  
  audit.sections.adminConfirmation = {
    genericRouteFound: true,
    hasPatchHandler: hasPatchExport,
    hasStatusValidation: hasStatusValidation,
    routeSize: routeContent.length
  };
  
  console.log(`   Generic [resource]/[id] Route: ✅ FOUND`);
  console.log(`   PATCH Handler: ${hasPatchExport ? '✅ EXISTS' : '❌ MISSING'}`);
  console.log(`   Status Validation: ${hasStatusValidation ? '✅ PRESENT' : '❌ MISSING'}`);
} catch (error) {
  audit.sections.adminConfirmation = {
    genericRouteFound: false,
    error: error.message
  };
  console.log(`   ❌ ERROR: ${error.message}`);
}

console.log();

// ============================================================
// RULE 10: VERIFY CUSTOMER LIFECYCLE SEMANTICS
// ============================================================
console.log('[RULE 10] Verifying Customer Lifecycle Semantics...\n');

// Check if customer classification is status-based or explicit
const customerClassificationQuery = `
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name='customers'
  AND column_name IN ('status', 'is_confirmed', 'classification', 'type')
ORDER BY column_name;
`;

const { data: customerClassificationColumns } = await supabase.rpc('exec_sql', { sql: customerClassificationQuery });

audit.sections.customerLifecycle = {
  classificationColumns: customerClassificationColumns || [],
  hasExplicitClassification: (customerClassificationColumns?.length || 0) > 0,
  semanticsImplementation: 'UNKNOWN'
};

if (audit.sections.customerMetric.hasCustomerConversionLogic) {
  audit.sections.customerLifecycle.semanticsImplementation = 'DASHBOARD_DERIVED';
} else if (customerClassificationColumns && customerClassificationColumns.length > 0) {
  audit.sections.customerLifecycle.semanticsImplementation = 'EXPLICIT_COLUMN';
} else {
  audit.sections.customerLifecycle.semanticsImplementation = 'NOT_IMPLEMENTED';
}

console.log(`   Classification Columns: ${customerClassificationColumns?.length || 0}`);
console.log(`   Implementation: ${audit.sections.customerLifecycle.semanticsImplementation}\n`);

// ============================================================
// CONTRADICTION ANALYSIS
// ============================================================
console.log('[CONTRADICTION ANALYSIS] Comparing with previous reports...\n');

const previousReportClaims = {
  layer2: {
    createBookingExists: true,
    rlsEnabled: true,
    customerDeduplicationWorks: true,
    customerMetricExists: true,
    sixServicesOperational: true
  },
  comprehensive: {
    createBookingExists: false,
    rlsEnabled: false,
    customerConversionMissing: true,
    onlyFourFormsExist: true,
    runtimeUnproven: true
  }
};

const actualState = {
  createBookingExists: audit.sections.createBooking.exists,
  rlsEnabled: audit.sections.rls.bookingsRlsEnabled,
  customerMetricExists: audit.sections.customerMetric.hasCustomerConversionLogic,
  servicesFound: audit.sections.sixServices.summary.found
};

audit.sections.contradictionAnalysis = {
  previousReportClaims,
  actualState,
  layer2Matches: {
    createBooking: previousReportClaims.layer2.createBookingExists === actualState.createBookingExists,
    rls: previousReportClaims.layer2.rlsEnabled === actualState.rlsEnabled,
    customerMetric: previousReportClaims.layer2.customerMetricExists === actualState.customerMetricExists
  },
  comprehensiveMatches: {
    createBooking: previousReportClaims.comprehensive.createBookingExists === actualState.createBookingExists,
    rls: !previousReportClaims.comprehensive.rlsEnabled === actualState.rlsEnabled,
    customerMetric: previousReportClaims.comprehensive.customerConversionMissing === !actualState.customerMetricExists
  }
};

console.log(`   Create Booking — Layer 2 claimed: EXISTS, Comprehensive claimed: MISSING, Actual: ${actualState.createBookingExists ? 'EXISTS' : 'MISSING'}`);
console.log(`   RLS — Layer 2 claimed: ENABLED, Comprehensive claimed: DISABLED, Actual: ${actualState.rlsEnabled ? 'ENABLED' : 'DISABLED'}`);
console.log(`   Customer Metric — Layer 2 claimed: EXISTS, Comprehensive claimed: MISSING, Actual: ${actualState.customerMetricExists ? 'EXISTS' : 'MISSING'}`);
console.log(`   Services — Layer 2 claimed: 6/6, Comprehensive claimed: 4/6, Actual: ${actualState.servicesFound}/6\n`);

// ============================================================
// SAVE REPORT
// ============================================================
const reportPath = `AUTHORITATIVE_BOOKING_RECONCILIATION_${Date.now()}.json`;
await writeFile(reportPath, JSON.stringify(audit, null, 2));

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║  AUTHORITATIVE RECONCILIATION COMPLETE                           ║');
console.log('╚══════════════════════════════════════════════════════════════════╝\n');

console.log(`📄 Full report saved: ${reportPath}\n`);

console.log('🎯 AUTHORITATIVE STATE SUMMARY:\n');
console.log(`   create_booking() function: ${actualState.createBookingExists ? '✅ EXISTS' : '❌ MISSING'}`);
console.log(`   Bookings RLS: ${actualState.rlsEnabled ? '✅ ENABLED' : '❌ DISABLED'}`);
console.log(`   Customer conversion logic: ${actualState.customerMetricExists ? '✅ EXISTS' : '❌ MISSING'}`);
console.log(`   Public service forms: ${actualState.servicesFound}/6 found`);

console.log('\n✅ READ-ONLY AUDIT COMPLETE. No changes made.\n');

process.exit(0);
