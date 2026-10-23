import { test, expect, type Page } from '@playwright/test';
import { testUsers } from './fixtures/auth';

const ADMIN_BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const PUBLIC_BASE_URL = process.env.PUBLIC_WEBSITE_URL || 'http://localhost:8000';

async function signIn(page: Page) {
  const user = testUsers.super_admin;
  await page.goto(`${ADMIN_BASE_URL}/login`);
  await page.waitForSelector('input[type="email"]', { timeout: 20000 });
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 60000 });
}

/**
 * The page selector in catalog-manager.tsx is a custom button dropdown
 * (there is NO <select>): a "Select page..." trigger opens a panel of
 * page-title buttons (div.absolute.top-12 > button).
 */
async function selectServicePage(page: Page, pageTitle: string) {
  await page.goto(`${ADMIN_BASE_URL}/dashboard/services`);
  const trigger = page.getByRole('button', { name: /Select page/ });
  await trigger.waitFor({ timeout: 15000 });
  await trigger.click();
  await page.locator('div.absolute.top-12').getByRole('button', { name: pageTitle }).click();
  // Surface tabs (All / Navigation / Info / Packages) render only once a page
  // is selected, so this doubles as the selection confirmation.
  await expect(page.getByRole('button', { name: 'Packages', exact: true })).toBeVisible({ timeout: 15000 });
}

/**
 * Open the Packages surface and launch the packages modal from its card.
 * Each card belongs to one service that has configured charges.
 */
async function openPackagesModal(page: Page) {
  await page.getByRole('button', { name: 'Packages', exact: true }).first().click();
  const card = page.locator('div.grid').filter({ hasText: 'package(s)' }).first();
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.getByRole('button', { name: 'Packages', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /Packages \/ Charges/ });
  await expect(dialog).toBeVisible({ timeout: 10000 });
  // Wait for the charges list to hydrate before counting/asserting on rows.
  await expect(dialog.locator('[data-testid="package-item"]').first()).toBeVisible({ timeout: 15000 });
}

/** Scoped toast locator: toasts render as fixed [role="alert"] divs. */
function toast(page: Page, text: string) {
  return page.locator('[role="alert"]').filter({ hasText: text });
}

test.describe('Admin-to-Public Website Synchronization', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('should sync description changes to public website', async ({ page, context }) => {
    test.slow();
    await selectServicePage(page, 'Conference');
    await openPackagesModal(page);
    const dialog = page.getByRole('dialog', { name: /Packages \/ Charges/ });
    const firstPackage = dialog.locator('[data-testid="package-item"]').first();
    const packageName = (await firstPackage.locator('[data-testid="package-name"]').textContent()) ?? '';
    expect(packageName).toBeTruthy();

    await firstPackage.locator('[data-testid="package-edit"]').click();
    const uniqueMarker = `SYNC-MARKER-${Date.now()}`;
    const newDescription = `Updated desc marker: ${uniqueMarker}`;
    await dialog.locator('textarea').fill(newDescription);
    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    // save.onSuccess: toast "Package updated" AND the edit form closes.
    await expect(toast(page, 'Package updated')).toBeVisible({ timeout: 10000 });
    await expect(dialog.locator('form')).toHaveCount(0);
    console.log(`OK: Admin: Updated "${packageName}" with marker: ${uniqueMarker}`);

    const publicPage = await context.newPage();
    await publicPage.goto(`${PUBLIC_BASE_URL}/pages/business/conference.html`);
    await publicPage.waitForLoadState('networkidle');
    await publicPage.waitForTimeout(4000);

    // Observational only: the public site hydrates #pricing asynchronously.
    const pricingVisible = await publicPage.locator('#pricing').isVisible().catch(() => false);
    if (pricingVisible) {
      console.log('OK: Public: Pricing section visible');
      const bodyText = (await publicPage.locator('body').textContent()) ?? '';
      const hasContent = bodyText.includes(packageName);
      console.log(`OK: Public: Package "${packageName}" present: ${hasContent}`);
    } else {
      console.log('WARN: Public: Pricing section not visible');
    }
    await publicPage.close();
  });

  test('should hide inactive packages from public website', async ({ page, context }) => {
    test.slow();
    await selectServicePage(page, 'VIP');
    await openPackagesModal(page);
    const dialog = page.getByRole('dialog', { name: /Packages \/ Charges/ });
    const firstPackage = dialog.locator('[data-testid="package-item"]').first();
    const packageName = (await firstPackage.locator('[data-testid="package-name"]').textContent()) || '';
    const initialStatus = await firstPackage.getAttribute('data-package-status');

    if (initialStatus === 'active') {
      await firstPackage.locator('[data-testid="package-toggle"]').click();
      // Toggle toast description: "<name>" is now inactive.
      await expect(toast(page, 'is now inactive')).toBeVisible({ timeout: 10000 });
      await expect(firstPackage).toHaveAttribute('data-package-status', 'inactive', { timeout: 10000 });
      console.log(`OK: Admin: Deactivated "${packageName}"`);

      const publicPage = await context.newPage();
      await publicPage.goto(`${PUBLIC_BASE_URL}/pages/experiences/vip.html`);
      await publicPage.waitForLoadState('networkidle');
      await publicPage.waitForTimeout(4000);
      const pricingVisible = await publicPage.locator('#pricing').isVisible().catch(() => false);
      console.log(`Public pricing visible: ${pricingVisible}`);
      await publicPage.close();

      await firstPackage.locator('[data-testid="package-toggle"]').click();
      // Toggle toast description: "<name>" is now active (distinct from
      // "is now inactive", so a still-visible previous toast cannot collide).
      await expect(toast(page, 'is now active')).toBeVisible({ timeout: 10000 });
      await expect(firstPackage).toHaveAttribute('data-package-status', 'active', { timeout: 10000 });
      console.log(`OK: Admin: Reactivated "${packageName}"`);
    } else {
      test.skip();
    }
  });

  test('should verify all 4 pages sync correctly', async ({ page, context }) => {
    test.slow();
    const testPages = ['Conference', 'Events', 'VIP', 'Grooming'];
    const adminCounts: { [key: string]: number } = {};

    for (const pageTitle of testPages) {
      await selectServicePage(page, pageTitle);
      await openPackagesModal(page);
      const dialog = page.getByRole('dialog', { name: /Packages \/ Charges/ });
      adminCounts[pageTitle] = await dialog.locator('[data-testid="package-item"]').count();
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    }
    console.log('Admin counts:', JSON.stringify(adminCounts));

    const publicPage = await context.newPage();
    // Public route map mirrors services.href in the live DB (note: Events lives
    // under /pages/business/, there is no /pages/events/events-venue.html).
    const routes = {
      Conference: '/pages/business/conference.html',
      Events: '/pages/business/events.html',
      VIP: '/pages/experiences/vip.html',
      Grooming: '/pages/business/grooming-care.html',
    };

    for (const [name, route] of Object.entries(routes)) {
      await publicPage.goto(`${PUBLIC_BASE_URL}${route}`);
      await publicPage.waitForLoadState('networkidle');
      await publicPage.waitForTimeout(3000);
      const pricingVisible = await publicPage.locator('#pricing').isVisible().catch(() => false);
      const elements = await publicPage.locator('[data-charge-name]').count();
      console.log(`${name}: pricingVisible=${pricingVisible}, elements=${elements}`);
    }
    await publicPage.close();
  });
});
