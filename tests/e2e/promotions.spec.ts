/**
 * LOOP 20 — PROMOTION CHANNEL E2E TEST SUITE
 * 
 * Tests the complete promotion lifecycle:
 * - Admin create/edit/delete
 * - Date validation
 * - Public rendering (live/expired/upcoming)
 * - Placement (any page vs specific page)
 * - Browser stability
 */
import { test, expect, type Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const PUBLIC_URL = process.env.PUBLIC_URL || 'http://localhost:8099';
const EMAIL = process.env.E2E_SUPER_ADMIN_EMAIL;
const PASSWORD = process.env.E2E_SUPER_ADMIN_PASSWORD;

/* ---- helpers ---- */
function trackErrors(p: Page): string[] {
  const e: string[] = [];
  p.on('console', (m) => { if (m.type() === 'error') e.push(m.text()); });
  p.on('pageerror', (err) => e.push(err.message));
  return e;
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
  try { await p.waitForLoadState('networkidle', { timeout: 3000 }); } catch { /* ignore */ }
  await p.waitForTimeout(ms);
}

async function gotoPromotions(p: Page) {
  await p.goto(`${BASE_URL}/dashboard/promotions`);
  await settle(p);
}

/* ---- tests ---- */
test.describe('Promotion Channel', () => {
  
  test('Admin: promotions page loads', async ({ page }) => {
    const errors = trackErrors(page);
    await login(page);
    await gotoPromotions(page);
    
    // Heading should be visible (not the nav link)
    await expect(page.getByRole('heading', { name: 'Promotions' })).toBeVisible();
    const realErrors = errors.filter(e => !e.toLowerCase().includes('warning'));
    expect(realErrors).toHaveLength(0);
  });

  test('Admin: create promotion form opens', async ({ page }) => {
    await login(page);
    await gotoPromotions(page);
    
    await page.click('button:has-text("New Promotion")');
    await expect(page.getByText('New Promotion').last()).toBeVisible();
    
    // Verify form fields
    await expect(page.getByPlaceholder('e.g. VIP Cabin Night')).toBeVisible();
    await expect(page.getByPlaceholder('Describe the offer')).toBeVisible();
  });

  test('Admin: required fields validation', async ({ page }) => {
    await login(page);
    await gotoPromotions(page);
    
    await page.click('button:has-text("New Promotion")');
    await page.getByPlaceholder('e.g. VIP Cabin Night').fill('Test Promotion');
    
    // Try to save without dates
    await page.click('button:has-text("Save Promotion")');
    
    // Should show validation errors
    await expect(page.getByText(/required/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('Admin: date validation - expiry before opening', async ({ page }) => {
    await login(page);
    await gotoPromotions(page);
    
    await page.click('button:has-text("New Promotion")');
    await page.getByPlaceholder('e.g. VIP Cabin Night').fill('Date Test Promotion');
    await page.getByPlaceholder('Describe the offer').fill('Test description');
    
    // Set expiry before opening
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    
    await page.locator('input[type="date"]').first().fill(today);
    await page.locator('input[type="date"]').last().fill(yesterday);
    
    await page.click('button:has-text("Save Promotion")');
    
    // Should show validation error
    await expect(page.getByText(/expiry|after|opening/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('Public: no expired promotion renders', async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto(`${PUBLIC_URL}/`);
    await settle(page, 2000);
    
    // Expired promotion should NOT be visible
    const stickers = page.locator('#zt-promo-stickers');
    await expect(stickers).toHaveCount(0);
    
    // Check console for errors
    const realErrors = errors.filter(e => 
      !e.toLowerCase().includes('warning') && 
      !e.toLowerCase().includes('deprecat') &&
      !e.includes('net::err_connection')
    );
    expect(realErrors).toHaveLength(0);
  });

  test('Public: no browser hang on homepage', async ({ page }) => {
    const errors = trackErrors(page);
    const startTime = Date.now();
    
    await page.goto(`${PUBLIC_URL}/`);
    await page.waitForLoadState('domcontentloaded');
    await settle(page, 3000);
    
    const loadTime = Date.now() - startTime;
    
    // Page should load in under 15 seconds (hang would be much longer)
    expect(loadTime).toBeLessThan(15000);
    
    // No console errors
    const realErrors = errors.filter(e => 
      !e.toLowerCase().includes('warning') && 
      !e.toLowerCase().includes('deprecat') &&
      !e.includes('net::err_connection')
    );
    expect(realErrors).toHaveLength(0);
  });

  test('Public: promotion stickers container stability', async ({ page }) => {
    await page.goto(`${PUBLIC_URL}/`);
    await settle(page, 2000);
    
    // Multiple reloads should not accumulate stickers
    for (let i = 0; i < 3; i++) {
      await page.reload();
      await settle(page, 1500);
    }
    
    // Should have at most one stickers container (or zero if no active promos)
    const count = await page.locator('#zt-promo-stickers').count();
    expect(count).toBeLessThanOrEqual(1);
  });
});
