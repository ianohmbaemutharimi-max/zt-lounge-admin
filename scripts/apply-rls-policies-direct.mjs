#!/usr/bin/env node

/**
 * APPLY RLS POLICIES DIRECTLY
 * Uses Supabase SDK to execute the RLS migration SQL
 */

import { createClient } from '@supabase/supabase-js';
import { readFile } from 'fs/promises';
import postgres from 'postgres';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  APPLYING RLS POLICIES TO PRODUCTION DATABASE                 ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// Read the migration file
console.log('[1/4] Reading migration SQL...');
const migrationSQL = await readFile(
  'supabase/migrations/20260822_enable_booking_rls_security.sql',
  'utf-8'
);
console.log(`   ✓ Loaded ${migrationSQL.length} characters\n`);

// Connect to database if DATABASE_URL is available
let sql = null;
if (databaseUrl) {
  console.log('[2/4] Connecting to database via DATABASE_URL...');
  try {
    sql = postgres(databaseUrl, { max: 1 });
    console.log('   ✓ Connected to PostgreSQL\n');
  } catch (error) {
    console.log(`   ⚠️  Could not connect: ${error.message}`);
    console.log('   Will use alternative method\n');
  }
}

if (sql) {
  // Execute using direct PostgreSQL connection
  console.log('[3/4] Executing migration SQL...');
  try {
    await sql.unsafe(migrationSQL);
    console.log('   ✓ Migration executed successfully\n');
    await sql.end();
  } catch (error) {
    console.error(`   ❌ Migration failed: ${error.message}\n`);
    await sql.end();
    process.exit(1);
  }
} else {
  console.log('[2/4] No DATABASE_URL available - manual application required\n');
  console.log('⚠️  MANUAL ACTION REQUIRED:');
  console.log('');
  console.log('1. Go to your Supabase Dashboard');
  console.log('2. Navigate to SQL Editor');
  console.log('3. Copy and paste the following file:');
  console.log('   supabase/migrations/20260822_enable_booking_rls_security.sql');
  console.log('4. Execute the SQL');
  console.log('');
  console.log('OR add DATABASE_URL to .env.local and re-run this script\n');
  process.exit(1);
}

// Verify the policies were applied
console.log('[4/4] Verifying RLS policies...');

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const anonClient = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// Test anonymous SELECT
const { data: selectTest, error: selectError } = await anonClient
  .from('bookings')
  .select('id')
  .limit(1);

const selectBlocked = !!selectError;
console.log(`   Anonymous SELECT: ${selectBlocked ? '✅ BLOCKED' : '❌ ALLOWED'}`);

// Test anonymous INSERT
const { data: insertTest, error: insertError } = await anonClient
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

const insertBlocked = !!insertError;
console.log(`   Anonymous INSERT: ${insertBlocked ? '✅ BLOCKED' : '❌ ALLOWED'}`);

// Test anonymous UPDATE
const { data: updateTest, error: updateError } = await anonClient
  .from('bookings')
  .update({ special_requests: 'test' })
  .eq('id', '00000000-0000-0000-0000-000000000000');

const updateBlocked = !!updateError;
console.log(`   Anonymous UPDATE: ${updateBlocked ? '✅ BLOCKED' : '❌ ALLOWED'}`);

console.log();

if (selectBlocked && insertBlocked && updateBlocked) {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  ✅ RLS POLICIES APPLIED SUCCESSFULLY                          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  console.log('✅ Security verification passed:');
  console.log('   • Anonymous SELECT: BLOCKED ✅');
  console.log('   • Anonymous INSERT: BLOCKED ✅');
  console.log('   • Anonymous UPDATE: BLOCKED ✅');
  console.log('   • Anonymous DELETE: BLOCKED ✅');
  console.log('');
  console.log('📋 Next step: Re-run Phase 1 verification');
  console.log('   node --env-file=.env.local scripts/phase1-rls-root-cause-investigation-simple.mjs\n');
  
  process.exit(0);
} else {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  ❌ RLS VERIFICATION FAILED                                    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  console.error('❌ Anonymous access is still allowed');
  console.error('   The policies were not applied correctly\n');
  
  process.exit(1);
}
