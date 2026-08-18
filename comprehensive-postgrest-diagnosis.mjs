#!/usr/bin/env node

/**
 * Comprehensive PostgREST / Data API Diagnostic
 * Identifies why PGRST205 persists for media_assets/media_usage
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

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

const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

console.log('╔═══════════════════════════════════════════════════════════╗');
console.log('║  COMPREHENSIVE POSTGREST DIAGNOSTIC                       ║');
console.log('╚═══════════════════════════════════════════════════════════╝\n');

const report = {
  timestamp: new Date().toISOString(),
  findings: [],
  rootCause: null,
  recommendation: null
};

// 1. Verify table existence
console.log('═══════════════════════════════════════════════════════════');
console.log('STEP 1: VERIFY TABLE EXISTENCE');
console.log('═══════════════════════════════════════════════════════════\n');

try {
  const { data: tables, error } = await serviceClient
    .from('information_schema.tables')
    .select('table_name, table_type, table_schema')
    .eq('table_schema', 'public')
    .in('table_name', ['media_assets', 'media_usage', 'menu_items']);

  if (error) throw error;

  console.log('📋 Tables in public schema:');
  tables.forEach(t => {
    console.log(`   ${t.table_name}: ${t.table_type}`);
    const exists = ['media_assets', 'media_usage'].includes(t.table_name);
    if (exists) report.findings.push(`✅ ${t.table_name} exists in PostgreSQL`);
  });

  const hasMedia = tables.some(t => t.table_name === 'media_assets');
  const hasUsage = tables.some(t => t.table_name === 'media_usage');
  const hasMenu = tables.some(t => t.table_name === 'menu_items');

  if (!hasMedia || !hasUsage) {
    report.rootCause = 'Tables do not exist in database';
    report.recommendation = 'Re-apply migration';
  }
  console.log();
} catch (err) {
  console.log(`❌ Error checking tables: ${err.message}\n`);
  report.findings.push(`❌ Cannot query information_schema: ${err.message}`);
}

// 2. Check table schema and ownership
console.log('═══════════════════════════════════════════════════════════');
console.log('STEP 2: TABLE SCHEMA & OWNERSHIP');
console.log('═══════════════════════════════════════════════════════════\n');

try {
  const { data: columns, error } = await serviceClient
    .from('information_schema.columns')
    .select('table_name, column_name, data_type')
    .eq('table_schema', 'public')
    .eq('table_name', 'media_assets')
    .order('ordinal_position');

  if (error) throw error;

  console.log('📊 media_assets schema:');
  columns.forEach(c => {
    console.log(`   ${c.column_name}: ${c.data_type}`);
  });
  report.findings.push(`✅ media_assets has ${columns.length} columns`);
  console.log();
} catch (err) {
  console.log(`❌ Error: ${err.message}\n`);
}

// 3. Check grants
console.log('═══════════════════════════════════════════════════════════');
console.log('STEP 3: TABLE GRANTS');
console.log('═══════════════════════════════════════════════════════════\n');

try {
  const { data: grants, error } = await serviceClient
    .from('information_schema.role_table_grants')
    .select('grantee, table_name, privilege_type')
    .eq('table_schema', 'public')
    .in('table_name', ['media_assets', 'media_usage'])
    .order('table_name, grantee');

  if (error) throw error;

  console.log('🔐 Grants on media tables:');
  const byTable = {};
  grants.forEach(g => {
    if (!byTable[g.table_name]) byTable[g.table_name] = {};
    if (!byTable[g.table_name][g.grantee]) byTable[g.table_name][g.grantee] = [];
    byTable[g.table_name][g.grantee].push(g.privilege_type);
  });

  Object.entries(byTable).forEach(([table, grantees]) => {
    console.log(`\n   ${table}:`);
    Object.entries(grantees).forEach(([grantee, privs]) => {
      console.log(`     ${grantee}: ${privs.join(', ')}`);
    });
  });

  const hasAuthenticator = grants.some(g => g.grantee === 'authenticator');
  const hasAnon = grants.some(g => g.grantee === 'anon');
  const hasAuthenticated = grants.some(g => g.grantee === 'authenticated');

  if (!hasAuthenticator) {
    report.findings.push('⚠️  Missing grants for authenticator role');
    report.rootCause = 'PostgREST cannot access tables without authenticator grants';
    report.recommendation = 'GRANT ALL ON media_assets, media_usage TO authenticator';
  } else {
    report.findings.push('✅ authenticator role has grants');
  }
  console.log();
} catch (err) {
  console.log(`❌ Error: ${err.message}\n`);
}

// 4. Check RLS
console.log('═══════════════════════════════════════════════════════════');
console.log('STEP 4: ROW LEVEL SECURITY');
console.log('═══════════════════════════════════════════════════════════\n');

try {
  const { data: rls, error } = await serviceClient
    .from('pg_tables')
    .select('tablename, rowsecurity')
    .eq('schemaname', 'public')
    .in('tablename', ['media_assets', 'media_usage', 'menu_items']);

  if (error) throw error;

  console.log('🔒 RLS Status:');
  rls.forEach(t => {
    const status = t.rowsecurity ? 'ENABLED' : 'DISABLED';
    console.log(`   ${t.tablename}: ${status}`);
    if (t.tablename.startsWith('media_')) {
      report.findings.push(`${t.rowsecurity ? '✅' : '⚠️'} ${t.tablename} RLS ${status}`);
    }
  });
  console.log();
} catch (err) {
  console.log(`❌ Error: ${err.message}\n`);
}

// 5. Test REST endpoints directly
console.log('═══════════════════════════════════════════════════════════');
console.log('STEP 5: REST API ENDPOINT TESTS');
console.log('═══════════════════════════════════════════════════════════\n');

// Test known working table
console.log('🧪 Testing menu_items (known working table)...');
try {
  const { data, error } = await anonClient
    .from('menu_items')
    .select('id')
    .limit(1);

  if (error) {
    console.log(`❌ menu_items: ${error.message} (${error.code})`);
    report.findings.push('❌ PostgREST not working for existing tables');
  } else {
    console.log(`✅ menu_items: SUCCESS (${data.length} rows)`);
    report.findings.push('✅ PostgREST working for existing tables');
  }
} catch (err) {
  console.log(`❌ menu_items: ${err.message}`);
}

// Test media_assets
console.log('\n🧪 Testing media_assets (new table)...');
try {
  const { data, error } = await anonClient
    .from('media_assets')
    .select('id')
    .limit(1);

  if (error) {
    console.log(`❌ media_assets: ${error.message} (${error.code})`);
    if (error.code === 'PGRST205') {
      report.findings.push('❌ PGRST205: Table not in schema cache');
      if (!report.rootCause) {
        report.rootCause = 'PostgREST schema cache does not include media_assets';
      }
    }
  } else {
    console.log(`✅ media_assets: SUCCESS (${data.length} rows)`);
    report.findings.push('✅ media_assets accessible via PostgREST');
  }
} catch (err) {
  console.log(`❌ media_assets: ${err.message}`);
}

// Test with service role
console.log('\n🧪 Testing media_assets with service role...');
try {
  const { data, error } = await serviceClient
    .from('media_assets')
    .select('id')
    .limit(1);

  if (error) {
    console.log(`❌ service role: ${error.message} (${error.code})`);
    if (error.code === 'PGRST205') {
      report.findings.push('❌ PGRST205 even with service role');
      report.rootCause = 'Schema cache issue affects all roles - NOTIFY did not work';
    }
  } else {
    console.log(`✅ service role: SUCCESS (${data.length} rows)`);
    report.findings.push('✅ Service role can access media_assets');
  }
} catch (err) {
  console.log(`❌ service role: ${err.message}`);
}

console.log();

// 6. Direct HTTP test
console.log('═══════════════════════════════════════════════════════════');
console.log('STEP 6: DIRECT HTTP REST API TEST');
console.log('═══════════════════════════════════════════════════════════\n');

try {
  const response = await fetch(`${supabaseUrl}/rest/v1/media_assets?select=id&limit=1`, {
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`
    }
  });

  console.log(`📡 GET /rest/v1/media_assets`);
  console.log(`   Status: ${response.status} ${response.statusText}`);
  
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  if (response.status === 200) {
    console.log(`   Response: ${JSON.stringify(body)}`);
    report.findings.push('✅ Direct HTTP: media_assets accessible');
  } else {
    console.log(`   Error: ${JSON.stringify(body)}`);
    report.findings.push(`❌ Direct HTTP: ${response.status} - ${JSON.stringify(body)}`);
  }
} catch (err) {
  console.log(`❌ HTTP Error: ${err.message}`);
}

console.log();

// Final analysis
console.log('═══════════════════════════════════════════════════════════');
console.log('ROOT CAUSE ANALYSIS');
console.log('═══════════════════════════════════════════════════════════\n');

if (!report.rootCause) {
  // Try to infer from findings
  const hasPGRST205 = report.findings.some(f => f.includes('PGRST205'));
  const tablesExist = report.findings.some(f => f.includes('media_assets exists'));
  const hasGrants = report.findings.some(f => f.includes('authenticator role has grants'));

  if (hasPGRST205 && tablesExist && hasGrants) {
    report.rootCause = 'PostgREST schema cache stale despite NOTIFY command';
    report.recommendation = 'Supabase project restart may be required, or wait for automatic refresh';
  } else if (hasPGRST205 && tablesExist && !hasGrants) {
    report.rootCause = 'Missing authenticator role grants';
    report.recommendation = 'Execute: GRANT ALL ON media_assets, media_usage TO authenticator;';
  } else if (hasPGRST205 && !tablesExist) {
    report.rootCause = 'Tables do not exist in database';
    report.recommendation = 'Re-apply migration';
  }
}

console.log('🔍 ROOT CAUSE:');
console.log(`   ${report.rootCause || 'Unable to determine - see findings above'}\n`);

console.log('💡 RECOMMENDATION:');
console.log(`   ${report.recommendation || 'Manual investigation required'}\n`);

console.log('📋 ALL FINDINGS:');
report.findings.forEach(f => console.log(`   ${f}`));

console.log('\n═══════════════════════════════════════════════════════════\n');

// Save report
await Bun.write('postgrest-diagnosis-report.json', JSON.stringify(report, null, 2));
console.log('📄 Full report saved: postgrest-diagnosis-report.json\n');

process.exit(report.rootCause && report.recommendation ? 0 : 1);
