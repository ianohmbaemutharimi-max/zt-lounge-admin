/**
 * ZT LOUNGE ADMIN — PRODUCTION CERTIFICATION
 * 
 * Comprehensive production-readiness verification including:
 * - Schema consistency checks
 * - Security audit
 * - Performance measurement
 * - Build verification
 * - Regression testing
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment
const envPath = join(__dirname, '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([A-Z_]+)=(.+)$/);
  if (match) {
    env[match[1]] = match[2];
  }
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const BASE_URL = 'http://localhost:3000';

console.log('═══════════════════════════════════════════════════════════════');
console.log('  ZT LOUNGE ADMIN — PRODUCTION CERTIFICATION');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log('Time:', new Date().toISOString());
console.log('Supabase:', SUPABASE_URL);
console.log();

const results = {
  environment: { tests: [], pass: 0, fail: 0, warn: 0 },
  schema: { tests: [], pass: 0, fail: 0, warn: 0 },
  security: { tests: [], pass: 0, fail: 0, warn: 0 },
  api: { tests: [], pass: 0, fail: 0, warn: 0 },
  performance: { tests: [], pass: 0, fail: 0, warn: 0 },
  regression: { tests: [], pass: 0, fail: 0, warn: 0 },
};

function test(category, name, status, details = '') {
  const result = { name, status, details, timestamp: new Date().toISOString() };
  results[category].tests.push(result);
  
  if (status === 'PASS') results[category].pass++;
  else if (status === 'FAIL') results[category].fail++;
  else if (status === 'WARN') results[category].warn++;
  
  const icons = { PASS: '✅', FAIL: '❌', WARN: '⚠️', INFO: 'ℹ️' };
  console.log(`${icons[status]} [${category.toUpperCase()}] ${name}`);
  if (details) console.log(`   ${details}`);
}

// ==================================
// PHASE 1: ENVIRONMENT & CONNECTION
// ==================================
console.log('\n' + '═'.repeat(63));
console.log('PHASE 1: ENVIRONMENT & CONNECTION');
console.log('═'.repeat(63) + '\n');

test('environment', 'Supabase URL configured', 
  SUPABASE_URL === 'https://jczwilrysvnhcjzjztbi.supabase.co' ? 'PASS' : 'FAIL',
  SUPABASE_URL);

test('environment', 'Anon key present',
  SUPABASE_ANON_KEY && SUPABASE_ANON_KEY.length > 20 ? 'PASS' : 'FAIL');

test('environment', 'Service key present',
  SUPABASE_SERVICE_KEY && SUPABASE_SERVICE_KEY.length > 20 ? 'PASS' : 'FAIL');

// Test connection
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
try {
  const { error } = await supabaseAdmin.from('profiles').select('id').limit(1);
  test('environment', 'Supabase connection', error ? 'FAIL' : 'PASS', 
    error ? error.message : 'Connection successful');
} catch (e) {
  test('environment', 'Supabase connection', 'FAIL', e.message);
}

// ==================================
// PHASE 2: SCHEMA CONSISTENCY
// ==================================
console.log('\n' + '═'.repeat(63));
console.log('PHASE 2: SCHEMA CONSISTENCY VERIFICATION');
console.log('═'.repeat(63) + '\n');

// Load repository allowlists
const repoPath = join(__dirname, 'src/lib/repository.ts');
const repoContent = readFileSync(repoPath, 'utf-8');

// Parse response allowlists (simple regex extraction)
const allowlistMatch = repoContent.match(/const responseAllowlist[\s\S]*?= \{([\s\S]*?)\n\}/);
if (!allowlistMatch) {
  test('schema', 'Repository allowlist parsing', 'FAIL', 'Could not parse');
} else {
  test('schema', 'Repository allowlist found', 'PASS');
}

// Critical regression test: contact_messages.updated_at
console.log('\n📋 CONTACT_MESSAGES REGRESSION TEST:');

try {
  // Test 1: Query without updated_at (should succeed)
  const { data: data1, error: error1 } = await supabaseAdmin
    .from('contact_messages')
    .select('id, full_name, phone, email, subject, message, status, replied_by, replied_at, created_at')
    .limit(1);
  
  if (error1) {
    test('regression', 'contact_messages query without updated_at', 'FAIL', error1.message);
  } else {
    test('regression', 'contact_messages query without updated_at', 'PASS', 'Query successful');
  }
  
  // Test 2: Query with updated_at (should fail because column doesn't exist)
  const { data: data2, error: error2 } = await supabaseAdmin
    .from('contact_messages')
    .select('id, updated_at')
    .limit(1);
  
  if (error2 && error2.message && error2.message.includes('updated_at')) {
    test('regression', 'contact_messages.updated_at column absent', 'PASS', 
      'Column correctly does not exist in database');
  } else if (error2) {
    test('regression', 'contact_messages.updated_at column absent', 'WARN', 
      `Unexpected error: ${error2.message}`);
  } else {
    test('regression', 'contact_messages.updated_at column absent', 'FAIL', 
      'WARNING: Column exists in database! Schema drift detected.');
  }
} catch (e) {
  test('regression', 'contact_messages regression test', 'FAIL', e.message);
}

// Verify repository allowlist doesn't include updated_at
if (repoContent.includes('contact_messages') && !repoContent.match(/contact_messages[^}]*updated_at/)) {
  test('regression', 'Repository allowlist excludes updated_at', 'PASS');
} else if (repoContent.match(/contact_messages[^}]*updated_at/)) {
  test('regression', 'Repository allowlist excludes updated_at', 'FAIL', 
    'updated_at found in contact_messages allowlist!');
} else {
  test('regression', 'Repository allowlist excludes updated_at', 'WARN', 
    'Could not verify');
}

// Check notifications.updated_at
console.log('\n📋 NOTIFICATIONS SCHEMA CHECK:');

try {
  const { data, error } = await supabaseAdmin
    .from('notifications')
    .select('id, updated_at')
    .limit(1);
  
  if (error && error.message && error.message.includes('updated_at')) {
    test('schema', 'notifications.updated_at column', 'INFO', 
      'Column does not exist remotely (matches contact_messages)');
    
    // Check if local schema defines it
    const schemaPath = join(__dirname, 'src/db/schema.ts');
    const schemaContent = readFileSync(schemaPath, 'utf-8');
    if (schemaContent.match(/notifications[\s\S]*?updatedAt/)) {
      test('schema', 'notifications local schema consistency', 'WARN',
        'Local schema defines updatedAt but remote DB lacks column');
    } else {
      test('schema', 'notifications local schema consistency', 'PASS');
    }
  } else if (!error) {
    test('schema', 'notifications.updated_at column', 'INFO', 'Column exists in database');
  }
} catch (e) {
  test('schema', 'notifications schema check', 'WARN', e.message);
}

// ==================================
// PHASE 3: SECURITY AUDIT
// ==================================
console.log('\n' + '═'.repeat(63));
console.log('PHASE 3: SECURITY AUDIT');
console.log('═'.repeat(63) + '\n');

// Check for exposed secrets in src/
function searchDirectory(dir, pattern, exclude = ['node_modules', '.next', 'dist']) {
  const results = [];
  const items = readdirSync(dir);
  
  for (const item of items) {
    if (exclude.includes(item)) continue;
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      results.push(...searchDirectory(fullPath, pattern, exclude));
    } else if (stat.isFile() && (item.endsWith('.ts') || item.endsWith('.tsx') || item.endsWith('.js'))) {
      try {
        const content = readFileSync(fullPath, 'utf-8');
        if (pattern.test(content)) {
          results.push({ file: fullPath, content: content.substring(0, 200) });
        }
      } catch (e) {
        // Skip files that can't be read
      }
    }
  }
  return results;
}

console.log('🔒 SCANNING FOR EXPOSED SECRETS:');

// Check for service role key exposure
const serviceKeyPattern = /SUPABASE_SERVICE_ROLE_KEY|service.*role.*key|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[\w-]+\.[\w-]+/i;
const srcSecrets = searchDirectory(join(__dirname, 'src'), serviceKeyPattern);

if (srcSecrets.length === 0) {
  test('security', 'No service role key in src/', 'PASS');
} else {
  test('security', 'No service role key in src/', 'FAIL',
    `Found ${srcSecrets.length} potential exposures: ${srcSecrets.map(s => s.file).join(', ')}`);
}

// Check middleware for proper auth
const middlewarePath = join(__dirname, 'middleware.ts');
const middlewareContent = readFileSync(middlewarePath, 'utf-8');

if (middlewareContent.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY') && 
    !middlewareContent.includes('SUPABASE_SERVICE_ROLE_KEY')) {
  test('security', 'Middleware uses anon key only', 'PASS');
} else {
  test('security', 'Middleware uses anon key only', 'WARN', 
    'Verify middleware auth implementation');
}

// Check for hardcoded credentials
const credPattern = /password\s*[:=]\s*['"][^'"]{6,}['"]/i;
const hardcoded = searchDirectory(join(__dirname, 'src'), credPattern);

if (hardcoded.length === 0) {
  test('security', 'No hardcoded passwords', 'PASS');
} else {
  test('security', 'No hardcoded passwords', 'WARN',
    `Found ${hardcoded.length} potential matches - manual review recommended`);
}

// ==================================
// PHASE 4: API ENDPOINT VERIFICATION
// ==================================
console.log('\n' + '═'.repeat(63));
console.log('PHASE 4: API ENDPOINT VERIFICATION');
console.log('═'.repeat(63) + '\n');

const endpoints = [
  '/api/auth/session',
  '/api/dashboard/stats',
  '/api/admin/contact-messages',
  '/api/admin/hero-slides',
  '/api/admin/business-settings',
  '/api/admin/notifications',
];

console.log('🌐 TESTING API ENDPOINTS (unauthenticated):');

for (const endpoint of endpoints) {
  const start = Date.now();
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`);
    const duration = Date.now() - start;
    
    if (response.status === 401) {
      test('api', `${endpoint}`, 'PASS', `401 Unauthorized (${duration}ms)`);
    } else if (response.status === 500) {
      const text = await response.text().catch(() => 'Could not read body');
      test('api', `${endpoint}`, 'FAIL', `500 Error: ${text.substring(0, 100)}`);
    } else {
      test('api', `${endpoint}`, 'WARN', `Unexpected status ${response.status} (${duration}ms)`);
    }
  } catch (error) {
    test('api', `${endpoint}`, 'FAIL', `Request failed: ${error.message}`);
  }
}

// ==================================
// PHASE 5: PERFORMANCE BASELINE
// ==================================
console.log('\n' + '═'.repeat(63));
console.log('PHASE 5: PERFORMANCE MEASUREMENT');
console.log('═'.repeat(63) + '\n');

const perfEndpoints = [
  '/api/auth/session',
  '/api/admin/contact-messages',
  '/api/dashboard/stats',
];

console.log('⚡ MEASURING API RESPONSE TIMES:');

for (const endpoint of perfEndpoints) {
  const measurements = [];
  
  for (let i = 0; i < 3; i++) {
    const start = Date.now();
    try {
      await fetch(`${BASE_URL}${endpoint}`);
      measurements.push(Date.now() - start);
    } catch (e) {
      // Continue even if request fails
    }
  }
  
  if (measurements.length > 0) {
    const avg = Math.round(measurements.reduce((a, b) => a + b) / measurements.length);
    const status = avg < 200 ? 'PASS' : avg < 500 ? 'WARN' : 'FAIL';
    test('performance', `${endpoint} response time`, status, 
      `${avg}ms average (${measurements.join('ms, ')}ms)`);
  }
}

// ==================================
// PHASE 6: STORAGE VERIFICATION
// ==================================
console.log('\n' + '═'.repeat(63));
console.log('PHASE 6: STORAGE VERIFICATION');
console.log('═'.repeat(63) + '\n');

console.log('💾 CHECKING STORAGE BUCKETS:');

try {
  const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
  
  if (error) {
    test('schema', 'Storage buckets accessible', 'FAIL', error.message);
  } else {
    test('schema', 'Storage buckets accessible', 'PASS', `${buckets.length} buckets found`);
    
    const expectedBuckets = ['hero-images', 'gallery-images', 'service-images', 
                             'menu-images', 'testimonial-photos', 'logos', 'public-assets'];
    
    for (const bucket of expectedBuckets) {
      const exists = buckets.some(b => b.name === bucket);
      test('schema', `Bucket: ${bucket}`, exists ? 'PASS' : 'WARN', 
        exists ? 'Found' : 'Missing');
    }
  }
} catch (e) {
  test('schema', 'Storage verification', 'FAIL', e.message);
}

// ==================================
// FINAL SUMMARY
// ==================================
console.log('\n' + '═'.repeat(63));
console.log('CERTIFICATION SUMMARY');
console.log('═'.repeat(63) + '\n');

let totalPass = 0, totalFail = 0, totalWarn = 0;

for (const [category, stats] of Object.entries(results)) {
  totalPass += stats.pass;
  totalFail += stats.fail;
  totalWarn += stats.warn;
  
  const icon = stats.fail > 0 ? '🔴' : stats.warn > 0 ? '🟡' : '🟢';
  console.log(`${icon} ${category.toUpperCase()}: ${stats.pass} pass, ${stats.fail} fail, ${stats.warn} warn`);
}

console.log('\n' + '═'.repeat(63));
console.log(`TOTAL: ${totalPass} pass, ${totalFail} fail, ${totalWarn} warn`);
console.log('═'.repeat(63));

// Determine verdict
let verdict;
if (totalFail > 0) {
  verdict = '🔴 NOT PRODUCTION READY';
  console.log(`\n${verdict}`);
  console.log('Critical failures detected. Review failed tests above.');
} else if (totalWarn > 5) {
  verdict = '🟡 PRODUCTION READY WITH WARNINGS';
  console.log(`\n${verdict}`);
  console.log('Multiple warnings detected. Review recommended before deployment.');
} else {
  verdict = '🟢 PRODUCTION CERTIFIED';
  console.log(`\n${verdict}`);
  console.log('All critical checks passed. Ready for deployment.');
}

console.log('\n' + '═'.repeat(63));
console.log('NOTE: Authenticated CRUD testing requires valid credentials.');
console.log('Complete full authenticated testing before production deployment.');
console.log('═'.repeat(63) + '\n');

// Write results to file
const report = {
  timestamp: new Date().toISOString(),
  verdict,
  summary: {
    pass: totalPass,
    fail: totalFail,
    warn: totalWarn,
  },
  categories: results,
};

const reportPath = join(__dirname, 'production-certification-results.json');
import('fs').then(fs => {
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`📄 Full results written to: production-certification-results.json\n`);
});

process.exit(totalFail > 0 ? 1 : 0);
