/**
 * Verification Script: Database Schema Fix
 * Tests all API endpoints to confirm the contact-messages fix
 */

const BASE_URL = 'http://localhost:3000';

const ENDPOINTS_TO_TEST = [
  '/api/auth/session',
  '/api/dashboard/stats',
  '/api/admin/hero-slides',
  '/api/admin/business-settings',
  '/api/admin/website-pages',
  '/api/admin/menu-categories',
  '/api/admin/menu-items',
  '/api/admin/services',
  '/api/admin/contact-messages',  // Previously failing with HTTP 500
  '/api/admin/notifications',
];

async function testEndpoint(endpoint) {
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    const status = response.status;
    const statusText = response.statusText;
    
    let body;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      body = await response.json();
    } else {
      body = await response.text();
    }
    
    return { endpoint, status, statusText, body, success: status === 200 };
  } catch (error) {
    return { endpoint, status: 0, statusText: 'ERROR', error: error.message, success: false };
  }
}

async function runVerification() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('     DATABASE SCHEMA FIX VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════════\n');
  console.log('Testing endpoints after contact_messages schema fix...\n');
  
  const results = [];
  
  for (const endpoint of ENDPOINTS_TO_TEST) {
    process.stdout.write(`Testing ${endpoint}... `);
    const result = await testEndpoint(endpoint);
    results.push(result);
    
    if (result.success) {
      console.log('✅ HTTP 200');
    } else {
      console.log(`❌ HTTP ${result.status}`);
    }
  }
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('DETAILED RESULTS');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  results.forEach(result => {
    console.log(`\n${result.endpoint}`);
    console.log(`  Status: ${result.status} ${result.statusText}`);
    
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    } else if (Array.isArray(result.body)) {
      console.log(`  Response: Array with ${result.body.length} items`);
    } else if (typeof result.body === 'object') {
      if (result.body.error) {
        console.log(`  Error: ${result.body.error.code} - ${result.body.error.message}`);
      } else {
        console.log(`  Response: Object with ${Object.keys(result.body).length} keys`);
      }
    }
  });
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;
  
  console.log(`Total Endpoints: ${results.length}`);
  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Failed: ${failCount}\n`);
  
  const contactMessagesResult = results.find(r => r.endpoint === '/api/admin/contact-messages');
  if (contactMessagesResult) {
    console.log('CRITICAL ENDPOINT: /api/admin/contact-messages');
    if (contactMessagesResult.success) {
      console.log('  ✅ NOW WORKING - Schema mismatch resolved!');
      console.log('  The updated_at column has been removed from expectations.');
      console.log('  Repository now correctly queries only existing columns.\n');
    } else {
      console.log('  ❌ STILL FAILING');
      console.log(`  Status: ${contactMessagesResult.status}`);
      if (contactMessagesResult.body && contactMessagesResult.body.error) {
        console.log(`  Error: ${contactMessagesResult.body.error.message}\n`);
      }
    }
  }
  
  console.log('═══════════════════════════════════════════════════════════════');
  
  if (failCount === 0) {
    console.log('✅ ALL ENDPOINTS PASSING - Database integration verified!\n');
    process.exit(0);
  } else {
    console.log('⚠️  Some endpoints still failing - review errors above\n');
    process.exit(1);
  }
}

runVerification().catch(error => {
  console.error('Verification script error:', error);
  process.exit(1);
});
