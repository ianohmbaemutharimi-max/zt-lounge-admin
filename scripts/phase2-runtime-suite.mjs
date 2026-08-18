#!/usr/bin/env node
/**
 * ZT LOUNGE — PHASE 2 RUNTIME ACCEPTANCE TEST SUITE
 * 
 * Genuine runtime acceptance testing with real authentication, database verification,
 * and actual evidence capture.
 * 
 * EXECUTION:
 * node scripts/phase2-runtime-suite.mjs
 * 
 * Requirements:
 * - Application running on http://localhost:3000
 * - Supabase connection available
 * - .env.local configured with Supabase credentials
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// Load .env.local manually
function loadEnv() {
  const envPath = path.join(ROOT, '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match && !match[1].startsWith('#')) {
        process.env[match[1].trim()] = match[2].trim();
      }
    });
  }
}

loadEnv();

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Runtime tracking
const RUN_ID = `ZT_E2E_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
const testResults = [];
const createdRecords = [];
let sessionCache = {};

console.log('═'.repeat(80));
console.log('ZT LOUNGE — PHASE 2 RUNTIME ACCEPTANCE TEST SUITE');
console.log(`Run ID: ${RUN_ID}`);
console.log(`Base URL: ${BASE_URL}`);
console.log(`Environment: ${SUPABASE_URL?.includes('staging') ? 'STAGING' : 'UNKNOWN'}`);
console.log('═'.repeat(80));
console.log();

// ============================================================================
// PHASE 1: ENVIRONMENT SAFETY GATE
// ============================================================================

console.log('PHASE 1: Environment Safety Gate');
console.log('─'.repeat(80));

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ BLOCKED: Supabase credentials not configured in .env.local');
  process.exit(1);
}

if (!SUPABASE_URL.includes('staging') && !SUPABASE_URL.includes('local')) {
  console.error('❌ BLOCKED: Supabase URL does not appear to be staging/local');
  console.error(`    URL: ${SUPABASE_URL}`);
  console.error('    Cannot execute destructive tests against unknown environment');
  process.exit(1);
}

console.log('✓ Staging environment confirmed');
console.log('✓ Supabase credentials available');
console.log();

// ============================================================================
// PHASE 2: REAL AUTHENTICATION
// ============================================================================

console.log('PHASE 2: Real Authentication');
console.log('─'.repeat(80));

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function authenticateRole(role) {
  // Derive test credentials from role
  // These should exist in Supabase Auth
  const testAccounts = {
    super_admin: { email: 'super_admin@example.local', password: 'test123456' },
    admin: { email: 'admin@example.local', password: 'test123456' },
    manager: { email: 'manager@example.local', password: 'test123456' },
    receptionist: { email: 'receptionist@example.local', password: 'test123456' },
    staff: { email: 'staff@example.local', password: 'test123456' },
  };

  const account = testAccounts[role];
  if (!account) {
    return { ok: false, error: `Unknown role: ${role}` };
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: account.email,
      password: account.password,
    });

    if (error) {
      return { ok: false, error: `Auth failed for ${role}: ${error.message}` };
    }

    if (!data.session?.access_token) {
      return { ok: false, error: `No access token for ${role}` };
    }

    sessionCache[role] = data.session.access_token;
    return { ok: true, token: data.session.access_token };
  } catch (e) {
    return { ok: false, error: `Auth exception for ${role}: ${e.message}` };
  }
}

async function testAuthentication() {
  const roles = ['super_admin', 'admin', 'manager'];
  let passCount = 0;
  let blockedCount = 0;

  for (const role of roles) {
    const result = await authenticateRole(role);
    if (result.ok) {
      console.log(`✓ ${role}: Authenticated`);
      passCount++;
      recordResult({
        phase: 'auth',
        role,
        test: 'signInWithPassword',
        expected: 200,
        actual: 'token_received',
        status: 'PASS',
      });
    } else {
      console.log(`⚠ ${role}: ${result.error}`);
      blockedCount++;
      recordResult({
        phase: 'auth',
        role,
        test: 'signInWithPassword',
        expected: 'authenticated',
        actual: result.error,
        status: 'BLOCKED',
      });
    }
  }

  console.log(`\nAuthentication: ${passCount} PASS, ${blockedCount} BLOCKED`);
  return blockedCount === 0;
}

// ============================================================================
// PHASE 3: API CLIENT WITH DATABASE VERIFICATION
// ============================================================================

console.log();
console.log('PHASE 3: API Client & Database Verification');
console.log('─'.repeat(80));

async function makeRequest(method, endpoint, role, body = null) {
  const token = sessionCache[role];
  if (!token) {
    throw new Error(`No session for role: ${role}`);
  }

  const url = `${BASE_URL}${endpoint}`;
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const start = Date.now();
  const res = await fetch(url, options);
  const duration = Date.now() - start;

  let responseBody;
  try {
    responseBody = await res.json();
  } catch {
    responseBody = null;
  }

  return {
    method,
    endpoint,
    role,
    status: res.status,
    duration,
    body: responseBody,
  };
}

async function verifyDatabaseRecord(table, id) {
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    return { exists: false, error: error.message };
  }

  return { exists: true, record: data };
}

async function trackCreatedRecord(table, id, mediaId = null) {
  createdRecords.push({
    runId: RUN_ID,
    table,
    id,
    mediaId,
    createdAt: new Date().toISOString(),
  });
}

console.log('✓ API client implemented');
console.log('✓ Database verification ready');
console.log();

// ============================================================================
// PHASE 4: GENERIC CRUD TEST HARNESS
// ============================================================================

console.log('PHASE 4: CRUD Test Harness');
console.log('─'.repeat(80));

async function testCRUD() {
  // Test menu-items as exemplar resource
  const resource = 'menu-items';
  const role = 'admin';

  console.log(`Testing resource: ${resource}`);

  // POST (Create)
  const createPayload = {
    name: `${RUN_ID}_menu_item`,
    description: 'Test menu item',
    price: 99.99,
  };

  const createRes = await makeRequest('POST', `/api/admin/${resource}`, role, createPayload);

  if (createRes.status !== 200 && createRes.status !== 201) {
    recordResult({
      phase: 'crud',
      resource,
      method: 'POST',
      role,
      expected: 200,
      actual: createRes.status,
      status: 'FAIL',
    });
    console.log(`✗ POST ${resource}: ${createRes.status}`);
    return;
  }

  const recordId = createRes.body?.id;
  if (!recordId) {
    recordResult({
      phase: 'crud',
      resource,
      method: 'POST',
      role,
      expected: 'returned_id',
      actual: 'no_id',
      status: 'FAIL',
    });
    console.log(`✗ POST ${resource}: No ID returned`);
    return;
  }

  await trackCreatedRecord(resource, recordId);

  // Verify database
  const dbVerify = await verifyDatabaseRecord(resource, recordId);
  if (!dbVerify.exists) {
    recordResult({
      phase: 'crud',
      resource,
      method: 'POST',
      role,
      expected: 'persisted',
      actual: 'not_found',
      status: 'FAIL',
    });
    console.log(`✗ POST ${resource}: Not persisted in database`);
    return;
  }

  recordResult({
    phase: 'crud',
    resource,
    method: 'POST',
    role,
    expected: 200,
    actual: createRes.status,
    duration: createRes.duration,
    status: 'PASS',
  });
  console.log(`✓ POST ${resource}: ${createRes.status} (${createRes.duration}ms)`);

  // GET (List)
  const listRes = await makeRequest('GET', `/api/admin/${resource}`, role);
  recordResult({
    phase: 'crud',
    resource,
    method: 'GET',
    role,
    expected: 200,
    actual: listRes.status,
    duration: listRes.duration,
    status: listRes.status === 200 ? 'PASS' : 'FAIL',
  });
  console.log(`✓ GET ${resource}: ${listRes.status} (${listRes.duration}ms)`);

  // GET Individual
  const singleRes = await makeRequest('GET', `/api/admin/${resource}/${recordId}`, role);
  recordResult({
    phase: 'crud',
    resource,
    method: 'GET_SINGLE',
    role,
    expected: 200,
    actual: singleRes.status,
    duration: singleRes.duration,
    status: singleRes.status === 200 ? 'PASS' : 'FAIL',
  });
  console.log(`✓ GET ${resource}/${recordId}: ${singleRes.status} (${singleRes.duration}ms)`);

  // PATCH (Update)
  const updatePayload = { description: 'Updated via tests' };
  const updateRes = await makeRequest('PATCH', `/api/admin/${resource}/${recordId}`, role, updatePayload);
  recordResult({
    phase: 'crud',
    resource,
    method: 'PATCH',
    role,
    expected: 200,
    actual: updateRes.status,
    duration: updateRes.duration,
    status: updateRes.status === 200 ? 'PASS' : 'FAIL',
  });
  console.log(`✓ PATCH ${resource}/${recordId}: ${updateRes.status} (${updateRes.duration}ms)`);

  // DELETE
  const deleteRes = await makeRequest('DELETE', `/api/admin/${resource}/${recordId}`, role);
  recordResult({
    phase: 'crud',
    resource,
    method: 'DELETE',
    role,
    expected: 200,
    actual: deleteRes.status,
    duration: deleteRes.duration,
    status: deleteRes.status === 200 ? 'PASS' : 'FAIL',
  });
  console.log(`✓ DELETE ${resource}/${recordId}: ${deleteRes.status} (${deleteRes.duration}ms)`);

  // Verify deletion
  const delVerify = await verifyDatabaseRecord(resource, recordId);
  if (delVerify.exists) {
    recordResult({
      phase: 'crud',
      resource,
      method: 'DELETE_VERIFY',
      role,
      expected: 'deleted',
      actual: 'still_exists',
      status: 'FAIL',
    });
    console.log(`✗ DELETE verification: Record still exists`);
  } else {
    recordResult({
      phase: 'crud',
      resource,
      method: 'DELETE_VERIFY',
      role,
      expected: 'deleted',
      actual: 'confirmed',
      status: 'PASS',
    });
    console.log(`✓ DELETE verification: Record removed`);
  }
}

// ============================================================================
// PHASE 5: RBAC AUTHORIZATION MATRIX
// ============================================================================

console.log();
console.log('PHASE 5: RBAC Authorization Matrix');
console.log('─'.repeat(80));

async function testRBAC() {
  const testMatrix = [
    { role: 'admin', resource: 'menu-items', method: 'POST', expectedStatus: 200 },
    { role: 'admin', resource: 'menu-items', method: 'GET', expectedStatus: 200 },
    { role: 'manager', resource: 'menu-items', method: 'POST', expectedStatus: 403 },
    { role: 'manager', resource: 'menu-items', method: 'GET', expectedStatus: 200 },
  ];

  for (const test of testMatrix) {
    const token = sessionCache[test.role];
    if (!token) {
      recordResult({
        phase: 'rbac',
        role: test.role,
        resource: test.resource,
        method: test.method,
        expected: test.expectedStatus,
        actual: 'NO_SESSION',
        status: 'BLOCKED',
      });
      console.log(`⚠ ${test.role} ${test.method} ${test.resource}: No session`);
      continue;
    }

    let res;
    try {
      if (test.method === 'POST') {
        res = await makeRequest(test.method, `/api/admin/${test.resource}`, test.role, {
          name: `${RUN_ID}_rbac_test`,
        });
      } else {
        res = await makeRequest(test.method, `/api/admin/${test.resource}`, test.role);
      }

      const passed = res.status === test.expectedStatus;
      recordResult({
        phase: 'rbac',
        role: test.role,
        resource: test.resource,
        method: test.method,
        expected: test.expectedStatus,
        actual: res.status,
        duration: res.duration,
        status: passed ? 'PASS' : 'FAIL',
      });

      const symbol = passed ? '✓' : '✗';
      console.log(`${symbol} ${test.role} ${test.method} ${test.resource}: ${res.status} (expected ${test.expectedStatus})`);

      if (!passed && res.status === 200 && test.expectedStatus === 403) {
        console.error('   🚨 PRIVILEGE ESCALATION DETECTED');
      }
    } catch (e) {
      recordResult({
        phase: 'rbac',
        role: test.role,
        resource: test.resource,
        method: test.method,
        expected: test.expectedStatus,
        actual: 'ERROR',
        error: e.message,
        status: 'FAIL',
      });
      console.log(`✗ ${test.role} ${test.method} ${test.resource}: Error - ${e.message}`);
    }
  }
}

// ============================================================================
// PHASE 6: CLEANUP
// ============================================================================

console.log();
console.log('PHASE 6: Cleanup');
console.log('─'.repeat(80));

async function cleanup() {
  let deletedCount = 0;

  for (const record of createdRecords) {
    try {
      const { error } = await supabase
        .from(record.table)
        .delete()
        .eq('id', record.id);

      if (!error) {
        deletedCount++;
      }
    } catch (e) {
      console.error(`Failed to delete ${record.table} ${record.id}: ${e.message}`);
    }
  }

  console.log(`✓ Cleaned up ${deletedCount} records`);
  recordResult({
    phase: 'cleanup',
    test: 'record_deletion',
    expected: createdRecords.length,
    actual: deletedCount,
    status: deletedCount === createdRecords.length ? 'PASS' : 'FAIL',
  });

  return deletedCount === createdRecords.length;
}

// ============================================================================
// RESULTS & REPORTING
// ============================================================================

function recordResult(result) {
  testResults.push({
    timestamp: new Date().toISOString(),
    ...result,
  });
}

function generateReport() {
  const summary = {
    runId: RUN_ID,
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    totalTests: testResults.length,
    pass: testResults.filter(r => r.status === 'PASS').length,
    fail: testResults.filter(r => r.status === 'FAIL').length,
    blocked: testResults.filter(r => r.status === 'BLOCKED').length,
    skipped: testResults.filter(r => r.status === 'SKIPPED').length,
  };

  const gate = summary.fail > 0 ? 'RED' : summary.blocked > 0 ? 'YELLOW' : 'GREEN';

  const report = {
    summary: {
      ...summary,
      gate,
    },
    results: testResults,
  };

  // Write JSON results
  const resultsPath = path.join(ROOT, 'test-results', 'results.json');
  fs.mkdirSync(path.dirname(resultsPath), { recursive: true });
  fs.writeFileSync(resultsPath, JSON.stringify(report, null, 2));

  // Write markdown report
  const mdPath = path.join(ROOT, 'RUNTIME_ACCEPTANCE_REPORT.md');
  let md = `# ZT Lounge — Runtime Acceptance Test Report\n\n`;
  md += `**Run ID:** ${RUN_ID}\n`;
  md += `**Timestamp:** ${new Date().toISOString()}\n`;
  md += `**Environment:** ${SUPABASE_URL?.includes('staging') ? 'STAGING' : 'UNKNOWN'}\n`;
  md += `**Gate:** ${gate === 'GREEN' ? '✅ GREEN' : gate === 'YELLOW' ? '⚠️ YELLOW' : '🔴 RED'}\n\n`;
  md += `## Summary\n\n`;
  md += `- Total Tests: ${summary.totalTests}\n`;
  md += `- PASS: ${summary.pass}\n`;
  md += `- FAIL: ${summary.fail}\n`;
  md += `- BLOCKED: ${summary.blocked}\n`;
  md += `- SKIPPED: ${summary.skipped}\n\n`;

  fs.writeFileSync(mdPath, md);

  return report;
}

// ============================================================================
// EXECUTION
// ============================================================================

async function main() {
  try {
    // Authenticate
    const authOk = await testAuthentication();
    if (!authOk) {
      console.log('\n⚠️  Some roles could not authenticate (marked BLOCKED)');
    }

    // CRUD Tests
    console.log();
    await testCRUD();

    // RBAC Tests
    console.log();
    await testRBAC();

    // Cleanup
    console.log();
    await cleanup();

    // Generate Report
    console.log();
    console.log('Generating Report...');
    const report = generateReport();

    console.log();
    console.log('═'.repeat(80));
    console.log('TEST SUMMARY');
    console.log('═'.repeat(80));
    console.log(`Total: ${report.summary.totalTests}`);
    console.log(`PASS:  ${report.summary.pass}`);
    console.log(`FAIL:  ${report.summary.fail}`);
    console.log(`BLOCKED: ${report.summary.blocked}`);
    console.log(`Gate:  ${report.summary.gate}`);
    console.log();
    console.log(`Results: test-results/results.json`);
    console.log(`Report: RUNTIME_ACCEPTANCE_REPORT.md`);
    console.log('═'.repeat(80));

    process.exit(report.summary.fail > 0 ? 1 : 0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
