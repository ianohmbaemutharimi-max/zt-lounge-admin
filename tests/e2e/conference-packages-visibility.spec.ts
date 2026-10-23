/**
 * E2E Test: Conference Page Packages Visibility
 * 
 * Verifies that packages for Conference page are correctly displayed
 * after the pageScopedItems fix.
 */

import { test, expect, type Page } from '@playwright/test';
import { testUsers } from './fixtures/auth';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function signIn(page: Page) {
  const user = testUsers.super_admin;
  await page.goto('/login');
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 20000 });
}

test.describe('Conference Packages Visibility', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('CRITICAL: Conference should show Packages (3) not (0)', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/services`);
    await page.waitForLoadState('networkidle');

    // Select Conference page
    const conferenceOption = await page.locator('option:has-text("Conference")').getAttribute('value');
    expect(conferenceOption).toBeTruthy();
    
    await page.locator('select').first().selectOption(conferenceOption!);
    await page.waitForTimeout(3000);

    // Check Packages button
    const packagesButton = page.locator('button, a').filter({ hasText: /Packages/i }).first();
    await expect(packagesButton).toBeVisible({ timeout: 10000 });

    const buttonText = await packagesButton.textContent();
    console.log('📦 Packages button text:', buttonText);

    if (buttonText?.includes('(0)')) {
      console.log('❌ BUG CONFIRMED: Shows Packages (0) when database has 3 packages');
    } else if (buttonText?.includes('(3)')) {
      console.log('✅ FIX VERIFIED: Shows Packages (3) correctly');
    }
    
    expect(buttonText).toMatch(/Packages\s*\(\s*3\s*\)/i);
  });

  test('VERIFY: All 3 Conference packages visible', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/services`);
    await page.waitForLoadState('networkidle');

    const conferenceOption = await page.locator('option:has-text("Conference")').getAttribute('value');
    await page.locator('select').first().selectOption(conferenceOption!);
    await page.waitForTimeout(2500);

    await page.locator('button, a').filter({ hasText: /Packages/i }).first().click();
    await page.waitForTimeout(2000);

    await expect(page.locator('text=Full-Day Package')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Executive Package')).toBeVisible();
    await expect(page.locator('text=Half-Day Package')).toBeVisible();

    console.log('✅ All 3 Conference packages are visible');
  });
});
