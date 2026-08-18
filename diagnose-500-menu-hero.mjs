import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function diagnose() {
  console.log("🔍 Diagnosing menu_items and hero_slides schema...\n");

  // Get columns for both tables
  const { data: menuItems, error: menuError } = await supabase
    .from("information_schema.columns")
    .select("column_name, data_type, is_nullable")
    .eq("table_name", "menu_items");

  if (menuError) {
    console.error("❌ Error querying menu_items schema:", menuError);
  } else {
    console.log("✅ menu_items columns:");
    if (menuItems && menuItems.length > 0) {
      menuItems.forEach((col) => {
        console.log(
          `  - ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable})`
        );
      });
    } else {
      console.log("  No columns found");
    }
  }

  console.log("\n");

  const { data: heroSlides, error: heroError } = await supabase
    .from("information_schema.columns")
    .select("column_name, data_type, is_nullable")
    .eq("table_name", "hero_slides");

  if (heroError) {
    console.error("❌ Error querying hero_slides schema:", heroError);
  } else {
    console.log("✅ hero_slides columns:");
    if (heroSlides && heroSlides.length > 0) {
      heroSlides.forEach((col) => {
        console.log(
          `  - ${col.column_name} (${col.data_type}, nullable: ${col.is_nullable})`
        );
      });
    } else {
      console.log("  No columns found");
    }
  }

  console.log("\n");

  // Now try to fetch from each table to see what the actual error is
  console.log("📡 Testing queries...\n");

  const { data: menuData, error: menuQueryError, status: menuStatus } =
    await supabase.from("menu_items").select("*").limit(1);

  console.log(`menu_items query status: ${menuStatus}`);
  if (menuQueryError) {
    console.error("❌ menu_items error:", menuQueryError.message);
  } else {
    console.log("✅ menu_items query succeeded");
    if (menuData && menuData.length > 0) {
      console.log("Sample columns:", Object.keys(menuData[0]));
    }
  }

  console.log("\n");

  const { data: heroData, error: heroQueryError, status: heroStatus } =
    await supabase.from("hero_slides").select("*").limit(1);

  console.log(`hero_slides query status: ${heroStatus}`);
  if (heroQueryError) {
    console.error("❌ hero_slides error:", heroQueryError.message);
  } else {
    console.log("✅ hero_slides query succeeded");
    if (heroData && heroData.length > 0) {
      console.log("Sample columns:", Object.keys(heroData[0]));
    }
  }

  console.log("\n");

  // Try selecting just the columns from RESPONSE_ALLOWLISTS
  console.log("🔎 Testing RESPONSE_ALLOWLISTS columns...\n");

  const menuColumns = [
    "id",
    "page_id",
    "category_id",
    "name",
    "description",
    "price",
    "image_url",
    "media_id",
    "display_order",
    "is_active",
    "created_at",
    "updated_at",
    "slug",
    "alt_text",
    "category",
    "type",
    "is_featured",
  ].join(",");

  const { data: menuSelectData, error: menuSelectError } = await supabase
    .from("menu_items")
    .select(menuColumns)
    .limit(1);

  if (menuSelectError) {
    console.error("❌ menu_items SELECT error:", menuSelectError.message);
  } else {
    console.log("✅ menu_items RESPONSE_ALLOWLISTS SELECT succeeded");
  }

  const heroColumns = [
    "id",
    "page_id",
    "badge",
    "title",
    "highlight",
    "subtitle",
    "image_url",
    "media_id",
    "buttons",
    "display_order",
    "is_active",
    "created_at",
    "updated_at",
    "alt_text",
    "cta_text",
    "cta_link",
  ].join(",");

  const { data: heroSelectData, error: heroSelectError } = await supabase
    .from("hero_slides")
    .select(heroColumns)
    .limit(1);

  if (heroSelectError) {
    console.error("❌ hero_slides SELECT error:", heroSelectError.message);
  } else {
    console.log("✅ hero_slides RESPONSE_ALLOWLISTS SELECT succeeded");
  }
}

diagnose().catch(console.error);
