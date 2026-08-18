/**
 * E2E Test Runner - Uses credentials from PowerShell environment
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get credentials from environment variables (passed from PowerShell)
const TEST_ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL;
const TEST_ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;

if (!TEST_ADMIN_EMAIL || !TEST_ADMIN_PASSWORD) {
  console.error('❌ ERROR: TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD must be set in PowerShell environment');
  console.error('\nPlease set them first:');
  console.error('  $env:TEST_ADMIN_EMAIL="your-email@example.com"');
  console.error('  $env:TEST_ADMIN_PASSWORD="your-password"');
  process.exit(1);
}

console.log('🚀 Starting E2E verification test...\n');

// Run the E2E test with credentials as arguments
const testProcess = spawn('node', ['e2e-verification.mjs', TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD], {
  stdio: 'inherit',
  cwd: __dirname,
});

testProcess.on('close', (code) => {
  process.exit(code);
});
