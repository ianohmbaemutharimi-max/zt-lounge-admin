/**
 * MEMBERSHIP F-1 — LIFECYCLE AUTHORITY (PATCH/DELETE CLOSURE)
 * PATCH -> MembershipHandler.update (identity immutable); DELETE -> 409.
 * SAFETY: identity/package probes REJECTED (no write); notes probe restored.
 * No fixtures created.
 */

import { test, expect } from '@playwright/test';
import { testUsers } from './fixtures/auth';

const API = '/api/admin';

type Membership = {
  id: string;
  customer_id: string;
  plan_id: string;
  status: string;
  notes: string | null;
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
  method: 'get' | 'post' | 'patch' | 'delete',
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

test.describe('Membership F-1 — lifecycle authority', () => {
  test('PATCH cannot move identity; DELETE refused; notes ok', async ({ page }) => {
    // Browser health: F-1 must not introduce membership console errors or 5xx.
    const membershipConsoleErrors: string[] = [];
    const membership500s: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && /membership/i.test(msg.text())) {
        membershipConsoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      if (/membership/i.test(String(err))) membershipConsoleErrors.push(String(err));
    });
    page.on('response', (r) => {
      if (r.url().includes('/api/admin/customer-memberships') && r.status() >= 500) {
        membership500s.push(`${r.request().method()} ${r.url()} -> ${r.status()}`);
      }
    });

    await signIn(page);

    const list = await apiReq(page, 'get', '/customer-memberships?limit=100');
    expect(list.status, 'membership list must be readable').toBe(200);
    const rows = (list.body?.data ?? []) as Membership[];
    expect(rows.length, 'need one membership for F-1 probes').toBeGreaterThan(0);
    const target = rows[0];
    const originalNotes = target.notes;
    const moveCustomer = await apiReq(page, 'patch', `/customer-memberships/${target.id}`, {
      customer_id: '00000000-0000-0000-0000-000000000000',
    });
    console.log('[f1] PATCH customer_id =', moveCustomer.status);
    expect(moveCustomer.status, 'customer_id move rejected').toBe(400);

    const movePlan = await apiReq(page, 'patch', `/customer-memberships/${target.id}`, {
      plan_id: '00000000-0000-0000-0000-000000000000',
    });
    console.log('[f1] PATCH plan_id =', movePlan.status);
    expect(movePlan.status, 'plan_id rewrite rejected').toBe(400);

    const garbageStatus = await apiReq(page, 'patch', `/customer-memberships/${target.id}`, {
      status: 'suspended',
    });
    console.log('[f1] PATCH garbage status =', garbageStatus.status);
    expect(garbageStatus.status, 'arbitrary status rejected').toBe(400);

    const serverFields = await apiReq(page, 'patch', `/customer-memberships/${target.id}`, {
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      annual_price_snapshot: 1,
    });
    console.log('[f1] PATCH server fields =', serverFields.status);
    expect([200, 400], 'server fields must not 500').toContain(serverFields.status);

    const probeNotes = `F1-PROBE ${Date.now()}`;
    // Audit baseline (clock-independent): snapshot existing audit row ids for
    // this membership BEFORE mutating, so only THIS run's new rows are asserted.
    const baselineLogs = await apiReq(page, 'get', `/activity-logs?limit=100&orderBy=created_at&ascending=false`);
    expect(baselineLogs.status, 'activity-logs baseline readable').toBe(200);
    const baselineIds = new Set(
      ((baselineLogs.body?.data ?? []) as Array<Record<string, any>>).map((r) => String(r.id)),
    );

    const notesOk = await apiReq(page, 'patch', `/customer-memberships/${target.id}`, {
      notes: probeNotes,
    });
    console.log('[f1] PATCH notes =', notesOk.status);
    expect(notesOk.status, 'notes edit succeeds').toBe(200);
    expect(notesOk.body?.notes, 'notes round-trip').toBe(probeNotes);

    const restore = await apiReq(page, 'patch', `/customer-memberships/${target.id}`, {
      notes: originalNotes,
    });
    expect(restore.status, 'notes restore succeeds').toBe(200);
    expect(restore.body?.notes ?? null, 'notes restored to original value').toBe(originalNotes ?? null);

    const reread = await apiReq(page, 'get', `/customer-memberships/${target.id}`);
    expect(reread.status, 're-readable').toBe(200);
    expect(reread.body?.customer_id, 'customer_id unchanged').toBe(target.customer_id);
    expect(reread.body?.plan_id, 'plan_id unchanged').toBe(target.plan_id);
    expect(reread.body?.member_number, 'member_number unchanged').toBe(target.member_number);
    expect(reread.body?.notes ?? null, 'probe notes fully reverted').toBe(originalNotes ?? null);

    const del = await apiReq(page, 'delete', `/customer-memberships/${target.id}`);
    console.log('[f1] DELETE =', del.status);
    expect(del.status, 'hard delete rejected').toBe(409);
    const stillThere = await apiReq(page, 'get', `/customer-memberships/${target.id}`);
    expect(stillThere.status, 'row survives rejected DELETE').toBe(200);

    const batch = await apiReq(page, 'delete', `/customer-memberships/batch`, { ids: [target.id] });
    console.log('[f1] batch DELETE =', batch.status);
    expect(batch.status, 'batch delete rejected').toBe(409);

    // F-1 §8G: membership must still exist after the rejected batch delete.
    const afterBatch = await apiReq(page, 'get', `/customer-memberships/${target.id}`);
    expect(afterBatch.status, 'membership survives rejected batch DELETE').toBe(200);

    // F-1 §8G regression (NON-DESTRUCTIVE route-alive probes — no real mutation):
    // create with empty body must fail validation before any insert (400),
    // renew/cancel on a nonexistent id must 404 before any mutation.
    const createProbe = await apiReq(page, 'post', `/customer-memberships`, {});
    console.log('[f1] POST create (empty) =', createProbe.status);
    expect(createProbe.status, 'create route alive + validates before insert').toBe(400);

    const renewProbe = await apiReq(
      page, 'post', `/customer-memberships/00000000-0000-0000-0000-000000000000/renew`,
    );
    console.log('[f1] POST renew (nonexistent) =', renewProbe.status);
    expect(renewProbe.status, 'renew route alive + 404 before mutation').toBe(404);

    const cancelProbe = await apiReq(
      page, 'post', `/customer-memberships/00000000-0000-0000-0000-000000000000/cancel`,
    );
    console.log('[f1] POST cancel (nonexistent) =', cancelProbe.status);
    expect(cancelProbe.status, 'cancel route alive + 404 before mutation').toBe(404);

    // F-1 §15 read-only regression: plan + customer selection lists still serve.
    const plans = await apiReq(page, 'get', `/membership-plans?limit=100`);
    expect(plans.status, 'membership plans list works').toBe(200);
    expect(Array.isArray(plans.body?.data), 'plans payload shape intact').toBe(true);

    const customers = await apiReq(page, 'get', `/customers?limit=100`);
    expect(customers.status, 'customers list works').toBe(200);
    expect(Array.isArray(customers.body?.data), 'customers payload shape intact').toBe(true);

    // F-1 §11 audit verification via the runtime admin API (no service-role):
    // only the two successful mutations (notes probe + notes restore) may write
    // membership audit rows; every rejection must leave no mutation audit.
    const logs = await apiReq(page, 'get', `/activity-logs?limit=100&orderBy=created_at&ascending=false`);
    expect(logs.status, 'activity-logs readable via admin runtime').toBe(200);
    const logRows = (logs.body?.data ?? []) as Array<Record<string, any>>;
    console.log('[f1] activity-logs rows visible to admin:', logRows.length);
    const membershipLogs = logRows.filter(
      (r) =>
        r.table_name === 'customer_memberships' &&
        r.record_id === target.id &&
        !baselineIds.has(String(r.id)),
    );
    const updateRows = membershipLogs.filter((r) => r.action === 'UPDATE');
    const deleteRows = membershipLogs.filter((r) => r.action === 'DELETE');
    const createRows = membershipLogs.filter((r) => r.action === 'CREATE');
    console.log(
      `[f1] audit rows for target: UPDATE=${updateRows.length} DELETE=${deleteRows.length} CREATE=${createRows.length}`,
    );
    // notes probe + notes restore = exactly 2 UPDATE audit rows.
    expect(updateRows.length, 'successful notes mutations audited (probe + restore)').toBe(2);
    // Rejected DELETE/batch-DELETE/identity/status probes created no mutation.
    expect(deleteRows.length, 'no DELETE audit rows (rejections must not audit mutations)').toBe(0);
    expect(createRows.length, 'no CREATE audit rows').toBe(0);
    expect(membershipLogs.length, 'exactly the 2 successful mutations audited').toBe(2);

    const failures: string[] = [];
    page.on('response', (r) => {
      if (r.url().includes('/api/admin/customer-memberships') && !r.ok()) {
        failures.push(`${r.request().method()} ${r.url()} -> ${r.status()}`);
      }
    });
    await page.goto('/dashboard/members');
    await expect(page.getByRole('heading', { name: /member/i }).first()).toBeVisible({
      timeout: 30_000,
    });
    expect(failures, 'no failed membership API calls').toEqual([]);

    // F-1 §15: customers surface (assignment/selection UI) unaffected by the fix.
    await page.goto('/dashboard/customers');
    await expect(page.getByRole('heading', { name: /customer/i }).first()).toBeVisible({
      timeout: 30_000,
    });
    expect(failures, 'no failed membership API calls on customers page').toEqual([]);

    // F-1 §10 browser health: no 5xx or membership console errors from the fix.
    // (400/404/409 above are the intended protection responses, not failures.)
    expect(membership500s, 'no membership 5xx responses').toEqual([]);
    expect(membershipConsoleErrors, 'no membership console errors').toEqual([]);
  });
});
