#!/usr/bin/env node
/**
 * PHASE 4D: LIVE DASHBOARD RPC REPAIR
 * 
 * This script applies the corrected get_dashboard_stats() RPC
 * directly to the live Supabase database using the service role client.
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
config({ path: join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'SET' : 'MISSING');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? 'SET' : 'MISSING');
  process.exit(1);
}

// Create service role client
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log('═══════════════════════════════════════════════════════════════');
console.log('PHASE 4D: LIVE DASHBOARD RPC REPAIR');
console.log('═══════════════════════════════════════════════════════════════\n');

async function main() {
  // PHASE 1: Inspect current RPC
  console.log('PHASE 1: INSPECT CURRENT RPC\n');
  
  console.log('Testing current get_dashboard_stats()...');
  const { data: currentData, error: currentError } = await supabase.rpc('get_dashboard_stats');
  
  if (currentError) {
    console.log('❌ RPC execution failed:', currentError.message);
  } else {
    console.log('✅ Current RPC executes successfully');
    console.log('   Current keys:', Object.keys(currentData || {}).join(', '));
    
    const hasCorrectContract = 
      currentData &&
      'cards' in currentData &&
      'revenue' in currentData &&
      'trends' in currentData &&
      'recentBookings' in currentData &&
      'activity' in currentData &&
      'notifications' in currentData;
    
    if (hasCorrectContract) {
      console.log('\n✅ RPC ALREADY HAS CORRECT CONTRACT');
      console.log('   No repair needed. Dashboard should be working.');
      process.exit(0);
    } else {
      console.log('   ❌ Contract mismatch detected');
    }
  }
  
  // PHASE 2: Apply corrected RPC
  console.log('\n\nPHASE 2: APPLY CORRECTED RPC\n');
  
  const migrationPath = join(__dirname, '..', 'supabase', 'migrations', '20260815_fix_dashboard_stats_rpc.sql');
  
  let migrationSQL;
  try {
    migrationSQL = readFileSync(migrationPath, 'utf8');
    console.log('✅ Migration file loaded');
    console.log('   Path:', migrationPath);
  } catch (error) {
    console.log('❌ Failed to read migration file:', error.message);
    process.exit(1);
  }
  
  console.log('\n⚠️  ATTEMPTING TO APPLY SQL VIA SUPABASE CLIENT...');
  console.log('   Note: Service role may not have DDL permissions via PostgREST\n');
  
  // Try to execute the SQL
  const { data: execData, error: execError } = await supabase.rpc('exec', {
    query: migrationSQL
  });
  
  if (execError) {
    console.log('❌ BLOCKED: Cannot apply migration via Supabase client');
    console.log('   Error:', execError.message);
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('RESULT: BLOCKED');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('The Supabase client cannot execute DDL (CREATE FUNCTION) statements.');
    console.log('This is a PostgREST security limitation.\n');
    console.log('MANUAL APPLICATION REQUIRED:\n');
    console.log('1. Open Supabase Dashboard SQL Editor');
    console.log('2. Copy contents of: supabase/migrations/20260815_fix_dashboard_stats_rpc.sql');
    console.log('3. Paste and execute\n');
    console.log('Or use Supabase CLI:');
    console.log('   supabase db push\n');
    process.exit(1);
  }
  
  console.log('✅ SQL execution attempted');
  
  // PHASE 3: Verify repaired RPC
  console.log('\n\nPHASE 3: VERIFY REPAIRED RPC\n');
  
  console.log('Testing repaired get_dashboard_stats()...');
  const { data: repairedData, error: repairedError } = await supabase.rpc('get_dashboard_stats');
  
  if (repairedError) {
    console.log('❌ RPC execution failed:', repairedError.message);
    process.exit(1);
  }
  
  console.log('✅ RPC executes successfully\n');
  
  // Verify contract
  const requiredKeys = ['cards', 'revenue', 'trends', 'recentBookings', 'activity', 'notifications'];
  const actualKeys = Object.keys(repairedData || {});
  
  console.log('Contract Verification:');
  console.log('  Expected keys:', requiredKeys.join(', '));
  console.log('  Actual keys:  ', actualKeys.join(', '));
  
  const missingKeys = requiredKeys.filter(k => !actualKeys.includes(k));
  const extraKeys = actualKeys.filter(k => !requiredKeys.includes(k));
  
  if (missingKeys.length > 0) {
    console.log('\n❌ Missing required keys:', missingKeys.join(', '));
    process.exit(1);
  }
  
  if (extraKeys.length > 0) {
    console.log('\n⚠️  Extra keys found:', extraKeys.join(', '));
  }
  
  // Verify cards structure
  if (repairedData.cards) {
    const requiredCardFields = [
      'todays_bookings',
      'pending_bookings',
      'total_customers',
      'active_services',
      'staff_members',
      'pending_messages',
      'monthly_revenue'
    ];
    
    const actualCardFields = Object.keys(repairedData.cards);
    const missingCardFields = requiredCardFields.filter(f => !actualCardFields.includes(f));
    
    console.log('\n✅ Top-level keys correct');
    console.log('\nCards Structure:');
    console.log('  Expected:', requiredCardFields.length, 'fields');
    console.log('  Actual:  ', actualCardFields.length, 'fields');
    
    if (missingCardFields.length > 0) {
      console.log('  ❌ Missing:', missingCardFields.join(', '));
      process.exit(1);
    } else {
      console.log('  ✅ All card fields present');
    }
  }
  
  // Verify array types
  const arrayFields = ['revenue', 'trends', 'recentBookings', 'activity', 'notifications'];
  console.log('\nArray Type Verification:');
  
  for (const field of arrayFields) {
    const isArray = Array.isArray(repairedData[field]);
    console.log(`  ${field}: ${isArray ? '✅ array' : '❌ not array'}`);
    if (!isArray) {
      process.exit(1);
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('RESULT: PASS');
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log('✅ Live RPC repaired and verified');
  console.log('✅ All required keys present');
  console.log('✅ Cards structure correct');
  console.log('✅ Array types correct');
  console.log('\nDashboard should now load without contract errors.\n');
}

main().catch(error => {
  console.error('\n❌ FATAL ERROR:', error.message);
  console.error(error.stack);
  process.exit(1);
});
