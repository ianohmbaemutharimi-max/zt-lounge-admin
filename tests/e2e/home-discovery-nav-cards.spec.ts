import { test, expect, type Page } from '@playwright/test';
import { testUsers } from './fixtures/auth';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function signIn(page: Page) {
  const user = testUsers.super_admin;
  await page.goto(`${BASE_URL}/login`);
  await page.waitForSelector('input[type="email"]', { timeout: 20000 });
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 60000 });
}

/** Open the Services catalog and pick a page from the custom dropdown. */
async function selectServicePage(page: Page, label: string) {
  await page.goto(`${BASE_URL}/dashboard/services`);
  await page.getByRole('button', { name: /Select page/i }).click();
  await page.getByRole('button', { name: new RegExp(label, 'i') }).first().click();
}

test.describe('Home Discovery Page - Global Nav Cards', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('Home shows discovery banner and global nav cards', async ({ page }) => {
    test.slow();
    await selectServicePage(page, 'Home');

    // Discovery banner must explain the global nav set.
    await expect(page.getByText('Discovery page.')).toBeVisible({ timeout: 15000 });

    // Switch to the Navigation surface where nav cards render.
    await page.getByRole('button', { name: /Navigation/i }).first().click();

    // The public homepage discovers cards from ALL pages — the admin must
    // now show the same set. Wait with a RETRYING assertion first (the
    // services fetch is async; a raw count() would race it), then count.
    // At minimum: Conference, Events, VIP, Grooming, Restaurant, Lounge
    // each own one active nav card (6 total, verified in DB).
    await expect(page.getByRole('heading', { name: 'Conference', level: 4 })).toBeVisible({ timeout: 20000 });

    const navGrid = page.locator('.grid');
    const cards = navGrid.locator('h4');
    const count = await cards.count();
    console.log(`OK: Home nav cards visible: ${count}`);
    expect(count).toBeGreaterThanOrEqual(6);

    // Spot-check known global nav cards render with destination links.
    await expect(page.getByRole('heading', { name: 'Events', level: 4 })).toBeVisible();
    await expect(page.getByRole('heading', { name: /VIP Cabins/i, level: 4 })).toBeVisible();

    // Each card must show its canonical destination (→ pages/...).
    const destLinks = page.locator('p:has-text("→ pages/")');
    expect(await destLinks.count()).toBeGreaterThanOrEqual(6);
    console.log('OK: Home discovery nav cards show destinations');
  });

  test('Home All-surface lists the same global nav set', async ({ page }) => {
    test.slow();
    await selectServicePage(page, 'Home');

    // "All" surface (default) must list the discovery set, not "No services".
    await expect(page.getByText('Discovery page.')).toBeVisible({ timeout: 15000 });
    // The old empty state must NOT appear.
    await expect(page.getByText('No services on this page')).toHaveCount(0);
    // The DataTable should contain the nav rows (name cells).
    await expect(page.getByRole('cell', { name: 'Conference' }).first()).toBeVisible({ timeout: 15000 });
    console.log('OK: Home All-surface lists global nav services');
  });

  test('regular page keeps strict owning-page filter', async ({ page }) => {
    test.slow();
    await selectServicePage(page, 'Conference');

    // Non-discovery pages show NO banner…
    await expect(page.getByText('Discovery page.')).toHaveCount(0);
    // …and scope to their own services only (Conference owns 5).
    await expect(page.getByRole('cell', { name: 'Conference' }).first()).toBeVisible({ timeout: 15000 });
    // VIP-owned cards must not leak into Conference's list.
    await expect(page.getByRole('cell', { name: 'VIP Cabins' })).toHaveCount(0);
    console.log('OK: Conference page scoped to its own services only');
  });

  test('Home package modal opens with owning-page scope', async ({ page }) => {
    test.slow();
    await selectServicePage(page, 'Home');

    // Packages surface on Home must show packages for discovered nav cards
    // (Conference/Events/VIP/Grooming each own 3 — verified in DB).
    // Surface tabs are plain labels: All | Navigation | Info | Packages.
    await page.getByRole('button', { name: 'Packages', exact: true }).click();

    // Wait for the per-service charge fetches (dedicated route) to settle:
    // the Conference card must appear among services with packages.
    const conferenceCard = page.locator('.grid > *').filter({ hasText: 'Conference' }).first();
    await expect(conferenceCard).toBeVisible({ timeout: 20000 });

    // Open the Conference card's modal — owned by Conference page, viewed
    // from Home. The fail-closed charges route must accept it via the
    // service's own page_id.
    await conferenceCard.getByRole('button', { name: /Packages/i }).click();

    const dialog = page.getByRole('dialog', { name: /Conference.*Packages|Packages.*Conference/i });
    await expect(dialog).toBeVisible({ timeout: 10000 });
    // Conference has 3 packages in the DB — they must load despite viewing from Home.
    await expect(dialog.locator('[data-testid="package-item"]')).toHaveCount(3, { timeout: 15000 });
    console.log('OK: Conference packages (3) load from Home discovery view');
  });
});
