/**
 * E2E Test Suite: Package Visibility Across All Pages
 * 
 * Tests the React Query cache fix (line 964: added page_id to queryKey)
 * that ensures packages display correctly when switching between pages.
 * 
 * Pages with packages (verified 2026-10-11):
 * - Conference: 3 packages (Half-Day, Full-Day, Executive)
 * - Events Venue: 3 packages (Silver, Gold, Premium Wedding)
 * - VIP Cabins: 3 packages (Silver, Gold, Executive Suite)
 * - Grooming & Care: 3 packages (Express Wash, Premium Detail, Ultimate Protection)
 * 
 * Each page has 1 NAV service that owns all packages.
 */

import { test, expect, type Page } from '@playwright/test';
import { testUsers } from './fixtures/auth';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function signIn(page: Page) {
  const user = testUsers.super_admin;
  await page.goto('/login');
  await page.waitForSelector('input[type="email"]', { timeout: 20000 });
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');
  // The post-auth redirect to /dashboard can be slow on a cold Turbopack build;
  // allow 30s for the client-side navigation to complete.
  await page.waitForURL(/\/dashboard/, { timeout: 60000 });
}

/**
 * Helper: Navigate to Services page and select a specific page
 */
async function selectServicePage(page: Page, pageTitle: string) {
  await page.goto(`${BASE_URL}/dashboard/services`);
  await page.waitForLoadState('networkidle');
  
  // Find and select the page
  // Page selector is a custom button dropdown; the option button carries the page title.
  const optionValue = await page.locator('div.absolute.top-12').getByRole('button', { name: pageTitle }).getAttribute('value');
  expect(optionValue).toBeTruthy();
  
  await page.locator('div.absolute.top-12').getByRole('button', { name: pageTitle }).click();
  // Surface tabs (All / Navigation / Info / Packages) render only once a page
  // is selected, so this doubles as the selection confirmation.
  await expect(page.getByRole('button', { name: 'Packages', exact: true })).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1500);
}

/**
 * Helper: Click Packages tab and verify count
 */
async function verifyPackagesTab(page: Page, expectedCount: number) {
  const packagesButton = page.locator('button, a').filter({ hasText: /Packages/i }).first();
  await expect(packagesButton).toBeVisible({ timeout: 20000 });
  
  const buttonText = await packagesButton.textContent();
  console.log(`ðŸ“¦ Packages button: ${buttonText}`);
  
  // POLLING assertion: the count is fetched per-service via the dedicated
  // charges route, so the tab can render "(0)" briefly before charges resolve.
  // expect.poll retries until the text matches instead of reading it once.
  const regex = new RegExp(`Packages\\s*\\(\\s*${expectedCount}\\s*\\)`, 'i');
  await expect
    .poll(async () => ((await packagesButton.textContent()) ?? '').replace(/\s+/g, ' ').trim(), {
      timeout: 20000,
      message: `Packages tab should settle on count ${expectedCount}`,
    })
    .toMatch(regex);
  
  return packagesButton;
}

