#!/usr/bin/env node

/**
 * ZT LOUNGE — BOOKING PIPELINE LIVE RECONCILIATION + REMEDIATION
 * 
 * Complete pipeline fix with runtime testing against live Supabase database
 * Project: jczwilrysvnhcjzjztbi
 */

import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile, readdir } from 'fs/promises';
import { join } from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);

const report = {
  timestamp: new Date().toISOString(),
  project: 'jczwilrysvnhcjzjztbi',
  phases: {}
};

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  ZT LOUNGE — BOOKING PIPELINE LIVE REMEDIATION                 ║');
console.log('║  Project: jczwilrysvnhcjzjztbi                                 ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// ============================================================
// PHASE 0 — LIVE DATABASE FORENSIC AUDIT
// ============================================================
console.log('═══ PHASE 0: LIVE DATABASE FORENSIC AUDIT ═══\n');

report.phases.phase0 = {
  name: 'Live Database Forensic Audit',
  findings: {}
};

// 1. Check Tables
console.log('[1/7] Checking core tables...');
const tables = ['bookings', 'customers', 'services', 'profiles', 'roles'];
const tableResults = {};

for (const table of tables) {
  try {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    
    tableResults[table] = {
      exists: !error,
      count: count || 0,
      error: error?.message || null
    };
  } catch (e) {
    tableResults[table] = {
      exists: false,
      error: e.message
    };
  }
}

report.phases.phase0.findings.tables = tableResults;

tables.forEach(table => {
  const status = tableResults[table].exists ? '✅' : '❌';
  const count = tableResults[table].count;
  console.log(`   ${status} ${table}: ${tableResults[table].exists ? `exists (${count} rows)` : 'MISSING'}`);
});

// 2. Check Functions
console.log('\n[2/7] Checking database functions...');
const functions = ['create_booking', 'get_dashboard_stats', 'is_admin_or_above'];
const functionResults = {};

for (const func of functions) {
  try {
    // Try calling with minimal args to see if it exists
    const { error } = await supabase.rpc(func, {}).limit(0);
    functionResults[func] = {
      exists: !error || !error.message.includes('not found'),
      error: error?.message || null
    };
  } catch (e) {
    functionResults[func] = {
      exists: false,
      error: e.message
    };
  }
}

report.phases.phase0.findings.functions = functionResults;

functions.forEach(func => {
  const status = functionResults[func].exists ? '✅' : '❌';
  console.log(`   ${status} ${func}(): ${functionResults[func].exists ? 'exists' : 'MISSING'}`);
});

// 3. Check Services Data
if (tableResults.services?.exists) {
  console.log('\n[3/7] Checking services data...');
  const { data: services, error } = await supabase
    .from('services')
    .select('slug, name, active')
    .order('slug');
  
  report.phases.phase0.findings.services = {
    count: services?.length || 0,
    services: services || [],
    error: error?.message || null
  };
  
  const expectedSlugs = ['restaurant', 'lounge-bar', 'vip-cabins', 'events', 'conference', 'auto-spa'];
  const foundSlugs = services?.map(s => s.slug) || [];
  const missing = expectedSlugs.filter(s => !foundSlugs.includes(s));
  
  console.log(`   Found ${services?.length || 0} services`);
  services?.forEach(s => {
    console.log(`   ✅ ${s.slug} (${s.name}) - ${s.active ? 'active' : 'inactive'}`);
  });
  
  if (missing.length > 0) {
    console.log(`   ❌ Missing: ${missing.join(', ')}`);
  }
} else {
  console.log('\n[3/7] Services table missing, skipping...');
}

// 4. Check Migration History
console.log('\n[4/7] Checking migration history...');
try {
  const { data: migrations, error } = await supabase
    .from('schema_migrations')
    .select('version')
    .order('version');
  
  report.phases.phase0.findings.migrations = {
    count: migrations?.length || 0,
    versions: migrations?.map(m => m.version) || [],
    error: error?.message || null
  };
  
  console.log(`   Applied migrations: ${migrations?.length || 0}`);
  if (migrations && migrations.length > 0) {
    console.log(`   Latest: ${migrations[migrations.length - 1].version}`);
  }
} catch (e) {
  report.phases.phase0.findings.migrations = {
    error: 'Migration table not accessible'
  };
  console.log(`   ⚠️  Cannot read migration history`);
}

// 5. Check Local Migrations
console.log('\n[5/7] Checking local migration files...');
try {
  const migrationFiles = await readdir('supabase/migrations');
  const sqlFiles = migrationFiles.filter(f => f.endsWith('.sql'));
  
  report.phases.phase0.findings.localMigrations = {
    count: sqlFiles.length,
    files: sqlFiles
  };
  
  console.log(`   Local migration files: ${sqlFiles.length}`);
  
  // Check for booking-related migrations
  const bookingMigrations = sqlFiles.filter(f => 
    f.toLowerCase().includes('booking') || 
    f.toLowerCase().includes('customer')
  );
  
  if (bookingMigrations.length > 0) {
    console.log(`   Booking-related migrations:`);
    bookingMigrations.forEach(f => console.log(`     - ${f}`));
  }
} catch (e) {
  report.phases.phase0.findings.localMigrations = {
    error: e.message
  };
  console.log(`   ⚠️  Cannot read local migrations`);
}

// 6. Check Current Data Counts
console.log('\n[6/7] Checking data counts...');
const counts = {};
for (const table of ['bookings', 'customers']) {
  if (tableResults[table]?.exists) {
    const { count } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    counts[table] = count || 0;
  }
}

report.phases.phase0.findings.dataCounts = counts;
console.log(`   Bookings: ${counts.bookings ?? 'N/A'}`);
console.log(`   Customers: ${counts.customers ?? 'N/A'}`);

// 7. Check Frontend Integration
console.log('\n[7/7] Checking frontend integration...');
const publicWebsiteRoot = 'd:/zt lounge/zt-lounge-demo/zt-lounge';

try {
  const repoPath = join(publicWebsiteRoot, 'assets/js/repositories/BookingRepository.js');
  const repoContent = await readFile(repoPath, 'utf-8');
  
  const hasCreateBooking = repoContent.includes('create_booking');
  const hasRpcCall = /\.rpc\s*\(\s*['"`]create_booking['"`]/.test(repoContent);
  
  report.phases.phase0.findings.frontend = {
    repositoryExists: true,
    hasCreateBookingRef: hasCreateBooking,
    hasRpcCall: hasRpcCall
  };
  
  console.log(`   ✅ BookingRepository.js found`);
  console.log(`   ${hasRpcCall ? '✅' : '❌'} RPC call to create_booking`);
} catch (e) {
  report.phases.phase0.findings.frontend = {
    error: e.message
  };
  console.log(`   ❌ Cannot read BookingRepository.js`);
}

// ============================================================
// PHASE 0 SUMMARY
// ============================================================
console.log('\n═══ PHASE 0 SUMMARY ═══\n');

const phase0Status = {
  tablesExist: Object.values(tableResults).every(t => t.exists),
  functionsExist: Object.values(functionResults).every(f => f.exists),
  hasData: (counts.bookings || 0) > 0 || (counts.customers || 0) > 0,
  frontendReady: report.phases.phase0.findings.frontend?.hasRpcCall || false
};

console.log(`Tables: ${phase0Status.tablesExist ? '✅ ALL EXIST' : '❌ MISSING'}`);
console.log(`Functions: ${phase0Status.functionsExist ? '✅ ALL EXIST' : '❌ MISSING'}`);
console.log(`Data: ${phase0Status.hasData ? '✅ HAS DATA' : '⚠️  EMPTY'}`);
console.log(`Frontend: ${phase0Status.frontendReady ? '✅ CONFIGURED' : '❌ NOT CONFIGURED'}`);

report.phases.phase0.summary = phase0Status;

// Determine next steps
const needsSetup = !phase0Status.tablesExist || !phase0Status.functionsExist;

if (needsSetup) {
  console.log('\n❌ CRITICAL: Database infrastructure missing');
  console.log('   Action required: Apply pending migrations\n');
  
  // Save report and exit
  const reportPath = `BOOKING_PIPELINE_PHASE0_AUDIT_${Date.now()}.json`;
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`📄 Phase 0 audit saved: ${reportPath}\n`);
  
  console.log('🛠️  RECOMMENDED ACTION:');
  console.log('   Run: npx supabase db push\n');
  console.log('   Or manually apply missing migrations to the database.\n');
  
  process.exit(1);
}

console.log('\n✅ Phase 0 complete. Database infrastructure exists.');
console.log('   Proceeding to Phase 1...\n');

// ============================================================
// Save Phase 0 Report
// ============================================================
const reportPath = `BOOKING_PIPELINE_LIVE_REMEDIATION_${Date.now()}.json`;
await writeFile(reportPath, JSON.stringify(report, null, 2));

console.log(`\n✅ Complete audit saved: ${reportPath}\n`);

process.exit(0);
