import { test, expect, type Page } from '@playwright/test';
import { testUsers } from './fixtures/auth';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const TEST_PAGES = {
  conference: { slug: 'conference', serviceName: 'Conference' },
  // Live service slug is `events` (services.page_id = events page); the public
  // href path segment `pages/business/events.html` is NOT the service slug.
  events: { slug: 'events', serviceName: 'Events' },
  vip: { slug: 'vip-cabins', serviceName: 'VIP' },
};

async function signIn(page: Page) {
  const user = testUsers.super_admin;
  await page.goto(`${BASE_URL}/login`);
  await page.waitForSelector('input[type="email"]', { timeout: 20000 });
  await page.fill('input[type="email"]', user.email);
  await page.fill('input[type="password"]', user.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/, { timeout: 60000 });
}

async function apiRequest(page: Page, method: string, path: string, body?: any) {
  const options = body ? { data: body } : undefined;
  return await page.request[method.toLowerCase() as 'get' | 'post' | 'patch' | 'delete'](`${BASE_URL}${path}`, options);
}

async function fetchPageIdForService(page: Page, serviceSlug: string): Promise<string | null> {
  // Generic admin route defaults to limit=10; fetch enough rows to find the service.
  const response = await apiRequest(page, 'GET', '/api/admin/services?limit=100');
  const json = await response.json();
  const service = json.data?.find((s: any) => s.slug === serviceSlug);
    return service?.pageId || service?.page_id || null;
}

test.describe('Package Management API - Read Operations', () => {
  let pageId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    pageId = (await fetchPageIdForService(page, TEST_PAGES.conference.slug)) || '';
  });

  test('GET returns package list with correct structure', async ({ page }) => {
    const response = await apiRequest(page, 'GET', `/api/admin/services/${TEST_PAGES.conference.slug}/charges?page_id=${pageId}`);
    expect(response.status()).toBe(200);
    const json = await response.json();
    expect(json).toHaveProperty('data');
    expect(Array.isArray(json.data)).toBe(true);
    console.log(`✅ GET returned ${json.data.length} packages`);
    if (json.data.length > 0) {
      const firstPackage = json.data[0];
      expect(firstPackage).toHaveProperty('id');
      expect(firstPackage).toHaveProperty('name');
      expect(firstPackage).toHaveProperty('price');
      expect(firstPackage).toHaveProperty('status');
    }
  });

  test('GET without page_id returns 400', async ({ page }) => {
    const response = await apiRequest(page, 'GET', `/api/admin/services/${TEST_PAGES.conference.slug}/charges`);
    expect(response.status()).toBe(400);
    const json = await response.json();
    expect(json.error).toMatch(/page.*selected|page_id/i);
    console.log('✅ API correctly rejects request without page_id');
  });

  test('GET with wrong page_id returns 404', async ({ page }) => {
    const wrongPageId = '00000000-0000-0000-0000-000000000000';
    const response = await apiRequest(page, 'GET', `/api/admin/services/${TEST_PAGES.conference.slug}/charges?page_id=${wrongPageId}`);
    expect(response.status()).toBe(404);
    const json = await response.json();
    expect(json.error).toMatch(/not found/i);
    console.log('✅ API correctly enforces page ownership');
  });
});

// ============================================================================
// TEST SUITE: Write Operations
// ============================================================================