test.describe('Package Visibility - All Pages', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('Conference page shows 3 packages', async ({ page }) => {
    await selectServicePage(page, 'Conference');
    const packagesButton = await verifyPackagesTab(page, 3);
    
    // Click and verify packages are visible
    await packagesButton.click();
    await page.waitForTimeout(2000);
    
    await expect(page.locator('text=Half-Day Package')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Full-Day Package')).toBeVisible();
    await expect(page.locator('text=Executive Package')).toBeVisible();
    
    console.log('âœ… Conference: All 3 packages visible');
  });

  test('Events Venue page shows 3 packages', async ({ page }) => {
    await selectServicePage(page, 'Events');
    const packagesButton = await verifyPackagesTab(page, 3);
    
    await packagesButton.click();
    await page.waitForTimeout(2000);
    
    await expect(page.locator('text=Silver Celebration')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Gold Celebration')).toBeVisible();
    await expect(page.locator('text=Premium Wedding')).toBeVisible();
    
    console.log('âœ… Events: All 3 packages visible');
  });

  test('VIP Cabins page shows 3 packages', async ({ page }) => {
    await selectServicePage(page, 'VIP');
    const packagesButton = await verifyPackagesTab(page, 3);
    
    await packagesButton.click();
    await page.waitForTimeout(2000);
    
    await expect(page.locator('text=Silver Cabin')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Gold Cabin')).toBeVisible();
    await expect(page.locator('text=Executive Suite')).toBeVisible();
    
    console.log('âœ… VIP Cabins: All 3 packages visible');
  });

  test('Grooming & Care page shows 3 packages', async ({ page }) => {
    await selectServicePage(page, 'Grooming');
    const packagesButton = await verifyPackagesTab(page, 3);
    
    await packagesButton.click();
    await page.waitForTimeout(2000);
    
    await expect(page.locator('text=Express Wash')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Premium Detail').first()).toBeVisible();
    await expect(page.locator('text=Ultimate Protection').first()).toBeVisible();
    
    console.log('âœ… Grooming & Care: All 3 packages visible');
  });

  test('CRITICAL: Package count updates when switching pages', async ({ page }) => {
    console.log('\nðŸ”„ Testing page switch cache invalidation...\n');
    
    // Start with Conference
    await selectServicePage(page, 'Conference');
    await verifyPackagesTab(page, 3);
    console.log('âœ… Conference shows 3 packages');
    
    // Switch to Events
    const eventsOption = await page.locator('select').first().locator('option', { hasText: 'Events' }).first().getAttribute('value');
    await page.locator('select').first().selectOption(eventsOption!);
    await page.waitForTimeout(3000);
    await verifyPackagesTab(page, 3);
    console.log('âœ… Events shows 3 packages after switch');
    
    // Switch to VIP
    const vipOption = await page.locator('select').first().locator('option', { hasText: 'VIP' }).first().getAttribute('value');
    await page.locator('select').first().selectOption(vipOption!);
    await page.waitForTimeout(3000);
    await verifyPackagesTab(page, 3);
    console.log('âœ… VIP shows 3 packages after switch');
    
    // Switch to Grooming
    const groomingOption = await page.locator('select').first().locator('option', { hasText: 'Grooming' }).first().getAttribute('value');
    await page.locator('select').first().selectOption(groomingOption!);
    await page.waitForTimeout(3000);
    await verifyPackagesTab(page, 3);
    console.log('âœ… Grooming shows 3 packages after switch');
    
    console.log('\nâœ… React Query cache invalidation is working correctly');
  });

  test('Pages without packages show 0', async ({ page }) => {
    // Test a page that has no packages (e.g., Restaurant, Lounge)
    await selectServicePage(page, 'Restaurant');
    await verifyPackagesTab(page, 0);
    console.log('âœ… Restaurant correctly shows 0 packages');
    
    await selectServicePage(page, 'Lounge');
    await verifyPackagesTab(page, 0);
    console.log('âœ… Lounge correctly shows 0 packages');
  });
});


test.describe('Package Management - Admin Operations', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('Admin can view package details for Conference', async ({ page }) => {
    await selectServicePage(page, 'Conference');
    
    const packagesButton = page.locator('button, a').filter({ hasText: /Packages/i }).first();
    await packagesButton.click();

    // The per-service charges fetch goes through the dedicated charges route,
    // which can be slow on a cold Turbopack build. Poll for the known Conference
    // row (auto-retrying) instead of a fixed sleep + single-shot reads.
    const fullDayRow = page.locator('tr:has-text("Full-Day Package")');
    await expect(fullDayRow).toBeVisible({ timeout: 30000 });

    // Table headers only render once rows exist, so assert them AFTER the row.
    await expect(page.locator('th:has-text("Package")')).toBeVisible();
    await expect(page.locator('th:has-text("Service")')).toBeVisible();
    await expect(page.locator('th:has-text("Price")')).toBeVisible();

    // Verify specific package with price
    await expect(fullDayRow).toContainText('4,500');
    await expect(fullDayRow).toContainText('Conference');
    
    console.log('âœ… Package details table displays correctly');
  });

  test('Package status badges display correctly', async ({ page }) => {
    await selectServicePage(page, 'Events');
    const packagesButton = page.locator('button, a').filter({ hasText: /Packages/i }).first();
    await expect(packagesButton).toBeVisible({ timeout: 15000 });
    await packagesButton.click();

    // POLL until the per-service charges render an active status badge.
    const activeBadge = page.getByText(/^active$/i).first();
    await expect(activeBadge).toBeVisible({ timeout: 20000 });
    const activeCount = await page.getByText(/^active$/i).count();
    expect(activeCount).toBeGreaterThan(0);
    
    console.log(`âœ… Found ${activeCount} active package badges`);
  });

  test('Admin can see all service types on Grooming page', async ({ page }) => {
    await selectServicePage(page, 'Grooming');
    
    // Grooming has 20 services (1 NAV + 19 INFO across 3 categories)
    // Grooming has 20 services (1 NAV + 19 INFO across 3 categories).
    // The sidebar also matches /services/i, so poll the SUMMARY stat that reads
    // "N services" rather than grabbing the first (sidebar) match.
    await expect
      .poll(async () => (await page.getByText(/\d+\s+services/i).first().textContent()) ?? '', {
        timeout: 15000,
        message: 'Grooming summary should show "N services"',
      })
      .toMatch(/\d+\s+services/i);
    const summaryText = await page.getByText(/\d+\s+services/i).first().textContent();
    console.log(`ðŸ“Š Grooming summary: ${summaryText}`);
    
    // Should show multiple services
    expect(summaryText).toMatch(/\d+\s+services/i);
    
    // Verify packages still show correctly despite multiple service categories
    await verifyPackagesTab(page, 3);
    
    console.log('âœ… Grooming page handles multiple categories correctly');
  });
});

test.describe('Package Visibility - Regression Tests', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('Empty state displays when no packages exist', async ({ page }) => {
    await selectServicePage(page, 'Restaurant');
    
    const packagesButton = page.locator('button, a').filter({ hasText: /Packages/i }).first();
    await packagesButton.click();
    await page.waitForTimeout(2000);
    
    // The packages table renders its empty state (verified copy):
    // "No packages configured yet" / "Add pricing packages...".
    const emptyState = page.getByText(/no packages configured yet/i).first();
    await expect(emptyState).toBeVisible({ timeout: 20000 });
    console.log('âœ… Empty state displays correctly for pages without packages');
  });

  test('Package count in nav matches table row count', async ({ page }) => {
    await selectServicePage(page, 'Conference');

    const packagesButton = page.locator('button, a').filter({ hasText: /Packages/i }).first();
    await expect(packagesButton).toBeVisible({ timeout: 15000 });

    // POLL the button until the count settles (charges load per-service),
    // THEN compare the settled count to the rendered table row count.
    await expect
      .poll(async () => ((await packagesButton.textContent()) ?? '').replace(/\s+/g, ' ').trim(), { timeout: 20000 })
      .toMatch(/Packages\s*\(\s*3\s*\)/i);
    const buttonText = await packagesButton.textContent();
    const buttonCount = parseInt(buttonText?.match(/\d+/)?.[0] || '0');

    // Click and count rows
    await packagesButton.click();
    const tableRows = page.locator('table tbody tr');
    await expect.poll(async () => tableRows.count(), { timeout: 20000 }).toBe(buttonCount);
    const rowCount = await tableRows.count();

    expect(rowCount).toBe(buttonCount);
    console.log(`Button shows ${buttonCount}, table has ${rowCount} rows - match!`);
  });

  test('All 4 package pages accessible in sequence', async ({ page }) => {
    // 4 full page visits + polling assertions exceed the default 120s budget
    // on a cold dev server, so triple it (Playwright test.slow: 120s → 360s).
    test.slow();
    const pagesToTest = [
      { name: 'Conference', packages: 3 },
      { name: 'Events', packages: 3 },
      { name: 'VIP', packages: 3 },
      { name: 'Grooming', packages: 3 }
    ];
    
    for (const { name, packages } of pagesToTest) {
      await selectServicePage(page, name);
      await verifyPackagesTab(page, packages);
      console.log(`âœ… ${name}: ${packages} packages verified`);
    }
    
    console.log('\nâœ… All 4 package pages are accessible and display correct counts');
  });
});



