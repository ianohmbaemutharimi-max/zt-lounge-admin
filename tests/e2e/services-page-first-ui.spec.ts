/**
 * ADMIN SERVICES — PAGE-FIRST BLACK-BOX / NETWORK VERIFICATION
 *
 * Drives the real /dashboard/services screen in a browser and inspects the
 * actual network traffic, proving the UI invariant:
 *
 *   "Page selection comes first. Services do not load as a global collection
 *    and then get visually filtered."
 *
 * READ-ONLY: this spec only navigates and observes. It never creates, edits or
 * deletes a service or a charge, so no production data is written.
 */

import { test, expect } from '@playwright/test';
import { testUsers } from './fixtures/auth';

const SVC_LIST = /\/api\/admin\/services(\?|$)/;
const SVC_CHARGES = /\/api\/admin\/services\/[^/?]+\/charges/;

test.describe('Admin Services — page-first UI + network (READ-ONLY)', () => {
  test('service requests are page-constrained and never global', async ({ page }) => {
    const user = testUsers.super_admin;
    await page.goto('/login');
    await page.fill('#email', user.email);
    await page.fill('#password', user.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 45_000 });

    /** Every /api/admin/services list request seen so far. */
    const listRequests: URL[] = [];
    const chargeRequests: URL[] = [];

    page.on('request', (req) => {
      if (req.method() !== 'GET') return;
      const url = new URL(req.url());
      if (url.pathname !== '/api/admin/services') return;
      if (SVC_CHARGES.test(url.pathname)) {
        chargeRequests.push(url);
      } else if (SVC_LIST.test(url.pathname)) {
        listRequests.push(url);
      }
    });

    await page.goto('/dashboard/services');
    await page.waitForLoadState('networkidle');

    // ── Navigate to a page first so the page scope is established ─────────
    // The page-first model requires an explicit page selection; no auto-default
    // was kept per Issue 1 fix (selectedPageId starts as null).
    const selector = page.locator('select').filter({ hasText: 'page' }).first();
    const options = await selector.locator('option').evaluateAll((els) =>
      els.map((e) => (e as HTMLOptionElement).value).filter((v) => v && v.length > 0),
    );
    expect(options.length, 'page selector must offer website_pages.id values').toBeGreaterThan(0);

    // Select the last (most recently used or first available) page
    await selector.selectOption(options[options.length - 1]);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(750);

    // Wait for the "Page scope:" label to appear after page is selected
    // (the label appears once selectedPageId is set and services query runs)
    await expect(
      page.getByText('Page scope:'),
      'Services screen must present a page selector after page selection',
    ).toBeVisible({ timeout: 15000 });

    // ── NETWORK: no service collection may load unscoped ─────────────────

    // ── NETWORK: no service collection may load unscoped ─────────────────
    // If the page resolves a default page, the request must carry page_id.
    // If it does not, there must be NO service request at all. Either way an
    // unscoped "load all services" is a failure (§23).
    const unscoped = listRequests.filter((u) => !u.searchParams.has('filter:page_id'));
    expect(
      unscoped.map((u) => u.toString()),
      'service list must never be requested without filter:page_id',
    ).toEqual([]);

    // ── Selecting a page drives a page-scoped request ─────────────────────
    const before = listRequests.length;
    const selector = page.locator('select').filter({ hasText: 'page' }).first();
    const options = await selector.locator('option').evaluateAll((els) =>
      els.map((e) => (e as HTMLOptionElement).value).filter((v) => v && v.length > 0),
    );
    expect(options.length, 'page selector must offer website_pages.id values').toBeGreaterThan(0);

    await selector.selectOption(options[options.length - 1]);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(750);

    const after = listRequests.slice(before);
    const scopedAfter = after.filter((u) => u.searchParams.has('filter:page_id'));
    expect(
      scopedAfter.length,
      'switching page must re-query with a page constraint',
    ).toBeGreaterThan(0);
    // The filter value is server-serialized as "<operator>:<value>" (eq:<uuid>).
    const scopedValues = scopedAfter.map((u) =>
      (u.searchParams.get('filter:page_id') ?? '').replace(/^eq:/, ''),
    );
    expect(
      scopedValues,
      'switched page must appear as the query constraint',
    ).toContain(options[options.length - 1]);

    // ── Re-check globally: still no unscoped request slipped through ──────
    expect(
      listRequests.filter((u) => !u.searchParams.has('filter:page_id')).map((u) => u.toString()),
      'no unscoped service list request at any point',
    ).toEqual([]);

    // ── Charges, when opened, must be page-scoped too ────────────────────
    const packagesBtn = page.getByRole('button', { name: /packages|charges/i }).first();
    if (await packagesBtn.count()) {
      await packagesBtn.click();
      await page.waitForTimeout(2000);
      if (chargeRequests.length) {
        expect(
          chargeRequests.filter((u) => !u.searchParams.get('page_id')).map((u) => u.toString()),
          'charge reads must carry the selected page_id',
        ).toEqual([]);
      } else {
        console.log('[page-first] no charge request observed (modal list empty)');
      }
    }

    console.log(
      `[page-first] service list requests: ${listRequests.length} ` +
        `(all page-constrained: ${listRequests.every((u) => u.searchParams.has('filter:page_id'))})`,
    );
  });
});
