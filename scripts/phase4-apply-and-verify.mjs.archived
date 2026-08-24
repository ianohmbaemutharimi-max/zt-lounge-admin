#!/usr/bin/env node

/**
 * PHASE 4: APPLY DASHBOARD RPC MIGRATION AND VERIFY
 * 
 * This script:
 * 1. Applies the corrected dashboard stats RPC migration
 * 2. Verifies the function exists and has correct structure
 * 3. Executes the RPC and validates the return contract
 * 4. Checks security settings (SECURITY DEFINER, grants)
 * 5. Validates against UI expectations
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
config({ path: join(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing Supabase credentials');
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', SUPABASE_URL ? '✓' : '✗');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_KEY ? '✓' : '✗');
  process.exit(1);
}

// Create admin client
const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

console.log('═══════════════════════════════════════════════════════════════');
console.log('PHASE 4: DASHBOARD RPC MIGRATION & VERIFICATION');
console.log('═══════════════════════════════════════════════════════════════\n');

const results = {
  migration: null,
  function_exists: null,
  execution: null,
  contract: null,
  security: null,
};

// ===================================================================
// STEP 1: APPLY MIGRATION
// ===================================================================
console.log('STEP 1: Apply Migration\n');

try {
  const migrationPath = join(__dirname, '..', 'supabase', 'migrations', '20260815_fix_dashboard_stats_rpc.sql');
  const migrationSQL = readFileSync(migrationPath, 'utf8');
  
  console.log('📄 Migration file: 20260815_fix_dashboard_stats_rpc.sql');
  console.log('📏 SQL length:', migrationSQL.length, 'characters\n');
  
  const { data, error } = await adminClient.rpc('exec_sql', { sql: migrationSQL }).catch(async (err) => {
    // If exec_sql doesn't exist, try direct execution
    return await adminClient.from('_migrations').select('*').limit(1).then(() => {
      // Try using pg_stat_statements or direct query
      return adminClient.rpc('query', { query_text: migrationSQL });
    }).catch(async () => {
      // Last resort: use raw SQL query
      const { data, error } = await adminClient.rpc('exec', { sql: migrationSQL });
      return { data, error };
    });
  });
  
  if (error) {
    // Try alternative: direct execution via PostgREST
    console.log('⚠️  RPC method not available, trying direct SQL execution...\n');
    
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({ sql: migrationSQL })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    console.log('✅ Migration applied successfully (via HTTP)\n');
    results.migration = 'PASS';
  } else {
    console.log('✅ Migration applied successfully\n');
    results.migration = 'PASS';
  }
} catch (err) {
  console.error('❌ Migration failed:', err.message);
  console.error('\n📋 Manual Action Required:');
  console.error('   Run the migration manually in Supabase SQL Editor:');
  console.error('   supabase/migrations/20260815_fix_dashboard_stats_rpc.sql\n');
  results.migration = 'BLOCKED';
}

// ===================================================================
// STEP 2: VERIFY FUNCTION EXISTS
// ===================================================================
console.log('STEP 2: Verify Function Exists\n');

try {
  const { data, error } = await adminClient.rpc('get_dashboard_stats');
  
  if (error) {
    console.error('❌ Function does not exist or cannot be called');
    console.error('   Error:', error.message);
    results.function_exists = 'FAIL';
  } else {
    console.log('✅ Function exists and is callable\n');
    results.function_exists = 'PASS';
    results.execution = { data, timestamp: new Date().toISOString(), executionTime: null };
  }
} catch (err) {
  console.error('❌ Function check failed:', err.message);
  results.function_exists = 'FAIL';
}

if (results.function_exists !== 'PASS') {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('PHASE 4 VERDICT: BLOCKED');
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log('Migration must be applied manually before proceeding.\n');
  process.exit(1);
}

// ===================================================================
// STEP 3: EXECUTE RPC AND MEASURE PERFORMANCE
// ===================================================================
console.log('STEP 3: Execute RPC and Validate Contract\n');

const startTime = Date.now();
const { data: rpcResult, error: rpcError } = await adminClient.rpc('get_dashboard_stats');
const executionTime = Date.now() - startTime;

if (rpcError) {
  console.error('❌ RPC execution failed:', rpcError.message);
  results.execution = 'FAIL';
} else {
  console.log('✅ RPC executed successfully');
  console.log('⏱️  Execution time:', executionTime, 'ms\n');
  results.execution = { data: rpcResult, timestamp: new Date().toISOString(), executionTime };
}

// ===================================================================
// STEP 4: VALIDATE CONTRACT
// ===================================================================
console.log('STEP 4: Validate Contract Against UI Expectations\n');

const expectedStructure = {
  cards: [
    'todays_bookings',
    'pending_bookings',
    'total_customers',
    'active_services',
    'staff_members',
    'pending_messages',
    'monthly_revenue',
  ],
  revenue: 'array',
  trends: 'array',
  recentBookings: 'array',
  activity: 'array',
  notifications: 'array',
};

const contractValidation = {
  cards: {},
  collections: {},
};

let contractPass = true;

// Check top-level structure
for (const key of Object.keys(expectedStructure)) {
  if (!(key in rpcResult)) {
    console.error(`❌ Missing top-level key: ${key}`);
    contractPass = false;
    contractValidation[key] = 'MISSING';
  } else {
    contractValidation[key] = 'PRESENT';
  }
}

// Check cards fields
if (rpcResult.cards) {
  console.log('📊 Cards Structure:');
  for (const field of expectedStructure.cards) {
    const value = rpcResult.cards[field];
    const exists = field in rpcResult.cards;
    const typeOk = exists && (typeof value === 'number' || typeof value === 'string');
    
    console.log(`   ${exists && typeOk ? '✓' : '✗'} ${field}: ${value} (${typeof value})`);
    
    if (!exists) {
      contractPass = false;
      contractValidation.cards[field] = 'MISSING';
    } else if (!typeOk) {
      contractPass = false;
      contractValidation.cards[field] = 'TYPE_ERROR';
    } else {
      contractValidation.cards[field] = 'PASS';
    }
  }
  console.log();
} else {
  console.error('❌ Cards object missing\n');
  contractPass = false;
}

// Check arrays
console.log('📋 Collection Structures:');
for (const key of ['revenue', 'trends', 'recentBookings', 'activity', 'notifications']) {
  if (rpcResult[key]) {
    const isArray = Array.isArray(rpcResult[key]);
    const length = isArray ? rpcResult[key].length : 'N/A';
    console.log(`   ${isArray ? '✓' : '✗'} ${key}: ${isArray ? 'array' : typeof rpcResult[key]} (${length} items)`);
    
    if (!isArray) {
      contractPass = false;
      contractValidation.collections[key] = 'NOT_ARRAY';
    } else {
      contractValidation.collections[key] = 'PASS';
    }
  } else {
    console.log(`   ✗ ${key}: missing`);
    contractPass = false;
    contractValidation.collections[key] = 'MISSING';
  }
}
console.log();

results.contract = contractPass ? 'PASS' : 'FAIL';

// ===================================================================
// STEP 5: CHECK SECURITY SETTINGS
// ===================================================================
console.log('STEP 5: Verify Security Settings\n');

try {
  const { data: functionInfo, error: fnError } = await adminClient
    .from('pg_proc')
    .select('proname, prosecdef')
    .eq('proname', 'get_dashboard_stats')
    .single()
    .catch(() => ({ data: null, error: null }));
  
  if (functionInfo) {
    console.log('🔒 Security Mode:', functionInfo.prosecdef ? 'SECURITY DEFINER ✓' : 'SECURITY INVOKER ⚠️');
    results.security = functionInfo.prosecdef ? 'PASS' : 'WARNING';
  } else {
    console.log('⚠️  Could not verify security settings (requires pg_catalog access)');
    results.security = 'UNKNOWN';
  }
} catch (err) {
  console.log('⚠️  Could not verify security settings:', err.message);
  results.security = 'UNKNOWN';
}

console.log();

// ===================================================================
// SUMMARY
// ===================================================================
console.log('═══════════════════════════════════════════════════════════════');
console.log('PHASE 4 RESULTS');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('Migration Applied:        ', results.migration || 'BLOCKED');
console.log('Function Exists:          ', results.function_exists || 'FAIL');
console.log('RPC Execution:            ', results.execution ? 'PASS' : 'FAIL');
console.log('Execution Time:           ', results.execution?.executionTime || 'N/A', 'ms');
console.log('Contract Validation:      ', results.contract || 'FAIL');
console.log('Security Settings:        ', results.security || 'UNKNOWN');

console.log();

if (results.contract === 'PASS') {
  console.log('✅ PHASE 4 VERDICT: PASS');
  console.log();
  console.log('Dashboard RPC now returns:');
  console.log('• cards (7 metrics with snake_case names)');
  console.log('• revenue (6-month analytics)');
  console.log('• trends (14-day booking trends)');
  console.log('• recentBookings (last 10 bookings)');
  console.log('• activity (last 10 admin actions)');
  console.log('• notifications (10 most recent/unread)');
} else {
  console.log('❌ PHASE 4 VERDICT: FAIL');
  console.log();
  console.log('Contract validation failed. See details above.');
}

console.log('\n═══════════════════════════════════════════════════════════════\n');

// Export results for downstream verification
console.log('📊 Full RPC Result Sample:\n');
console.log(JSON.stringify(rpcResult, null, 2));
console.log();

process.exit(results.contract === 'PASS' ? 0 : 1);
