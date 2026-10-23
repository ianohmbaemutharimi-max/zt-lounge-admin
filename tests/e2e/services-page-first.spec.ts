/**
 * ADMIN SERVICES — PAGE-FIRST ISOLATION (READ-ONLY VERIFICATION)
 *
 * Proves the canonical Services ownership hierarchy is enforced end to end:
 *
 *     website_pages.id -> services.page_id -> service_charges.service_id
 *
 * and that knowing a service_id (or a service slug) is never sufficient to
 * cross the selected page_id boundary.
 *
 * SAFETY CONTRACT (§25 — no production data writes):
 *   Every request in this spec is a GET, except the F2 write probes below,
 *   which are mutation-proof BY CONSTRUCTION: they target a fabricated,
 *   non-existent UUID (so 0 rows can ever match) and a create payload that
 *   cannot satisfy the dedicated route's server-side service hop (so no row
 *   can be inserted). No real record is ever created, updated or deleted, no
 *   fake Service is created to test isolation, and no ALTER / DROP /
 *   TRUNCATE is issued. Authorization is proven through read paths and
 *   unreachable write paths, never by mutating a real record.
 */

import { test, expect } from '@playwright/test';
import { testUsers } from './fixtures/auth';

const API = '/api/admin';

type Service = { id: string; name: string; slug: string; page_id: string | null };
type Page = { id: string; title: string; page_key: string };

/**
 * The admin API is cookie-authenticated (Supabase SSR): getServerSession reads
 * the session from cookies, not from an Authorization header. So the spec signs
 * in through the real /login form and then issues API calls through
 * `page.request`, which shares the browser context's cookie jar.
 */
async function signIn(page: import('@playwright/test').Page) {
  const user = testUsers.super_admin;
  await page.goto('/login');
  await page.fill('#email', user.email);
  await page.fill('#password', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 45_000 });
}

async function apiGet(
  page: import('@playwright/test').Page,
  path: string,
) {
  const res = await page.request.get(`${API}${path}`);
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status(), body };
}

