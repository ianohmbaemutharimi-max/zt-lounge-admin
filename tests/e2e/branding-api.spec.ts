/**  
 * BRANDING API — DIRECT RUNTIME SMOKE TESTS  
 *  
 * Verifies the /api/admin/business-settings/branding endpoint works correctly  
 * following the canonical media architecture pattern.  
 *  
 * Auth: Uses captured admin cookies via captureAuthCookies fixture.  
 */  
import { test, expect } from "@playwright/test";  
import { captureAuthCookies } from "./fixtures/auth";  

let authCookies: import("@playwright/test").Cookie[];  

test.beforeAll(async ({ browser }) => {  
  test.setTimeout(120_000);  
  authCookies = await captureAuthCookies(browser);  
});  

test.beforeEach(async ({ context }) => {  
  await context.addCookies(authCookies);  
});  

test.describe.serial("branding-api", () => {  
  test("PATCH branding → 200 + updated business_settings", async ({ page }) => {  
    // First, get current business settings to find existing media assets  
    const settingsRes = await page.request.get("/api/admin/business-settings");  
    expect(settingsRes.ok()).toBe(true);  
    const settings = await settingsRes.json();  
    const biz = settings.data?.[0];  
    expect(biz).toBeTruthy();  

    // Get media assets to find a valid image  
    const mediaRes = await page.request.get("/api/admin/media");  
    expect(mediaRes.ok()).toBe(true);  
    const media = await mediaRes.json();  
    const images = (media.data ?? []).filter((m: any) =>  
      m.mime_type?.startsWith("image/") && m.category === "branding"  
    );  

    // If no branding images exist, skip asset validation test  
    if (images.length === 0) {  
      test.skip(true, "No branding images available for testing");  
      return;  
    }  

    const imageId = images[0].id;  

    // Test: Update logo_media_id  
    const logoRes = await page.request.patch("/api/admin/business-settings/branding", {  
      data: { logo_media_id: imageId },  
    });  
    expect(logoRes.ok()).toBe(true);  
    const logoBody = await logoRes.json();  
    expect(logoBody).toHaveProperty("logo_media_id", imageId);  

    // Reset to original for favicon test  
    if (biz?.logo_media_id) {  
      await page.request.patch("/api/admin/business-settings/branding", {  
        data: { logo_media_id: biz.logo_media_id },  
      });  
    }  

    // Test: Update favicon_media_id  
    const faviconRes = await page.request.patch("/api/admin/business-settings/branding", {  
      data: { favicon_media_id: imageId },  
    });  
    expect(faviconRes.ok()).toBe(true);  
    const faviconBody = await faviconRes.json();  
    expect(faviconBody).toHaveProperty("favicon_media_id", imageId);  

    // Reset to original  
    if (biz?.favicon_media_id) {  
      await page.request.patch("/api/admin/business-settings/branding", {  
        data: { favicon_media_id: biz.favicon_media_id },  
      });  
    }  

    // Test: Update both fields at once  
    const bothRes = await page.request.patch("/api/admin/business-settings/branding", {  
      data: {  
        logo_media_id: imageId,  
        favicon_media_id: imageId,  
      },  
    });  
    expect(bothRes.ok()).toBe(true);  
    const bothBody = await bothRes.json();  
    expect(bothBody).toHaveProperty("logo_media_id", imageId);  
    expect(bothBody).toHaveProperty("favicon_media_id", imageId);  

    // Reset both to original  
    await page.request.patch("/api/admin/business-settings/branding", {  
      data: {  
        logo_media_id: biz?.logo_media_id ?? null,  
        favicon_media_id: biz?.favicon_media_id ?? null,  
      },  
    });  
  });  

  test("PATCH branding with invalid UUID → 404", async ({ page }) => {  
    const res = await page.request.patch("/api/admin/business-settings/branding", {  
      data: { logo_media_id: "not-a-valid-uuid" },  
    });  
    // Should fail validation or not find the asset  
    expect(res.status()).toBeGreaterThanOrEqual(400);  
  });  

  test("PATCH branding with non-image asset → 400", async ({ page }) => {  
    // Get media assets and find a non-image one (e.g., video or document)  
    const mediaRes = await page.request.get("/api/admin/media");  
    expect(mediaRes.ok()).toBe(true);  
    const media = await mediaRes.json();  
    const nonImages = (media.data ?? []).filter((m: any) =>  
      !m.mime_type?.startsWith("image/") && m.mime_type  
    );  

    if (nonImages.length === 0) {  
      test.skip(true, "No non-image media assets available for testing");  
      return;  
    }  

    const nonImageId = nonImages[0].id;  
    const res = await page.request.patch("/api/admin/business-settings/branding", {  
      data: { logo_media_id: nonImageId },  
    });  
    expect(res.status()).toBe(400);  
    const body = await res.json();  
    expect(body.error).toMatch(/image/i);  
  });  

  test("PATCH branding with empty body → 400", async ({ page }) => {  
    const res = await page.request.patch("/api/admin/business-settings/branding", {  
      data: {},  
    });  
    expect(res.status()).toBe(400);  
    const body = await res.json();  
    expect(body.error).toMatch(/at least one/i);  
  });  

  test("PATCH branding without auth → 401 or redirect", async ({ page }) => {  
    // Create a new context without auth cookies  
    const unauthContext = await page.context().newContext();  
    const unauthPage = await unauthContext.newPage();  

    const res = await unauthPage.request.patch("/api/admin/business-settings/branding", {  
      data: { logo_media_id: "some-uuid" },  
    });  

    // Should reject unauthenticated requests  
    expect(res.status()).toBeGreaterThanOrEqual(400);  

    await unauthContext.close();  
  });  
});
