#!/usr/bin/env node

/**
 * Apply grants fix migration to resolve PGRST205
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const serviceClient = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║  APPLY GRANTS FIX MIGRATION                               ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

console.log('📋 Reading migration file...\n');

const migrationSQL = readFileSync(
  resolve(__dirname, 'supabase/migrations/20260813_fix_media_library_grants.sql'),
  'utf-8'
);

// Split into individual statements
const statements = migrationSQL
  .split(';')
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--') && !s.match(/^\/\*/));

console.log(`📝 Found ${statements.length} SQL statements to execute\n`);

console.log('═══════════════════════════════════════════════════════════');
console.log('EXECUTING MIGRATION');
console.log('═══════════════════════════════════════════════════════════\n');

let successCount = 0;
let failCount = 0;

for (let i = 0; i < statements.length; i++) {
  const statement = statements[i] + ';';
  
  // Skip comments and verification queries
  if (statement.includes('SELECT') && statement.includes('information_schema')) {
    console.log(`⏩ Skipping verification query ${i + 1}\n`);
    continue;
  }
  
  console.log(`🔧 Executing statement ${i + 1}/${statements.length}...`);
  
  try {
    // Execute via HTTP POST to admin API
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: statement })
    });

    if (!response.ok) {
      // Try alternative approach: execute via supabase-js
      const { data, error } = await serviceClient.rpc('exec_sql', { query: statement });
      
      if (error) {
        console.log(`   ⚠️  RPC not available, trying direct query...`);
        
        // For GRANT/NOTIFY, we'll execute via the SQL endpoint
        const sqlResponse = await fetch(`${supabaseUrl}/rest/v1/`, {
          method: 'POST',
          headers: {
            'apikey': supabaseServiceKey,
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'Content-Type': 'application/vnd.pgrst.object+json',
            'Prefer': 'return=minimal'
          },
          body: statement
        });

        if (!sqlResponse.ok) {
          throw new Error(`Failed to execute: ${await sqlResponse.text()}`);
        }
      }
    }

    console.log(`   ✅ Success\n`);
    successCount++;
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}\n`);
    failCount++;
  }
}

console.log('═══════════════════════════════════════════════════════════');
console.log('MIGRATION RESULT');
console.log('═══════════════════════════════════════════════════════════\n');

console.log(`✅ Successful: ${successCount}`);
console.log(`❌ Failed: ${failCount}\n`);

if (failCount > 0) {
  console.log('⚠️  Some statements failed. Execute the migration manually in SQL Editor:\n');
  console.log('   supabase/migrations/20260813_fix_media_library_grants.sql\n');
}

// Wait for schema reload
console.log('⏳ Waiting 10 seconds for schema reload...\n');
await new Promise(resolve => setTimeout(resolve, 10000));

// Test PostgREST access
console.log('═══════════════════════════════════════════════════════════');
console.log('TESTING POSTGREST ACCESS');
console.log('═══════════════════════════════════════════════════════════\n');

const testEndpoints = [
  { name: 'media_assets', path: '/rest/v1/media_assets?select=id&limit=1' },
  { name: 'media_usage', path: '/rest/v1/media_usage?select=id&limit=1' }
];

let allWorking = true;

for (const endpoint of testEndpoints) {
  try {
    const response = await fetch(`${supabaseUrl}${endpoint.path}`, {
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`
      }
    });

    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }

    console.log(`📡 GET ${endpoint.path}`);
    console.log(`   Status: ${response.status} ${response.statusText}`);

    if (response.status === 200) {
      console.log(`   ✅ SUCCESS: ${JSON.stringify(body)}`);
    } else {
      console.log(`   ❌ FAILED: ${JSON.stringify(body)}`);
      allWorking = false;
    }
    console.log();
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}\n`);
    allWorking = false;
  }
}

console.log('═══════════════════════════════════════════════════════════\n');

if (allWorking) {
  console.log('✅ PGRST205 RESOLVED - PostgREST can now access media tables!\n');
  console.log('Next step: Run backfill');
  console.log('  node complete-backfill-now.mjs "email" "password"\n');
  process.exit(0);
} else {
  console.log('❌ PGRST205 persists - Manual SQL Editor execution required\n');
  process.exit(1);
}
