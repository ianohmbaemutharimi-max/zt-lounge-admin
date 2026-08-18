/**
 * Refresh Supabase Schema Cache and Run Backfill
 * 
 * This script:
 * 1. Refreshes the PostgREST schema cache
 * 2. Waits for propagation
 * 3. Runs the backfill script
 * 
 * Usage: node refresh-schema-and-backfill.mjs <email> <password>
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const TEST_EMAIL = process.argv[2];
const TEST_PASSWORD = process.argv[3];

if (!TEST_EMAIL || !TEST_PASSWORD) {
  console.error('Usage: node refresh-schema-and-backfill.mjs <email> <password>');
  process.exit(1);
}

// Load environment
const envContent = readFileSync('.env.local', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([A-Z_]+)=(.+)$/);
  if (match) env[match[1]] = match[2];
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  ZT LOUNGE - REFRESH SCHEMA CACHE & BACKFILL                  ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

try {
  console.log('🔄 Step 1: Refreshing PostgREST schema cache...\n');
  
  // Try to refresh schema cache using PostgREST admin endpoint
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Prefer': 'schema-cache-reload'
      }
    });
    
    if (response.ok || response.status === 204) {
      console.log('✅ Schema cache reload requested\n');
    } else {
      console.log('⚠️  Schema cache reload may not be supported via API');
      console.log('   Response:', response.status, response.statusText);
      console.log('   Continuing anyway - cache may refresh automatically\n');
    }
  } catch (error) {
    console.log('⚠️  Could not request schema cache reload:', error.message);
    console.log('   Continuing anyway - cache may have already refreshed\n');
  }

  console.log('⏳ Step 2: Waiting 5 seconds for cache propagation...\n');
  await wait(5000);

  console.log('🔍 Step 3: Verifying table accessibility...\n');
  
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  
  // Try to query media_assets
  const { data: testData, error: testError } = await supabaseAdmin
    .from('media_assets')
    .select('id')
    .limit(1);

  if (testError) {
    if (testError.message.includes('schema cache')) {
      console.log('❌ Schema cache still not refreshed');
      console.log('   Error:', testError.message);
      console.log('\n📋 MANUAL ACTION REQUIRED:\n');
      console.log('   1. Open Supabase Dashboard: https://supabase.com/dashboard');
      console.log('   2. Navigate to your project');
      console.log('   3. Settings → API');
      console.log('   4. Click "Reload schema" or wait 5-10 more minutes');
      console.log('   5. Then re-run this script\n');
      process.exit(1);
    } else {
      console.log('⚠️  Unexpected error:', testError.message);
    }
  } else {
    console.log('✅ media_assets table is accessible!\n');
  }

  console.log('🚀 Step 4: Running backfill script...\n');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Run backfill script
  const backfillCommand = `node scripts/backfill-media-assets.mjs "${TEST_EMAIL}" "${TEST_PASSWORD}"`;
  
  const { stdout, stderr } = await execAsync(backfillCommand, {
    maxBuffer: 10 * 1024 * 1024 // 10MB buffer
  });

  console.log(stdout);
  if (stderr) {
    console.error(stderr);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('✅ BACKFILL COMPLETE!');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('📋 Next Steps:');
  console.log('   1. Verify media_assets records created');
  console.log('   2. Verify media_usage records created');
  console.log('   3. Test image retrieval from Media Library');
  console.log('   4. Proceed to Phase 2: Media APIs\n');

} catch (error) {
  console.error('\n❌ FAILED:', error.message);
  
  if (error.message.includes('schema cache')) {
    console.log('\n💡 SOLUTION:\n');
    console.log('   The Supabase schema cache needs more time to refresh.');
    console.log('   Please try one of these options:\n');
    console.log('   A. Wait 5-10 more minutes and run this script again');
    console.log('   B. Manually reload schema in Supabase Dashboard:');
    console.log('      - Open https://supabase.com/dashboard');
    console.log('      - Navigate to Settings → API');
    console.log('      - Click "Reload schema"\n');
  }
  
  process.exit(1);
}
