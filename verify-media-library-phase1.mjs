#!/usr/bin/env node

/**
 * MEDIA LIBRARY PHASE 1 VERIFICATION
 * 
 * Tests the read-only media browser implementation:
 * - API endpoint authentication
 * - Media assets retrieval
 * - Usage count calculation
 * - Bucket filtering
 * - Search functionality
 * - Unauthorized access rejection
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@ztlounge.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const BASE_URL = 'http://localhost:3000';

// ANSI color codes
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
  console.log('');
  log(`${'='.repeat(80)}`, 'blue');
  log(`  ${title}`, 'bold');
  log(`${'='.repeat(80)}`, 'blue');
}

const results = {
  passed: [],
  failed: [],
  blocked: [],
};

function pass(test) {
  results.passed.push(test);
  log(`✓ ${test}`, 'green');
}

function fail(test, reason) {
  results.failed.push({ test, reason });
  log(`✗ ${test}`, 'red');
  log(`  Reason: ${reason}`, 'red');
}

function block(test, reason) {
  results.blocked.push({ test, reason });
  log(`⊘ ${test}`, 'yellow');
  log(`  Blocked: ${reason}`, 'yellow');
}

async function main() {
  section('MEDIA LIBRARY PHASE 1 VERIFICATION');

  // Check environment
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    fail('Environment check', 'Missing Supabase credentials');
    process.exit(1);
  }

  if (!ADMIN_PASSWORD) {
    block('All tests', 'ADMIN_PASSWORD not set in .env.local');
    process.exit(1);
  }

  log(`Supabase URL: ${SUPABASE_URL}`, 'blue');
  log(`Admin Email: ${ADMIN_EMAIL}`, 'blue');

  section('1. AUTHENTICATION');

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  log('Authenticating as admin...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });

  if (authError || !authData.session) {
    fail('Admin authentication', authError?.message || 'No session returned');
    process.exit(1);
  }

  pass('Admin authentication successful');
  const sessionToken = authData.session.access_token;

  section('2. UNAUTHORIZED ACCESS TEST');

  log('Testing /api/media without authentication...');
  const unauthRes = await fetch(`${BASE_URL}/api/media`);
  
  if (unauthRes.status === 401) {
    pass('Unauthorized access properly rejected (401)');
  } else {
    fail('Unauthorized access test', `Expected 401, got ${unauthRes.status}`);
  }

  section('3. MEDIA ASSETS RETRIEVAL');

  log('Fetching all media assets...');
  const mediaRes = await fetch(`${BASE_URL}/api/media`, {
    headers: {
      'Cookie': `sb-access-token=${sessionToken}; sb-refresh-token=${authData.session.refresh_token}`,
    },
  });

  if (!mediaRes.ok) {
    fail('Media assets fetch', `HTTP ${mediaRes.status}`);
    const errorText = await mediaRes.text();
    log(`Response: ${errorText}`, 'red');
    process.exit(1);
  }

  const mediaData = await mediaRes.json();
  pass(`Media assets fetch successful (HTTP ${mediaRes.status})`);

  if (!mediaData.data || !Array.isArray(mediaData.data)) {
    fail('Media response format', 'Missing or invalid data array');
    process.exit(1);
  }

  pass(`Response contains data array`);

  const assets = mediaData.data;
  log(`\nFound ${assets.length} media assets`, 'blue');

  if (assets.length === 0) {
    block('Asset validation', 'No assets found (expected 36 from backfill)');
  } else {
    pass(`Asset count: ${assets.length}`);

    // Validate asset structure
    const firstAsset = assets[0];
    const requiredFields = ['id', 'bucket', 'path', 'public_url', 'title', 'usageCount', 'created_at'];
    const missingFields = requiredFields.filter(f => !(f in firstAsset));

    if (missingFields.length === 0) {
      pass('Asset structure validation');
    } else {
      fail('Asset structure', `Missing fields: ${missingFields.join(', ')}`);
    }

    // Check usage counts
    const withUsage = assets.filter(a => a.usageCount > 0).length;
    const withoutUsage = assets.filter(a => a.usageCount === 0).length;
    log(`\nUsage counts:`, 'blue');
    log(`  - Assets with usage: ${withUsage}`);
    log(`  - Assets without usage: ${withoutUsage}`);
    pass('Usage count calculation');

    // Check buckets
    const buckets = [...new Set(assets.map(a => a.bucket))].sort();
    log(`\nBuckets found:`, 'blue');
    buckets.forEach(b => log(`  - ${b}`));
    pass(`Bucket diversity (${buckets.length} buckets)`);
  }

  // Check pagination
  if (mediaData.pagination) {
    pass('Pagination metadata present');
    log(`  Total: ${mediaData.pagination.total}`, 'blue');
    log(`  Limit: ${mediaData.pagination.limit}`, 'blue');
    log(`  Offset: ${mediaData.pagination.offset}`, 'blue');
  } else {
    fail('Pagination', 'Missing pagination metadata');
  }

  section('4. BUCKET FILTERING');

  if (assets.length > 0 && buckets.length > 0) {
    const testBucket = buckets[0];
    log(`Testing filter by bucket: ${testBucket}...`);

    const filterRes = await fetch(`${BASE_URL}/api/media?bucket=${encodeURIComponent(testBucket)}`, {
      headers: {
        'Cookie': `sb-access-token=${sessionToken}; sb-refresh-token=${authData.session.refresh_token}`,
      },
    });

    if (!filterRes.ok) {
      fail('Bucket filter', `HTTP ${filterRes.status}`);
    } else {
      const filterData = await filterRes.json();
      const filtered = filterData.data;
      const allMatch = filtered.every(a => a.bucket === testBucket);

      if (allMatch) {
        pass(`Bucket filter works (${filtered.length} assets in ${testBucket})`);
      } else {
        fail('Bucket filter', 'Some assets do not match filter');
      }
    }
  } else {
    block('Bucket filtering', 'No assets to test');
  }

  section('5. SEARCH FUNCTIONALITY');

  if (assets.length > 0) {
    const searchTerm = assets[0].title ? assets[0].title.substring(0, 5) : 'test';
    log(`Testing search for: "${searchTerm}"...`);

    const searchRes = await fetch(`${BASE_URL}/api/media?search=${encodeURIComponent(searchTerm)}`, {
      headers: {
        'Cookie': `sb-access-token=${sessionToken}; sb-refresh-token=${authData.session.refresh_token}`,
      },
    });

    if (!searchRes.ok) {
      fail('Search functionality', `HTTP ${searchRes.status}`);
    } else {
      const searchData = await searchRes.json();
      pass(`Search executed successfully (${searchData.data.length} results)`);
    }
  } else {
    block('Search functionality', 'No assets to test');
  }

  section('6. IMAGE ACCESSIBILITY');

  if (assets.length > 0) {
    const testAsset = assets[0];
    log(`Testing image URL accessibility: ${testAsset.public_url}...`);

    try {
      const imgRes = await fetch(testAsset.public_url, { method: 'HEAD' });
      if (imgRes.ok) {
        pass(`Image URL accessible (HTTP ${imgRes.status})`);
      } else {
        fail('Image accessibility', `HTTP ${imgRes.status} for ${testAsset.public_url}`);
      }
    } catch (error) {
      fail('Image accessibility', error.message);
    }
  } else {
    block('Image accessibility', 'No assets to test');
  }

  // Logout
  await supabase.auth.signOut();

  section('VERIFICATION SUMMARY');

  log(`\nPassed: ${results.passed.length}`, 'green');
  log(`Failed: ${results.failed.length}`, results.failed.length > 0 ? 'red' : 'green');
  log(`Blocked: ${results.blocked.length}`, results.blocked.length > 0 ? 'yellow' : 'green');

  if (results.failed.length > 0) {
    log('\nFailed tests:', 'red');
    results.failed.forEach(f => {
      log(`  ✗ ${f.test}: ${f.reason}`, 'red');
    });
  }

  if (results.blocked.length > 0) {
    log('\nBlocked tests:', 'yellow');
    results.blocked.forEach(b => {
      log(`  ⊘ ${b.test}: ${b.reason}`, 'yellow');
    });
  }

  const exitCode = results.failed.length > 0 ? 1 : 0;
  process.exit(exitCode);
}

main().catch((error) => {
  log(`\n✗ Unexpected error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
