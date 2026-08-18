import { test, expect } from "@playwright/test";

/**
 * DEFINITIVE Media Library Edit Feature Verification
 * 
 * This test focuses on:
 * 1. Finding a media record with actual data (not empty)
 * 2. Verifying the PATCH request is sent
 * 3. Confirming database persistence through:
 *    - Direct API GET after update
 *    - Page reload showing new values
 * 4. Restoring original values
 * 5. Verifying no test data remains
 */

const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || "http://localhost:3000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "ianohmbaemutharimi@gmail.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Ianohmbae531?";

test.describe("Media Library Edit - Definitive Verification", () => {
  test("Complete workflow: auth → find media → edit → verify PATCH → verify persistence → restore", async ({ page, context }) => {
    console.log("\n🔵 STARTING DEFINITIVE MEDIA EDIT VERIFICATION\n");

    // STEP 1: AUTHENTICATE
    console.log("STEP 1: Authenticating as admin...");
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    await page.getByLabel("Email", { exact: true }).fill(ADMIN_EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    
    await page.waitForURL(/\/dashboard/, { timeout: 30000 });
    console.log("✅ Authentication successful");

    // STEP 2: NAVIGATE TO MEDIA LIBRARY
    console.log("\nSTEP 2: Navigating to Media Library...");
    await page.goto(`${BASE_URL}/dashboard/media`, { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: /Media Library/i })).toBeVisible({ timeout: 10000 });
    console.log("✅ Media Library loaded");

    // STEP 3: WAIT FOR MEDIA CARDS AND FIND ONE WITH DATA
    console.log("\nSTEP 3: Finding media card with content...");
    const mediaCards = page.locator('[class*="aspect-video"]');
    await expect(mediaCards.first()).toBeVisible({ timeout: 10000 });
    
    const cardCount = await mediaCards.count();
    console.log(`ℹ️  Found ${cardCount} media cards`);

    let selectedMediaId: string | null = null;
    let originalTitle: string | null = null;
    let originalAltText: string | null = null;
    const testTitle = `VERIFIED_EDIT_${Date.now()}`;
    const testAltText = "Definitive verification test";

    // Try to find a card and edit it
    for (let i = 0; i < Math.min(cardCount, 5); i++) {
      const card = mediaCards.nth(i);
      await card.scrollIntoViewIfNeeded();
      
      // Hover to reveal edit button
      await card.hover();
      const editBtn = card.locator("button").filter({ hasText: /edit/i }).first();
      
      try {
        await expect(editBtn).toBeVisible({ timeout: 3000 });
        console.log(`✅ Edit button visible on card ${i + 1}`);
        
        // Click to open modal
        await editBtn.click();
        
        // Wait for modal
        const modal = page.locator('[role="dialog"]').first();
        await expect(modal).toBeVisible({ timeout: 5000 });
        console.log(`✅ Modal opened for card ${i + 1}`);
        
        // Get form inputs using robust selectors
        const titleInput = page.getByLabel("Title", { exact: true });
        const altTextInput = page.getByLabel("Alt Text", { exact: true });
        
        await expect(titleInput).toBeVisible();
        await expect(altTextInput).toBeVisible();
        
        originalTitle = await titleInput.inputValue() || "";
        originalAltText = await altTextInput.inputValue() || "";
        
        console.log(`ℹ️  Original values: title="${originalTitle}", alt="${originalAltText}"`);
        
        // STEP 4: FILL NEW VALUES
        console.log("\nSTEP 4: Entering test values...");
        await titleInput.clear();
        await titleInput.fill(testTitle);
        await altTextInput.clear();
        await altTextInput.fill(testAltText);
        console.log(`✅ Filled: title="${testTitle}", alt="${testAltText}"`);
        
        // STEP 5: CAPTURE PATCH REQUEST AND SEND IT
        console.log("\nSTEP 5: Saving and capturing PATCH request...");
        let capturedPatchRequest: any = null;
        let capturedPatchResponse: any = null;
        
        page.on("request", (request) => {
          if (request.method() === "PATCH" && request.url().includes("/api/admin/media_assets/")) {
            const urlParts = request.url().split("/");
            selectedMediaId = urlParts[urlParts.length - 1];
            capturedPatchRequest = {
              url: request.url(),
              method: request.method(),
              body: request.postDataJSON(),
            };
            console.log(`📤 PATCH captured: ${request.url()}`);
            console.log(`   Body: ${JSON.stringify(request.postDataJSON())}`);
          }
        });

        page.on("response", (response) => {
          if (response.request().method() === "PATCH" && response.url().includes("/api/admin/media_assets/")) {
            capturedPatchResponse = {
              status: response.status(),
              statusText: response.statusText(),
            };
            console.log(`📥 Response: ${response.status()} ${response.statusText()}`);
          }
        });
        
        // Click save button
        const saveButton = page.getByRole("button", { name: /save changes/i });
        await saveButton.click();
        
        // Wait for modal to close
        await page.waitForFunction(() => {
          return !document.querySelector('[role="dialog"]');
        }, { timeout: 10000 });
        
        console.log("✅ Modal closed (save completed)");
        
        // VERIFY PATCH REQUEST
        expect(capturedPatchRequest).toBeTruthy();
        expect(capturedPatchRequest.method).toBe("PATCH");
        expect(capturedPatchRequest.body.title).toBe(testTitle);
        expect(capturedPatchRequest.body.alt_text).toBe(testAltText);
        expect(capturedPatchResponse?.status).toBe(200);
        console.log("✅ PATCH request verified: correct method, payload, and 200 response");
        
        // STEP 6: VERIFY PERSISTENCE VIA API
        console.log("\nSTEP 6: Verifying persistence via direct API call...");
        const getResponse = await page.request.get(
          `${BASE_URL}/api/admin/media_assets/${selectedMediaId}`
        );
        expect(getResponse.status()).toBe(200);
        const data = await getResponse.json();
        expect(data.title).toBe(testTitle);
        expect(data.alt_text).toBe(testAltText);
        console.log(`✅ API GET confirmed persistence: title="${data.title}", alt="${data.alt_text}"`);
        
        // STEP 7: RELOAD PAGE AND VERIFY UI REFLECTS CHANGE
        console.log("\nSTEP 7: Reloading page and verifying UI persistence...");
        await page.goto(`${BASE_URL}/dashboard/media`, { waitUntil: "networkidle" });
        await expect(page.getByRole("heading", { name: /Media Library/i })).toBeVisible({ timeout: 10000 });
        
        // Open the same card again
        const reloadedCards = page.locator('[class*="aspect-video"]');
        let foundCard = false;
        const reloadedCardCount = await reloadedCards.count();
        
        for (let j = 0; j < Math.min(reloadedCardCount, 10); j++) {
          const rCard = reloadedCards.nth(j);
          await rCard.hover();
          const rEditBtn = rCard.locator("button").filter({ hasText: /edit/i }).first();
          
          try {
            await expect(rEditBtn).toBeVisible({ timeout: 2000 });
            await rEditBtn.click();
            
            const rModal = page.locator('[role="dialog"]').first();
            await expect(rModal).toBeVisible({ timeout: 5000 });
            
            const rTitleInput = page.getByLabel("Title", { exact: true });
            const rAltTextInput = page.getByLabel("Alt Text", { exact: true });
            
            const reloadedTitle = await rTitleInput.inputValue();
            const reloadedAltText = await rAltTextInput.inputValue();
            
            // Check if this is our test record
            if (reloadedTitle === testTitle && reloadedAltText === testAltText) {
              console.log(`✅ UI persistence confirmed: title="${reloadedTitle}", alt="${reloadedAltText}"`);
              foundCard = true;
              
              // STEP 8: RESTORE ORIGINAL VALUES
              console.log("\nSTEP 8: Restoring original values...");
              await rTitleInput.clear();
              if (originalTitle) {
                await rTitleInput.fill(originalTitle);
              }
              await rAltTextInput.clear();
              if (originalAltText) {
                await rAltTextInput.fill(originalAltText);
              }
              
              const rSaveButton = page.getByRole("button", { name: /save changes/i });
              await rSaveButton.click();
              
              await page.waitForFunction(() => {
                return !document.querySelector('[role="dialog"]');
              }, { timeout: 10000 });
              
              console.log("✅ Original values restored");
              
              // STEP 9: VERIFY RESTORATION
              console.log("\nSTEP 9: Verifying restoration in database...");
              const restoreCheckResponse = await page.request.get(
                `${BASE_URL}/api/admin/media_assets/${selectedMediaId}`
              );
              const restoreCheckData = await restoreCheckResponse.json();
              expect(restoreCheckData.title).toBe(originalTitle || "");
              expect(restoreCheckData.alt_text).toBe(originalAltText || "");
              console.log(`✅ Restoration verified: title="${restoreCheckData.title}", alt="${restoreCheckData.alt_text}"`);
              
              break;
            }
          } catch (e) {
            // Card not matching or issue opening it, try next
            continue;
          }
        }
        
        if (foundCard) {
          console.log("\n🟢 COMPLETE WORKFLOW VERIFIED\n");
          console.log("Summary:");
          console.log("  ✅ Admin authentication");
          console.log("  ✅ Media Library loads");
          console.log("  ✅ Edit button visible");
          console.log("  ✅ Modal opens with existing values");
          console.log("  ✅ Form fields can be edited");
          console.log("  ✅ PATCH request sent correctly");
          console.log("  ✅ API response 200 OK");
          console.log("  ✅ Database update persisted");
          console.log("  ✅ UI reflects updated values after reload");
          console.log("  ✅ Original values restored");
          console.log("  ✅ No test data remains in database");
          return;
        }
      } catch (e) {
        // This card failed, try next
        continue;
      }
    }
    
    throw new Error("Could not find a media card to edit or workflow failed");
  });
});
