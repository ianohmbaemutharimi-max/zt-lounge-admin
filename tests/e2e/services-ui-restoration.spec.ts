import { test, expect } from '@playwright/test';

test.describe('Services UI Restoration', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('http://localhost:3000/');
    // Wait for potential redirect or auth check
    await page.waitForLoadState('networkidle');
  });

  test('should display Services page without errors', async ({ page }) => {
    // Navigate to Services page
    await page.goto('http://localhost:3000/dashboard/services');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Check that page title is present
    await expect(page.getByRole('heading', { name: /services/i })).toBeVisible();
    
    // Check for no error messages in the UI
    const errorElements = page.locator('text=/error|failed/i');
    const errorCount = await errorElements.count();
    expect(errorCount).toBe(0);
    
    // Verify the page has loaded data (not showing loading spinner)
    const spinner = page.locator('[role="status"]');
    await expect(spinner).not.toBeVisible();
  });

  test('should show services table or categories', async ({ page }) => {
    await page.goto('http://localhost:3000/dashboard/services');
    await page.waitForLoadState('networkidle');
    
    // Either a data table should be visible, or an empty state
    const hasDataTable = await page.locator('table').isVisible().catch(() => false);
    const hasEmptyState = await page.locator('text=/no services/i').isVisible().catch(() => false);
    
    expect(hasDataTable || hasEmptyState).toBeTruthy();
  });

  test('should have New Service button', async ({ page }) => {
    await page.goto('http://localhost:3000/dashboard/services');
    await page.waitForLoadState('networkidle');
    
    // Check for New Service button
    const newServiceButton = page.getByRole('button', { name: /new service/i });
    await expect(newServiceButton).toBeVisible();
  });

  test('console should not have database column errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('http://localhost:3000/dashboard/services');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Wait for any async operations
    
    // Check that no console errors mention missing columns
    const columnErrors = consoleErrors.filter(err => 
      err.includes('service_kind') || 
      err.includes('card_type') ||
      err.includes('column') && err.includes('does not exist')
    );
    
    expect(columnErrors).toHaveLength(0);
  });
});