test.describe('Package Management API - Write Operations', () => {
  let pageId: string;
  let testPackageId: string | null = null;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    pageId = (await fetchPageIdForService(page, TEST_PAGES.events.slug)) || '';
  });

  test.afterEach(async ({ page }) => {
    if (testPackageId && pageId) {
      await apiRequest(page, 'DELETE', `/api/admin/services/${TEST_PAGES.events.slug}/charges/${testPackageId}?page_id=${pageId}`);
      console.log(`🧹 Cleaned up test package ${testPackageId}`);
      testPackageId = null;
    }
  });

  test('POST creates a new package', async ({ page }) => {
    const newPackage = {
      name: `API Test Package ${Date.now()}`,
      description: 'Created via API contract test',
      price: '5000.00',
      unit: 'per event',
      status: 'active',
      sort_order: 999,
    };

    const response = await apiRequest(
      page, 'POST',
      `/api/admin/services/${TEST_PAGES.events.slug}/charges?page_id=${pageId}`,
      newPackage
    );

    expect(response.status()).toBe(201);
    const json = await response.json();
    expect(json).toHaveProperty('id');
    expect(json.name).toBe(newPackage.name);
    // price is a numeric column: the route writes price.toFixed(2) but PostgREST
    // returns a JSON number, so normalize with Number() before asserting.
    expect(Number(json.price)).toBe(5000);
    testPackageId = json.id;
    console.log(`✅ Created package: ${json.id}`);
  });

  test('POST validates required name field', async ({ page }) => {
    const response = await apiRequest(
      page, 'POST',
      `/api/admin/services/${TEST_PAGES.events.slug}/charges?page_id=${pageId}`,
      { name: '', price: '1000' }
    );
    expect(response.status()).toBe(400);
    const json = await response.json();
    expect(json.error).toMatch(/name.*required/i);
    console.log('✅ API validates package name is required');
  });

  test('POST validates price is non-negative', async ({ page }) => {
    const response = await apiRequest(
      page, 'POST',
      `/api/admin/services/${TEST_PAGES.events.slug}/charges?page_id=${pageId}`,
      { name: 'Invalid Price', price: '-100' }
    );
    expect(response.status()).toBe(400);
    const json = await response.json();
    expect(json.error).toMatch(/price/i);
    console.log('✅ API validates price is non-negative');
  });
});

// ============================================================================
// TEST SUITE: Patch/Delete Operations
// ============================================================================

test.describe('Package Management API - Update & Delete', () => {
  let pageId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    pageId = (await fetchPageIdForService(page, TEST_PAGES.events.slug)) || '';
  });

  test('PATCH updates package description', async ({ page }) => {
    // Create first
    const response = await apiRequest(
      page, 'POST',
      `/api/admin/services/${TEST_PAGES.events.slug}/charges?page_id=${pageId}`,
      { name: `PATCH Test ${Date.now()}`, price: '2000', status: 'active', sort_order: 0 }
    );
    expect(response.status()).toBe(201);
    const created = await response.json();
    
    // Update
    const newDesc = `Updated via PATCH at ${Date.now()}`;
    const updateResp = await apiRequest(
      page, 'PATCH',
      `/api/admin/services/${TEST_PAGES.events.slug}/charges/${created.id}?page_id=${pageId}`,
      { description: newDesc }
    );
    expect(updateResp.status()).toBe(200);
    
    // Verify
    const listResp = await apiRequest(page, 'GET', `/api/admin/services/${TEST_PAGES.events.slug}/charges?page_id=${pageId}`);
    const listJson = await listResp.json();
    const updated = listJson.data.find((p: any) => p.id === created.id);
    expect(updated.description).toBe(newDesc);
    console.log(`✅ Description updated: "${newDesc}"`);
    
    // Cleanup
    await apiRequest(page, 'DELETE', `/api/admin/services/${TEST_PAGES.events.slug}/charges/${created.id}?page_id=${pageId}`);
  });

  test('PATCH toggles package status', async ({ page }) => {
    const response = await apiRequest(
      page, 'POST',
      `/api/admin/services/${TEST_PAGES.events.slug}/charges?page_id=${pageId}`,
      { name: `Status Test ${Date.now()}`, price: '3000', status: 'active', sort_order: 0 }
    );
    const created = await response.json();
    expect(created.status).toBe('active');

    // Toggle to inactive
    const toggleResp = await apiRequest(
      page, 'PATCH',
      `/api/admin/services/${TEST_PAGES.events.slug}/charges/${created.id}?page_id=${pageId}`,
      { status: 'inactive' }
    );
    expect(toggleResp.status()).toBe(200);
    
    const listResp = await apiRequest(page, 'GET', `/api/admin/services/${TEST_PAGES.events.slug}/charges?page_id=${pageId}`);
    const listJson = await listResp.json();
    const toggled = listJson.data.find((p: any) => p.id === created.id);
    expect(toggled.status).toBe('inactive');
    console.log('✅ Status toggled: active → inactive');
    
    await apiRequest(page, 'DELETE', `/api/admin/services/${TEST_PAGES.events.slug}/charges/${created.id}?page_id=${pageId}`);
  });

  test('DELETE removes package', async ({ page }) => {
    const response = await apiRequest(
      page, 'POST',
      `/api/admin/services/${TEST_PAGES.events.slug}/charges?page_id=${pageId}`,
      { name: `Delete Test ${Date.now()}`, price: '1500', status: 'active', sort_order: 0 }
    );
    const created = await response.json();
    
    const deleteResp = await apiRequest(
      page, 'DELETE',
      `/api/admin/services/${TEST_PAGES.events.slug}/charges/${created.id}?page_id=${pageId}`
    );
    expect(deleteResp.status()).toBe(200);
    
    const listResp = await apiRequest(page, 'GET', `/api/admin/services/${TEST_PAGES.events.slug}/charges?page_id=${pageId}`);
    const listJson = await listResp.json();
    const found = listJson.data.some((p: any) => p.id === created.id);
    expect(found).toBe(false);
    console.log(`✅ Package ${created.id} deleted successfully`);
  });
});

