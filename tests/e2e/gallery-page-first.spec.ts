/**
 * ADMIN GALLERY — PAGE-FIRST ISOLATION (READ-ONLY VERIFICATION)
 *
 * Proves the canonical Gallery ownership hierarchy is enforced end to end:
 *
 *     website_pages.id -> gallery.page_id -> media_id -> media_assets.public_url
 *
 * and that knowing a gallery item UUID is never sufficient to cross the
 * selected page_id boundary.
 *
 * SAFETY CONTRACT (§16 — no production data writes):
 *   Every request in this spec is a GET, or a mutation that is expected to be
 *   REJECTED before it reaches the database. No real Gallery item is ever
 *   updated or deleted: cross-page update/delete probes are issued against an
 *   item owned by a DIFFERENT page, so the ownership guard refuses them and no
 *   row is touched. No fixture Gallery rows are created.
 */

import { test, expect } from '@playwright/test';
import { testUsers } from './fixtures/auth';

const API = '/api/admin';

type GalleryItem = {
  id: string;
  title: string;
  page_id: string | null;
  media_id: string | null;
  image_url?: string | null;
};
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

const apiGet = (page: import('@playwright/test').Page, path: string) =>
  apiReq(page, 'get', path);

test.describe('Admin Gallery — page-first isolation (READ-ONLY)', () => {
  test('collection is page-constrained, cross-page access refused, media canonical', async ({
    page,
  }) => {
    await signIn(page);
    const pages = await readPages(page);
    expect(pages.length, 'at least one website page must exist').toBeGreaterThan(0);

    // ── R2: the authoritative query constrains gallery.page_id in Postgres ──
    const perPage = new Map<string, GalleryItem[]>();
    for (const wp of pages) {
      const res = await apiGet(page, `/gallery?limit=100&filter:page_id=eq:${wp.id}`);
      expect(res.status, `gallery list for page ${wp.page_key}`).toBe(200);
      const rows = (res.body?.data ?? []) as GalleryItem[];
      for (const row of rows) {
        expect(row.page_id, `gallery "${row.title}" leaked into page ${wp.page_key}`).toBe(wp.id);
      }
      perPage.set(wp.id, rows);
    }

    const owners = [...perPage.entries()].filter(([, r]) => r.length > 0);
    console.log(
      '[gallery] pages owning items:',
      owners
        .map(([id, r]) => `${pages.find((p) => p.id === id)?.page_key ?? id}=${r.length}`)
        .join(', ') || '(none)',
    );
    expect(owners.length, 'at least one page must own Gallery items').toBeGreaterThan(0);

    const ownerId = owners[0][0];
    const ownItems = owners[0][1];

    // Cross-page isolation can only be proven against a genuinely DIFFERENT
    // website page. Per the safety contract it is discovered from live data —
    // never inserted as a fixture, and never the same page under another name.
    expect(
      pages.length,
      'at least two website pages must exist to prove cross-page isolation',
    ).toBeGreaterThan(1);
    const otherPage = pages.find((p) => p.id !== ownerId);
    if (!otherPage) {
      // Not softenable: without a second real page the invariant is unprovable,
      // so the test must fail loudly rather than silently skip the proof.
      throw new Error(
        `cross-page isolation requires a second website page distinct from ${ownerId}`,
      );
    }

    console.log(
      '[gallery] owner page id =',
      ownerId,
      '| other page id =',
      otherPage.id,
      '| other page_key =',
      otherPage.page_key,
    );

    // ── R4: cross-page READ is refused ──
    const sample = ownItems[0];
    // Explicit proof of the §"no fake page ownership" invariant: the sample is
    // owned by the selected page and otherPage is a DIFFERENT page.
    expect(sample.page_id, 'the sample must carry page ownership').toBeTruthy();
    expect(
      sample.page_id,
      'otherPage must be a DIFFERENT page from the one owning the sample',
    ).not.toBe(otherPage.id);
    const readOwn = await apiGet(page, `/gallery/${sample.id}?page_id=${ownerId}`);
    console.log('[gallery] R4 same-page read status =', readOwn.status);
    expect(readOwn.status, 'same-page gallery read must succeed').toBe(200);

    const readCross = await apiGet(page, `/gallery/${sample.id}?page_id=${otherPage.id}`);
    console.log('[gallery] R4 cross-page read status =', readCross.status);
    expect(readCross.status, 'cross-page gallery read must be refused').toBe(404);
    // The refusal must not leak the record through ANY field. The single-item
    // route returns the bare record on success (see afterCross below), so a leak
    // would surface at the top level rather than under a `data` envelope.
    expect(readCross.body?.id, 'cross-page read must not leak the record id').toBeFalsy();
    expect(readCross.body?.title, 'cross-page read must not leak the record title').toBeFalsy();

    // ── R5: cross-page UPDATE is refused (guard runs BEFORE the DB write) ──
    const crossPatch = await apiReq(page, 'patch', `/gallery/${sample.id}?page_id=${otherPage.id}`, {
      title: 'GALLERY-CROSS-PAGE-PROBE-MUST-NOT-PERSIST',
    });
    console.log('[gallery] R5 cross-page PATCH status =', crossPatch.status);
    expect(crossPatch.status, 'cross-page gallery update must be refused').toBe(404);

    // ── R6: cross-page DELETE is refused (no row is deleted) ──
    const crossDelete = await apiReq(
      page,
      'delete',
      `/gallery/${sample.id}?page_id=${otherPage.id}`,
    );
    console.log('[gallery] R6 cross-page DELETE status =', crossDelete.status);
    expect(crossDelete.status, 'cross-page gallery delete must be refused').toBe(404);

    // Proof the probe changed nothing: the record still exists, unchanged.
    const afterCross = await apiGet(page, `/gallery/${sample.id}?page_id=${ownerId}`);
    expect(afterCross.status, 'record must still be readable in its own page').toBe(200);
    // The single-item route returns the BARE record (NextResponse.json(data)) —
    // only the collection route wraps rows in a `data` envelope. Reading `.data`
    // here silently yielded undefined, which is why this assertion must use the
    // real contract.
    expect(
      afterCross.body?.title,
      'cross-page probes must not have mutated the record',
    ).toBe(sample.title);
    expect(
      afterCross.body?.page_id,
      'page_id must be unchanged',
    ).toBe(sample.page_id);

    // ── R1: a request with NO page scope is fail-closed, not global ──
    const noScopeRead = await apiGet(page, `/gallery/${sample.id}`);
    console.log('[gallery] R1 unscoped read status =', noScopeRead.status);
    expect(noScopeRead.status, 'unscoped gallery read must be refused').toBe(400);

    const badPageRead = await apiGet(page, `/gallery/${sample.id}?page_id=${crypto.randomUUID()}`);
    console.log('[gallery] R4 unknown-page read status =', badPageRead.status);
    expect(badPageRead.status, 'unknown page_id must not reveal the record').toBe(404);

    // ── R3: create REQUIRES a valid page_id (rejected before any INSERT) ──
    // Probe 1: no page scope at all. The route rejects this before any INSERT.
    const createNoPage = await apiReq(page, 'post', '/gallery', {
      title: 'GALLERY-CREATE-PROBE-MUST-NOT-EXIST',
      page_id: null,
    });
    console.log('[gallery] R3 create without page_id status =', createNoPage.status);
    expect(createNoPage.status, 'gallery create without page_id must be refused').toBe(400);

    // Probe 2: a well-formed but NON-EXISTENT page. The scope must be stated in the
    // query string (that is how the Admin UI sends it) AND echoed in the body, so
    // the request reaches the page-existence check instead of failing earlier on a
    // missing scope. The route answers 400: a dangling page reference is an invalid
    // request, consistent with every other create-path rejection in this route.
    const ghostPageId = crypto.randomUUID();
    const createBadPage = await apiReq(page, 'post', `/gallery?page_id=${ghostPageId}`, {
      title: 'GALLERY-CREATE-PROBE-MUST-NOT-EXIST',
      page_id: ghostPageId,
    });
    console.log('[gallery] R3 create with unknown page_id status =', createBadPage.status);
    expect(createBadPage.status, 'gallery create with unknown page_id must be refused').toBe(400);

    // Probe 3: the body must not be able to target a page other than the selected
    // one. Scope = otherPage, body = the page that owns the sample.
    const createCrossPage = await apiReq(page, 'post', `/gallery?page_id=${otherPage.id}`, {
      title: 'GALLERY-CREATE-PROBE-MUST-NOT-EXIST',
      page_id: ownerId,
    });
    console.log('[gallery] R3 create with mismatched page_id status =', createCrossPage.status);
    expect(
      createCrossPage.status,
      'gallery create must not be able to target another page',
    ).toBe(400);

    // ── R8: media resolves canonically media_id -> media_assets -> public_url ──
    // Proven through the SAME resolver the Admin UI consumes. There is no GET on
    // /api/admin/media_assets/[id] (that route exposes only PATCH/DELETE), so the
    // gallery read enriches the row with resolved_image_url taken from
    // media_assets.public_url via src/lib/media/resolver.ts. That field is null
    // when the media_id has no matching asset, so a non-null absolute URL proves
    // the media_id -> media_assets -> public_url join actually resolved.
    const withMedia = ownItems.find((i) => !!i.media_id);
    expect(withMedia, 'at least one Gallery item must carry a media_id').toBeTruthy();
    const mediaRead = await apiGet(page, `/gallery/${withMedia!.id}?page_id=${ownerId}`);
    expect(mediaRead.status, 'the gallery item must be readable in its own page').toBe(200);
    expect(mediaRead.body?.media_id, 'the row must expose its media_id').toBe(withMedia!.media_id);
    expect(
      mediaRead.body?.resolved_image_url,
      'media_id must resolve through media_assets.public_url',
    ).toBeTruthy();
    expect(
      mediaRead.body?.resolved_image_url,
      'media_assets.public_url must be an absolute URL',
    ).toMatch(/^https?:\/\//);
    console.log('[gallery] R8 media chain OK:', mediaRead.body?.resolved_image_url);
  });

  test.afterAll(async () => {
    // Nothing to clean up: no spec in this file ever created or mutated a row.
  });
});


async function readPages(page: import('@playwright/test').Page): Promise<Page[]> {
  // website-pages can 500 on a cold process when the production schema lags the
  // allowlist (repository.ts prunes the missing column and re-derives on the
  // NEXT request). Pre-existing and out of scope, so retry once.
  let res = await apiGet(page, '/website-pages?limit=100');
  if (res.status === 500) res = await apiGet(page, '/website-pages?limit=100');
  expect(res.status, 'website-pages must be readable').toBe(200);
  return (res.body?.data ?? []) as Page[];
}
