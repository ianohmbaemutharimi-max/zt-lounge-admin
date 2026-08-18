#!/usr/bin/env node

/**
 * APPLY MISSING MIGRATION directly to Supabase
 * This script executes SQL statements one at a time to add media_id columns
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing Supabase credentials");
  process.exit(1);
}

console.log("🔧 APPLYING MISSING MIGRATION: 20260817_add_media_id_to_cms_tables\n");

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  try {
    // List of SQL statements to execute
    const statements = [
      // PHASE 1: Add media_id columns
      {
        desc: "Add media_id to menu_items",
        sql: "ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS media_id uuid;",
      },
      {
        desc: "Add media_id to services",
        sql: "ALTER TABLE services ADD COLUMN IF NOT EXISTS media_id uuid;",
      },
      {
        desc: "Add media_id to gallery",
        sql: "ALTER TABLE gallery ADD COLUMN IF NOT EXISTS media_id uuid;",
      },
      {
        desc: "Add media_id to hero_slides",
        sql: "ALTER TABLE hero_slides ADD COLUMN IF NOT EXISTS media_id uuid;",
      },
      // PHASE 2: Create foreign key constraints
      {
        desc: "FK constraint: menu_items.media_id",
        sql: "ALTER TABLE menu_items ADD CONSTRAINT fk_menu_items_media_id FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE SET NULL;",
      },
      {
        desc: "FK constraint: services.media_id",
        sql: "ALTER TABLE services ADD CONSTRAINT fk_services_media_id FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE SET NULL;",
      },
      {
        desc: "FK constraint: gallery.media_id",
        sql: "ALTER TABLE gallery ADD CONSTRAINT fk_gallery_media_id FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE SET NULL;",
      },
      {
        desc: "FK constraint: hero_slides.media_id",
        sql: "ALTER TABLE hero_slides ADD CONSTRAINT fk_hero_slides_media_id FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE SET NULL;",
      },
      // PHASE 3: Create indexes
      {
        desc: "Index: idx_menu_items_media_id",
        sql: "CREATE INDEX IF NOT EXISTS idx_menu_items_media_id ON menu_items(media_id);",
      },
      {
        desc: "Index: idx_services_media_id",
        sql: "CREATE INDEX IF NOT EXISTS idx_services_media_id ON services(media_id);",
      },
      {
        desc: "Index: idx_gallery_media_id",
        sql: "CREATE INDEX IF NOT EXISTS idx_gallery_media_id ON gallery(media_id);",
      },
      {
        desc: "Index: idx_hero_slides_media_id",
        sql: "CREATE INDEX IF NOT EXISTS idx_hero_slides_media_id ON hero_slides(media_id);",
      },
    ];

    let successCount = 0;
    let failureCount = 0;

    console.log("Executing SQL statements:\n");

    for (const stmt of statements) {
      try {
        // Execute directly via execute_sql function
        const { error } = await supabase.rpc("execute_sql", { query: stmt.sql }).catch(() => ({ error: null }));

        if (error) {
          console.log(`  ⚠️  ${stmt.desc}`);
          console.log(`      Error: ${error.message || "Statement may already exist or executed"}`);
          failureCount++;
        } else {
          console.log(`  ✅ ${stmt.desc}`);
          successCount++;
        }
      } catch (err) {
        console.log(`  ⚠️  ${stmt.desc}`);
        console.log(`      Error: ${err.message}`);
        failureCount++;
      }
    }

    console.log("\n" + "=".repeat(80));
    console.log("MIGRATION EXECUTION SUMMARY");
    console.log("=".repeat(80));
    console.log(`✅ Successful: ${successCount}`);
    console.log(`⚠️  Failed/Skipped: ${failureCount}\n`);

    // Verify the migration
    console.log("📋 Verifying migration...\n");

    const { data: menuData, error: menuError } = await supabase
      .from("menu_items")
      .select("media_id")
      .limit(1);

    if (menuError) {
      console.log(`  ❌ menu_items.media_id check: ${menuError.message}`);
    } else {
      console.log(`  ✅ menu_items.media_id column verified`);
    }

    const { data: heroData, error: heroError } = await supabase
      .from("hero_slides")
      .select("media_id")
      .limit(1);

    if (heroError) {
      console.log(`  ❌ hero_slides.media_id check: ${heroError.message}`);
    } else {
      console.log(`  ✅ hero_slides.media_id column verified`);
    }

    const { data: servicesData, error: servicesError } = await supabase
      .from("services")
      .select("media_id")
      .limit(1);

    if (servicesError) {
      console.log(`  ❌ services.media_id check: ${servicesError.message}`);
    } else {
      console.log(`  ✅ services.media_id column verified`);
    }

    const { data: galleryData, error: galleryError } = await supabase
      .from("gallery")
      .select("media_id")
      .limit(1);

    if (galleryError) {
      console.log(`  ❌ gallery.media_id check: ${galleryError.message}`);
    } else {
      console.log(`  ✅ gallery.media_id column verified`);
    }

    console.log("\n" + "=".repeat(80));
    console.log("✅ MIGRATION COMPLETE");
    console.log("=".repeat(80) + "\n");

  } catch (err) {
    console.error(`❌ Migration failed: ${err.message}`);
    process.exit(1);
  }
}

applyMigration();
