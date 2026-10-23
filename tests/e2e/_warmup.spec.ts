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

/**
 * Warm-up: the Repository degrades gracefully when the DB is missing
 * post-migration columns (services.service_kind / services.card_type), but the
 * FIRST request for each missing column in a server process still 500s while
 * the column is learned. After a dev-server restart this poisons the first
 * tests of a suite run. This warm-up hits each hot endpoint until it returns
 * 200 so the learning converges BEFORE the real suites run.
 */
test('warm up schema-incomplete learning', async ({ page }) => {
  test.slow();
  await signIn(page);

  async function untilOk(path: string, tries = 6): Promise<number> {
    let status = 0;
    for (let i = 0; i < tries; i++) {
      const res = await page.request.get(`${BASE_URL}${path}`);
      status = res.status();
      if (status === 200) return status;
      await page.waitForTimeout(300);
    }
    return status;
  }

  expect(await untilOk('/api/admin/services?limit=100')).toBe(200);
  expect(await untilOk('/api/admin/website-pages')).toBe(200);
  expect(await untilOk('/api/admin/service-categories')).toBe(200);

  // Resolve Conference's owning page id, then warm the charges route.
  const services = await (await page.request.get(`${BASE_URL}/api/admin/services?limit=100`)).json();
  const rows: any[] = services.data ?? services ?? [];
  const conference = rows.find((r: any) => r.slug === 'conference');
  expect(conference, 'conference service must exist').toBeTruthy();
  expect(await untilOk(`/api/admin/services/conference/charges?page_id=${conference.page_id}`)).toBe(200);

  console.log('WARMUP OK: schema learning converged');
});
