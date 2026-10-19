/**
 * Forensic UI probe (read-only): what does /dashboard/services actually render
 * for the Grooming & Care page? Dumps view buttons, InfoCard titles in DOM
 * order, page text for category names, Packages table headers, Categories tab.
 *
 * Run: node scripts/probe-grooming-category-ui.mjs
 * (Dev server must be warm on :3000; creds read from .env.local)
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = {};
for (const line of readFileSync(resolve(ROOT, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const BASE_URL = 'http://localhost:3000';
const EMAIL = env.E2E_SUPER_ADMIN_EMAIL;
const PASSWORD = env.E2E_SUPER_ADMIN_PASSWORD;

const out = { steps: [] };
const log = (step, data) => { out.steps.push({ step, ...data }); console.log(`\n== ${step} ==\n` + JSON.stringify(data, null, 2)); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

try {
  // 1. Login
  await page.goto(`${BASE_URL}/login`);
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 30000 });
  log('login', { ok: true });

  // 2. Services page + select Grooming & Care
  await page.goto(`${BASE_URL}/dashboard/services`);
  await page.waitForLoadState('networkidle');
  const sel = page.locator('select').first();
  const optValue = await sel.locator('option', { hasText: 'Grooming & Care' }).first().getAttribute('value');
  await sel.selectOption(optValue);
  await page.waitForTimeout(2500);

  // 3. Surface buttons (view switcher)
  const buttons = await page.locator('button').allInnerTexts();
  log('surface buttons (raw)', { texts: buttons.map(t => t.replace(/\s+/g, ' ').trim()).filter(t => /All|Navigation|Information|Packages|Services|Categories/i.test(t)) });

  // 4. DOM text search: do category names appear ANYWHERE on the default view?
  const bodyText = await page.locator('body').innerText();
  log('category names on default (All) surface', {
    'Auto Spa': bodyText.includes('Auto Spa'),
    'Barbershop': bodyText.includes('Barbershop'),
    'Carpet Cleaning': bodyText.includes('Carpet Cleaning'),
    'Category word': /\bCategory\b/.test(bodyText),
  });

  // 5. InfoCard grid titles in DOM order (h3 inside main content)
  const cardTitles = await page.locator('h3').allInnerTexts();
  log('h3 titles in DOM order (All surface: info cards + section headers)', { titles: cardTitles.map(t => t.replace(/\s+/g, ' ').trim()) });

  // 6. Information surface
  const infoBtn = page.locator('button').filter({ hasText: /^Information/ }).first();
  if (await infoBtn.count()) {
    await infoBtn.click();
    await page.waitForTimeout(800);
    const infoTitles = await page.locator('h3').allInnerTexts();
    const infoText = await page.locator('body').innerText();
    log('Information surface', {
      cardTitles: infoTitles.map(t => t.replace(/\s+/g, ' ').trim()),
      'Auto Spa present': infoText.includes('Auto Spa'),
      'Barbershop present': infoText.includes('Barbershop'),
      'Carpet Cleaning present': infoText.includes('Carpet Cleaning'),
    });
  }

  // 6b. Category chip filter — click "Barbershop" chip, expect only its cards.
  const barberChip = page.locator('[data-testid="category-filter"] button', { hasText: 'Barbershop' }).first();
  if (await barberChip.count()) {
    await barberChip.click();
    await page.waitForTimeout(600);
    const titles = (await page.locator('h3').allInnerTexts()).map(t => t.trim());
    const bodyAfter = await page.locator('body').innerText();
    log('Chip filter = Barbershop', {
      cardCount: titles.filter(t => t !== 'Information Cards').length,
      titles,
      'Exterior Wash hidden': !bodyAfter.includes('Exterior Wash'),
      'chip row present': await page.locator('[data-testid="category-filter"]').count() > 0,
    });
    // Restore All
    const allChip = page.locator('[data-testid="category-filter"] button', { hasText: /^All/ }).first();
    if (await allChip.count()) await allChip.click();
    await page.waitForTimeout(400);
  } else {
    log('Chip filter = Barbershop', { skipped: 'chip not found' });
  }

  // 6c. Category-scoped Add: each category group renders its own
  // "Add service to <Category>" button that pre-selects the category in the
  // item modal. Open the Barbershop one, verify preselection, then Escape —
  // NEVER submit (read-only probe, no mutations).
  const addBtnTexts = await page.locator('button[aria-label^="Add service to"]').allInnerTexts();
  const newServiceExact = await page.getByRole('button', { name: /New Service/i }).count();
  const newTexts = (await page.locator('button').allInnerTexts())
    .map(t => t.replace(/\s+/g, ' ').trim()).filter(t => /new/i.test(t));
  const addCheck = {
    groupButtonCount: addBtnTexts.length,
    groupButtons: addBtnTexts.map(t => t.replace(/\s+/g, ' ').trim()),
    roleNewServiceCount: newServiceExact, // E2E locator: getByRole name /New Service/i — must be 1
    buttonsWithNew: newTexts,
  };
  const barberAdd = page.locator('button[aria-label="Add service to Barbershop"]').first();
  if (await barberAdd.count()) {
    // React re-render right after the chip restore can swallow a single click;
    // poll the dialog and retry once if it didn't appear.
    const dialog = page.locator('[role="dialog"]').last();
    for (let attempt = 0; attempt < 3; attempt++) {
      await barberAdd.click();
      await page.waitForTimeout(800);
      if (await dialog.isVisible().catch(() => false)) break;
      await page.waitForTimeout(400);
    }
    addCheck.dialogVisible = await dialog.isVisible().catch(() => false);
    addCheck.dialogCount = await page.locator('[role="dialog"]').count();
    addCheck.categoryPreset = await dialog.locator('select').evaluateAll(
      (sels, cat) => sels
        .filter(s => Array.from(s.options).some(o => (o.textContent || '').trim() === cat))
        .map(s => s.selectedOptions[0]?.textContent?.trim() ?? null),
      'Barbershop'
    );
    addCheck.cardTypePreset = await dialog.locator('select').evaluateAll(
      sels => sels
        .filter(s => Array.from(s.options).some(o => o.value === 'information'))
        .map(s => s.value)
    );
    await page.keyboard.press('Escape'); // close WITHOUT saving
    await page.waitForTimeout(300);
    addCheck.dialogClosedWithoutSave = !(await dialog.isVisible());
  } else {
    addCheck.skipped = '"Add service to Barbershop" button not found';
  }
  log('Category-scoped Add service', addCheck);

  // 7. Packages surface → table headers (POLL: per-service charge fetches are async)
  const pkgBtn = page.locator('button').filter({ hasText: /^Packages/ }).first();
  if (await pkgBtn.count()) {
    await pkgBtn.click();
    // Auto-retry until the dedicated-route packages resolve into the table.
    let settled = 'NOT SETTLED';
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(1000);
      const txt = await page.locator('body').innerText();
      if (/KES/.test(txt)) { settled = `SETTLED after ~${i + 1}s`; break; }
    }
    const headers = await page.locator('th').allInnerTexts();
    const pkgText = await page.locator('body').innerText();
    const pkgBtnText = (await pkgBtn.textContent())?.replace(/\s+/g, ' ').trim();
    log('Packages surface', {
      settled,
      surfaceButtonLabel: pkgBtnText,
      thHeaders: headers.map(t => t.replace(/\s+/g, ' ').trim()),
      'Auto Spa present': pkgText.includes('Auto Spa'),
      'Barbershop present': pkgText.includes('Barbershop'),
      'row excerpt': pkgText.split('\n').filter(l => /Express|Premium Detail|Ultimate|KES/.test(l)).slice(0, 8),
    });
  }

  // 8. Categories tab
  const catTab = page.locator('button').filter({ hasText: /^Categories$/ }).first();
  if (await catTab.count()) {
    await catTab.click();
    await page.waitForTimeout(1000);
    const catText = await page.locator('main, body').first().innerText();
    log('Categories tab', {
      lines: catText.split('\n').map(l => l.trim()).filter(l => /items · order|Auto Spa|Barbershop|Carpet/i.test(l)).slice(0, 12),
    });
  }

  console.log('\nPROBE COMPLETE');
} catch (err) {
  console.error('PROBE ERROR:', err.message);
  out.error = err.message;
  process.exitCode = 1;
} finally {
  await browser.close();
}
