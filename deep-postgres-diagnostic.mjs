#!/usr/bin/env node

/**
 * Deep PostgreSQL Diagnostic for PGRST205
 * Direct database inspection to identify exact cause
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { writeFileSync } from 'fs';

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
  auth: { autoRefreshToken: false, persistSession: false },
  db: { schema: 'public' }
});

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║  DEEP POSTGRESQL DIAGNOSTIC - PGRST205 ROOT CAUSE        ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

const report = {
  timestamp: new Date().toISOString(),
  tables: {},
  grants: {},
  rls: {},
  comparison: {},
  rootCause: null,
  fix: null
};

// Helper to execute raw SQL via RPC
async function execSQL(query) {
  try {
    // Use the admin/postgres role via service key
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ query })
    });

    if (!response.ok) {
      // Try alternative: direct query
      const { data, error } = await serviceClient.rpc('exec_sql', { query });
      if (error) throw new Error(`SQL exec failed: ${error.message}`);
      return data;
    }

    return await response.json();
  } catch (err) {
    throw err;
  }
}

// PHASE 1: Table Existence & Basic Info
console.log('═══════════════════════════════════════════════════════════');
console.log('PHASE 1: TABLE EXISTENCE & OWNERSHIP');
console.log('═══════════════════════════════════════════════════════════\n');

const checkTables = `
SELECT 
  t.tablename,
  t.schemaname,
  t.tableowner,
  t.hasindexes,
  t.hasrules,
  t.hastriggers,
  t.rowsecurity as rls_enabled,
  pg_catalog.obj_description(c.oid) as table_comment
FROM pg_catalog.pg_tables t
JOIN pg_catalog.pg_class c ON c.relname = t.tablename
WHERE t.schemaname = 'public'
  AND t.tablename IN ('media_assets', 'media_usage', 'menu_items')
ORDER BY t.tablename;
`;

try {
  const { data: tables, error } = await serviceClient.rpc('exec_sql', { query: checkTables });
  
  if (error) {
    // Fallback: query pg_tables via postgREST
    console.log('⚠️  exec_sql RPC not available, using alternative...\n');
    
    // Direct metadata query
    const tableCheck = await Promise.all([
      serviceClient.from('pg_tables').select('*').eq('schemaname', 'public').eq('tablename', 'media_assets'),
      serviceClient.from('pg_tables').select('*').eq('schemaname', 'public').eq('tablename', 'media_usage'),
      serviceClient.from('pg_tables').select('*').eq('schemaname', 'public').eq('tablename', 'menu_items')
    ]);

    console.log('📋 Table Check Results:\n');
    tableCheck.forEach(({ data, error }, idx) => {
      const names = ['media_assets', 'media_usage', 'menu_items'];
      if (error && error.code === 'PGRST205') {
        console.log(`   ❌ ${names[idx]}: PGRST205 - Not in schema cache`);
        report.tables[names[idx]] = { exists: 'unknown', postgrest: 'PGRST205' };
      } else if (error) {
        console.log(`   ❌ ${names[idx]}: ${error.message}`);
        report.tables[names[idx]] = { exists: 'unknown', error: error.message };
      } else if (data && data.length > 0) {
        console.log(`   ✅ ${names[idx]}: EXISTS`);
        console.log(`      Owner: ${data[0].tableowner}`);
        console.log(`      RLS: ${data[0].rowsecurity ? 'ENABLED' : 'DISABLED'}`);
        report.tables[names[idx]] = {
          exists: true,
          owner: data[0].tableowner,
          rls: data[0].rowsecurity,
          postgrest: 'accessible'
        };
      } else {
        console.log(`   ❌ ${names[idx]}: NOT FOUND`);
        report.tables[names[idx]] = { exists: false };
      }
    });
  } else {
    console.log('📋 Tables in public schema:\n');
    (data || []).forEach(t => {
      console.log(`   ✅ ${t.tablename}`);
      console.log(`      Schema: ${t.schemaname}`);
      console.log(`      Owner: ${t.tableowner}`);
      console.log(`      RLS: ${t.rls_enabled ? 'ENABLED' : 'DISABLED'}`);
      report.tables[t.tablename] = {
        exists: true,
        schema: t.schemaname,
        owner: t.tableowner,
        rls: t.rls_enabled
      };
    });
  }
} catch (err) {
  console.log(`❌ Error: ${err.message}\n`);
  report.tables.error = err.message;
}

console.log();

// PHASE 2: Column Comparison
console.log('═══════════════════════════════════════════════════════════');
console.log('PHASE 2: SCHEMA COMPARISON');
console.log('═══════════════════════════════════════════════════════════\n');

for (const table of ['menu_items', 'media_assets', 'media_usage']) {
  console.log(`🔍 Inspecting ${table}...`);
  
  try {
    const { data: cols, error } = await serviceClient
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable')
      .eq('table_schema', 'public')
      .eq('table_name', table)
      .order('ordinal_position');

    if (error && error.code === 'PGRST205') {
      console.log(`   ❌ PGRST205: Cannot access information_schema`);
      console.log(`   ℹ️  This means PostgREST itself cannot see system tables\n`);
      break;
    } else if (error) {
      console.log(`   ❌ Error: ${error.message}\n`);
    } else if (cols && cols.length > 0) {
      console.log(`   Columns: ${cols.length}`);
      report.comparison[table] = { columns: cols.length };
    } else {
      console.log(`   ⚠️  No columns found\n`);
    }
  } catch (err) {
    console.log(`   ❌ ${err.message}\n`);
  }
}

console.log();

// PHASE 3: Grants Comparison
console.log('═══════════════════════════════════════════════════════════');
console.log('PHASE 3: GRANTS COMPARISON (CRITICAL)');
console.log('═══════════════════════════════════════════════════════════\n');

for (const table of ['menu_items', 'media_assets', 'media_usage']) {
  console.log(`🔐 Checking grants on ${table}...\n`);
  
  try {
    const { data: grants, error } = await serviceClient
      .from('information_schema.table_privileges')
      .select('grantee, privilege_type')
      .eq('table_schema', 'public')
      .eq('table_name', table)
      .in('grantee', ['anon', 'authenticated', 'authenticator', 'service_role']);

    if (error && error.code === 'PGRST205') {
      console.log(`   ❌ PGRST205 on information_schema.table_privileges\n`);
      break;
    } else if (error) {
      console.log(`   ❌ Error: ${error.message}\n`);
    } else if (grants && grants.length > 0) {
      const byGrantee = {};
      grants.forEach(g => {
        if (!byGrantee[g.grantee]) byGrantee[g.grantee] = [];
        byGrantee[g.grantee].push(g.privilege_type);
      });

      Object.entries(byGrantee).forEach(([grantee, privs]) => {
        console.log(`   ${grantee}: ${privs.join(', ')}`);
      });

      report.grants[table] = byGrantee;

      // Critical check
      const hasAuthenticator = grants.some(g => g.grantee === 'authenticator');
      if (!hasAuthenticator) {
        console.log(`\n   ⚠️  MISSING authenticator GRANTS - THIS IS THE ISSUE!`);
        report.rootCause = `Missing authenticator role grants on ${table}`;
      }
    } else {
      console.log(`   ⚠️  NO GRANTS FOUND - THIS IS THE ISSUE!`);
      report.rootCause = `No grants on ${table}`;
    }
  } catch (err) {
    console.log(`   ❌ ${err.message}\n`);
  }
  
  console.log();
}

// PHASE 4: Direct HTTP API Test
console.log('═══════════════════════════════════════════════════════════');
console.log('PHASE 4: DIRECT REST API TEST');
console.log('═══════════════════════════════════════════════════════════\n');

const testEndpoints = [
  { name: 'menu_items', path: '/rest/v1/menu_items?select=id&limit=1' },
  { name: 'media_assets', path: '/rest/v1/media_assets?select=id&limit=1' },
  { name: 'media_usage', path: '/rest/v1/media_usage?select=id&limit=1' }
];

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
      report[endpoint.name + '_api'] = { status: 200, working: true };
    } else {
      console.log(`   ❌ FAILED: ${JSON.stringify(body)}`);
      report[endpoint.name + '_api'] = { status: response.status, error: body };
      
      if (body.code === 'PGRST205') {
        console.log(`   ℹ️  PGRST205 confirms table not in PostgREST schema cache`);
      }
    }
    console.log();
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}\n`);
  }
}

// ROOT CAUSE ANALYSIS
console.log('═══════════════════════════════════════════════════════════');
console.log('ROOT CAUSE ANALYSIS');
console.log('═══════════════════════════════════════════════════════════\n');

if (!report.rootCause) {
  // Analyze findings
  const menuWorks = report.menu_items_api?.working === true;
  const mediaFails = report.media_assets_api?.error?.code === 'PGRST205';
  const tablesExist = report.tables.media_assets?.exists === true;

  if (menuWorks && mediaFails) {
    console.log('🔍 Pattern detected:');
    console.log('   ✅ menu_items works via PostgREST');
    console.log('   ❌ media_assets fails with PGRST205');
    console.log('   ✅ media_assets exists in PostgreSQL\n');

    if (report.grants.media_assets && !report.grants.media_assets.authenticator) {
      report.rootCause = 'Missing authenticator role grants on media tables';
      report.fix = 'GRANT ALL ON media_assets, media_usage TO authenticator;';
    } else if (!report.grants.media_assets) {
      report.rootCause = 'Unable to verify grants (PostgREST cannot access information_schema)';
      report.fix = 'Execute grants via SQL Editor: GRANT ALL ON media_assets, media_usage TO authenticator;';
    } else {
      report.rootCause = 'PostgREST schema cache stale despite correct grants';
      report.fix = 'Supabase infrastructure restart required (cannot be done programmatically)';
    }
  }
}

console.log('🎯 ROOT CAUSE:');
console.log(`   ${report.rootCause || 'Unable to determine from available diagnostics'}\n`);

console.log('💡 RECOMMENDED FIX:');
console.log(`   ${report.fix || 'Manual Supabase Dashboard intervention required'}\n`);

// Save report
const reportJSON = JSON.stringify(report, null, 2);
writeFileSync('deep-postgres-diagnostic-report.json', reportJSON);

console.log('═══════════════════════════════════════════════════════════');
console.log('📄 Full report saved: deep-postgres-diagnostic-report.json');
console.log('═══════════════════════════════════════════════════════════\n');

// Exit code based on whether we found a fixable issue
const fixable = report.fix && report.fix.includes('GRANT');
process.exit(fixable ? 0 : 1);
