#!/usr/bin/env node
/**
 * ADMIN BOOKING E2E TEST RUNNER
 * 
 * This script:
 * 1. Starts the Next.js development server
 * 2. Waits for it to be ready
 * 3. Runs the Playwright E2E test
 * 4. Generates a comprehensive report
 * 5. Cleans up processes
 */

import { spawn } from 'child_process';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const PORT = 3000;

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║   ADMIN BOOKING E2E VERIFICATION RUNNER                    ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// Validate environment
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ MISSING ENVIRONMENT VARIABLES');
  console.error('   Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

console.log('✓ Environment variables loaded');
console.log(`  Supabase URL: ${SUPABASE_URL}`);
console.log(`  Base URL: ${BASE_URL}\n`);

let devServer = null;

// Cleanup function
function cleanup() {
  if (devServer) {
    console.log('\n🧹 Shutting down development server...');
    devServer.kill();
  }
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);

async function checkServerReady(url, maxAttempts = 30) {
  console.log('⏳ Waiting for development server to be ready...');
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status === 404) {
        console.log('✓ Development server is ready\n');
        return true;
      }
    } catch (error) {
      // Server not ready yet
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    process.stdout.write(`  Attempt ${i + 1}/${maxAttempts}...\r`);
  }
  
  console.error('\n❌ Development server failed to start within timeout');
  return false;
}

async function runE2ETest() {
  try {
    // Step 1: Start development server
    console.log('🚀 Starting Next.js development server...\n');
    
    devServer = spawn('npm', ['run', 'dev'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      env: { ...process.env }
    });

    devServer.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Ready') || output.includes('started server')) {
        console.log('  ' + output.trim());
      }
    });

    devServer.stderr.on('data', (data) => {
      const output = data.toString();
      if (!output.includes('Debugger') && !output.includes('experimental')) {
        console.error('  [Server Error]', output.trim());
      }
    });

    // Step 2: Wait for server to be ready
    const serverReady = await checkServerReady(BASE_URL);
    if (!serverReady) {
      process.exit(1);
    }

    // Step 3: Run Playwright test
    console.log('🎭 Running Playwright E2E test...\n');
    console.log('═'.repeat(60));
    
    const playwrightProcess = spawn(
      'npx',
      ['playwright', 'test', 'tests/e2e/admin-booking-e2e.spec.ts', '--reporter=list'],
      {
        stdio: 'inherit',
        shell: true,
        env: { ...process.env, BASE_URL }
      }
    );

    await new Promise((resolve, reject) => {
      playwrightProcess.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Playwright test failed with code ${code}`));
        }
      });
    });

    console.log('\n═'.repeat(60));
    console.log('\n✅ E2E TEST COMPLETED SUCCESSFULLY\n');

    // Step 4: Look for generated report
    const reportFiles = fs.readdirSync('.').filter(f => f.startsWith('ADMIN_BOOKING_E2E_REPORT_'));
    if (reportFiles.length > 0) {
      const latestReport = reportFiles.sort().reverse()[0];
      console.log(`📄 Report generated: ${latestReport}\n`);
      
      const report = JSON.parse(fs.readFileSync(latestReport, 'utf-8'));
      
      console.log('SUMMARY:');
      console.log(`  Test ID: ${report.testId}`);
      console.log(`  Booking ID: ${report.bookingId || 'N/A'}`);
      console.log(`  Booking Number: ${report.bookingNumber || 'N/A'}`);
      console.log(`  Timestamp: ${report.timestamp}`);
      console.log('');
      console.log('CHECKS:');
      for (const [key, value] of Object.entries(report.checks)) {
        const icon = value === 'PASS' ? '✓' : '⚠';
        console.log(`  ${icon} ${key}: ${value}`);
      }
      console.log('');
    }

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║   🟢 ADMIN BOOKING E2E VERIFIED                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

  } catch (error) {
    console.error('\n╔════════════════════════════════════════════════════════════╗');
    console.error('║   🔴 ADMIN BOOKING E2E FAILED                              ║');
    console.error('╚════════════════════════════════════════════════════════════╝\n');
    console.error('ERROR:', error.message);
    console.error('');
    process.exit(1);
  } finally {
    cleanup();
  }
}

// Run the test
runE2ETest();
