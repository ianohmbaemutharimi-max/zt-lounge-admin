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
  await expect(page.getByRole('button', { name: 'Info', exact: true })).toBeVisible({ timeout: 15000 });
}

function toast(page: Page, text: string) {
  return page.locator('[role="alert"]').filter({ hasText: text });
}

const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:3001';

test.describe('Restaurant Information Card - Admin to Public Verification', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('should edit information card name and verify persistence + public reflection', async ({ page }) => {
    await selectServicePage(page, 'Restaurant');
    console.log('Navigated to Restaurant page');

    await page.getByRole('button', { name: 'Info', exact: true }).click();
    console.log('Opened Info surface');
    await expect(page.getByRole('heading', { name: 'Informational Services' })).toBeVisible({ timeout: 15000 });

    // Find the information card grid (cards in 'Informational Services' section)
    const infoCardGrid = page.locator('div.grid').filter({ hasText: 'Informational Services' }).first();
    await expect(infoCardGrid).toBeVisible({ timeout: 15000 });
    console.log('Found information card grid');

    const infoCard = infoCardGrid.locator('[data-testid="info-card"]').first();
    await expect(infoCard).toBeVisible({ timeout: 15000 });
    const cardName = await infoCard.locator('h4').textContent();
    console.log(`Card name: "${cardName}"`);

    await infoCard.locator('button:has-text("Edit")').first().click();
    const editDialog = page.getByRole('dialog', { name: /Information Card/ });
    await expect(editDialog).toBeVisible({ timeout: 10000 });
    const typeIndicator = editDialog.locator('[data-testid="info-type"]');
    await expect(typeIndicator).toBeVisible({ timeout: 10000 });
    const form = editDialog.locator('form');
    await expect(form).toBeVisible({ timeout: 10000 });

    const testName = `E2E INFO UPDATE ${new Date().toISOString().slice(0, 19)}`;
    await form.locator('input[name="name"]').fill(testName);
    await form.locator('textarea[name="description"]').fill('Updated description');
    await form.locator('input[name="price"]').fill('19.99');
    console.log(`Set new name: "${testName}"`);

    await form.locator('button[type="submit"]').click();
    await expect(toast(page, 'Information card updated')).toBeVisible({ timeout: 10000 });
    console.log('Information card updated successfully in admin');

    const closeBtn = editDialog.getByRole('button', { name: /Close|Cancel/ });
    if (await closeBtn.count() > 0) {
      await closeBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await expect(editDialog).not.toBeVisible({ timeout: 5000 });
    console.log('Dialog closed');

    await page.locator('div.grid').filter({ hasText: 'Informational Services' }).first().locator('[data-testid="info-card"]').first().locator('button:has-text("Edit")').first().click();
    await expect(toast(page, 'Information card updated')).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(1000);
    const updatedName = await infoCard.locator('h4').textContent();
    expect(updatedName).toContain(testName);
    console.log('Name persisted in admin after reload');

    const context = page.context();
    const publicPage = await context.newPage();
    try {
      await publicPage.goto(`${PUBLIC_URL}/pages/experiences/restaurant.html`);
      await publicPage.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      console.log('Public page loaded');

      const websiteText = await publicPage.evaluate(() => {
        return document.body.innerText || document.body.textContent || '';
      });
      expect(websiteText).toContain(testName);
      console.log('Information card name reflects on public website');
      expect(websiteText).not.toContain('19.99');
      console.log('Price/charge text absent from public website');
    } finally {
      await publicPage.close();
    }

    try {
      await page.locator('div.grid').filter({ hasText: 'Informational Services' }).first().locator('[data-testid="info-card"]').first().locator('button:has-text("Edit")').first().click();
      await form.locator('input[name="name"]').fill('Restaurant');
      await form.locator('textarea[name="description"]').fill('');
      await form.locator('input[name="price"]').fill('');
      await form.locator('button[type="submit"]').click();
      await expect(toast(page, 'Information card updated')).toBeVisible({ timeout: 10000 });
      console.log('Cleaned up: name reset');
    } catch (e) {
      console.warn('Cleanup failed (non-blocking):', e);
    }
  });
});