// ============================================================================
// TEST SUITE: Security & Data Integrity
// ============================================================================

test.describe('Package Management API - Security & Integrity', () => {
  let conferencePageId: string;
  let eventsPageId: string;

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    conferencePageId = (await fetchPageIdForService(page, TEST_PAGES.conference.slug)) || '';
    eventsPageId = (await fetchPageIdForService(page, TEST_PAGES.events.slug)) || '';
  });

  test('cannot read packages with wrong page_id', async ({ page }) => {
    const response = await apiRequest(page, 'GET', `/api/admin/services/${TEST_PAGES.conference.slug}/charges?page_id=${eventsPageId}`);
    expect(response.status()).toBe(404);
    console.log('✅ Cross-page read blocked');
  });

  test('cannot create package with wrong page_id', async ({ page }) => {
    const response = await apiRequest(page, 'POST', `/api/admin/services/${TEST_PAGES.conference.slug}/charges?page_id=${eventsPageId}`, { name: 'Unauthorized', price: '1000', status: 'active', sort_order: 0 });
    expect(response.status()).toBe(404);
    console.log('✅ Cross-page create blocked');
  });

  test('packages returned in correct sort order', async ({ page }) => {
    const pageId = conferencePageId || '';
    const response = await apiRequest(page, 'GET', `/api/admin/services/${TEST_PAGES.conference.slug}/charges?page_id=${pageId}`);
    const json = await response.json();
    const sortOrders = json.data.map((p: any) => p.sort_order);
    for (let i = 1; i < sortOrders.length; i++) {
      expect(sortOrders[i]).toBeGreaterThanOrEqual(sortOrders[i - 1]);
    }
    console.log('✅ Packages returned in correct sort order');
  });

  test('price stored as string with decimal format', async ({ page }) => {
    const pageId = conferencePageId || '';
    const response = await apiRequest(page, 'GET', `/api/admin/services/${TEST_PAGES.conference.slug}/charges?page_id=${pageId}`);
    const json = await response.json();
    if (json.data.length > 0) {
      // price is numeric: JSON.parse drops trailing zeros, so String(price) may
      // be "4500" rather than "4500.00". Accept either representation.
      expect(String(json.data[0].price)).toMatch(/^\d+(\.\d{2})?$/);
      console.log(`✅ Price format: ${json.data[0].price}`);
    }
  });

  test('service_id is server-derived (not spoofable)', async ({ page }) => {
    const pageId = (await fetchPageIdForService(page, TEST_PAGES.vip.slug)) || '';
    const response = await apiRequest(page, 'POST', `/api/admin/services/${TEST_PAGES.vip.slug}/charges?page_id=${pageId}`, {
      name: `Spoof Test ${Date.now()}`, price: '1000', status: 'active', sort_order: 0,
      service_id: '00000000-0000-0000-0000-000000000000',
    });
    expect(response.status()).toBe(201);
    const created = await response.json();
    expect(created.service_id).not.toBe('00000000-0000-0000-0000-000000000000');
    console.log('✅ Server derives service_id from URL slug');
    await apiRequest(page, 'DELETE', `/api/admin/services/${TEST_PAGES.vip.slug}/charges/${created.id}?page_id=${pageId}`);
  });
});
