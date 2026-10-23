/**
 * DATABASE GROUND TRUTH TEST — Services Catalog
 * 
 * Verifies that the UI correctly displays services according to database ownership:
 * - /home owns 0 services
 * - Navigation tab should show 6 global cards (owned by other pages)
 * - Informational tab should show empty state
 * - Packages tab should show empty state
 * - /grooming-care owns 7 services (1 navigation + 6 informational)
 */

import { test, expect } from '@playwright/test';

test.describe('Services Catalog — Database Ground Truth', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to services catalog
    await page.goto('http://localhost:3000/admin/services');
    await page.waitForLoadState('networkidle');
  });

  test('HOME page — owns 0 services, shows 6 global navigation cards', async ({ page }) => {
    // Select /home page
    const pageSelector = page.locator('select, [role="combobox"]').filter({ hasText: /home|ZT Lounge Home/i }).first();
    if (await pageSelector.isVisible()) {
      await pageSelector.selectOption({ value: '/home' });
    } else {
      // Try clicking dropdown if it's not a select
      await page.locator('text=/home.*ZT Lounge Home/i').first().click();
    }
    
    await page.waitForTimeout(1000);

    // Test Navigation tab
    await page.locator('button', { hasText: 'Navigation' }).click();
    await page.waitForTimeout(500);

    // Should show 6 navigation cards (Conference, Events, Grooming and Care, Lounge & Bar, Restaurant, VIP Cabins)
    // Cards use Card component with overflow-hidden class
    const navCards = page.locator('div[class*="overflow-hidden"]');
    const navCount = await navCards.count();

    console.log(`Navigation cards on /home: ${navCount}`);
    expect(navCount).toBeGreaterThanOrEqual(6);

    // Verify help text mentions global discovery
    const helpText = await page.locator('text=/global.*discovery|Global navigation cards/i').first().textContent();
    console.log(`Navigation help text: ${helpText}`);
    expect(helpText?.toLowerCase()).toContain('global');

    // Test Informational tab
    await page.locator('button', { hasText: 'Informational' }).click();
    await page.waitForTimeout(500);

    // Should show empty state
    const emptyState = page.locator('text=/No services are owned by this page/i');
    await expect(emptyState).toBeVisible();
    console.log('✓ Informational tab shows correct empty state');

    // Test Packages tab
    await page.locator('button', { hasText: 'Packages' }).click();
    await page.waitForTimeout(500);

    // Should show empty state
    const pkgEmpty = page.locator('text=/No services|Select a page/i');
    await expect(pkgEmpty).toBeVisible();
    console.log('✓ Packages tab shows correct empty state');
  });

  test('GROOMING-CARE page — owns 7 services (1 nav + 6 info)', async ({ page }) => {
    // Select /grooming-care page
    const pageSelector = page.locator('select, [role="combobox"]').filter({ hasText: /grooming/i }).first();
    if (await pageSelector.isVisible()) {
      await pageSelector.selectOption({ value: '/grooming-care' });
    } else {
      await page.locator('text=/grooming.*care/i').first().click();
    }
    
    await page.waitForTimeout(1000);

    // Test Navigation tab — should show 1 card (Grooming and Care)
    await page.locator('button', { hasText: 'Navigation' }).click();
    await page.waitForTimeout(500);

    // Cards use Card component with overflow-hidden class
    const navCards = page.locator('div[class*="overflow-hidden"]');
    const navCount = await navCards.count();

    console.log(`Navigation cards on /grooming-care: ${navCount}`);
    expect(navCount).toBe(1);

    // Test Informational tab — should show 6 cards
    await page.locator('button', { hasText: 'Informational' }).click();
    await page.waitForTimeout(500);

    // Cards use Card component with overflow-hidden class
    const infoCards = page.locator('div[class*="overflow-hidden"]');
    const infoCount = await infoCards.count();

    console.log(`Informational cards on /grooming-care: ${infoCount}`);
    expect(infoCount).toBe(6);

    // Verify service names
    const expectedServices = [
      'Beard Trim & Shape',
      'Carpet Deep Cleaning',
      'Classic Haircut',
      'Haircut & Beard Grooming',
      'Mattress Cleaning',
      'Sofa & Upholstery Cleaning'
    ];

    for (const serviceName of expectedServices) {
      const serviceCard = page.locator(`text=${serviceName}`);
      await expect(serviceCard).toBeVisible();
    }

    console.log('✓ All 6 informational services visible');
  });

  test('Verify help text accuracy', async ({ page }) => {
    // Check All tab help text
    await page.locator('button', { hasText: /^All$/i }).click();
    await page.waitForTimeout(500);

    const allHelp = await page.locator('.text-muted-foreground, .text-muted').filter({ hasText: /Navigation.*Informational.*Packages/i }).first().textContent();
    console.log(`All tab help: ${allHelp}`);
    
    expect(allHelp).toContain('Navigation');
    expect(allHelp).toContain('global');
    expect(allHelp).toContain('Informational');
    expect(allHelp).toContain('page-scoped');
    expect(allHelp).toContain('Packages');

    // Check Navigation tab help text
    await page.locator('button', { hasText: 'Navigation' }).click();
    await page.waitForTimeout(500);

    const navHelp = await page.locator('.text-muted-foreground, .text-muted').filter({ hasText: /Global.*navigation/i }).first().textContent();
    console.log(`Navigation tab help: ${navHelp}`);
    
    expect(navHelp?.toLowerCase()).toContain('global');

    // Check Informational tab help text
    await page.locator('button', { hasText: 'Informational' }).click();
    await page.waitForTimeout(500);

    const infoHelp = await page.locator('.text-muted-foreground, .text-muted').filter({ hasText: /page|owned/i }).first().textContent();
    console.log(`Informational tab help: ${infoHelp}`);
    
    expect(infoHelp?.toLowerCase()).toContain('page');
  });
});
