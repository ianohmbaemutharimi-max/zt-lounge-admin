/**
 * LIVE DATABASE REPAIR AUDIT
 * 
 * Phase 2-3: Comprehensive live database inspection
 * - Query actual schema metadata
 * - Inspect RPC function definitions
 * - Investigate get_dashboard_stats() source
 * - Inspect RLS policies
 * - Inspect triggers
 * - Verify migration history
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const https = require('https');

// Load credentials
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envLines = envContent.split(/\r?\n/);

function findKey(lines, name) {
  for (const line of lines) {
    if (line.startsWith(name + '=')) return line.slice(name.length + 1).trim();
  }
  return null;
}

const SUPABASE_URL = findKey(envLines, 'NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_ANON_KEY = findKey(envLines, 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = findKey(envLines, 'SUPABASE_SERVICE_ROLE_KEY');

console.log('\n' + '='.repeat(80));
console.log('LIVE DATABASE REPAIR AUDIT');
console.log('='.repeat(80));
console.log('URL:', SUPABASE_URL);
console.log('Anon key project:', extractProjectRef(SUPABASE_ANON_KEY));
console.log('Service role key project:', extractProjectRef(SUPABASE_SERVICE_ROLE_KEY));

function extractProjectRef(jwt) {
  if (!jwt) return 'MISSING';
  const parts = jwt.split('.');
  if (parts.length !== 3) return 'INVALID';
  try {
    const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return decoded.ref || 'UNKNOWN';
  } catch {
    return 'PARSE_ERROR';
  }
}

// Test credentials
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function executeSQL(sql) {
  const url = new URL('/rest/v1/rpc/sql', SUPABASE_URL);
  return new Promise((resolve) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, data });
          }
        });
      }
    );
    req.on('error', (e) => resolve({ status: 0, error: e.message }));
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('PHASE 2: CREDENTIAL VERIFICATION');
  console.log('='.repeat(80));

  const anonRef = extractProjectRef(SUPABASE_ANON_KEY);
  const sroleRef = extractProjectRef(SUPABASE_SERVICE_ROLE_KEY);

  console.log(`\nAnon key project ref: ${anonRef}`);
  console.log(`Service-role key project ref: ${sroleRef}`);

  if (anonRef === 'jczwilrysvnhcjzjztbi' && sroleRef === 'jczwilrysvnhcjzjztbi') {
    console.log('✓ BOTH credentials match correct project');
  } else if (anonRef === 'jczwilrysvnhcjzjztbi' && sroleRef !== 'jczwilrysvnhcjzjztbi') {
    console.log('❌ SERVICE-ROLE KEY HAS WRONG PROJECT REF');
    console.log('   Expected: jczwilrysvnhcjzjztbi');
    console.log('   Actual:', sroleRef);
  }

  console.log('\n' + '='.repeat(80));
  console.log('PHASE 3: QUERY get_dashboard_stats() FUNCTION');
  console.log('='.repeat(80));

  try {
    const { data, error } = await supabase.rpc('get_dashboard_stats');
    if (error) {
      console.log('❌ RPC call failed:', error.message);
    } else {
      console.log('✓ RPC returned:', JSON.stringify(data, null, 2));
    }
  } catch (e) {
    console.log('❌ RPC call error:', e.message);
  }

  console.log('\n' + '='.repeat(80));
  console.log('PHASE 4: TABLE ROW COUNTS (via REST)');
  console.log('='.repeat(80));

  const tables = [
    'bookings', 'customers', 'services', 'contact_messages',
    'roles', 'profiles', 'business_settings'
  ];

  for (const table of tables) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });

    const status = error ? `❌ ${error.message}` : `✓ ${count} rows`;
    console.log(`  ${table.padEnd(25)} ${status}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('AUDIT COMPLETE');
  console.log('='.repeat(80) + '\n');
}


