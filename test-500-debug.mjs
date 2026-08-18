#!/usr/bin/env node

/**
 * Test menu-items and hero-slides endpoints
 * Capture real errors
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("❌ Missing Supabase env vars");
  process.exit(1);
}

async function testDatabase() {
  console.log("=== DATABASE SCHEMA INSPECTION ===\n");

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Test 1: Check if menu_items table exists and list columns
  console.log("1. Checking menu_items table schema:");
  const { data: menuData, error: menuError } = await supabase
    .from("menu_items")
    .select()
    .limit(1);

  if (menuError) {
    console.log(`   ❌ Error: ${menuError.message}`);
    console.log(`   Code: ${menuError.code}`);
  } else {
    console.log(`   ✓ Table exists`);
    if (menuData && menuData.length > 0) {
      console.log(`   Columns: ${Object.keys(menuData[0]).join(", ")}`);
    }
  }

  // Test 2: Check if hero_slides table exists
  console.log("\n2. Checking hero_slides table schema:");
  const { data: heroData, error: heroError } = await supabase
    .from("hero_slides")
    .select()
    .limit(1);

  if (heroError) {
    console.log(`   ❌ Error: ${heroError.message}`);
    console.log(`   Code: ${heroError.code}`);
  } else {
    console.log(`   ✓ Table exists`);
    if (heroData && heroData.length > 0) {
      console.log(`   Columns: ${Object.keys(heroData[0]).join(", ")}`);
    }
  }

  // Test 3: Check if media_assets table exists
  console.log("\n3. Checking media_assets table schema:");
  const { data: mediaData, error: mediaError } = await supabase
    .from("media_assets")
    .select()
    .limit(1);

  if (mediaError) {
    console.log(`   ❌ Error: ${mediaError.message}`);
    console.log(`   Code: ${mediaError.code}`);
  } else {
    console.log(`   ✓ Table exists`);
    if (mediaData && mediaData.length > 0) {
      console.log(`   Columns: ${Object.keys(mediaData[0]).join(", ")}`);
    }
  }

  // Test 4: Try menu_items with media_id and image_url
  console.log("\n4. Testing menu_items SELECT with specific columns:");
  const { data: menuCols, error: menuColError } = await supabase
    .from("menu_items")
    .select("id, name, media_id, image_url")
    .limit(1);

  if (menuColError) {
    console.log(`   ❌ Error: ${menuColError.message}`);
    console.log(`   Code: ${menuColError.code}`);
  } else {
    console.log(`   ✓ Query successful`);
    console.log(`   Count: ${menuCols?.length || 0}`);
  }

  // Test 5: Try hero_slides with media_id and image_url
  console.log("\n5. Testing hero_slides SELECT with specific columns:");
  const { data: heroCols, error: heroColError } = await supabase
    .from("hero_slides")
    .select("id, title, media_id, image_url")
    .limit(1);

  if (heroColError) {
    console.log(`   ❌ Error: ${heroColError.message}`);
    console.log(`   Code: ${heroColError.code}`);
  } else {
    console.log(`   ✓ Query successful`);
    console.log(`   Count: ${heroCols?.length || 0}`);
  }

  // Test 6: Check RLS policies on menu_items
  console.log("\n6. Testing RLS on menu_items (with anon key):");
  const { data: rls1, error: rls1Error } = await supabase
    .from("menu_items")
    .select("count", { count: "exact" });

  if (rls1Error) {
    console.log(`   ❌ Error: ${rls1Error.message}`);
  } else {
    console.log(`   ✓ RLS allows SELECT`);
    console.log(`   Total rows: ${rls1}`);
  }
}

testDatabase().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
