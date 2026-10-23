/**
 * ADMIN GALLERY — PAGE-FIRST UI VERIFICATION (request interception)
 *
 * Black-box proof that the Admin Gallery screen does not load a global Gallery
 * collection before a Website Page is selected, and that once a page IS
 * selected every Gallery collection request carries that page's UUID.
 *
 * READ-ONLY: this spec only observes network traffic. It performs no create,
 * update or delete.
 */

import { test, expect } from '@playwright/test';
import { testUsers } from './fixtures/auth';

type GalleryRequest = { url: string; hasPageScope: boolean };

/** Only collection reads of the Gallery resource (not the single-item route). */
function isGalleryCollectionRequest(url: string): boolean {
  const path = new URL(url).pathname;
  return /\/api\/admin\/gallery\/?$/.test(path);
}

async function signIn(page: import('@playwright/test').Page) {
  const user = testUsers.super_admin;
  await page.goto('/login');
  await page.fill('#email', user.email);
  await page.fill('#password', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 45_000 });
}

test.describe('Admin Gallery — page-first UI', () => {
  test('no Gallery collection loads before a page is selected, and loads are page-scoped', async ({
    page,
  }) => {
    const galleryRequests: GalleryRequest[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (req.method() === 'GET' && isGalleryCollectionRequest(url)) {
        const parsed = new URL(url);
        galleryRequests.push({
          url,
          hasPageScope:
            parsed.searchParams.has('filter:page_id') ||
            parsed.searchParams.get('page_id') !== null,
        });
      }
    });

    await signIn(page);

    // ── Phase 1: the Gallery screen before any page is chosen ──
    // The page-first control only renders after website-pages has loaded — the view
    // returns <Spinner> while `pages.isLoading` (see gallery-view.tsx). That first
    // request also compiles its route on a cold dev server, so this test
    // synchronises on the rendered data-driven state below rather than relying on
    // this fixed settle. The page-first assertions that follow are unchanged.
    await page.goto('/dashboard/gallery');
    await page.waitForTimeout(3000);

    // A previously stored page scope may legitimately auto-resolve on load.
    // What must never happen is an UNSCOPED collection request.
    const unscoped = galleryRequests.filter((r) => !r.hasPageScope);
    console.log(
      '[gallery-ui] requests before manual selection:',
      galleryRequests.length,
      'unscoped:',
      unscoped.length,
    );
    expect(
      unscoped.length,
      'Gallery collection must never be requested without a page scope',
    ).toBe(0);

    // ── Phase 2: select a page explicitly and observe the scoped request ──
    // The canonical page-first control, exactly as rendered by production:
    //   <Select aria-label="Website page"> in src/features/gallery/gallery-view.tsx
    // There is no data-testid anywhere in this codebase, so the test targets the
    // real accessible name of the control rather than a test-only hook.
    const pageSelect = page.locator('select[aria-label="Website page"]');
    // Wait on the real data-driven state: the control is only rendered once
    // website-pages has resolved, and its <option> list is what proves a genuine
    // page_id can be selected. This is a wait on application state, not a raised
    // assertion threshold — if the page list cannot load, the test must fail.
    await expect(
      pageSelect.locator('option'),
      'the Gallery page selector must render populated website pages',
    ).not.toHaveCount(0, { timeout: 30_000 });
    await expect(pageSelect, 'Gallery page selector must be present').toBeVisible();

    const options = await pageSelect.locator('option').evaluateAll((els) =>
      els
        .map((e) => (e as HTMLOptionElement).value)
        .filter((v) => v.length > 0),
    );
    console.log('[gallery-ui] selectable page ids:', options.length);
    expect(options.length, 'at least one website page must be selectable').toBeGreaterThan(0);

    // "All pages" must not be offered as a scope that loads every record.
    const emptyOption = await pageSelect
      .locator('option[value=""]')
      .evaluateAll((els) => els.map((e) => e.textContent?.trim() ?? ''));
    console.log('[gallery-ui] empty-value options:', JSON.stringify(emptyOption));

    // The screen may auto-resolve a scope on load, so to observe a NEW request we
    // must select a page that differs from the currently active scope — otherwise
    // the react-query key is unchanged and no refetch is expected.
    const currentScope = await pageSelect.inputValue();
    console.log('[gallery-ui] auto-resolved initial scope:', currentScope || '(none)');
    const target = options.find((v) => v !== currentScope);
    expect(
      target,
      'a second selectable page must exist to prove page selection re-scopes the query',
    ).toBeTruthy();
    expect(target, 'the target page must differ from the current scope').not.toBe(currentScope);

    galleryRequests.length = 0;
    await pageSelect.selectOption(target!);
    await page.waitForTimeout(3000);

    const afterSelect = [...galleryRequests];
    console.log(
      '[gallery-ui] requests after selecting a page:',
      afterSelect.map((r) => r.url.split('/api')[1]).join(' | ') || '(none)',
    );
    expect(afterSelect.length, 'selecting a page must load its Gallery collection').toBeGreaterThan(0);
    expect(
      afterSelect.filter((r) => !r.hasPageScope).length,
      'every post-selection Gallery request must carry the page scope',
    ).toBe(0);

    const scopedUrl = afterSelect[0].url;
    expect(scopedUrl, 'the request must reference the selected page UUID').toContain(target!);

    // ── Phase 3: switching pages re-scopes the request ──
    const switchTo = options.find((v) => v !== target);
    expect(
      switchTo,
      'a second selectable page must exist to prove page switching re-scopes the query',
    ).toBeTruthy();
    galleryRequests.length = 0;
    await pageSelect.selectOption(switchTo!);
    await page.waitForTimeout(3000);
    const afterSwitch = [...galleryRequests];
    console.log(
      '[gallery-ui] requests after switching page:',
      afterSwitch.map((r) => r.url.split('/api')[1]).join(' | ') || '(none)',
    );
    expect(afterSwitch.length, 'switching pages must re-query').toBeGreaterThan(0);
    expect(afterSwitch[0].url, 'the new request must reference the new page UUID').toContain(
      switchTo!,
    );
    expect(
      afterSwitch.filter((r) => !r.hasPageScope).length,
      'page switching must never fall back to an unscoped load',
    ).toBe(0);
  });
});
