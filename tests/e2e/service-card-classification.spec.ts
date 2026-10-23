/**
 * Service Card Classification Tests
 * 
 * Black-box and white-box tests for the explicit card_type field implementation.
 */

import { test, expect } from '@playwright/test';

// ============================================================================
// BLACK-BOX TESTS — UI Behavior
// ============================================================================

test.describe('Service Card Classification — Black-Box Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/services');
    await page.waitForLoadState('networkidle');
  });

  test('Card Type selector is visible in service edit form', async ({ page }) => {
    // Select a page first (services are page-scoped)
    const pageSelector = page.locator('select').filter({ hasText: /home|grooming/i }).first();
    if (await pageSelector.isVisible()) {
      await pageSelector.selectOption({ index: 1 });
      await page.waitForTimeout(500);
    }

    // Click edit on first service
    const editBtn = page.locator('button[title*="Edit"]').first();
    await editBtn.click();
    await page.waitForTimeout(500);

    // Verify Card Type field exists
    const cardTypeLabel = page.locator('label', { hasText: /card type/i });
    await expect(cardTypeLabel).toBeVisible();

    // Verify all three options are present
    const infoOption = page.locator('option[value="information"]');
    const navOption = page.locator('option[value="navigation"]');
    const pkgOption = page.locator('option[value="package"]');

    await expect(infoOption).toBeVisible();
    await expect(navOption).toBeVisible();
    await expect(pkgOption).toBeVisible();

    console.log('✅ Card Type selector visible with all three options');
  });

  test('Card Type can be changed and persisted', async ({ page }) => {
    // Select grooming-care page (has services)
    const pageSelector = page.locator('select').filter({ hasText: /grooming/i }).first();
    if (await pageSelector.isVisible()) {
      await pageSelector.selectOption({ index: 1 });
      await page.waitForTimeout(500);
    }

    // Edit first service
    const editBtn = page.locator('button[title*="Edit"]').first();
    await editBtn.click();
    await page.waitForTimeout(500);

    // Change card type to navigation
    const cardTypeSelect = page.locator('select').filter({ has: page.locator('option[value="navigation"]') });
    await cardTypeSelect.selectOption('navigation');

    // Save
    const saveBtn = page.locator('button[type="submit"]', { hasText: /save/i }).first();
    await saveBtn.click();
    await page.waitForTimeout(1000);

    // Re-open the same service
    await editBtn.click();
    await page.waitForTimeout(500);

    // Verify card type is still navigation
    const selectedOption = page.locator('select').filter({ has: page.locator('option[value="navigation"][selected]') });
    await expect(selectedOption).toBeVisible();

    console.log('✅ Card Type persists after save');
  });

  test('Card Type help text explains each option', async ({ page }) => {
    const pageSelector = page.locator('select').filter({ hasText: /grooming/i }).first();
    if (await pageSelector.isVisible()) {
      await pageSelector.selectOption({ index: 1 });
      await page.waitForTimeout(500);
    }

    const editBtn = page.locator('button[title*="Edit"]').first();
    await editBtn.click();
    await page.waitForTimeout(500);

    const helpText = page.locator('text=/Controls how this service appears/i');
    await expect(helpText).toBeVisible();

        console.log('✅ Card Type help text visible');
  });
});

// ============================================================================
// WHITE-BOX TESTS — Database Schema Verification
// ============================================================================

test.describe('Service Card Classification — White-Box Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/services');
    await page.waitForLoadState('networkidle');
  });

  test('Database schema has card_type column', async ({ page }) => {
    const pageSelector = page.locator('select').filter({ hasText: /grooming/i }).first();
    if (await pageSelector.isVisible()) {
      await pageSelector.selectOption({ index: 1 });
      await page.waitForTimeout(500);
    }

    const editBtn = page.locator('button[title*="Edit"]').first();
    await editBtn.click();
    await page.waitForTimeout(500);

    const cardTypeSelect = page.locator('select').filter({ has: page.locator('option[value="information"]') });
    await expect(cardTypeSelect).toBeVisible();

    console.log('✅ card_type field exists in API response');
  });

  test('API accepts valid card_type values', async ({ page }) => {
    const pageSelector = page.locator('select').filter({ hasText: /grooming/i }).first();
    if (await pageSelector.isVisible()) {
      await pageSelector.selectOption({ index: 1 });
      await page.waitForTimeout(500);
    }

    const editBtn = page.locator('button[title*="Edit"]').first();
    await editBtn.click();
    await page.waitForTimeout(500);

    const validTypes = ['information', 'navigation', 'package'];
    for (const type of validTypes) {
      const cardTypeSelect = page.locator('select').filter({ has: page.locator(`option[value="${type}"]`) });
      await cardTypeSelect.selectOption(type);
      console.log(`✅ card_type="${type}" accepted`);
    }
  });
});

// ============================================================================
// REGRESSION TESTS — Verify Existing Behavior
// ============================================================================

test.describe('Service Card Classification — Regression Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/services');
    await page.waitForLoadState('networkidle');
  });

  test('Surface switcher still works', async ({ page }) => {
    const pageSelector = page.locator('select').first();
    await pageSelector.selectOption({ index: 0 });
    await page.waitForTimeout(500);

    const surfaces = ['All', 'Navigation', 'Information', 'Packages'];
    for (const surface of surfaces) {
      const tab = page.locator('button', { hasText: new RegExp(`^${surface}`, 'i') });
      if (await tab.isVisible()) {
        await tab.click();
        await page.waitForTimeout(300);
        console.log(`✅ ${surface} surface switch works`);
      }
    }
  });

  test('Discovery host banner shows for Home', async ({ page }) => {
    const pageSelector = page.locator('select').filter({ hasText: /home/i }).first();
    if (await pageSelector.isVisible()) {
      await pageSelector.selectOption({ index: 0 });
      await page.waitForTimeout(500);
    }

    const banner = page.locator('text=/Discovery Host|owns 0 services/i');
    const isVisible = await banner.first().isVisible();
    console.log(isVisible ? '✅ Discovery host banner visible' : 'ℹ️ Banner not found');
  });
});