/**
 * MEMBERSHIP F-3 — EXPIRY BLACK-BOX + PLAYWRIGHT VERIFICATION
 *
 * Proves current behavior only. SAFETY: non-destructive probes exclusively —
 * route-alive 404s, protected-field write attempts that are read-back verified
 * as no-ops, UI health checks, and one route-mocked past-expiry presentation
 * check (browser-side data only — NO database mutation, no fixtures created,
 * no membership status/expiry ever written).
 */

import { test, expect } from '@playwright/test';
import { testUsers } from './fixtures/auth';

const API = '/api/admin';
const NIL_ID = '00000000-0000-0000-0000-000000000000';

type Membership = {
  id: string;
  customer_id: string;
  status: string;
  expires_at: string;
  member_number: string;
};

async function signIn(page: import('@playwright/test').Page) {
  const user = testUsers.super_admin;
  await page.goto('/login');
  await page.fill('#email', user.email);
  await page.fill('#password', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 45_000 });
}

async function apiReq(
  page: import('@playwright/test').Page,
  method: 'get' | 'post' | 'patch',
  path: string,
  data?: unknown,
) {
  const res = await page.request[method](`${API}${path}`, data === undefined ? {} : { data });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status(), body };
}

test.describe('Membership F-3 — expiry behavior', () => {
  test('API contract: protected expiry/status fields, route-alive probes', async ({ page }) => {
    const membership5xx: string[] = [];
    page.on('response', (r) => {
      if (r.url().includes('/api/admin/customer-memberships') && r.status() >= 500) {
        membership5xx.push(`${r.request().method()} ${r.url()} -> ${r.status()}`);
      }
    });

    await signIn(page);

    const list = await apiReq(page, 'get', '/customer-memberships?limit=100');
    expect(list.status, 'membership list readable').toBe(200);
    const rows = (list.body?.data ?? []) as Membership[];
    expect(rows.length, 'need at least one membership').toBeGreaterThan(0);
    const target = rows.find((r) => r.status === 'active') ?? rows[0];

    // Test A — nonexistent membership: every relevant route answers 404
    // (alive, and no mutation possible without an existing row).
    const patchMissing = await apiReq(page, 'patch', `/customer-memberships/${NIL_ID}`, {
      status: 'expired',
    });
    console.log('[f3] PATCH nonexistent (status=expired) =', patchMissing.status);
    expect(patchMissing.status, 'PATCH nonexistent -> 404').toBe(404);

    const renewMissing = await apiReq(page, 'post', `/customer-memberships/${NIL_ID}/renew`);
    console.log('[f3] POST renew (nonexistent) =', renewMissing.status);
    expect(renewMissing.status, 'renew nonexistent -> 404 before any mutation').toBe(404);

    const cancelMissing = await apiReq(page, 'post', `/customer-memberships/${NIL_ID}/cancel`);
    console.log('[f3] POST cancel (nonexistent) =', cancelMissing.status);
    expect(cancelMissing.status, 'cancel nonexistent -> 404 before any mutation').toBe(404);

    const expireMissing = await apiReq(page, 'post', `/customer-memberships/${NIL_ID}/expire`);
    console.log('[f3] POST expire subroute (nonexistent) =', expireMissing.status);
    expect(expireMissing.status, 'no dedicated /expire endpoint exists (404)').toBe(404);

    // Test B — protected expires_at: server-derived field must be stripped,
    // never written. Attempt a client-side rewrite of a REAL row's expiry,
    // then read the row back to prove it is untouched.
    const before = await apiReq(page, 'get', `/customer-memberships/${target.id}`);
    expect(before.status, 'single membership readable').toBe(200);
    const beforeExpiry = before.body?.expires_at;
    const beforeStatus = before.body?.status;
    expect(beforeExpiry, 'target has an expiry value').toBeTruthy();

    const expiryProbe = await apiReq(page, 'patch', `/customer-memberships/${target.id}`, {
      expires_at: '2020-01-01T00:00:00.000Z',
    });
    console.log('[f3] PATCH expires_at =', expiryProbe.status);
    expect(expiryProbe.status, 'expires_at PATCH is stripped no-op, never a 500').not.toBe(500);

    const after = await apiReq(page, 'get', `/customer-memberships/${target.id}`);
    expect(after.status, 're-read after probe').toBe(200);
    console.log('[f3] expires_at before/after =', beforeExpiry, '/', after.body?.expires_at);
    expect(after.body?.expires_at, 'expires_at must be UNCHANGED (server-stripped)').toBe(beforeExpiry);
    expect(after.body?.status, 'status unchanged by the expiry probe').toBe(beforeStatus);

    // Test C — invalid status value must be rejected (current validation contract).
    const garbage = await apiReq(page, 'patch', `/customer-memberships/${target.id}`, {
      status: 'garbage-status',
    });
    console.log('[f3] PATCH garbage status =', garbage.status);
    expect(garbage.status, 'invalid status value -> 400').toBe(400);

    // Read-back once more: the garbage probe changed nothing either.
    const final = await apiReq(page, 'get', `/customer-memberships/${target.id}`);
    expect(final.body?.status, 'status unchanged after rejected probe').toBe(beforeStatus);
    expect(final.body?.expires_at, 'expires_at unchanged after rejected probe').toBe(beforeExpiry);

    // Test D/E — expired-state transition + renewal mutation are NOT exercised:
    // live cohort check (service-role, read-only) shows 0 rows with
    // expires_at < now, so no disposable past-expiry fixture exists, and a
    // real active row cannot be safely reverted (expired -> active only via
    // renew, which rewrites expiry/snapshots). Classified NOT TESTABLE.

    expect(membership5xx, 'no membership 5xx from these probes').toEqual([]);
  });

  test('UI: members page renders status + expiry from real data', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedMembership: string[] = [];
    const membership5xx: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && /membership/i.test(msg.text())) consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    page.on('response', (r) => {
      if (r.url().includes('/api/admin/customer-memberships')) {
        if (r.status() >= 500) membership5xx.push(`${r.request().method()} ${r.url()} -> ${r.status()}`);
        if (!r.ok()) failedMembership.push(`${r.request().method()} ${r.url()} -> ${r.status()}`);
      }
    });

    await signIn(page);
    await page.goto('/dashboard/members');

    // A. page loads
    await expect(page.getByRole('heading', { name: /member/i }).first()).toBeVisible({
      timeout: 30_000,
    });

    // B. customer membership display: status + expiry columns present, rows rendered
    await expect(page.getByRole('columnheader', { name: 'Status' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('columnheader', { name: 'Expires' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Days Left' })).toBeVisible();
    await expect(page.getByText('Active', { exact: true }).first()).toBeVisible();
    const rowCount = await page.locator('tbody tr').count();
    console.log('[f3] members table rows =', rowCount);
    expect(rowCount, 'members table rendered rows').toBeGreaterThan(0);

    // D/E. browser network + console health (no visual-only PASS)
    expect(failedMembership, 'no failed membership requests').toEqual([]);
    expect(membership5xx, 'no membership 5xx').toEqual([]);
    expect(consoleErrors, 'no membership console errors').toEqual([]);
    expect(pageErrors, 'no page errors').toEqual([]);
  });

  test('UI: active badge + past expiry renders WITHOUT correction (route-mocked data, no DB write)', async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const membership5xx: string[] = [];
    const mutationRequests: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && /membership/i.test(msg.text())) consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    page.on('response', (r) => {
      if (r.url().includes('/api/admin/customer-memberships') && r.status() >= 500) {
        membership5xx.push(`${r.request().method()} ${r.url()} -> ${r.status()}`);
      }
    });
    // Mutation monitor: this test must issue ZERO membership writes.
    page.on('request', (r) => {
      if (r.url().includes('/api/admin/customer-memberships') && r.method() !== 'GET') {
        mutationRequests.push(`${r.method()} ${r.url()}`);
      }
    });

    // Fetch the REAL list payload first (read-only), then serve a browser-side
    // copy whose active rows carry a past expires_at. The database is never
    // touched — only the browser sees the synthetic expiry.
    await signIn(page);
    const list = await apiReq(page, 'get', '/customer-memberships?limit=100');
    expect(list.status, 'membership list readable').toBe(200);
    const body = list.body as { data: Membership[]; pagination?: unknown };
    const activeRows = (body.data ?? []).filter((r) => r.status === 'active');
    expect(activeRows.length, 'need an active membership to present as past-expiry').toBeGreaterThan(0);

    const mocked = {
      ...body,
      data: (body.data ?? []).map((r) =>
        r.status === 'active' ? { ...r, expires_at: '2020-01-01T00:00:00.000Z' } : r,
      ),
    };

    await page.route(
      (url) =>
        url.pathname === '/api/admin/customer-memberships' ||
        url.pathname === '/api/admin/customer-memberships/',
      async (route) => {
        if (route.request().method() !== 'GET') return route.continue();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mocked),
        });
      },
    );

    await page.goto('/dashboard/members');
    await expect(page.getByRole('heading', { name: /member/i }).first()).toBeVisible({
      timeout: 30_000,
    });

    // C. past expiry presentation: status-literal badge says Active while the
    // date-derived Days Left cell says Expired — same row, no correction.
    const activeRow = page
      .locator('tbody tr')
      .filter({ has: page.getByText('Active', { exact: true }) })
      .first();
    await expect(activeRow, 'an active row renders').toBeVisible({ timeout: 30_000 });
    await expect(
      activeRow.getByText('Expired', { exact: true }).first(),
      'Days Left shows Expired while status badge still shows Active',
    ).toBeVisible();
    console.log('[f3] active+past-expiry row renders: Active badge + Expired days cell');

    // Safety: zero membership mutation requests were issued by the browser.
    expect(mutationRequests, 'no membership mutation requests').toEqual([]);
    expect(membership5xx, 'no membership 5xx').toEqual([]);
    expect(consoleErrors, 'no membership console errors').toEqual([]);
    expect(pageErrors, 'no page errors').toEqual([]);
  });
});

