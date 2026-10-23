import { test, expect } from '@playwright/test';
import { testUsers } from './fixtures/auth';

/**
 * SERVICES ADMIN — NAVIGATION VIEW (IMAGE + DESCRIPTION) VERIFICATION
 *
 * Regression under test (user-reported):
 *   "nav button is wrong, when i press i must see image in the card and its
 *    description not just a word and some button"
 *
 * Root cause fixed in src/features/services/catalog-manager.tsx: NavCard read
 * `row.media?.url || row.image_url`, neither of which the admin list API ever
 * returns, so the card rendered with no image. The canonical field is
 * `resolved_image_url` (media_id -> media_assets.public_url), populated by
 * src/lib/media/resolver.ts for the `services` resource.
 *
 * READ-ONLY: this spec navigates and asserts rendered DOM only. It never
 * creates, edits or deletes a service, so no production data is mutated.
 */

test.describe('Services Admin — Navigation card renders image + description', () => {
  test.beforeEach(async ({ page }) => {
    const user = testUsers.super_admin;
    await page.goto('/login');
    await page.fill('#email', user.email);
    await page.fill('#password', user.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 45_000 });

    await page.goto('/dashboard/services');
    await page.waitForLoadState('networkidle');
  });

  test('Navigation card renders the service IMAGE (canonical resolved_image_url)', async ({ page }) => {
    // Conference owns an active navigation service (pages/business/conference.html)
    // with a media_id -> media_assets.public_url in the canonical DB.
    const pageSelector = page.locator('select').first();
    await pageSelector.selectOption({ label: 'Conference' });
    await page.waitForTimeout(1000);

    // Client-side surface switch (no reload).
    await page.getByRole('button', { name: 'Navigation', exact: true }).click();
    await page.waitForTimeout(500);

    // The NavCard renders the image next to an <h3> service title.
    const navCard = page
      .locator('h3:has-text("Conference")')
      .locator('xpath=ancestor::div[contains(@class,"overflow-hidden")][1]');
    const navImg = navCard.locator('img').first();
    await expect(navImg).toBeVisible({ timeout: 10_000 });

    // CRITICAL: src must be a resolved Supabase storage URL (the regression was
    // an empty/absent src because the card read a field the API never returns).
    const src = await navImg.getAttribute('src');
    expect(src, 'NavCard image src must be a resolved media_assets.public_url').toBeTruthy();
    expect(src).toMatch(/supabase\.co\/storage\/v1\/object\/public\//);

    console.log('✅ NavCard IMAGE renders: ' + src);
  });

  test('Navigation card renders the service DESCRIPTION text', async ({ page }) => {
    const pageSelector = page.locator('select').first();
    await pageSelector.selectOption({ label: 'Conference' });
    await page.waitForTimeout(1000);

    await page.getByRole('button', { name: 'Navigation', exact: true }).click();
    await page.waitForTimeout(500);

    const navCard = page
      .locator('h3:has-text("Conference")')
      .locator('xpath=ancestor::div[contains(@class,"overflow-hidden")][1]');
    const desc = navCard.locator('p.text-stone-300').first();
    await expect(desc).toBeVisible({ timeout: 10_000 });

    const descText = (await desc.textContent())?.trim() ?? '';
    expect(descText.length, 'Description must be non-empty rendered text').toBeGreaterThan(10);

    console.log('✅ NavCard DESCRIPTION renders: ' + descText);
  });
});
