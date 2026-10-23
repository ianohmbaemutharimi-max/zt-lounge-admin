/**
 * LOOP 16B.1 — INLINE IMAGEBROWSER INTERACTION VERIFICATION (read-only forensic probe)
 * No application code changed. Authenticates via UI form. Cancels every flow => 0 writes.
 */
import { test, expect, type Page, type Locator } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const EMAIL = process.env.E2E_SUPER_ADMIN_EMAIL;
const PASSWORD = process.env.E2E_SUPER_ADMIN_PASSWORD;

/* ---- helpers ---- */
function trackErrors(p: Page): string[] {
  const e: string[] = [];
  p.on('console', (m) => { if (m.type() === 'error') e.push(m.text()); });
  p.on('pageerror', (err) => e.push(err.message));
  return e;
}
function trackNetwork(p: Page) {
  const reqs: { method: string; url: string }[] = [];
  p.on('request', (r) => reqs.push({ method: r.method(), url: r.url() }));
  return reqs;
}
function getNonTestErrors(errors: string[]): string[] {
  return errors.filter(e => {
    const l = e.toLowerCase();
    if (l.includes('warning') || l.includes('deprecat')) return false;
    // Environmental: unreachable public-source demo image hosts are data issues,
    // not ImageBrowser defects (pre-existing broken demo imagery).
    if (l.includes('net::err_connection') || l.includes('failed to load resource')) return false;
    return true;
  });
}
/** Thumbnails live inside the image grid (div.grid > button[title]).
 *  NOTE: a bare button[title] can also match broken "No image" thumbnails that
 *  have no <img> child — use browserImgThumbs for src-level checks. */
function browserThumbs(p: Page): Locator {
  return p.locator('[role="dialog"] div.grid button[title]');
}
function browserImgThumbs(p: Page): Locator {
  return p.locator('[role="dialog"] div.grid button[title]').filter({ has: p.locator('img') });
}
/** LOOP 16C: browse view is indicated by the Back button (header text is canonical 'Your images'). */
async function returnToChoose(p: Page) {
  const backBtn = p.locator('[aria-label="Back to image options"]');
  if (await backBtn.isVisible().catch(() => false)) {
    await backBtn.click();
    await expect(backBtn).toBeHidden();
  }
  await expect(p.getByRole('button', { name: 'Cancel' }).last()).toBeVisible({ timeout: 5000 });
}
async function login(p: Page) {
  test.skip(!EMAIL || !PASSWORD, 'E2E credentials not configured');
  await p.goto(`${BASE_URL}/login`);
  await p.fill('#email', EMAIL!);
  await p.fill('#password', PASSWORD!);
  await p.click('button[type=submit]');
  await p.waitForURL(`${BASE_URL}/dashboard`, { timeout: 20000 });
  await p.waitForLoadState('networkidle');
}
async function settle(p: Page, ms = 1000) {
  try { await p.waitForLoadState('networkidle', { timeout: 3000 }); }
  catch { /* networkidle may never resolve on streaming/long-poll; ignore */ }
  await p.waitForTimeout(ms);
}
async function dialogCount(p: Page): Promise<number> {
  return await p.locator('[role="dialog"]').count();
}
async function dialogLabels(p: Page): Promise<string[]> {
  const locs = p.locator('[role="dialog"]');
  const n = await locs.count();
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push((await locs.nth(i).getAttribute('aria-label')) || '(no aria-label)');
  }
  return out;
}
async function settingsImageEditButton(p: Page): Promise<Locator> {
  await p.goto(`${BASE_URL}/dashboard/settings`);
  await settle(p);
  const logo = p.getByRole('button', { name: /Select Logo|Change Logo/i }).first();
  const fav = p.getByRole('button', { name: /Select Favicon|Change Favicon/i }).first();
  try { await logo.waitFor({ state: 'visible', timeout: 4000 }); return logo; }
  catch { try { await fav.waitFor({ state: 'visible', timeout: 4000 }); return fav; }
  catch { const f = p.getByRole('button', { name: /edit/i }).first(); await f.waitFor({ state: 'visible', timeout: 5000 }); return f; } }
}
/**
 * Verify the inline ImageBrowser flow within an open ImageChangeDialog.
 * expectedDialogCount: 1 for direct-open consumers (services/gallery/settings),
 *                      2 for consumers with a parent form dialog (promotions).
 */
