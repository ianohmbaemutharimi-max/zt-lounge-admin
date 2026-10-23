import { test, expect, type Page } from '@playwright/test';
import { testUsers } from './fixtures/auth';

const ADMIN_BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

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

test.describe('Package Management UI - Core Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('should display 3 packages with all control icons', async ({ page }) => {
    await selectServicePage(page, 'Conference');
    await openPackagesModal(page);
    const dialog = page.getByRole('dialog', { name: /Packages \/ Charges/ });
    const packages = dialog.locator('[data-testid="package-item"]');
    await expect(packages).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      const packageItem = packages.nth(i);
      await expect(packageItem.locator('[data-testid="package-name"]')).toBeVisible();
      // Badge renders as <span class="... rounded-full border ..."> (no .badge class).
      await expect(packageItem.locator('span.rounded-full')).toHaveText(/^(Active|Inactive)$/);
      await expect(packageItem.locator('[data-testid="package-edit"]')).toBeVisible();
      await expect(packageItem.locator('[data-testid="package-toggle"]')).toBeVisible();
      await expect(packageItem.locator('[data-testid="package-delete"]')).toBeVisible();
    }
    console.log('OK: All 3 packages display with edit/delete/toggle icons');
  });

  test('should edit package description and persist change', async ({ page }) => {
    await selectServicePage(page, 'Conference');
    await openPackagesModal(page);
    const dialog = page.getByRole('dialog', { name: /Packages \/ Charges/ });
    const firstPackage = dialog.locator('[data-testid="package-item"]').first();
    const originalName = await firstPackage.locator('[data-testid="package-name"]').textContent();
    await firstPackage.locator('[data-testid="package-edit"]').click();

    const newDescription = `E2E Test Updated Description - ${Date.now()}`;
    await dialog.locator('textarea').fill(newDescription);
    await dialog.getByRole('button', { name: 'Save Changes' }).click();
    // save.onSuccess: toast "Package updated" AND the edit form closes.
    await expect(toast(page, 'Package updated')).toBeVisible({ timeout: 10000 });
    await expect(dialog.locator('form')).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await openPackagesModal(page);
    await expect(
      dialog.locator('[data-testid="package-description"]', { hasText: newDescription.substring(0, 30) })
    ).toBeVisible({ timeout: 10000 });
    console.log(`OK: Updated description for "${originalName}" and verified persistence`);
  });

  test('should toggle package active/inactive status', async ({ page }) => {
    await selectServicePage(page, 'VIP');
    await openPackagesModal(page);
    const dialog = page.getByRole('dialog', { name: /Packages \/ Charges/ });
    const firstPackage = dialog.locator('[data-testid="package-item"]').first();
    const initialStatus = (await firstPackage.getAttribute('data-package-status')) ?? '';
    expect(initialStatus).toBeTruthy();
    const flipped = initialStatus === 'active' ? 'inactive' : 'active';
    try {
      await firstPackage.locator('[data-testid="package-toggle"]').click();
      // Toggle toast: title "Package activated|deactivated",
      // description: "<name>" is now <status>.
      await expect(toast(page, `is now ${flipped}`)).toBeVisible({ timeout: 10000 });
      await expect(firstPackage).toHaveAttribute('data-package-status', flipped, { timeout: 10000 });
      console.log(`OK: Toggled status from ${initialStatus} to ${flipped}`);

      await firstPackage.locator('[data-testid="package-toggle"]').click();
      await expect(toast(page, `is now ${initialStatus}`)).toBeVisible({ timeout: 10000 });
      await expect(firstPackage).toHaveAttribute('data-package-status', initialStatus, { timeout: 10000 });
      console.log('OK: Restored original status');
    } finally {
      // Never leave the shared VIP fixture deactivated.
      const current = await firstPackage.getAttribute('data-package-status').catch(() => null);
      if (current && current !== initialStatus) {
        await firstPackage.locator('[data-testid="package-toggle"]').click().catch(() => {});
        await expect(toast(page, `is now ${initialStatus}`))
          .toBeVisible({ timeout: 10000 })
          .catch(() => {});
      }
    }
  });

  test('should delete package with confirmation', async ({ page }) => {
    test.slow();
    await selectServicePage(page, 'Events');
    await openPackagesModal(page);
    const dialog = page.getByRole('dialog', { name: /Packages \/ Charges/ });

    // Create a scratch package via the modal's Add Package form.
    const testPackageName = `E2E Test Package ${Date.now()}`;
    await dialog.getByRole('button', { name: 'Add Package', exact: true }).first().click();
    await dialog.locator('input[name="name"]').fill(testPackageName);
    await dialog.locator('input[name="price"]').fill('1000');
    await dialog.locator('form button[type="submit"]').click();
    // save.onSuccess: toast "Package created" and the form closes.
    await expect(toast(page, 'Package created')).toBeVisible({ timeout: 10000 });
    await expect(dialog.locator('form')).toHaveCount(0);

    const testPackage = dialog.locator('[data-testid="package-item"]').filter({ hasText: testPackageName });
    await expect(testPackage).toBeVisible({ timeout: 10000 });

    // Native confirm dialog: Delete package "<name>"? Existing bookings keep their recorded price.
    const dialogMessages: string[] = [];
    page.on('dialog', (d) => {
      dialogMessages.push(d.message());
      d.accept().catch(() => {});
    });
    await testPackage.locator('[data-testid="package-delete"]').click();
    await expect(toast(page, 'Package deleted')).toBeVisible({ timeout: 10000 });
    await expect(testPackage).toHaveCount(0, { timeout: 10000 });
    expect(dialogMessages.join('\n')).toContain(testPackageName);
    console.log(`OK: Deleted test package "${testPackageName}"`);
  });
});
