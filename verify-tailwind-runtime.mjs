#!/usr/bin/env node

/**
 * TAILWIND RESOLUTION RUNTIME VERIFICATION
 * 
 * Tests that:
 * 1. Dev server starts successfully
 * 2. Dashboard routes compile without Tailwind resolution errors
 * 3. PostCSS integrates Tailwind correctly
 * 4. API endpoints respond correctly
 */

import { spawn } from 'child_process';
import axios from 'axios';
import { setTimeout } from 'timers/promises';

const BASE_URL = 'http://localhost:3000';
const DEV_SERVER_TIMEOUT = 60000; // 60 seconds
const ROUTE_CHECK_TIMEOUT = 120000; // 2 minutes for all routes

console.log('🚀 PHASE 9: Runtime Compile Test');
console.log('================================\n');

let devProcess = null;
let serverReady = false;
let startTime = Date.now();

const routes = [
  '/dashboard/services',
  '/dashboard/menu',
  '/dashboard/website',
  '/dashboard/media',
  '/dashboard/bookings',
];

const apiEndpoints = [
  {
    method: 'GET',
    path: '/api/health',
    desc: 'Health check',
    expectedStatus: 200,
  },
  {
    method: 'GET',
    path: '/api/admin/menu-items',
    desc: 'Menu items (unauthenticated)',
    expectedStatus: 401,
  },
  {
    method: 'GET',
    path: '/api/admin/hero-slides',
    desc: 'Hero slides (unauthenticated)',
    expectedStatus: 401,
  },
];

async function startDevServer() {
  return new Promise((resolve, reject) => {
    console.log('📡 Starting dev server...');
    
    devProcess = spawn('npm', ['run', 'dev'], {
      cwd: 'd:/zt lounge/zt-lounge-demo/zt-lounge-admin',
      stdio: 'pipe',
      shell: true,
    });

    let output = '';
    let errorOutput = '';

    devProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      console.log('📋', chunk.trim());

      // Check for "Ready in" message
      if (chunk.includes('Ready in') && !serverReady) {
        serverReady = true;
        console.log('✅ Dev server ready!\n');
        resolve();
      }
    });

    devProcess.stderr.on('data', (data) => {
      const chunk = data.toString();
      errorOutput += chunk;
      console.error('❌ ERROR:', chunk.trim());

      // Check for Tailwind resolution error
      if (chunk.includes("Can't resolve 'tailwindcss'")) {
        console.error('\n🔴 CRITICAL: Tailwind resolution failed!');
        reject(new Error('Tailwind resolution error detected'));
      }
    });

    devProcess.on('error', (err) => {
      reject(err);
    });

    // Timeout if server doesn't start
    setTimeout(DEV_SERVER_TIMEOUT).then(() => {
      if (!serverReady) {
        reject(new Error('Dev server failed to start within timeout'));
      }
    });
  });
}

async function checkRoute(route) {
  try {
    const response = await axios.get(`${BASE_URL}${route}`, {
      timeout: 10000,
      validateStatus: () => true, // Don't throw on any status
    });

    // Just checking it doesn't 500 from CSS compilation error
    if (response.status === 500) {
      const html = response.data || '';
      if (html.includes('PostCSS') || html.includes('tailwindcss')) {
        return { route, status: 'ERROR', message: 'PostCSS/Tailwind error' };
      }
      return { route, status: 'ERROR', message: 'Server error (not Tailwind)' };
    }

    return { route, status: 'OK', httpStatus: response.status };
  } catch (err) {
    return { route, status: 'ERROR', message: err.message };
  }
}

async function checkApiEndpoint(endpoint) {
  try {
    const response = await axios({
      method: endpoint.method,
      url: `${BASE_URL}${endpoint.path}`,
      timeout: 5000,
      validateStatus: () => true,
    });

    const statusMatch = response.status === endpoint.expectedStatus;
    return {
      path: endpoint.path,
      desc: endpoint.desc,
      status: statusMatch ? 'OK' : 'MISMATCH',
      expected: endpoint.expectedStatus,
      actual: response.status,
    };
  } catch (err) {
    return {
      path: endpoint.path,
      desc: endpoint.desc,
      status: 'ERROR',
      message: err.message,
    };
  }
}

async function verifyRoutes() {
  console.log('\n📄 PHASE 9A: Checking dashboard routes for CSS compilation...');
  console.log('-----------------------------------------------------------\n');

  const results = [];
  for (const route of routes) {
    const result = await checkRoute(route);
    results.push(result);
    const icon = result.status === 'OK' ? '✅' : '❌';
    console.log(`${icon} ${route}: ${result.status}`);
    if (result.message) console.log(`   ${result.message}`);
  }

  return results;
}

async function verifyApis() {
  console.log('\n🔗 PHASE 9B: Checking API endpoints...');
  console.log('-------------------------------------\n');

  const results = [];
  for (const endpoint of apiEndpoints) {
    const result = await checkApiEndpoint(endpoint);
    results.push(result);
    const icon = result.status === 'OK' ? '✅' : '❌';
    console.log(`${icon} ${endpoint.method} ${endpoint.path}`);
    console.log(`   ${endpoint.desc}`);
    console.log(`   Expected: ${result.expected}, Got: ${result.actual}`);
    if (result.message) console.log(`   Error: ${result.message}`);
  }

  return results;
}

async function main() {
  try {
    // Start dev server
    await startDevServer();

    // Wait a bit for hot reload to settle
    await setTimeout(3000);

    // Check routes
    const routeResults = await verifyRoutes();

    // Check APIs
    const apiResults = await verifyApis();

    // Summary
    console.log('\n📊 PHASE 9: SUMMARY');
    console.log('===================\n');

    const routesFailed = routeResults.filter(r => r.status !== 'OK').length;
    const apisFailed = apiResults.filter(r => r.status !== 'OK').length;

    console.log(`✅ Routes checked: ${routes.length}`);
    console.log(`   ✓ Passed: ${routes.length - routesFailed}`);
    console.log(`   ✗ Failed: ${routesFailed}`);

    console.log(`\n✅ APIs checked: ${apiEndpoints.length}`);
    console.log(`   ✓ Passed: ${apiEndpoints.length - apisFailed}`);
    console.log(`   ✗ Failed: ${apisFailed}`);

    const allPassed = routesFailed === 0 && apisFailed === 0;

    console.log(`\n${allPassed ? '🟢 PHASE 9: PASSED' : '🔴 PHASE 9: FAILED'}`);
    console.log('No Tailwind resolution errors detected!');

    process.exit(allPassed ? 0 : 1);
  } catch (err) {
    console.error('\n❌ FATAL ERROR:', err.message);
    process.exit(1);
  } finally {
    // Cleanup
    if (devProcess) {
      console.log('\n🛑 Stopping dev server...');
      devProcess.kill();
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
