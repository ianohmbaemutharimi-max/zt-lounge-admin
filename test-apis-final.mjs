import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const BASE_URL = "http://localhost:3000";
const authToken = process.env.TEST_AUTH_TOKEN;

async function testAPI(endpoint) {
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(authToken && { Authorization: `Bearer ${authToken}` }),
      },
    });

    const status = response.status;
    const text = await response.text();

    console.log(`${endpoint}: ${status}`);
    if (status !== 200) {
      console.log(`  Error: ${text.substring(0, 200)}`);
    }
    return status;
  } catch (err) {
    console.log(`${endpoint}: ERROR - ${err.message}`);
    return null;
  }
}

async function runTests() {
  console.log("Testing critical APIs...\n");

  const results = {
    menu_items: await testAPI("/api/admin/menu-items"),
    menu_categories: await testAPI("/api/admin/menu-categories"),
    hero_slides: await testAPI("/api/admin/hero-slides"),
  };

  console.log("\n=== RESULTS ===");
  console.log(`Menu Items: ${results.menu_items === 200 ? "✅ 200" : `❌ ${results.menu_items}`}`);
  console.log(
    `Menu Categories: ${results.menu_categories === 200 ? "✅ 200" : `❌ ${results.menu_categories}`}`
  );
  console.log(`Hero Slides: ${results.hero_slides === 200 ? "✅ 200" : `❌ ${results.hero_slides}`}`);

  if (
    results.menu_items === 200 &&
    results.menu_categories === 200 &&
    results.hero_slides === 200
  ) {
    console.log("\n🎉 All APIs are working!");
    process.exit(0);
  } else {
    console.log("\n⚠️  Some APIs still failing - migration may need to be applied");
    process.exit(1);
  }
}

runTests();
