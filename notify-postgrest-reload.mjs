#!/usr/bin/env node

/**
 * Execute NOTIFY pgrst, 'reload schema' to refresh PostgREST cache
 * Source: https://supabase.com/docs/guides/troubleshooting/refresh-postgrest-schema
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: resolve(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓' : '✗');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║  POSTGREST SCHEMA RELOAD                               ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

async function notifyPostgREST() {
  try {
    console.log('📡 Executing: NOTIFY pgrst, \'reload schema\';');
    
    const { data, error } = await supabase.rpc('pg_notify', {
      channel: 'pgrst',
      payload: 'reload schema'
    });

    if (error) {
      // Try direct SQL approach
      console.log('⚠️  RPC approach failed, trying direct SQL...\n');
      
      const { data: sqlData, error: sqlError } = await supabase
        .from('_supabase_meta')
        .select('*')
        .limit(0);
      
      // Execute raw SQL through service role
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: "NOTIFY pgrst, 'reload schema';"
        })
      });

      if (!response.ok) {
        throw new Error(`SQL execution failed: ${response.status} ${response.statusText}`);
      }
      
      console.log('✅ PostgREST reload notification sent via SQL\n');
    } else {
      console.log('✅ PostgREST reload notification sent via RPC\n');
    }

    console.log('⏳ Waiting 15 seconds for schema reload to propagate...\n');
    await new Promise(resolve => setTimeout(resolve, 15000));

    console.log('🧪 Testing PostgREST access to media_assets...');
    const { data: testData, error: testError } = await supabase
      .from('media_assets')
      .select('id')
      .limit(1);

    if (testError) {
      if (testError.code === 'PGRST205') {
        console.log('❌ PGRST205 still present after reload\n');
        console.log('🔍 Checking table grants and schema exposure...\n');
        return false;
      }
      console.log(`❌ Unexpected error: ${testError.message}\n`);
      return false;
    }

    console.log('✅ PostgREST can now see media_assets table!');
    console.log(`   Current count: ${testData?.length ?? 0} records\n`);

    console.log('🧪 Testing PostgREST access to media_usage...');
    const { data: testData2, error: testError2 } = await supabase
      .from('media_usage')
      .select('id')
      .limit(1);

    if (testError2) {
      if (testError2.code === 'PGRST205') {
        console.log('❌ media_usage still PGRST205\n');
        return false;
      }
      console.log(`❌ Unexpected error: ${testError2.message}\n`);
      return false;
    }

    console.log('✅ PostgREST can now see media_usage table!');
    console.log(`   Current count: ${testData2?.length ?? 0} records\n`);

    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ POSTGREST SCHEMA RELOAD SUCCESSFUL');
    console.log('═══════════════════════════════════════════════════════\n');
    
    return true;

  } catch (err) {
    console.error('❌ Error:', err.message);
    return false;
  }
}

const success = await notifyPostgREST();
process.exit(success ? 0 : 1);
