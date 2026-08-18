#!/usr/bin/env node

/**
 * DIAGNOSTIC SCRIPT: Menu Items & Hero Slides 500 Error Investigation
 * 
 * Purpose: Identify root cause of /api/admin/menu-items and /api/admin/hero-slides 500 errors
 * 
 * Execution Path:
 * 1. Verify Supabase connectivity
 * 2. Check menu_items table schema (columns, types, constraints)
 * 3. Check hero_slides table schema (columns, types, constraints)
 * 4. Query menu_items table directly
 * 5. Query hero_slides table directly
 * 6. Test API endpoints with authentication
 * 7. Compare expected vs actual schema
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("❌ Missing Supabase credentials");
  process.exit(1);
}

console.log("🔍 ZT LOUNGE — MENU ITEMS & HERO SLIDES 500 ERROR DIAGNOSIS\n");
console.log(`Supabase URL: ${supabaseUrl}`);
console.log(`Using service role key: ${!!supabaseServiceKey}\n`);

// Create Supabase client with service role key for full schema access
const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);

// ============================================================================
// PHASE 1: Check Table Existence & Schema
// ============================================================================

async function checkTableSchema() {
  console.log("=".repeat(80));
  console.log("PHASE 1: TABLE SCHEMA INSPECTION");
  console.log("=".repeat(80) + "\n");

  try {
    // Check menu_items columns
    console.log("📋 Checking menu_items table schema...");
    const { data: menuItemsColumns, error: menuItemsError } = await supabase.rpc(
      "get_table_columns",
      { table_name: "menu_items" }
    ).catch(() => ({ data: null, error: { message: "RPC not available" } }));

    if (menuItemsError) {
      console.log("  ⚠️  RPC not available, using direct query...");
      
      // Fallback: Try to query the table directly to see what columns exist
      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .limit(1);
      
      if (error) {
        console.log(`  ❌ Error querying menu_items: ${error.message}`);
        console.log(`     Code: ${error.code}`);
      } else if (data && data.length > 0) {
        const columns = Object.keys(data[0]);
        console.log(`  ✅ menu_items columns found: ${columns.join(", ")}`);
      } else {
        console.log(`  ℹ️  menu_items table is empty (no sample record)`);
      }
    } else if (menuItemsColumns) {
      console.log(`  ✅ menu_items columns: ${menuItemsColumns.map(c => c.column_name).join(", ")}`);
    }

    // Check hero_slides columns
    console.log("\n📋 Checking hero_slides table schema...");
    const { data: heroSlidesColumns, error: heroSlidesError } = await supabase.rpc(
      "get_table_columns",
      { table_name: "hero_slides" }
    ).catch(() => ({ data: null, error: { message: "RPC not available" } }));

    if (heroSlidesError) {
      console.log("  ⚠️  RPC not available, using direct query...");
      
      const { data, error } = await supabase
        .from("hero_slides")
        .select("*")
        .limit(1);
      
      if (error) {
        console.log(`  ❌ Error querying hero_slides: ${error.message}`);
        console.log(`     Code: ${error.code}`);
      } else if (data && data.length > 0) {
        const columns = Object.keys(data[0]);
        console.log(`  ✅ hero_slides columns found: ${columns.join(", ")}`);
      } else {
        console.log(`  ℹ️  hero_slides table is empty (no sample record)`);
      }
    } else if (heroSlidesColumns) {
      console.log(`  ✅ hero_slides columns: ${heroSlidesColumns.map(c => c.column_name).join(", ")}`);
    }

  } catch (err) {
    console.error(`❌ Schema inspection failed: ${err.message}`);
  }
}

// ============================================================================
// PHASE 2: Direct Table Query
// ============================================================================

async function queryTables() {
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 2: DIRECT TABLE QUERIES");
  console.log("=".repeat(80) + "\n");

  try {
    // Query menu_items
    console.log("📊 Querying menu_items table...");
    const { data: menuItems, error: menuError, count: menuCount } = await supabase
      .from("menu_items")
      .select("*", { count: "exact" })
      .limit(1);

    if (menuError) {
      console.log(`  ❌ Error: ${menuError.message}`);
      console.log(`     Code: ${menuError.code}`);
    } else {
      console.log(`  ✅ Query successful`);
      console.log(`     Total records: ${menuCount}`);
      if (menuItems && menuItems.length > 0) {
        console.log(`     Sample columns: ${Object.keys(menuItems[0]).join(", ")}`);
      }
    }

    // Query hero_slides
    console.log("\n📊 Querying hero_slides table...");
    const { data: heroSlides, error: heroError, count: heroCount } = await supabase
      .from("hero_slides")
      .select("*", { count: "exact" })
      .limit(1);

    if (heroError) {
      console.log(`  ❌ Error: ${heroError.message}`);
      console.log(`     Code: ${heroError.code}`);
    } else {
      console.log(`  ✅ Query successful`);
      console.log(`     Total records: ${heroCount}`);
      if (heroSlides && heroSlides.length > 0) {
        console.log(`     Sample columns: ${Object.keys(heroSlides[0]).join(", ")}`);
      }
    }

  } catch (err) {
    console.error(`❌ Table query failed: ${err.message}`);
  }
}

// ============================================================================
// PHASE 3: Test with Expected Columns from Repository
// ============================================================================

async function testExpectedColumns() {
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 3: TESTING EXPECTED COLUMNS FROM REPOSITORY");
  console.log("=".repeat(80) + "\n");

  // Expected columns from repository.ts RESPONSE_ALLOWLISTS
  const expectedMenuItemsColumns = [
    "id", "page_id", "category_id", "name", "description", "price",
    "image_url", "media_id", "display_order", "is_active", "created_at",
    "updated_at", "slug", "alt_text", "category", "type", "is_featured"
  ];

  const expectedHeroSlidesColumns = [
    "id", "page_id", "badge", "title", "highlight", "subtitle",
    "image_url", "media_id", "buttons", "display_order", "is_active",
    "created_at", "updated_at", "alt_text", "cta_text", "cta_link"
  ];

  try {
    console.log("🔍 Testing menu_items with expected columns...");
    const selectCols = expectedMenuItemsColumns.join(", ");
    const { data, error } = await supabase
      .from("menu_items")
      .select(selectCols)
      .limit(1);

    if (error) {
      console.log(`  ❌ Select failed: ${error.message}`);
      console.log(`     Code: ${error.code}`);
      
      // Try to identify which column is missing
      console.log("\n  🔎 Testing columns individually...");
      for (const col of expectedMenuItemsColumns) {
        const { error: colError } = await supabase
          .from("menu_items")
          .select(col)
          .limit(1);
        
        if (colError) {
          console.log(`     ❌ Column "${col}" - Error: ${colError.message}`);
        }
      }
    } else {
      console.log(`  ✅ All columns exist and query successful`);
      if (data && data.length > 0) {
        console.log(`     Sample data keys: ${Object.keys(data[0]).join(", ")}`);
      }
    }

    console.log("\n🔍 Testing hero_slides with expected columns...");
    const heroSelectCols = expectedHeroSlidesColumns.join(", ");
    const { data: heroData, error: heroError } = await supabase
      .from("hero_slides")
      .select(heroSelectCols)
      .limit(1);

    if (heroError) {
      console.log(`  ❌ Select failed: ${heroError.message}`);
      console.log(`     Code: ${heroError.code}`);
      
      console.log("\n  🔎 Testing columns individually...");
      for (const col of expectedHeroSlidesColumns) {
        const { error: colError } = await supabase
          .from("hero_slides")
          .select(col)
          .limit(1);
        
        if (colError) {
          console.log(`     ❌ Column "${col}" - Error: ${colError.message}`);
        }
      }
    } else {
      console.log(`  ✅ All columns exist and query successful`);
      if (heroData && heroData.length > 0) {
        console.log(`     Sample data keys: ${Object.keys(heroData[0]).join(", ")}`);
      }
    }

  } catch (err) {
    console.error(`❌ Column test failed: ${err.message}`);
  }
}

// ============================================================================
// PHASE 4: Check for media_assets table and FK relationships
// ============================================================================

async function checkMediaAssets() {
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 4: MEDIA_ASSETS TABLE & FOREIGN KEYS");
  console.log("=".repeat(80) + "\n");

  try {
    console.log("📋 Checking media_assets table...");
    const { data, error, count } = await supabase
      .from("media_assets")
      .select("id", { count: "exact" })
      .limit(1);

    if (error) {
      console.log(`  ❌ Error: ${error.message}`);
    } else {
      console.log(`  ✅ media_assets table exists`);
      console.log(`     Total records: ${count}`);
    }

    // Try to fetch with media_id join
    console.log("\n📋 Testing menu_items with media_id resolution...");
    const { data: itemsWithMedia, error: joinError } = await supabase
      .from("menu_items")
      .select(`id, media_id, image_url, name`)
      .limit(5);

    if (joinError) {
      console.log(`  ❌ Error: ${joinError.message}`);
    } else {
      console.log(`  ✅ Query successful`);
      if (itemsWithMedia && itemsWithMedia.length > 0) {
        const hasMediaId = itemsWithMedia.some(item => item.media_id);
        console.log(`     Records with media_id: ${itemsWithMedia.filter(i => i.media_id).length}/${itemsWithMedia.length}`);
      }
    }

  } catch (err) {
    console.error(`❌ Media assets check failed: ${err.message}`);
  }
}

// ============================================================================
// PHASE 5: Test API Endpoints
// ============================================================================

async function testApiEndpoints() {
  console.log("\n" + "=".repeat(80));
  console.log("PHASE 5: API ENDPOINT TESTS");
  console.log("=".repeat(80) + "\n");

  const baseUrl = "http://localhost:3000";

  try {
    console.log("🌐 Testing GET /api/admin/menu-items...");
    const menuResponse = await fetch(`${baseUrl}/api/admin/menu-items`, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    console.log(`   Status: ${menuResponse.status} ${menuResponse.statusText}`);
    if (menuResponse.status === 500) {
      const menuError = await menuResponse.json();
      console.log(`   ❌ Error response: ${JSON.stringify(menuError, null, 2)}`);
    } else if (menuResponse.ok) {
      const menuData = await menuResponse.json();
      console.log(`   ✅ Success - ${Array.isArray(menuData) ? menuData.length : 'unknown'} items`);
    }

    console.log("\n🌐 Testing GET /api/admin/hero-slides...");
    const heroResponse = await fetch(`${baseUrl}/api/admin/hero-slides`, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    console.log(`   Status: ${heroResponse.status} ${heroResponse.statusText}`);
    if (heroResponse.status === 500) {
      const heroError = await heroResponse.json();
      console.log(`   ❌ Error response: ${JSON.stringify(heroError, null, 2)}`);
    } else if (heroResponse.ok) {
      const heroData = await heroResponse.json();
      console.log(`   ✅ Success - ${Array.isArray(heroData) ? heroData.length : 'unknown'} slides`);
    }

    console.log("\n🌐 Testing GET /api/admin/menu-categories (for comparison)...");
    const categoriesResponse = await fetch(`${baseUrl}/api/admin/menu-categories`, {
      method: "GET",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
    });

    console.log(`   Status: ${categoriesResponse.status} ${categoriesResponse.statusText}`);
    if (categoriesResponse.ok) {
      const categoryData = await categoriesResponse.json();
      console.log(`   ✅ Success - ${Array.isArray(categoryData) ? categoryData.length : 'unknown'} categories`);
    }

  } catch (err) {
    console.error(`❌ API test failed: ${err.message}`);
    console.log("   (Make sure the dev server is running on http://localhost:3000)");
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  try {
    await checkTableSchema();
    await queryTables();
    await testExpectedColumns();
    await checkMediaAssets();
    await testApiEndpoints();

    console.log("\n" + "=".repeat(80));
    console.log("✅ DIAGNOSIS COMPLETE");
    console.log("=".repeat(80));
    console.log("\nSee errors above for root cause analysis.\n");

  } catch (err) {
    console.error(`\n❌ Fatal error: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
