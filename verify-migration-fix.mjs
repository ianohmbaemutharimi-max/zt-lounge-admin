#!/usr/bin/env node
/**
 * PHASE 3: Verify that the APIs return 200 after migration
 * Tests the 4 endpoints that were previously returning 500
 */

import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3000';
const ENDPOINTS = [
  '/api/admin/menu-items',
  '/api/admin/services',
  '/api/admin/gallery',
  '/api/admin/hero-slides'
];

async function testEndpoints() {
  console.log('====================================================================');
  console.log('PHASE 3 — API ENDPOINT VERIFICATION');
  console.log('====================================================================\n');
  
  const results = [];
  
  for (const endpoint of ENDPOINTS) {
    try {
      console.log(`Testing: ${endpoint}`);
      const response = await fetch(`${BASE_URL}${endpoint}`);
      const status = response.status;
      const data = await response.json().catch(() => null);
      
      const passed = status === 200;
      results.push({
        endpoint,
        status,
        passed,
        error: passed ? null : (data?.error || response.statusText)
      });
      
      console.log(`  Status: ${status} ${passed ? '✅ PASS' : '❌ FAIL'}`);
      if (!passed && data?.error) {
        console.log(`  Error: ${JSON.stringify(data.error).substring(0, 100)}`);
      }
    } catch (err) {
      console.log(`  Error: ${err.message}`);
      results.push({
        endpoint,
        status: 'ERROR',
        passed: false,
        error: err.message
      });
    }
    console.log();
  }
  
  // Summary
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  console.log('====================================================================');
  console.log('SUMMARY');
  console.log('====================================================================');
  console.log(`Results: ${passed}/${total} endpoints returned 200\n`);
  
  if (passed === total) {
    console.log('✅ ALL TESTS PASSED — Migration fix successful!');
    console.log('The following endpoints are now working:');
    results.forEach(r => console.log(`  - ${r.endpoint}`));
  } else {
    console.log('❌ SOME TESTS FAILED');
    results.forEach(r => {
      if (!r.passed) {
        console.log(`  - ${r.endpoint}: ${r.status} (${r.error})`);
      }
    });
  }
  
  process.exit(passed === total ? 0 : 1);
}

testEndpoints();
