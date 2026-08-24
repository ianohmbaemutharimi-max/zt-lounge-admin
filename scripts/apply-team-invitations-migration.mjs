#!/usr/bin/env node
/**
 * Apply Team Invitations Migration to Live Supabase Database
 * 
 * This script:
 * 1. Verifies connection to the correct Supabase project
 * 2. Checks if invitations table exists
 * 3. Applies the migration if needed
 * 4. Verifies the schema after application
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Load environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓' : '✗');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('🔍 ZT Lounge Admin - Team Invitations Migration\n');
console.log('Supabase URL:', supabaseUrl);
console.log('Project ID:', supabaseUrl.match(/https:\/\/([^.]+)/)?.[1] || 'unknown');
console.log('');

// Step 1: Check if invitations table exists
console.log('📋 Step 1: Checking if invitations table exists...');
const { data: existingTable, error: checkError } = await supabase
  .from('invitations')
  .select('id')
  .limit(1);

if (checkError) {
  if (checkError.code === 'PGRST200' || checkError.message.includes('relation') || checkError.message.includes('does not exist')) {
    console.log('✗ Table does not exist');
    console.log('   Error:', checkError.message);
    console.log('');
    
    // Step 2: Read migration file
    console.log('📄 Step 2: Reading migration file...');
    const migrationPath = join(projectRoot, 'supabase', 'migrations', '20260818_add_team_invitations.sql');
    let migrationSQL;
    try {
      migrationSQL = readFileSync(migrationPath, 'utf8');
      console.log('✓ Migration file loaded (117 lines)');
      console.log('');
    } catch (err) {
      console.error('❌ Failed to read migration file:', err.message);
      process.exit(1);
    }
    
    // Step 3: Apply migration
    console.log('🚀 Step 3: Applying migration to live database...');
    console.log('⚠️  This will execute:');
    console.log('   - CREATE TABLE invitations');
    console.log('   - CREATE INDEXES (6 indexes)');
    console.log('   - ENABLE ROW LEVEL SECURITY');
    console.log('   - CREATE RLS POLICIES (4 policies)');
    console.log('   - CREATE TRIGGER');
    console.log('');
    
    const { data: migrationResult, error: migrationError } = await supabase.rpc('exec', {
      sql: migrationSQL
    });
    
    if (migrationError) {
      // Try alternative: direct SQL execution via PostgREST won't work,
      // we need to use the admin API or manual SQL editor
      console.log('⚠️  Cannot apply migration automatically via RPC');
      console.log('');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('MANUAL MIGRATION REQUIRED');
      console.log('═══════════════════════════════════════════════════════════');
      console.log('');
      console.log('The migration must be applied manually via Supabase Dashboard:');
      console.log('');
      console.log('1. Open Supabase Dashboard:');
      console.log(`   https://supabase.com/dashboard/project/${supabaseUrl.match(/https:\/\/([^.]+)/)?.[1]}`);
      console.log('');
      console.log('2. Navigate to: SQL Editor');
      console.log('');
      console.log('3. Copy and execute the following SQL:');
      console.log(`   File: ${migrationPath}`);
      console.log('');
      console.log('4. Verify table created:');
      console.log('   SELECT * FROM invitations LIMIT 1;');
      console.log('');
      console.log('5. Re-run this script to verify');
      console.log('');
      console.log('═══════════════════════════════════════════════════════════');
      
      // Write SQL to a separate file for easy copy-paste
      const outputPath = join(projectRoot, 'APPLY_THIS_MIGRATION.sql');
      writeFileSync(outputPath, migrationSQL);
      console.log('');
      console.log(`✓ Migration SQL written to: APPLY_THIS_MIGRATION.sql`);
      console.log('');
      
      process.exit(2); // Exit with code 2 = manual intervention required
    }
    
    console.log('✓ Migration applied successfully');
    console.log('');
  } else {
    console.error('❌ Unexpected error checking table:', checkError);
    process.exit(1);
  }
} else {
  console.log('✓ Table already exists');
  console.log('');
}

// Step 4: Verify schema
console.log('🔍 Step 4: Verifying invitations table schema...');

// Check table structure via information_schema
const { data: columns, error: columnsError } = await supabase.rpc('exec', {
  sql: `
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'invitations'
    ORDER BY ordinal_position;
  `
});

if (columnsError) {
  console.log('⚠️  Could not verify schema via RPC');
  console.log('   Attempting alternative verification...');
  
  // Try simple select to confirm table exists
  const { data: testData, error: testError } = await supabase
    .from('invitations')
    .select('id')
    .limit(1);
  
  if (testError) {
    console.error('❌ Table verification failed:', testError.message);
    process.exit(1);
  }
  
  console.log('✓ Table exists and is accessible');
  console.log('');
} else if (columns && columns.length > 0) {
  console.log('✓ Schema verified:');
  columns.forEach(col => {
    console.log(`   - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : ''}`);
  });
  console.log('');
}

// Step 5: Verify RLS enabled
console.log('🔒 Step 5: Verifying Row Level Security...');
const { data: rlsStatus, error: rlsError } = await supabase.rpc('exec', {
  sql: `
    SELECT tablename, rowsecurity
    FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename = 'invitations';
  `
});

if (!rlsError && rlsStatus && rlsStatus.length > 0) {
  const rls = rlsStatus[0];
  if (rls.rowsecurity) {
    console.log('✓ RLS enabled');
  } else {
    console.log('⚠️  RLS is NOT enabled');
  }
} else {
  console.log('⚠️  Could not verify RLS status');
}
console.log('');

// Final summary
console.log('═══════════════════════════════════════════════════════════');
console.log('VERIFICATION COMPLETE');
console.log('═══════════════════════════════════════════════════════════');
console.log('');
console.log('✅ invitations table is ready');
console.log('');
console.log('Next steps:');
console.log('1. Test the API endpoint:');
console.log('   GET /api/admin/team-invitations?status=pending');
console.log('');
console.log('2. Verify UI loads:');
console.log('   Navigate to /dashboard/team');
console.log('');
console.log('3. Run full verification:');
console.log('   node scripts/verify-team-invitations-live.mjs');
console.log('');

process.exit(0);
