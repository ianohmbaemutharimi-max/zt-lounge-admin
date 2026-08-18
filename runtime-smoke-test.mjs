import 'dotenv/config';

const BASE_URL = 'http://localhost:3000';

async function runSmokeTest() {
  console.log('=== ZT LOUNGE ADMIN — RUNTIME SMOKE TEST ===\n');
  console.log(`Server: ${BASE_URL}`);
  console.log(`Time: ${new Date().toISOString()}\n`);
  
  const results = {
    serverHealth: null,
    publicPages: [],
    staticAssets: [],
    apiEndpoints: [],
    imageUrls: [],
    favicon: null,
    optionalChecks: [],
    summary: {
      total: 0,
      passed: 0,
      failed: 0
    }
  };
  
  // Test 1: Server Health
  console.log('## TEST 1: SERVER HEALTH\n');
  try {
    const response = await fetch(BASE_URL);
    const status = response.status;
    const pass = status === 200 || status === 307 || status === 308;
    results.serverHealth = { url: BASE_URL, status, pass };
    console.log(`${pass ? '✅' : '❌'} GET / → HTTP ${status}`);
    results.summary.total++;
    if (pass) results.summary.passed++;
    else results.summary.failed++;
  } catch (e) {
    results.serverHealth = { url: BASE_URL, status: 'ERROR', pass: false, error: e.message };
    console.log(`❌ GET / → ERROR: ${e.message}`);
    results.summary.total++;
    results.summary.failed++;
  }
  
  // Test 2: Public Pages
  console.log('\n## TEST 2: PUBLIC PAGES\n');
  const publicPages = [
    '/login',
    '/unauthorized',
  ];
  
  for (const page of publicPages) {
    try {
      const response = await fetch(BASE_URL + page);
      const status = response.status;
      const pass = status === 200;
      results.publicPages.push({ url: page, status, pass });
      console.log(`${pass ? '✅' : '❌'} GET ${page} → HTTP ${status}`);
      results.summary.total++;
      if (pass) results.summary.passed++;
      else results.summary.failed++;
    } catch (e) {
      results.publicPages.push({ url: page, status: 'ERROR', pass: false, error: e.message });
      console.log(`❌ GET ${page} → ERROR: ${e.message}`);
      results.summary.total++;
      results.summary.failed++;
    }
  }
  
  // Test 3: Favicon
  console.log('\n## TEST 3: FAVICON\n');
  try {
    const response = await fetch(BASE_URL + '/favicon.ico');
    const status = response.status;
    const contentType = response.headers.get('content-type');
    const pass = status === 200;
    results.favicon = { url: '/favicon.ico', status, contentType, pass };
    console.log(`${pass ? '✅' : '❌'} GET /favicon.ico → HTTP ${status} (${contentType})`);
    results.summary.total++;
    if (pass) results.summary.passed++;
    else results.summary.failed++;
  } catch (e) {
    results.favicon = { url: '/favicon.ico', status: 'ERROR', pass: false, error: e.message };
    console.log(`❌ GET /favicon.ico → ERROR: ${e.message}`);
    results.summary.total++;
    results.summary.failed++;
  }
  
  // Test 4: Supabase Storage Images (Sample)
  console.log('\n## TEST 4: SUPABASE STORAGE IMAGES (Sample)\n');
  const storageImages = [
    'https://jczwilrysvnhcjzjztbi.supabase.co/storage/v1/object/public/hero-images/hero-restaurant.webp',
    'https://jczwilrysvnhcjzjztbi.supabase.co/storage/v1/object/public/hero-images/hero-lounge.webp',
    'https://jczwilrysvnhcjzjztbi.supabase.co/storage/v1/object/public/gallery-images/gallery-01.webp',
    'https://jczwilrysvnhcjzjztbi.supabase.co/storage/v1/object/public/service-images/lounge-interior-main.webp',
    'https://jczwilrysvnhcjzjztbi.supabase.co/storage/v1/object/public/menu-images/nyama-choma.webp',
    'https://jczwilrysvnhcjzjztbi.supabase.co/storage/v1/object/public/logos/logo.webp',
  ];
  
  for (const imageUrl of storageImages) {
    try {
      const response = await fetch(imageUrl, { method: 'HEAD' });
      const status = response.status;
      const contentType = response.headers.get('content-type');
      const pass = status === 200;
      const shortUrl = imageUrl.split('/').pop();
      results.imageUrls.push({ url: imageUrl, status, contentType, pass });
      console.log(`${pass ? '✅' : '❌'} HEAD ${shortUrl} → HTTP ${status} (${contentType})`);
      results.summary.total++;
      if (pass) results.summary.passed++;
      else results.summary.failed++;
    } catch (e) {
      results.imageUrls.push({ url: imageUrl, status: 'ERROR', pass: false, error: e.message });
      console.log(`❌ HEAD ${imageUrl} → ERROR: ${e.message}`);
      results.summary.total++;
      results.summary.failed++;
    }
  }
  
  // Test 5: API Endpoints (Authentication) - REQUIRED
  console.log('\n## TEST 5: API ENDPOINTS (Authentication) — REQUIRED\n');
  const requiredApiEndpoints = [
    '/api/admin/hero-slides',
    '/api/admin/gallery',
    '/api/admin/services',
    '/api/admin/menu-items',
    '/api/admin/business-settings',
  ];
  
  for (const endpoint of requiredApiEndpoints) {
    try {
      const response = await fetch(BASE_URL + endpoint);
      const status = response.status;
      // Admin endpoints should return 401/403 (auth required)
      const pass = status === 401 || status === 403 || status === 307;
      results.apiEndpoints.push({ url: endpoint, status, pass, note: 'Auth required' });
      console.log(`${pass ? '✅' : '❌'} GET ${endpoint} → HTTP ${status}`);
      results.summary.total++;
      if (pass) results.summary.passed++;
      else results.summary.failed++;
    } catch (e) {
      results.apiEndpoints.push({ url: endpoint, status: 'ERROR', pass: false, error: e.message });
      console.log(`❌ GET ${endpoint} → ERROR: ${e.message}`);
      results.summary.total++;
      results.summary.failed++;
    }
  }
  
  // Optional: Health endpoint check (not required for CMS functionality)
  console.log('\n## OPTIONAL: HEALTH ENDPOINT\n');
  try {
    const response = await fetch(BASE_URL + '/api/health');
    const status = response.status;
    const implemented = status === 200;
    results.optionalChecks.push({ 
      url: '/api/health', 
      status, 
      implemented,
      note: 'Optional monitoring endpoint - not required for CMS functionality'
    });
    console.log(`ℹ️  GET /api/health → HTTP ${status} ${implemented ? '(IMPLEMENTED)' : '(NOT IMPLEMENTED - OK)'}`);
  } catch (e) {
    results.optionalChecks.push({ 
      url: '/api/health', 
      status: 'ERROR',
      implemented: false,
      note: 'Optional monitoring endpoint - not required for CMS functionality',
      error: e.message
    });
    console.log(`ℹ️  GET /api/health → ERROR: ${e.message} (NOT IMPLEMENTED - OK)`);
  }
  
  // Test 6: Check for legacy asset references in rendered HTML
  console.log('\n## TEST 6: LEGACY ASSET REFERENCES CHECK\n');
  try {
    const response = await fetch(BASE_URL + '/login');
    const html = await response.text();
    
    const legacyPatterns = [
      /assets\/images\//g,
      /zt-lounge\/assets/g,
      /\.\.\/\.\.\/zt-lounge/g,
    ];
    
    let legacyFound = false;
    for (const pattern of legacyPatterns) {
      const matches = html.match(pattern);
      if (matches && matches.length > 0) {
        console.log(`❌ Found legacy pattern: ${pattern} (${matches.length} occurrences)`);
        legacyFound = true;
      }
    }
    
    if (!legacyFound) {
      console.log('✅ No legacy asset references found in HTML');
    }
    
    results.summary.total++;
    if (!legacyFound) results.summary.passed++;
    else results.summary.failed++;
  } catch (e) {
    console.log(`❌ Error checking HTML: ${e.message}`);
    results.summary.total++;
    results.summary.failed++;
  }
  
  // Summary
  console.log('\n=== TEST SUMMARY ===');
  console.log(`Required Production Tests: ${results.summary.total}`);
  console.log(`✅ Passed: ${results.summary.passed}`);
  console.log(`❌ Failed: ${results.summary.failed}`);
  console.log(`Success Rate: ${((results.summary.passed / results.summary.total) * 100).toFixed(1)}%`);
  
  if (results.optionalChecks.length > 0) {
    console.log(`\nℹ️  Optional Checks: ${results.optionalChecks.length} (not included in score)`);
  }
  
  // Save results
  const fs = await import('fs');
  fs.writeFileSync('runtime-smoke-test-results.json', JSON.stringify(results, null, 2));
  console.log('\n✅ Results saved to runtime-smoke-test-results.json');
  
  // Exit with appropriate code
  process.exit(results.summary.failed === 0 ? 0 : 1);
}

runSmokeTest().catch(e => {
  console.error('Test suite error:', e);
  process.exit(1);
});
