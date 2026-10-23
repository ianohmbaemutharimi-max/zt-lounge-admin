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

async function selectServicePage(page: Page, pageTitle: string) {
  await page.goto(`${ADMIN_BASE_URL}/dashboard/services`);
  const trigger = page.getByRole('button', { name: /Select page/ });
  await trigger.waitFor({ timeout: 15000 });
  await trigger.click();
  await page.locator('div.absolute.top-12').getByRole('button', { name: pageTitle }).click();
  await expect(page.getByRole('button', { name: 'Packages', exact: true })).toBeVisible({ timeout: 15000 });
}

async function openPackagesModal(page: Page) {
  await page.getByRole('button', { name: 'Packages', exact: true }).first().click();
  const card = page.locator('div.grid').filter({ hasText: 'package(s)' }).first();
  await expect(card).toBeVisible({ timeout: 15000 });
  await card.getByRole('button', { name: 'Packages', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: /Packages \/ Charges/ });
  await expect(dialog).toBeVisible({ timeout: 10000 });
  await expect(dialog.locator('[data-testid="package-item"]').first()).toBeVisible({ timeout: 15000 });
}

function toast(page: Page, text: string) {
  return page.locator('[role="alert"]').filter({ hasText: text });
}

const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3001';

test.describe('Restaurant Package Edit - Admin to Public Verification', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

test('should edit package description in Restaurant and verify persistence + public reflection', async ({ page }) => {
  await selectServicePage(page, 'Restaurant');
  console.log('Navigated to Restaurant page');

  await openPackagesModal(page);
  const dialog = page.getByRole('dialog', { name: /Packages \/ Charges/ });
  console.log('Packages modal opened');

  const packages = dialog.locator('[data-testid="package-item"]');
  await expect(packages).toHaveCount(3);
  console.log('Found 3 packages in Restaurant page');

  const firstName = (await packages.nth(0).locator('[data-testid="package-name"]').textContent()) ?? '';
  console.log(`Package #1 name: "${firstName}"`);

  await packages.nth(0).locator('[data-testid="package-edit"]').click();
  const form = dialog.locator('form');
  await expect(form).toBeVisible({ timeout: 10000 });
  console.log('Edit form opened');

  const testDescription = `E2E RSTR UPDATE ${new Date().toISOString().slice(0, 19)}`;
  const descField = form.locator('textarea[name="description"]');
  await descField.fill(testDescription);
  console.log(`Set new description: "${testDescription}"`);

  await form.locator('button[type="submit"]').click();
  await expect(toast(page, 'Package updated')).toBeVisible({ timeout: 10000 });
  console.log('Package updated successfully in admin');

  const closeBtn = dialog.getByRole('button', { name: /Close|Cancel/ });
  if (await closeBtn.count() > 0) {
    await closeBtn.click();
  } else {
    await page.keyboard.press('Escape');
  }
  await expect(dialog).not.toBeVisible({ timeout: 5000 });
  console.log('Modal closed');

  await page.getByRole('button', { name: 'Packages', exact: true }).first().click();
  await expect(dialog).toBeVisible({ timeout: 10000 });
  const updatedDescription = await packages.nth(0).locator('[data-testid="package-description"]').textContent() ?? '';
  expect(updatedDescription).toContain(testDescription);
  console.log('Description persisted in admin after reopen');

  const context = page.context();
  const publicPage = await context.newPage();
  try {
    await publicPage.goto(`${PUBLIC_URL}/pages/experiences/restaurant.html`);
    await publicPage.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    console.log('Public page loaded');

    const websiteText = await publicPage.evaluate(() => {
      return document.body.innerText || document.body.textContent || '';
    });
    expect(websiteText).toContain('E2E RSTR UPDATE');
    console.log('Package description reflects on public website');
  } finally {
    await publicPage.close();
  }

  try {
    await page.getByRole('button', { name: 'Packages', exact: true }).first().click();
    await packages.nth(0).locator('[data-testid="package-edit"]').click();
    await form.locator('textarea[name="description"]').fill('');
    await form.locator('button[type="submit"]').click();
    await expect(toast(page, 'Package updated')).toBeVisible({ timeout: 10000 });
    console.log('Cleaned up: description reset');
  } catch (e) {
    console.warn('Cleanup failed (non-blocking):', e);
  }
});
});

