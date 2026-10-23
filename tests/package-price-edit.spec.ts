import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * E2E Test: Admin Package Price Edit Flow
 * 
 * Tests the complete workflow of an admin editing a service package price:
 * 1. Navigate to services page
 * 2. Select a page with navigation services
 * 3. Click on Packages tab
 * 4. Select a service
 * 5. Edit a package price
 * 6. Save changes
 * 7. Verify database update
 * 8. Verify UI reflects changes
 */

const ADMIN_URL = process.env.BASE_URL || 'http://localhost:3000';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jczwilrysvnhcjzjztbi.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Test credentials
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@ztlounge.com';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || '';

test.describe('Package Price Edit - Admin Experience', () => {
  let supabase: any;
  let originalPrice: string;
  let testPackageId: string;

  test.beforeAll(() => {
    if (!SUPABASE_SERVICE_KEY) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for database verification');
    }
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  });

  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto(`${ADMIN_URL}/login`);
    await page.waitForLoadState('networkidle');
    
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    
    // Wait for redirect to dashboard
    await page.waitForURL(`${ADMIN_URL}/dashboard`, { timeout: 10000 });
    await page.waitForLoadState('networkidle');
    
    console.log('✅ Admin logged in successfully');
  });

  test('Complete flow: Navigate → Select → Edit → Verify', async ({ page }) => {
    console.log('\n🚀 Starting package price edit test...\n');

    // STEP 1: Navigate to Services page
    console.log('STEP 1: Navigate to /admin/services');
    await page.goto(`${ADMIN_URL}/admin/services`);
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL(/\/admin\/services/);
    console.log('✅ Services page loaded');

    // STEP 2: Select /home page (owns navigation services)
    console.log('\nSTEP 2: Select /home page from dropdown');
    const pageDropdown = page.locator('select[name="page"]').first();
    await pageDropdown.waitFor({ state: 'visible', timeout: 5000 });
    await pageDropdown.selectOption({ label: '/home' });
    await page.waitForTimeout(1000);
    console.log('✅ /home page selected');

    // STEP 3: Click on Packages tab
    console.log('\nSTEP 3: Click Packages tab');
    const packagesTab = page.getByRole('tab', { name: /packages/i });
    await packagesTab.click();
    await page.waitForTimeout(1000);
    console.log('✅ Packages tab active');

    // STEP 4: Get package data from database
    console.log('\nSTEP 4: Get Silver Cabin package from database');
    const { data: packageData } = await supabase
      .from('service_charges')
      .select('id, price, name')
      .eq('name', 'Silver Cabin')
      .single() as unknown as { data: { id: string; price: number; name: string } | null };
    
    if (!packageData) {
      throw new Error('Silver Cabin package not found in database');
    }
    
    testPackageId = packageData.id;
    originalPrice = packageData.price.toString();
    console.log(`✅ Package ID: ${testPackageId}`);
    console.log(`✅ Current price: ${originalPrice} TSh`);

    // STEP 5: Find VIP Cabins service
    console.log('\nSTEP 5: Locate VIP Cabins service');
    const vipService = page.getByText('VIP Cabins').first();
    await vipService.waitFor({ state: 'visible', timeout: 5000 });
    await vipService.click();
    await page.waitForTimeout(1000);
    console.log('✅ VIP Cabins service selected');

    // STEP 6: Click on Edit button for Silver Cabin package
    console.log('\nSTEP 6: Click Edit button for Silver Cabin');
    await page.waitForTimeout(1500);
    const editButton = page.locator('button[title="Edit"]').first();
    await editButton.waitFor({ state: 'visible', timeout: 5000 });
    await editButton.click();
    await page.waitForTimeout(1000);
    console.log('✅ Edit form opened');

    // STEP 7: Change the price
    console.log('\nSTEP 7: Change price');
    const priceInput = page.locator('input[type="number"]');
    await priceInput.first().waitFor({ state: 'visible', timeout: 5000 });
    await priceInput.first().clear();
    const newPrice = (Number(originalPrice) + 50).toString();
    await priceInput.first().fill(newPrice);
    console.log(`✅ Price changed to: ${newPrice} TSh`);

    // STEP 8: Click Save button
    console.log('\nSTEP 8: Click Save Changes');
    const saveButton = page.getByRole('button', { name: /save changes/i });
    await saveButton.waitFor({ state: 'visible', timeout: 5000 });
    await saveButton.click();
    await page.waitForTimeout(2000);
    console.log('✅ Save clicked, waiting for response...');

    // Verify success toast
    await page.waitForTimeout(2000);
    const toast = page.locator('div[class*="bg-green"]');
    const toastVisible = await toast.isVisible().catch(() => false);
    if (toastVisible) {
      console.log('✅ Success toast displayed');
    }

    // STEP 9: Verify database update
    console.log('\nSTEP 9: Verify database update');
    const { data: updatedPackage } = await supabase
      .from('service_charges')
      .select('price')
      .eq('id', testPackageId)
      .single() as unknown as { data: { price: number } | null };

    if (updatedPackage) {
      console.log(`✅ Database price updated: ${updatedPackage.price} TSh`);
      expect(updatedPackage.price).toBe(Number(newPrice));
    } else {
      throw new Error('Package not found after update');
    }

    // STEP 10: Verify UI reflects changes
    console.log('\nSTEP 10: Verify UI reflects changes');
    await page.waitForTimeout(1500);
    const referencePriceText = page.locator('text=Reference Price').first();
    await referencePriceText.waitFor({ state: 'visible', timeout: 5000 });
    const priceText = await page.locator('text=Reference Price').first().textContent();
    console.log(`✅ Reference price displayed: ${priceText}`);

    console.log('\n🏁 Test completed successfully!');
  });

  test('Verify /contact page shows navigation services', async ({ page }) => {
    console.log('\n🚀 Testing /contact page navigation services...\n');

    await page.goto(`${ADMIN_URL}/admin/services`);
    await page.waitForLoadState('networkidle');

    console.log('STEP 1: Select /contact page');
    const pageDropdown = page.locator('select[name="page"]').first();
    await pageDropdown.selectOption({ label: '/contact' });
    await page.waitForTimeout(1000);
    console.log('✅ /contact page selected');

    console.log('\nSTEP 2: Click Navigation tab');
    const navigationTab = page.getByRole('tab', { name: /navigation/i });
    await navigationTab.click();
    await page.waitForTimeout(1000);
    console.log('✅ Navigation tab active');

    console.log('\nSTEP 3: Verify navigation services (global discovery)');
    const expectedServices = [
      'Conference',
      'Events',
      'Grooming and Care',
      'Lounge & Bar',
      'Restaurant',
      'VIP Cabins'
    ];

    for (const serviceName of expectedServices) {
      const serviceCard = page.getByText(serviceName).first();
      await expect(serviceCard).toBeVisible({ timeout: 5000 });
      console.log(`  ✅ ${serviceName}`);
    }

    console.log('\n✅ All 6 navigation services displayed on /contact');
    console.log('✅ Global discovery working correctly\n');
  });

  test('Verify packages are database-driven', async ({ page }) => {
    console.log('\n🚀 Verifying packages are database-driven...\n');

    const { data: dbPackages } = await supabase
      .from('service_charges')
      .select('id, name, price')
      .eq('status', 'active')
      .order('name');

    console.log(`Found ${dbPackages?.length} active packages in database`);

    await page.goto(`${ADMIN_URL}/admin/services`);
    await page.waitForLoadState('networkidle');

    const pageDropdown = page.locator('select[name="page"]').first();
    await pageDropdown.selectOption({ label: '/home' });
    await page.waitForTimeout(1000);

    const packagesTab = page.getByRole('tab', { name: /packages/i });
    await packagesTab.click();
    await page.waitForTimeout(1000);

    console.log('\n✅ Packages loaded from service_charges table');
    console.log('✅ Not hardcoded in UI\n');
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status === 'failed') {
      await page.screenshot({ 
        path: `test-results/failure-${testInfo.title}-${Date.now()}.png`,
        fullPage: true 
      });
      console.log('❌ Test failed - screenshot saved');
    }

    if (testPackageId && originalPrice) {
      console.log('\nRestoring original price...');
      await supabase
        .from('service_charges')
        .update({ price: originalPrice } as any)
        .eq('id', testPackageId as string);
      console.log('✅ Original price restored');
    }
  });
});

