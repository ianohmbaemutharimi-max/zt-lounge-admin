import { defineConfig, devices } from '@playwright/test';

/**
 * ZT Lounge Runtime Production Acceptance Test Suite
 * 
 * Configuration for Playwright E2E testing with real authentication
 * and database verification.
 */

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // Disable parallel to avoid race conditions on shared DB
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1, // Single worker to maintain test isolation
  reporter: [
    // The HTML report must NOT live inside `test-results`, which is Playwright's
    // default outputDir for per-test artifacts. Nesting the two makes Playwright
    // refuse the run with an output-folder collision, so the report is written to
    // a sibling directory instead.
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list'],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  globalSetup: './tests/e2e/setup/global-setup.ts',
  globalTeardown: './tests/e2e/setup/global-teardown.ts',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
    timeout: 120 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
});
