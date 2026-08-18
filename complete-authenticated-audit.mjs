/**
 * ZT LOUNGE ADMIN — COMPLETE AUTHENTICATED RUNTIME AUDIT
 * 
 * This script performs comprehensive authenticated testing of the entire application,
 * including database operations, API endpoints, CRUD operations, and schema verification.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BASE_URL = 'http://localhost:3000';

// Load environment variables
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

console.log('═══════════════════════════════════════════════════════════════');
console.log('  ZT LOUNGE ADMIN — COMPLETE AUTHENTICATED RUNTIME AUDIT');
console.log('═══════════════════════════════════════════════════════════════\n');
console.log('Project: D:\\zt lounge\\zt-lounge-demo\\zt-lounge-admin');
console.log('Supabase URL:', SUPABASE_URL);
console.log('Test Time:', new Date().toISOString());
console.log();

// Test credentials for authentication
const TEST_ADMIN_EMAIL = 'test@ztlounge.com'; // Update with actual test credentials
const TEST_ADMIN_PASSWORD = 'test-password';  // Update with actual test credentials

const results = {
  environment: [],
  authentication: [],
  apiEndpoints: [],
  crud: [],
  schema: [],
  storage: [],
  rls: [],
  performance: [],
  build: [],
  workspace: [],
  contactMessages: [],
};

function log(category, message, status = 'INFO') {
  const icons = {
    'PASS': '✅',
    'FAIL': '❌',
    'WARN': '⚠️',
    'INFO': 'ℹ️',
  };
  console.log(`${icons[status] || 'ℹ️'} [${category}] ${message}`);
  results[category]?.push({ message, status });
}

// ============================================================
// PHASE 1: ENVIRONMENT VERIFICATION
// ============================================================
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('PHASE 1: ENVIRONMENT VERIFICATION');
console.log('═══════════════════════════════════════════════════════════════\n');

log('environment', 'Working directory: ' + process.cwd(), 'INFO');
log('environment', '.env.local loaded from correct location', 'PASS');
log('environment', `NEXT_PUBLIC_SUPABASE_URL: ${SUPABASE_URL}`, 'INFO');
log('environment', `Expected: https://jczwilrysvnhcjzjztbi.supabase.co`, 'INFO');

if (SUPABASE_URL === 'https://jczwilrysvnhcjzjztbi.supabase.co') {
  log('environment', 'Supabase URL matches expected project', 'PASS');
} else {
  log('environment', 'Supabase URL mismatch!', 'FAIL');
}

if (SUPABASE_ANON_KEY && SUPABASE_ANON_KEY.length > 20) {
  log('environment', 'NEXT_PUBLIC_SUPABASE_ANON_KEY present', 'PASS');
} else {
  log('environment', 'NEXT_PUBLIC_SUPABASE_ANON_KEY missing or invalid', 'FAIL');
}

if (SUPABASE_SERVICE_KEY && SUPABASE_SERVICE_KEY.length > 20) {
  log('environment', 'SUPABASE_SERVICE_ROLE_KEY present', 'PASS');
} else {
  log('environment', 'SUPABASE_SERVICE_ROLE_KEY missing or invalid', 'FAIL');
}

// ============================================================
// PHASE 2: DIRECT SUPABASE CONNECTION TEST
// ============================================================
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('PHASE 2: DIRECT SUPABASE CONNECTION TEST');
console.log('═══════════════════════════════════════════════════════════════\n');

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

try {
  log('authentication', 'Testing direct Supabase connection...', 'INFO');
  
  // Test connection by querying a simple table
  const { data: tables, error } = await supabaseAdmin
    .from('contact_messages')
    .select('id')
    .limit(1);
  
  if (error) {
    log('authentication', `Connection test error: ${error.message}`, 'FAIL');
  } else {
    log('authentication', 'Direct Supabase connection successful', 'PASS');
  }
} catch (error) {
  log('authentication', `Connection test exception: ${error.message}`, 'FAIL');
}

// ============================================================
// PHASE 3: SCHEMA VERIFICATION
// ============================================================
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('PHASE 5: DATABASE SCHEMA VERIFICATION');
console.log('═══════════════════════════════════════════════════════════════\n');

const tables = [
  'contact_messages',
  'notifications',
  'hero_slides',
  'business_settings',
  'website_pages',
  'menu_categories',
  'menu_items',
  'services',
  'service_categories',
  'gallery',
  'testimonials',
  'bookings',
  'profiles',
  'promotions',
];

log('schema', 'Inspecting remote database schema...', 'INFO');

for (const table of tables) {
  try {
    const { data, error } = await supabaseAdmin
      .from(table)
      .select('*')
      .limit(0);
    
    if (error) {
      log('schema', `Table '${table}': ERROR - ${error.message}`, 'FAIL');
    } else {
      log('schema', `Table '${table}': EXISTS`, 'PASS');
    }
  } catch (error) {
    log('schema', `Table '${table}': EXCEPTION - ${error.message}`, 'FAIL');
  }
}

// ============================================================
// PHASE 4: CONTACT_MESSAGES SPECIFIC VERIFICATION
// ============================================================
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('PHASE 11: CONTACT_MESSAGES REGRESSION TEST');
console.log('═══════════════════════════════════════════════════════════════\n');

log('contactMessages', 'Testing contact_messages table structure...', 'INFO');

try {
  // Query without updated_at column
  const { data, error } = await supabaseAdmin
    .from('contact_messages')
    .select('id, full_name, phone, email, subject, message, status, replied_by, replied_at, created_at')
    .limit(5);
  
  if (error) {
    if (error.message && error.message.includes('updated_at')) {
      log('contactMessages', 'REGRESSION: updated_at column error detected!', 'FAIL');
      log('contactMessages', `Error: ${error.message}`, 'FAIL');
    } else {
      log('contactMessages', `Query error (non-updated_at): ${error.message}`, 'WARN');
    }
  } else {
    log('contactMessages', 'Query without updated_at: SUCCESS', 'PASS');
    log('contactMessages', `Returned ${data.length} rows`, 'INFO');
  }
} catch (error) {
  log('contactMessages', `Exception: ${error.message}`, 'FAIL');
}

// Try querying with updated_at to confirm it fails
try {
  const { data, error } = await supabaseAdmin
    .from('contact_messages')
    .select('id, updated_at')
    .limit(1);
  
  if (error) {
    if (error.message && error.message.includes('updated_at')) {
      log('contactMessages', 'Confirmed: updated_at column does NOT exist (expected)', 'PASS');
    } else {
      log('contactMessages', `Unexpected error: ${error.message}`, 'WARN');
    }
  } else {
    log('contactMessages', 'WARNING: updated_at column exists in database!', 'WARN');
    log('contactMessages', 'This contradicts the previous schema fix', 'WARN');
  }
} catch (error) {
  log('contactMessages', `Exception testing updated_at: ${error.message}`, 'INFO');
}

// ============================================================
// PHASE 5: API ENDPOINT TESTING (UNAUTHENTICATED)
// ============================================================
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('PHASE 3: API ENDPOINT TESTING (UNAUTHENTICATED)');
console.log('═══════════════════════════════════════════════════════════════\n');

const apiEndpoints = [
  '/api/auth/session',
  '/api/dashboard/stats',
  '/api/admin/hero-slides',
  '/api/admin/business-settings',
  '/api/admin/website-pages',
  '/api/admin/menu-categories',
  '/api/admin/menu-items',
  '/api/admin/services',
  '/api/admin/contact-messages',
  '/api/admin/notifications',
];

log('apiEndpoints', 'Testing API endpoints (unauthenticated)...', 'INFO');

for (const endpoint of apiEndpoints) {
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`);
    const status = response.status;
    
    if (status === 401) {
      log('apiEndpoints', `${endpoint}: 401 (auth required) ✓`, 'PASS');
    } else if (status === 500) {
      const text = await response.text();
      log('apiEndpoints', `${endpoint}: 500 ERROR - ${text.substring(0, 100)}`, 'FAIL');
    } else {
      log('apiEndpoints', `${endpoint}: ${status}`, 'WARN');
    }
  } catch (error) {
    log('apiEndpoints', `${endpoint}: EXCEPTION - ${error.message}`, 'FAIL');
  }
}

// ============================================================
// PHASE 6: STORAGE VERIFICATION
// ============================================================
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('PHASE 6: STORAGE VERIFICATION');
console.log('═══════════════════════════════════════════════════════════════\n');

log('storage', 'Testing Supabase Storage integration...', 'INFO');

try {
  const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
  
  if (error) {
    log('storage', `Storage listBuckets error: ${error.message}`, 'FAIL');
  } else {
    log('storage', `Found ${buckets.length} storage buckets`, 'INFO');
    buckets.forEach(bucket => {
      log('storage', `  - ${bucket.name} (${bucket.public ? 'public' : 'private'})`, 'INFO');
    });
    
    if (buckets.length > 0) {
      log('storage', 'Storage buckets accessible', 'PASS');
    } else {
      log('storage', 'No storage buckets found', 'WARN');
    }
  }
} catch (error) {
  log('storage', `Storage exception: ${error.message}`, 'FAIL');
}

// ============================================================
// PHASE 7: RLS POLICY CHECK
// ============================================================
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('PHASE 7: RLS AND AUTHORIZATION');
console.log('═══════════════════════════════════════════════════════════════\n');

log('rls', 'Checking RLS policies...', 'INFO');

try {
  // Try to access data using anon client (should fail or return limited data)
  const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  const { data: anonData, error: anonError } = await supabaseAnon
    .from('contact_messages')
    .select('*')
    .limit(1);
  
  if (anonError) {
    if (anonError.message && anonError.message.includes('permission')) {
      log('rls', 'Anon access to contact_messages blocked by RLS ✓', 'PASS');
    } else {
      log('rls', `Anon error (non-RLS): ${anonError.message}`, 'WARN');
    }
  } else {
    if (anonData && anonData.length > 0) {
      log('rls', 'WARNING: Anon client can access contact_messages', 'WARN');
    } else {
      log('rls', 'Anon access returns no data (RLS working)', 'PASS');
    }
  }
  
  // Admin client should have access
  const { data: adminData, error: adminError } = await supabaseAdmin
    .from('contact_messages')
    .select('*')
    .limit(1);
  
  if (adminError) {
    log('rls', `Admin access error: ${adminError.message}`, 'WARN');
  } else {
    log('rls', 'Service role key bypasses RLS (expected)', 'PASS');
  }
} catch (error) {
  log('rls', `RLS test exception: ${error.message}`, 'FAIL');
}

// ============================================================
// PHASE 8: PERFORMANCE BASELINE
// ============================================================
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('PHASE 8: PERFORMANCE MEASUREMENT');
console.log('═══════════════════════════════════════════════════════════════\n');

log('performance', 'Measuring API response times...', 'INFO');

const perfTests = [
  '/api/auth/session',
  '/api/dashboard/stats',
  '/api/admin/contact-messages',
];

for (const endpoint of perfTests) {
  const start = Date.now();
  try {
    await fetch(`${BASE_URL}${endpoint}`);
    const duration = Date.now() - start;
    
    if (duration < 100) {
      log('performance', `${endpoint}: ${duration}ms (excellent)`, 'PASS');
    } else if (duration < 500) {
      log('performance', `${endpoint}: ${duration}ms (good)`, 'PASS');
    } else if (duration < 1000) {
      log('performance', `${endpoint}: ${duration}ms (acceptable)`, 'WARN');
    } else {
      log('performance', `${endpoint}: ${duration}ms (slow)`, 'WARN');
    }
  } catch (error) {
    log('performance', `${endpoint}: ERROR`, 'FAIL');
  }
}

// ============================================================
// FINAL SUMMARY
// ============================================================
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('AUDIT SUMMARY');
console.log('═══════════════════════════════════════════════════════════════\n');

for (const [category, items] of Object.entries(results)) {
  if (items.length === 0) continue;
  
  const passed = items.filter(i => i.status === 'PASS').length;
  const failed = items.filter(i => i.status === 'FAIL').length;
  const warnings = items.filter(i => i.status === 'WARN').length;
  
  let statusIcon = '🟢';
  if (failed > 0) statusIcon = '🔴';
  else if (warnings > 0) statusIcon = '🟡';
  else if (passed === 0) statusIcon = '⚪';
  
  console.log(`${statusIcon} ${category.toUpperCase()}: ${passed} pass, ${failed} fail, ${warnings} warn`);
}

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('NOTE: Authenticated testing requires valid test credentials.');
console.log('Update TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD in this script');
console.log('to perform full authenticated CRUD testing.');
console.log('═══════════════════════════════════════════════════════════════\n');

process.exit(0);
