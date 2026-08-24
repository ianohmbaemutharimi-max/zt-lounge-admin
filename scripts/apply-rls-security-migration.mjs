#!/usr/bin/env node

/**
 * APPLY RLS SECURITY MIGRATION TO LIVE DATABASE
 * 
 * Project: jczwilrysvnhcjzjztbi
 * Migration: 20260822_enable_booking_rls_security.sql
 * 
 * This script applies the RLS security fix to the live Supabase database.
 */

import { createClient } from '@supabase/supabase-js';
import { readFile, writeFile } from 'fs/promises';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const report = {
  timestamp: new Date().toISOString(),
  project: 'jczwilrysvnhcjzjztbi',
  migration_file: 'supabase/migrations/20260822_enable_booking_rls_security.sql',
  phases: {}
};

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  APPLYING RLS SECURITY MIGRATION TO LIVE DATABASE              ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// Read migration file
console.log('📄 Reading migration file...');
const migrationPath = 'supabase/migrations/20260822_enable_booking_rls_security.sql';
const migrationSQL = await readFile(migrationPath, 'utf8');

console.log(`   ✓ Loaded ${migrationSQL.length} bytes\n`);

// Execute migration
console.log('⚙️  Executing migration SQL...\n');

try {
  // Try to execute via Supabase client
  // Note: Supabase JS client doesn't support arbitrary SQL execution
  // We need to use the REST API or SQL editor
  
  console.log('⚠️  IMPORTANT: Supabase JS SDK cannot execute arbitrary SQL migrations.\n');
  console.log('The migration MUST be applied via one of these methods:\n');
  console.log('METHOD 1: Supabase Dashboard SQL Editor');
  console.log('  1. Go to: https://supabase.com/dashboard/project/jczwilrysvnhcjzjztbi/sql/new');
  console.log('  2. Copy the contents of: supabase/migrations/20260822_enable_booking_rls_security.sql');
  console.log('  3. Paste into SQL Editor');
  console.log('  4. Click "Run"\n');
  
  console.log('METHOD 2: Supabase CLI (if installed)');
  console.log('  Run: supabase db push\n');
  
  console.log('METHOD 3: Direct PostgreSQL Connection');
  console.log('  Use the database URL from Supabase settings\n');
  
  report.phases.migration_application = {
    status: 'MANUAL_REQUIRED',
    reason: 'Supabase JS SDK cannot execute DDL statements',
    migration_content: migrationSQL,
    instructions: [
      'Open Supabase Dashboard SQL Editor',
      'Paste migration SQL',
      'Execute migration',
      'Re-run verification script'
    ]
  };
  
  // Save migration content for manual application
  const migrationOutputPath = 'MIGRATION_TO_APPLY_RLS_SECURITY.sql';
  await writeFile(migrationOutputPath, migrationSQL);
  
  console.log(`📄 Migration SQL saved to: ${migrationOutputPath}`);
  console.log('   Copy this file content to Supabase SQL Editor\n');
  
  // Save report
  const reportPath = 'RLS_MIGRATION_APPLICATION_INSTRUCTIONS.json';
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  
  console.log(`📄 Instructions saved to: ${reportPath}\n`);
  
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  NEXT STEPS                                                    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  console.log('1. Open Supabase Dashboard SQL Editor');
  console.log('2. Paste the migration SQL');
  console.log('3. Click "Run"');
  console.log('4. After successful execution, run:');
  console.log('   node --env-file=.env.local scripts/rls-final-security-verification.mjs\n');
  
  process.exit(0);
  
} catch (error) {
  console.error('❌ Error:', error.message);
  report.phases.migration_application = {
    status: 'ERROR',
    error: error.message
  };
  process.exit(1);
}
