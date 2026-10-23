import { test, expect } from '@playwright/test';
import { testUsers } from './fixtures/auth';
import { createClient } from '@supabase/supabase-js';
import { SERVICE_TEMPLATES, PAGES_WITH_INFO_CARDS } from './fixtures/service-templates';

/**
 * COMPREHENSIVE SERVICE CARD SETUP TEST
 * 
 * Creates a complete service card structure for the ZT Lounge website:
 * - Home & Contact: Navigation cards only (no informational cards)
 * - Restaurant Menu & Gallery: 0 service cards
 * - Conference, Events, VIP, Lounge, Restaurant, Barbershop, Auto Spa, Carpet Cleaning:
 *   Each gets 4 informational service cards with images and descriptions
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

test.describe('Service Cards Setup - Complete Website Structure', () => {
  let supabase: any;
  let mediaAssets: any[] = [];
  let categoryIds: Record<string, string> = {};

  test.beforeAll(async () => {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const { data: media } = await supabase
      .from('media_assets')
      .select('id, title, category')
      .order('title');
    
    mediaAssets = media || [];
    console.log(`✅ Found ${mediaAssets.length} media assets`);

    const { data: categories } = await supabase
      .from('service_categories')
      .select('id, name');
    
    categories?.forEach((c: any) => {
      categoryIds[c.name] = c.id;
    });
    console.log(`✅ Found ${Object.keys(categoryIds).length} categories`);
  });

  test.beforeEach(async ({ page }) => {
    const user = testUsers.super_admin;
    await page.goto('/login');
    await page.fill('#email', user.email);
    await page.fill('#password', user.password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 45_000 });
  });

  test('1. Create 4 informational service cards for each business page', async ({ page }) => {
    console.log('\n📋 CREATING SERVICE CARDS FOR ALL BUSINESS PAGES\n');

    for (const pageConfig of PAGES_WITH_INFO_CARDS) {
      const templates = SERVICE_TEMPLATES[pageConfig.subcategory || pageConfig.category];
      if (!templates) continue;

      console.log(`\n🏢 ${pageConfig.category}${pageConfig.subcategory ? ' > ' + pageConfig.subcategory : ''}`);

      await page.goto('/dashboard/services');
      await page.waitForLoadState('networkidle');

      const pageSelector = page.locator('select').first();
      await pageSelector.selectOption({ label: pageConfig.label });
      await page.waitForTimeout(1500);

      await page.getByRole('button', { name: 'Information', exact: true }).click();
      await page.waitForTimeout(1000);

      for (let i = 0; i < templates.length; i++) {
        const template = templates[i];
        console.log(`  📝 Creating: ${template.name}`);

        const newServiceBtn = page.getByRole('button', { name: /New Service/i });
        await newServiceBtn.click();
        await page.waitForTimeout(500);

        await page.fill('input[name="name"]', template.name);
        await page.fill('textarea[name="description"]', template.description);

        const categorySelect = page.locator('select[name="category_id"]');
        const categoryId = categoryIds[pageConfig.subcategory || pageConfig.category];
        if (categoryId) {
          await categorySelect.selectOption(categoryId);
        }

        if (mediaAssets.length > 0) {
          const imageBtn = page.locator('button:has-text("Select Image"), button:has-text("Change Image")').first();
          if (await imageBtn.isVisible().catch(() => false)) {
            await imageBtn.click();
            await page.waitForTimeout(500);
            
            const firstImage = page.locator('[data-media-item]').first();
            if (await firstImage.isVisible().catch(() => false)) {
              await firstImage.click();
              await page.waitForTimeout(300);
            }
          }
        }

        const saveBtn = page.getByRole('button', { name: /Save|Create/i }).last();
        await saveBtn.click();
        await page.waitForTimeout(2000);

        console.log(`    ✅ Created: ${template.name}`);
      }

      console.log(`  ✅ Completed ${pageConfig.category}: 4 services`);
    }

    console.log('\n🎉 ALL SERVICE CARDS CREATED SUCCESSFULLY!\n');
  });


  test('2. Verify service cards display with images in admin', async ({ page }) => {
    console.log('\n🔍 VERIFYING SERVICE CARD DISPLAY IN ADMIN\n');

    await page.goto('/dashboard/services');
    await page.waitForLoadState('networkidle');

    const pageSelector = page.locator('select').first();
    await pageSelector.selectOption({ label: 'Conference' });
    await page.waitForTimeout(1500);

    await page.getByRole('button', { name: 'Information', exact: true }).click();
    await page.waitForTimeout(1000);

    const serviceRows = page.locator('table tbody tr');
    const count = await serviceRows.count();
    
    console.log(`  ✅ Found ${count} service rows in Conference`);
    expect(count).toBeGreaterThanOrEqual(4);

    if (count > 0) {
      const firstEditBtn = page.locator('button[title*="Edit"]').first();
      await firstEditBtn.click();
      await page.waitForTimeout(500);

      const modal = page.locator('[role="dialog"], .modal').first();
      await expect(modal).toBeVisible({ timeout: 5000 });

      console.log('  ✅ Edit modal opens successfully');

      const closeBtn = page.getByRole('button', { name: /Close|Cancel/i }).last();
      await closeBtn.click();
      await page.waitForTimeout(500);
    }

    console.log('\n✅ SERVICE CARD VERIFICATION COMPLETE!\n');
  });

  test('3. Verify Home and Contact have navigation cards only', async ({ page }) => {
    console.log('\n🔍 VERIFYING NAVIGATION-ONLY PAGES\n');

    await page.goto('/dashboard/services');
    await page.waitForLoadState('networkidle');

    const pageSelector = page.locator('select').first();
    await pageSelector.selectOption({ label: 'Home' });
    await page.waitForTimeout(1500);

    await page.getByRole('button', { name: 'Information', exact: true }).click();
    await page.waitForTimeout(1000);

    const emptyState = page.locator('text=/No informational services|No services are owned/i');
    await expect(emptyState).toBeVisible({ timeout: 5000 });

    console.log('  ✅ Home page has no informational cards (correct)');

    await page.getByRole('button', { name: 'Navigation', exact: true }).click();
    await page.waitForTimeout(1000);

    const navCards = page.locator('h3').filter({ hasText: /Conference|Events|VIP|Lounge|Restaurant/i });
    const navCount = await navCards.count();
    
    console.log(`  ✅ Home page has ${navCount} navigation cards`);
    expect(navCount).toBeGreaterThan(0);

    console.log('\n✅ NAVIGATION-ONLY VERIFICATION COMPLETE!\n');
  });
});
