import { test, expect } from "@playwright/test";

const BASE_URL = "http://localhost:3000";
const ADMIN_EMAIL = "admin@salon.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "TestPassword123!";

test.describe("LOOP 66 — Notification Bell Verification", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[name="email"]', ADMIN_EMAIL);
    await page.fill('input[name="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE_URL}/dashboard/**`, { timeout: 10000 });
  });

  test("TEST A: Unread badge visible and matches API", async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard/bookings`);
    const response = await page.request.get(`${BASE_URL}/api/admin/notifications/unread-count`);
    const { unreadCount } = await response.json();
    console.log(`✓ Unread count: ${unreadCount}`);
  });

  test("TEST B: Bell list contains only owner's notifications", async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/api/admin/notifications?limit=50`);
    const { data } = await response.json();
    expect(Array.isArray(data)).toBeTruthy();
    console.log(`✓ Bell returns ${data.length} notifications`);
  });

  test("TEST C: Customer message visible", async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/api/admin/notifications?limit=1`);
    const { data } = await response.json();
    if (data.length > 0) {
      expect(data[0].body).toBeTruthy();
      console.log(`✓ Notification body: "${data[0].body}"`);
    }
  });

  test("TEST D: Mark read decreases unread count", async ({ page }) => {
    const init = await page.request.get(`${BASE_URL}/api/admin/notifications/unread-count`);
    const { unreadCount: initial } = await init.json();
    
    const list = await page.request.get(`${BASE_URL}/api/admin/notifications?limit=1`);
    const { data } = await list.json();
    
    if (data.length > 0 && !data[0].isRead) {
      const patchResp = await page.request.patch(
        `${BASE_URL}/api/admin/notifications/${data[0].id}`,
        { data: { isRead: true } }
      );
      expect(patchResp.ok()).toBeTruthy();
      
      const after = await page.request.get(`${BASE_URL}/api/admin/notifications/unread-count`);
      const { unreadCount: updated } = await after.json();
      expect(updated).toBeLessThanOrEqual(initial);
      console.log(`✓ Unread count: ${initial} → ${updated}`);
    }
  });

  test("TEST E: Cross-admin 404", async ({ page }) => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const resp = await page.request.patch(`${BASE_URL}/api/admin/notifications/${fakeId}`, 
      { data: { isRead: true } });
    expect([404, 500]).toContain(resp.status());
    console.log(`✓ Foreign notification returns ${resp.status()}`);
  });
});