test.describe('Admin Services — page-first isolation (READ-ONLY)', () => {
  test('service collection is page-constrained and cross-page access is refused', async ({
    page,
  }) => {
    await signIn(page);

    // ── Locate the website pages, then read each page's service collection ─
    // website-pages can 500 on a cold process when the production schema lags
    // the allowlist (repository.ts prunes the missing column and re-derives on
    // the NEXT request). That is a pre-existing, out-of-scope condition, so the
    // spec retries once to let the documented graceful degradation take effect.
    let pagesRes = await apiGet(page, '/website-pages?limit=100');
    if (pagesRes.status === 500) {
      console.log('[page-first] website-pages cold-start 500; retrying after column prune');
      pagesRes = await apiGet(page, '/website-pages?limit=100');
    }
    if (pagesRes.status !== 200) {
      console.log('[page-first] website-pages diagnostics:', JSON.stringify(pagesRes.body));
    }
    expect(pagesRes.status, 'website-pages must be readable').toBe(200);
    const pages = (pagesRes.body?.data ?? []) as Page[];
    expect(pages.length, 'at least one website page must exist').toBeGreaterThan(0);

    // The authoritative query is services.page_id = selected_page_id,
    // enforced in Postgres — not narrowed in React.
    const perPage = new Map<string, Service[]>();
    for (const wp of pages) {
      const res = await apiGet(page, `/services?limit=100&filter:page_id=eq:${wp.id}`);
      expect(res.status, `services list for page ${wp.page_key}`).toBe(200);
      const rows = (res.body?.data ?? []) as Service[];

      // Query-level isolation: EVERY returned row belongs to the requested page.
      for (const row of rows) {
        expect(
          row.page_id,
          `service "${row.name}" leaked into page ${wp.page_key}`,
        ).toBe(wp.id);
      }
      perPage.set(wp.id, rows);
    }

    const pagesWithServices = [...perPage.entries()].filter(([, rows]) => rows.length > 0);
    console.log(
      '[page-first] pages owning services:',
      pagesWithServices
        .map(([id, rows]) => `${pages.find((p) => p.id === id)?.page_key ?? id}=${rows.length}`)
        .join(', '),
    );

    if (pagesWithServices.length < 2) {
      // Not a failure of the invariant: with a single owning page there is no
      // second page to cross into. Report and skip the cross-page block.
      console.log(
        '[page-first] only one page owns services — cross-page assertions need 2+ such pages',
      );
      return;
    }

    const [[pageAId, servicesA], [pageBId, servicesB]] = pagesWithServices;
    const pageA = pages.find((p) => p.id === pageAId)!;
    const pageB = pages.find((p) => p.id === pageBId)!;
    const serviceA = servicesA[0];
    const serviceB = servicesB[0];

    // ── Disjointness: the two page-scoped collections never overlap ────────
    const idsA = new Set(servicesA.map((s) => s.id));
    for (const s of servicesB) {
      expect(idsA.has(s.id), 'page-scoped collections must be disjoint').toBe(false);
    }

    // ── Requirement D/F: read one service by id across the page boundary ──
    const ownRead = await apiGet(page, `/services/${serviceA.id}?page_id=${pageAId}`);
    expect(ownRead.status, 'own-page service read must succeed').toBe(200);
    expect(ownRead.body?.page_id).toBe(pageAId);

    const crossRead = await apiGet(page, `/services/${serviceB.id}?page_id=${pageAId}`);
    expect(
      crossRead.status,
      'cross-page service read must be rejected/inaccessible',
    ).toBeGreaterThanOrEqual(400);
    expect([403, 404]).toContain(crossRead.status);
    // The response must not confirm the record exists on another page.
    expect(crossRead.body?.id).toBeUndefined();

    // ── No page context at all → refused (fail-closed) ───────────────────
    const noScopeRead = await apiGet(page, `/services/${serviceA.id}`);
    expect(
      noScopeRead.status,
      'service read without page_id must be refused',
    ).toBeGreaterThanOrEqual(400);
    expect([400, 403, 404]).toContain(noScopeRead.status);

    // ── Requirement E: charges stay subordinate to the selected service ──
    const ownCharges = await apiGet(page, `/services/${serviceA.slug}/charges?page_id=${pageAId}`);
    expect(ownCharges.status, 'own-page charges must load').toBe(200);
    for (const charge of ownCharges.body?.data ?? []) {
      expect(charge.service_id).toBe(serviceA.id);
    }

    // Cross-page charges: page B's service slug while page A is selected.
    const crossCharges = await apiGet(
      page,
      `/services/${serviceB.slug}/charges?page_id=${pageAId}`,
    );
    expect(
      crossCharges.status,
      'cross-page charges must be rejected/inaccessible',
    ).toBeGreaterThanOrEqual(400);
    expect([403, 404]).toContain(crossCharges.status);
    expect(crossCharges.body?.data).toBeUndefined();

    // Charges with no selected page are refused as well.
    const unscopedCharges = await apiGet(page, `/services/${serviceA.slug}/charges`);
    expect(
      unscopedCharges.status,
      'charges without page_id must be refused',
    ).toBeGreaterThanOrEqual(400);
    expect([400, 403, 404]).toContain(unscopedCharges.status);

    console.log(
      `[page-first] pageA=${pageA.page_key} pageB=${pageB.page_key} — ` +
        `crossRead=${crossRead.status} crossCharges=${crossCharges.status} ` +
        `noScope=${noScopeRead.status} unscopedCharges=${unscopedCharges.status}`,
    );
  });

  // ── F1 companion: no session → 401, fail closed before any ownership logic ─
  test('unauthenticated service read is refused with 401', async ({ page }) => {
    await signIn(page);
    const origin = new URL(page.url()).origin;

    const pagesRes = await apiGet(page, '/website-pages?limit=100');
    const pages = (pagesRes.body?.data ?? []) as Page[];
    expect(pages.length, 'at least one website page must exist').toBeGreaterThan(0);

    // Not every page owns services — find one that does (read-only, no writes).
    let target: { page: Page; service: Service } | null = null;
    for (const wp of pages) {
      const svcRes = await apiGet(page, `/services?limit=100&filter:page_id=eq:${wp.id}`);
      const rows = (svcRes.body?.data ?? []) as Service[];
      if (rows.length) {
        target = { page: wp, service: rows[0] };
        break;
      }
    }
    expect(target, 'at least one page must own a service').not.toBeNull();

    const anonCtx = await page.context().browser()!.newContext({ baseURL: origin });
    try {
      const res = await anonCtx.request.get(
        `${API}/services/${target!.service.id}?page_id=${target!.page.id}`,
      );
      expect(res.status(), 'no-session read must be 401').toBe(401);
    } finally {
      await anonCtx.close();
    }
  });

  // ── F2: generic resource API refuses service_charges; dedicated route stays ─
  test('generic service_charges routes fail closed; dedicated gate unchanged', async ({
    page,
  }) => {
    await signIn(page);

    const FABRICATED = '00000000-0000-4000-8000-000000000000';

    // Reads: list + by-id must look exactly like an unknown resource (404).
    const list = await apiGet(page, '/service_charges?limit=5');
    expect(list.status, 'generic service_charges list must be refused').toBe(404);
    expect(list.body?.error?.code).toBe('NOT_FOUND');
    expect(list.body?.data).toBeUndefined();

    const byId = await apiGet(page, `/service_charges/${FABRICATED}`);
    expect(byId.status, 'generic service_charges read must be refused').toBe(404);
    expect(byId.body?.error?.code).toBe('NOT_FOUND');

    // Writes: refused BEFORE the repository. Payloads are mutation-proof
    // (fabricated ids / no server-side service hop) even if a guard regressed.
    const postRes = await page.request.post(`${API}/service_charges`, {
      data: { name: '_p0_probe', price: 1, unit: 'session', service_id: FABRICATED },
    });
    expect(postRes.status(), 'generic create must be refused').toBe(404);

    const patchRes = await page.request.patch(`${API}/service_charges/${FABRICATED}`, {
      data: { name: '_p0_probe', price: 1 },
    });
    expect(patchRes.status(), 'generic update must be refused').toBe(404);

    const delRes = await page.request.delete(`${API}/service_charges/${FABRICATED}`);
    expect(delRes.status(), 'generic delete must be refused').toBe(404);

    const batchRes = await page.request.delete(`${API}/service_charges/batch`, {
      data: { ids: [FABRICATED] },
    });
    expect(batchRes.status(), 'generic batch delete must be refused').toBe(404);

    // The dedicated gate remains the single working path (own scope → 200).
    const wpRes = await apiGet(page, '/website-pages?limit=100');
    const wps = (wpRes.body?.data ?? []) as Page[];
    let dedicated: { status: number; body?: any } | null = null;
    for (const wp of wps) {
      const sRes = await apiGet(page, `/services?limit=100&filter:page_id=eq:${wp.id}`);
      const sRows = (sRes.body?.data ?? []) as Service[];
      if (!sRows.length) continue;
      dedicated = await apiGet(page, `/services/${sRows[0].slug}/charges?page_id=${wp.id}`);
      if (dedicated.status === 200) break;
    }
    expect(dedicated?.status, 'dedicated charges route must still serve 200').toBe(200);
    console.log('[page-first] F2 generic refusals + dedicated 200 verified');
  });
});

