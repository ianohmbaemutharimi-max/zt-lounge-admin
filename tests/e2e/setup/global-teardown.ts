/**
 * Global Teardown for E2E Tests
 * Runs once after all tests complete
 */

async function globalTeardown() {
  console.log('\n' + '='.repeat(60));
  console.log('ZT LOUNGE E2E TEST SUITE - GLOBAL TEARDOWN');
  console.log('='.repeat(60));
  console.log('\n✓ Test suite complete. Cleaning up resources...\n');
}

export default globalTeardown;