async function verifyInlineBrowserFlow(p: Page, errors: string[], expectedDialogCount: number) {
  // 6.1 OPEN CHOOSER — dialog open, preview/chooser visible
  await expect(p.locator('[role="dialog"]')).toHaveCount(expectedDialogCount, { timeout: 10000 });
  const hasPreview = await p.locator('img[alt="Preview"]').count() > 0;
  const hasNoImage = await p.getByText('No image selected').isVisible();
  expect(hasPreview || hasNoImage).toBeTruthy();
  await expect(p.getByRole('button', { name: 'Your images' })).toBeVisible({ timeout: 5000 });

  // 7. OPEN INLINE BROWSER — Your images opens inline, no second modal
  const countBefore = await dialogCount(p);
  await p.getByRole('button', { name: 'Your images' }).click();
  await settle(p);
  expect(await dialogCount(p)).toBe(countBefore);
  const labels = await dialogLabels(p);
  for (const label of labels) { expect(label).not.toBe('Browse Media Library'); }
  await expect(p.getByRole('button', { name: 'Back to image options' })).toBeVisible({ timeout: 5000 });
  await expect(p.locator('[aria-label="Back to image options"]')).toBeVisible({ timeout: 5000 });
  await expect(p.getByPlaceholder('Search images by name or title…')).toBeVisible({ timeout: 5000 });
  const thumbs = browserThumbs(p);
  await expect(thumbs.first()).toBeVisible({ timeout: 15000 });
  const beforeCount = await thumbs.count();

  // 8. SEARCH TEST
  const firstTitle = (await thumbs.first().getAttribute('title')) || '';
  const searchTerm = firstTitle.split(/[\s_-]+/)[0]?.substring(0, 6) || 'zzz-nomatch';
  await p.getByPlaceholder('Search images by name or title…').fill(searchTerm);
  await settle(p, 500);
  const afterCount = await thumbs.count();
  expect(afterCount).toBeLessThanOrEqual(beforeCount);
  await p.locator('[aria-label="Clear search"]').click();
  await settle(p, 500);
  expect(await thumbs.count()).toBe(beforeCount);

  // 9. IMAGE SELECTION TEST
  if (beforeCount > 0) {
    const thumbToSelect = thumbs.first();
    const thumbSrc = await thumbToSelect.locator('img').getAttribute('src');
    await thumbToSelect.click();
    await settle(p, 500);
    await expect(p.getByRole('button', { name: 'Back to image options' })).toBeHidden();
    await expect(p.getByRole('button', { name: 'Your images' })).toBeVisible();
    expect(await dialogCount(p)).toBe(expectedDialogCount);
    const preview = p.locator('img[alt="Preview"]');
    if (await preview.count() > 0 && thumbSrc) {
      expect(await preview.getAttribute('src')).toBe(thumbSrc);
    }
  }

  // 11. BACK BUTTON TEST
  await p.getByRole('button', { name: 'Your images' }).click();
  await settle(p);
  await expect(p.getByRole('button', { name: 'Back to image options' })).toBeVisible();
  await p.locator('[aria-label="Back to image options"]').click();
  await settle(p);
  await expect(p.getByRole('button', { name: 'Back to image options' })).toBeHidden();
  await expect(p.getByRole('button', { name: 'Your images' })).toBeVisible();
  expect(await dialogCount(p)).toBe(expectedDialogCount);

  // 12. CANCEL TEST — return from browse first (Cancel lives only in choose view)
  await returnToChoose(p);
  // Scope to the ImageChangeDialog itself (its choose view contains 'Your images')
  // so the parent form's own Cancel button (Promotions) never matches.
  const chooserCancel = p
    .locator('[role="dialog"]')
    .filter({ has: p.getByRole('button', { name: 'Your images' }) })
    .getByRole('button', { name: 'Cancel' });
  await expect(chooserCancel).toHaveCount(1);
  await chooserCancel.click();
  // Parent form dialogs (expectedDialogCount=2) intentionally remain open
  await expect(p.locator('[role="dialog"]')).toHaveCount(expectedDialogCount - 1, { timeout: 5000 });
}
/** Reset test: open → Your images → cancel → reopen starts in choose */
async function verifyReset(p: Page, openDialog: () => Promise<void>) {
  await openDialog();
  await settle(p);
  await expect(p.locator('[role="dialog"]')).toHaveCount(1);
  await p.getByRole('button', { name: 'Your images' }).click();
  await settle(p);
  await expect(p.getByRole('button', { name: 'Back to image options' })).toBeVisible();
  // Cancel lives only in choose view — return from browse first
  await returnToChoose(p);
  await p.getByRole('button', { name: 'Cancel' }).click();
  await expect(p.locator('[role="dialog"]')).toHaveCount(0);
  await openDialog();
  await settle(p);
  await expect(p.locator('[role="dialog"]')).toHaveCount(1);
  await expect(p.getByRole('button', { name: 'Your images' })).toBeVisible();
  await expect(p.getByRole('button', { name: 'Back to image options' })).toBeHidden();
  await p.getByRole('button', { name: 'Cancel' }).click();
}

