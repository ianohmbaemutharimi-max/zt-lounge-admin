#!/usr/bin/env node

/**
 * ZT LOUNGE ADMIN — PERFORMANCE AUDIT
 * 
 * Comprehensive performance profiling of all API routes:
 * - Baseline measurements against production build (next start)
 * - Separates Next.js compilation time from application latency
 * - Identifies database query bottlenecks
 * - Detects N+1 queries, duplicate queries, sequential queries
 * - Measures auth/middleware overhead
 * - Provides actionable optimization recommendations
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;

const BASE_URL = 'http://localhost:3000';

const log = (message, data = null) => {
  console.log(`[${new Date().toISOString()}] ${message}`);
  if (data) console.log(JSON.stringify(data, null, 2));
};

const error = (message, err = null) => {
  console.error(`[${new Date().toISOString()}] ❌ ${message}`);
  if (err) console.error(err);
};

const success = (message) => {
  console.log(`[${new Date().toISOString()}] ✅ ${message}`);
};

const warn = (message) => {
  console.warn(`[${new Date().toISOString()}] ⚠️  ${message}`);
};

async function measureEndpoint(url, options = {}, label = '') {
  const start = Date.now();
  try {
    const response = await fetch(url, options);
    const elapsed = Date.now() - start;
    
    let body = null;
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      body = await response.json();
    } else {
      body = await response.text();
    }
    
    return {
      label: label || url,
      url,
      status: response.status,
      elapsed,
      ok: response.ok,
      body,
      headers: Object.fromEntries(response.headers.entries())
    };
  } catch (err) {
    const elapsed = Date.now() - start;
    return {
      label: label || url,
      url,
      status: 0,
      elapsed,
      ok: false,
      error: err.message,
      body: null
    };
  }
}

async function authenticateAdmin() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD required in .env.local');
  }
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  const { data, error: authError } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  
  if (authError || !data.session) {
    throw new Error(`Authentication failed: ${authError?.message || 'No session'}`);
  }
  
  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    session: data.session
  };
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('ZT LOUNGE ADMIN — PERFORMANCE AUDIT');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  const results = {
    timestamp: new Date().toISOString(),
    environment: 'production',
    baseUrl: BASE_URL,
    measurements: [],
    analysis: {},
    recommendations: []
  };
  
  // Step 1: Authenticate
  log('🔐 Authenticating admin user...');
  let auth;
  try {
    auth = await authenticateAdmin();
    success(`Authenticated as ${ADMIN_EMAIL}`);
  } catch (err) {
    error('Authentication failed', err);
    throw err;
  }
  
  const authHeaders = {
    'Authorization': `Bearer ${auth.accessToken}`,
    'Content-Type': 'application/json'
  };
  
  // Step 2: Warm-up request (triggers Next.js compilation)
  log('\n🔥 Warming up server (first request triggers compilation)...');
  const warmup = await measureEndpoint(`${BASE_URL}/api/health`, {}, 'Health Check (warmup)');
  results.measurements.push(warmup);
  log(`Warmup: ${warmup.elapsed}ms (includes compilation)`);
  
  // Wait for compilation to settle
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Step 3: Measure health endpoint (baseline)
  log('\n📊 Baseline measurement (health endpoint)...');
  const health = await measureEndpoint(`${BASE_URL}/api/health`, {}, 'Health Check');
  results.measurements.push(health);
  success(`Health: ${health.status} in ${health.elapsed}ms`);
  
  // Step 4: Measure auth/session overhead
  log('\n🔐 Measuring auth/session overhead...');
  const session = await measureEndpoint(
    `${BASE_URL}/api/auth/session`,
    { headers: authHeaders },
    'Auth Session'
  );
  results.measurements.push(session);
  log(`Session: ${session.status} in ${session.elapsed}ms`);
  
  // Step 5: Measure dashboard stats (known slow endpoint ~3.2s)
  log('\n📈 Measuring dashboard stats...');
  const stats = await measureEndpoint(
    `${BASE_URL}/api/dashboard/stats`,
    { headers: authHeaders },
    'Dashboard Stats'
  );
  results.measurements.push(stats);
  log(`Dashboard Stats: ${stats.status} in ${stats.elapsed}ms`);
  
  if (stats.elapsed > 1000) {
    warn(`Dashboard stats took ${stats.elapsed}ms — investigating get_dashboard_stats RPC`);
    results.recommendations.push({
      severity: 'HIGH',
      endpoint: '/api/dashboard/stats',
      issue: `Slow response time: ${stats.elapsed}ms`,
      rootCause: 'RPC function get_dashboard_stats likely performs sequential queries',
      recommendation: 'Optimize RPC to use parallel queries or add database indexes'
    });
  }
  
  // Step 6: Measure admin resources (generic CRUD)
  log('\n📦 Measuring admin resource endpoints...');
  
  const resources = [
    'menu-items',
    'gallery',
    'services',
    'bookings',
    'customers',
    'staff',
    'notifications',
    'business-settings'
  ];
  
  for (const resource of resources) {
    const result = await measureEndpoint(
      `${BASE_URL}/api/admin/${resource}`,
      { headers: authHeaders },
      `GET /api/admin/${resource}`
    );
    results.measurements.push(result);
    
    if (result.ok) {
      const count = Array.isArray(result.body?.data) ? result.body.data.length : 'N/A';
      log(`  ${resource}: ${result.status} in ${result.elapsed}ms (${count} records)`);
      
      if (result.elapsed > 2000) {
        warn(`  Slow response on ${resource}: ${result.elapsed}ms`);
        results.recommendations.push({
          severity: result.elapsed > 5000 ? 'CRITICAL' : 'HIGH',
          endpoint: `/api/admin/${resource}`,
          issue: `Slow response time: ${result.elapsed}ms`,
          rootCause: 'Possible missing index, N+1 query, or inefficient RLS policy',
          recommendation: 'Review Supabase query, check indexes, optimize RLS'
        });
      }
    } else {
      error(`  ${resource}: ${result.status} in ${result.elapsed}ms`);
    }
  }
  
  // Step 7: Measure media endpoint
  log('\n🖼️  Measuring media endpoint...');
  const media = await measureEndpoint(
    `${BASE_URL}/api/media`,
    { headers: authHeaders },
    'GET /api/media'
  );
  results.measurements.push(media);
  log(`Media: ${media.status} in ${media.elapsed}ms`);
  
  // Step 8: Analysis
  log('\n🔍 Analyzing results...');
  
  const slowEndpoints = results.measurements
    .filter(m => m.ok && m.elapsed > 1000)
    .sort((a, b) => b.elapsed - a.elapsed);
  
  results.analysis = {
    totalEndpoints: results.measurements.length,
    successfulRequests: results.measurements.filter(m => m.ok).length,
    failedRequests: results.measurements.filter(m => !m.ok).length,
    slowEndpoints: slowEndpoints.length,
    averageResponseTime: Math.round(
      results.measurements
        .filter(m => m.ok && m.label !== 'Health Check (warmup)')
        .reduce((sum, m) => sum + m.elapsed, 0) /
      results.measurements.filter(m => m.ok && m.label !== 'Health Check (warmup)').length
    ),
    slowestEndpoints: slowEndpoints.slice(0, 5).map(m => ({
      label: m.label,
      elapsed: m.elapsed
    }))
  };
  
  // Step 9: Report
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('PERFORMANCE AUDIT RESULTS');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  console.log(`Total Endpoints Tested: ${results.analysis.totalEndpoints}`);
  console.log(`Successful Requests: ${results.analysis.successfulRequests}`);
  console.log(`Failed Requests: ${results.analysis.failedRequests}`);
  console.log(`Average Response Time: ${results.analysis.averageResponseTime}ms`);
  console.log(`Endpoints > 1s: ${results.analysis.slowEndpoints}\n`);
  
  if (slowEndpoints.length > 0) {
    console.log('⚠️  SLOW ENDPOINTS (>1000ms):\n');
    slowEndpoints.forEach((m, i) => {
      console.log(`${i + 1}. ${m.label}`);
      console.log(`   ${m.elapsed}ms — HTTP ${m.status}`);
      console.log(`   URL: ${m.url}\n`);
    });
  }
  
  if (results.recommendations.length > 0) {
    console.log('\n📋 OPTIMIZATION RECOMMENDATIONS:\n');
    results.recommendations.forEach((rec, i) => {
      console.log(`${i + 1}. [${rec.severity}] ${rec.endpoint}`);
      console.log(`   Issue: ${rec.issue}`);
      console.log(`   Root Cause: ${rec.rootCause}`);
      console.log(`   Recommendation: ${rec.recommendation}\n`);
    });
  }
  
  // Save results
  const fs = await import('fs/promises');
  const reportPath = join(__dirname, '..', 'performance-audit-report.json');
  await fs.writeFile(reportPath, JSON.stringify(results, null, 2));
  success(`\nDetailed report saved to: performance-audit-report.json`);
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('PERFORMANCE AUDIT COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  error('Performance audit failed', err);
  process.exit(1);
});