/* ---- suite ---- */
test.describe('LOOP 16B.1 — Inline ImageBrowser Interaction Verification', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  // 6. PRIMARY TEST — SERVICES
  test('Services: inline ImageBrowser flow', async ({ page }) => {
    const errors = trackErrors(page);
    const requests = trackNetwork(page);
    await page.goto(`${BASE_URL}/dashboard/services`);
    await settle(page, 2000);
    const editImageBtns = page.locator('button[title="Choose image"]');
    if (await editImageBtns.count() === 0) {
      // First visit has NO page scope (no-default contract): row actions AND the
      // New Service button are both gated on a selected page. Select the KNOWN
      // populated page (grooming-care, else last option) so the flow can run.
      const scopeSel = page.locator('select').filter({ hasText: 'page' }).first();
      const opts = await scopeSel.locator('option').evaluateAll((els) =>
        els.map((e) => ({ v: (e as HTMLOptionElement).value, t: (e.textContent || '').trim() })).filter((o) => o.v),
      );
      const scopePick = opts.find((o) => o.t.startsWith('/grooming-care')) || opts[opts.length - 1];
      if (scopePick) {
        await scopeSel.selectOption(scopePick.v);
        await settle(page, 1500);
      }
    }
    if (await editImageBtns.count() > 0) {
      await editImageBtns.first().click();
      await settle(page);
      await verifyInlineBrowserFlow(page, errors, 1);
    } else {
      const newBtn = page.getByRole('button', { name: /New Service/i });
      await newBtn.click();
      await settle(page);
      await page.getByRole('button', { name: 'Choose image', exact: true }).click();
      await settle(page);
      await verifyInlineBrowserFlow(page, errors, 2);
      const cancels = page.getByRole('button', { name: 'Cancel' });
      if (await cancels.count() > 1) await cancels.first().click();
      else await page.keyboard.press('Escape');
    }
    const mutations = requests.filter(r => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method));
    expect(mutations, `Unexpected mutations: ${JSON.stringify(mutations.map(m => m.url))}`).toHaveLength(0);
    expect(getNonTestErrors(errors), `Console errors: ${JSON.stringify(getNonTestErrors(errors))}`).toEqual([]);
  });

  // 14. PROMOTIONS
  test('Promotions: inline ImageBrowser flow', async ({ page }) => {
    const errors = trackErrors(page);
    const requests = trackNetwork(page);
    await page.goto(`${BASE_URL}/dashboard/promotions`);
    await settle(page, 2000);
    const editBtn = page.getByTitle('Edit');
    if (await editBtn.count() === 0) { test.skip(); }
    await editBtn.first().click();
    await settle(page);
    await page.getByRole('button', { name: /Change image|Choose image/ }).click();
    await settle(page);
    // 2 dialogs: edit form + ImageChangeDialog
    await verifyInlineBrowserFlow(page, errors, 2);
    // Close edit form dialog
    await page.keyboard.press('Escape');
    const mutations = requests.filter(r => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method));
    expect(mutations, `Unexpected mutations: ${JSON.stringify(mutations.map(m => m.url))}`).toHaveLength(0);
    expect(getNonTestErrors(errors), `Console errors: ${JSON.stringify(getNonTestErrors(errors))}`).toEqual([]);
  });

  // THIRD CONSUMER — GALLERY
  test('Gallery: inline ImageBrowser flow', async ({ page }) => {
    const errors = trackErrors(page);
    const requests = trackNetwork(page);
    await page.goto(`${BASE_URL}/dashboard/gallery`);
    await settle(page, 2000);
    // Try Pencil (Choose image) on existing items first
    const pencilBtns = page.locator('button[title="Choose image"]');
    if (await pencilBtns.count() > 0) {
      await pencilBtns.first().click();
      await settle(page);
      await verifyInlineBrowserFlow(page, errors, 1);
    } else {
      const addBtn = page.getByRole('button', { name: /Add Image/i });
      await addBtn.click();
      await settle(page);
      await page.getByRole('button', { name: 'Choose image', exact: true }).click();
      await settle(page);
      await verifyInlineBrowserFlow(page, errors, 2);
      const cancels = page.getByRole('button', { name: 'Cancel' });
      if (await cancels.count() > 0) await cancels.first().click();
    }
    const mutations = requests.filter(r => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method));
    expect(mutations, `Unexpected mutations: ${JSON.stringify(mutations.map(m => m.url))}`).toHaveLength(0);
    expect(getNonTestErrors(errors), `Console errors: ${JSON.stringify(getNonTestErrors(errors))}`).toEqual([]);
  });

  // 16. FOURTH CONSUMER — SETTINGS
  test('Settings: inline ImageBrowser flow', async ({ page }) => {
    const errors = trackErrors(page);
    const requests = trackNetwork(page);
    const editBtn = await settingsImageEditButton(page);
    await editBtn.click();
    await settle(page);
    await verifyInlineBrowserFlow(page, errors, 1);
    const mutations = requests.filter(r => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method));
    expect(mutations, `Unexpected mutations: ${JSON.stringify(mutations.map(m => m.url))}`).toHaveLength(0);
    expect(getNonTestErrors(errors), `Console errors: ${JSON.stringify(getNonTestErrors(errors))}`).toEqual([]);
  });

  // 13. CLOSE/RESET TEST
  test('Reset: dialog starts in choose view after close/reopen', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto(`${BASE_URL}/dashboard/services`);
    await settle(page, 2000);
    const editBtn = page.locator('button[title="Choose image"]');
    if (await editBtn.count() === 0) { test.skip(); }
    const openDialog = async () => { await editBtn.first().click(); await settle(page); };
    await verifyReset(page, openDialog);
    expect(getNonTestErrors(errors)).toEqual([]);
  });

  // 18. SINGLE-MODAL ASSERTION (dedicated)
  test('Single-modal: opening Your images does not spawn a second dialog', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto(`${BASE_URL}/dashboard/services`);
    await settle(page, 2000);
    const editBtn = page.locator('button[title="Choose image"]');
    if (await editBtn.count() === 0) { test.skip(); }
    await editBtn.first().click();
    await settle(page);
    const before = await dialogCount(page);
    await page.getByRole('button', { name: 'Your images' }).click();
    await settle(page);
    expect(await dialogCount(page)).toBe(before);
    // No MediaPickerModal (aria-label="Browse Media Library")
    const labels = await dialogLabels(page);
    expect(labels).not.toContain('Browse Media Library');
    // Only one aria-modal per dialog level (no nested focus trap)
    const modalDialogs = page.locator('[role="dialog"][aria-modal="true"]');
    expect(await modalDialogs.count()).toBe(before);
    await returnToChoose(page);
    await page.getByRole('button', { name: 'Cancel' }).click();
    expect(getNonTestErrors(errors)).toEqual([]);
  });

  // 19-20. CONSOLE + NETWORK MONITORING (dedicated full-flow check)
  test('No console errors and no mutation requests during full flow', async ({ page }) => {
    const errors = trackErrors(page);
    const requests = trackNetwork(page);
    await page.goto(`${BASE_URL}/dashboard/services`);
    await settle(page, 2000);
    const editBtn = page.locator('button[title="Choose image"]');
    if (await editBtn.count() === 0) { test.skip(); }
    await editBtn.first().click();
    await settle(page);
    await page.getByRole('button', { name: 'Your images' }).click();
    await settle(page);
    const thumbs = browserThumbs(page);
    if (await thumbs.count() > 0) {
      const t = await thumbs.first().getAttribute('title');
      if (t) {
        const term = t.split(/[\s_-]+/)[0]?.substring(0, 6) || 'test';
        await page.getByPlaceholder('Search images by name or title…').fill(term);
        await settle(page, 500);
        await page.locator('[aria-label="Clear search"]').click();
        await settle(page, 500);
        await thumbs.first().click();
        await settle(page, 500);
      }
    }
    await returnToChoose(page);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
    const mutations = requests.filter(r => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method));
    expect(mutations, `Mutations detected: ${JSON.stringify(mutations.map(m => ({ m: m.method, u: m.url })))}`).toHaveLength(0);
    expect(getNonTestErrors(errors), `Console errors: ${JSON.stringify(getNonTestErrors(errors))}`).toEqual([]);
  });

  // 21. RESPONSIVE CHECK
  test('Responsive: mobile viewport keeps browser usable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE_URL}/dashboard/services`);
    await settle(page, 2000);
    const editBtn = page.locator('button[title="Choose image"]');
    if (await editBtn.count() === 0) { test.skip(); }
    await editBtn.first().click();
    await settle(page);
    await expect(page.locator('[role="dialog"]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Your images' }).click();
    await settle(page);
    await expect(page.getByRole('button', { name: 'Back to image options' })).toBeVisible();
    await expect(page.locator('[aria-label="Back to image options"]')).toBeVisible();
    await expect(page.getByPlaceholder('Search images by name or title…')).toBeVisible();
    const thumbs = browserThumbs(page);
    if (await thumbs.count() > 0) { await thumbs.first().click(); await settle(page, 500); }
    await returnToChoose(page);
    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  // 22. ACCESSIBILITY CHECK
  test('Accessibility: dialog name, Back label, search label, keyboard', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/services`);
    await settle(page, 2000);
    const editBtn = page.locator('button[title="Choose image"]');
    if (await editBtn.count() === 0) { test.skip(); }
    await editBtn.first().click();
    await settle(page);
    // Dialog has accessible name
    const ariaLabel = await page.locator('[role="dialog"]').getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
    // Open browser
    await page.getByRole('button', { name: 'Your images' }).click();
    await settle(page);
    // Back button has accessible name
    const backLabel = await page.locator('[aria-label="Back to image options"]').getAttribute('aria-label');
    expect(backLabel).toBe('Back to image options');
    // Search input has accessible label
    const searchLabel = await page.locator('input[aria-label="Search images"]').getAttribute('aria-label');
    expect(searchLabel).toBe('Search images');
    // Keyboard: Tab to first thumbnail (with <img>), Enter to select
    const thumbs = browserImgThumbs(page);
    if (await thumbs.count() > 0) {
      await thumbs.first().focus();
      await expect(thumbs.first()).toBeFocused();
      await page.keyboard.press('Enter');
      await settle(page, 500);
      await expect(page.getByRole('button', { name: 'Back to image options' })).toBeHidden();
    }
    // Escape closes the single dialog (no nested trap)
    await page.keyboard.press('Escape');
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  });

  // 23. DATA SAFETY VERIFICATION
  test('Data safety: zero writes during full verification flow', async ({ page }) => {
    const requests = trackNetwork(page);
    await page.goto(`${BASE_URL}/dashboard/services`);
    await settle(page, 2000);
    const editBtn = page.locator('button[title="Choose image"]');
    if (await editBtn.count() === 0) { test.skip(); }
    await editBtn.first().click();
    await settle(page);
    // Full read-only flow
    await page.getByRole('button', { name: 'Your images' }).click();
    await settle(page);
    const thumbs = browserThumbs(page);
    if (await thumbs.count() > 0) {
      await thumbs.first().click();
      await settle(page, 500);
    }
    // Cancel lives only in choose view — return from browse first
    await returnToChoose(page);
    await page.getByRole('button', { name: 'Cancel' }).click();
    // Verify only GET requests to media endpoint, no mutations
    const mutations = requests.filter(r => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method));
    expect(mutations, `Data writes detected: ${JSON.stringify(mutations.map(m => ({ m: m.method, u: m.url })))}`).toHaveLength(0);
  });
});
