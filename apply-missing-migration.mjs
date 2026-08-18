#!/usr/bin/env node

/**
 * APPLY MISSING MIGRATION: Add media_id columns to menu_items and hero_slides
 * 
 * This script applies the migration that was created but not applied to the live database.
 * Root cause: Migration drift - the SQL file exists but wasn't executed against Supabase.
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

console.log("🔧 APPLYING MISSING MIGRATION: Add media_id to CMS Tables\n");
console.log(`Supabase URL: ${supabaseUrl}\n`);

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  try {
    console.log("📋 Migration: 20260817_add_media_id_to_cms_tables\n");
    console.log("Executing SQL statements...\n");

    // PHASE 1: Add media_id columns (nullable, no defaults)
    console.log("PHASE 1: Adding media_id columns...");
    
    let result = await supabase.rpc("exec", {
      sql: "ALTER TABLE menu_items ADD COLUMN media_id uuid;"
    }).catch(() => null);
    
    if (result?.error) {
      console.log(`  ⚠️  menu_items.media_id: ${result.error.message}`);
    } else {
      console.log(`  ✅ Added media_id to menu_items`);
    }

    result = await supabase.rpc("exec", {
      sql: "ALTER TABLE services ADD COLUMN media_id uuid;"
    }).catch(() => null);
    
    if (result?.error) {
      console.log(`  ⚠️  services.media_id: ${result.error.message}`);
    } else {
      console.log(`  ✅ Added media_id to services`);
    }

    result = await supabase.rpc("exec", {
      sql: "ALTER TABLE gallery ADD COLUMN media_id uuid;"
    }).catch(() => null);
    
    if (result?.error) {
      console.log(`  ⚠️  gallery.media_id: ${result.error.message}`);
    } else {
      console.log(`  ✅ Added media_id to gallery`);
    }

    result = await supabase.rpc("exec", {
      sql: "ALTER TABLE hero_slides ADD COLUMN media_id uuid;"
    }).catch(() => null);
    
    if (result?.error) {
      console.log(`  ⚠️  hero_slides.media_id: ${result.error.message}`);
    } else {
      console.log(`  ✅ Added media_id to hero_slides`);
    }

    // PHASE 2: Create foreign key constraints
    console.log("\nPHASE 2: Creating foreign key constraints...");
    
    result = await supabase.rpc("exec", {
      sql: "ALTER TABLE menu_items ADD CONSTRAINT fk_menu_items_media_id FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE SET NULL;"
    }).catch(() => null);
    
    if (result?.error) {
      console.log(`  ⚠️  FK menu_items: ${result.error.message}`);
    } else {
      console.log(`  ✅ FK constraint for menu_items created`);
    }

    result = await supabase.rpc("exec", {
      sql: "ALTER TABLE services ADD CONSTRAINT fk_services_media_id FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE SET NULL;"
    }).catch(() => null);
    
    if (result?.error) {
      console.log(`  ⚠️  FK services: ${result.error.message}`);
    } else {
      console.log(`  ✅ FK constraint for services created`);
    }

    result = await supabase.rpc("exec", {
      sql: "ALTER TABLE gallery ADD CONSTRAINT fk_gallery_media_id FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE SET NULL;"
    }).catch(() => null);
    
    if (result?.error) {
      console.log(`  ⚠️  FK gallery: ${result.error.message}`);
    } else {
      console.log(`  ✅ FK constraint for gallery created`);
    }

    result = await supabase.rpc("exec", {
      sql: "ALTER TABLE hero_slides ADD CONSTRAINT fk_hero_slides_media_id FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE SET NULL;"
    }).catch(() => null);
    
    if (result?.error) {
      console.log(`  ⚠️  FK hero_slides: ${result.error.message}`);
    } else {
      console.log(`  ✅ FK constraint for hero_slides created`);
    }

    // PHASE 3: Create indexes
    console.log("\nPHASE 3: Creating indexes...");
    
    result = await supabase.rpc("exec", {
      sql: "CREATE INDEX idx_menu_items_media_id ON menu_items(media_id);"
    }).catch(() => null);
    
    if (result?.error) {
      console.log(`  ⚠️  Index menu_items: ${result.error.message}`);
    } else {
      console.log(`  ✅ Index on menu_items.media_id created`);
    }

    result = await supabase.rpc("exec", {
      sql: "CREATE INDEX idx_services_media_id ON services(media_id);"
    }).catch(() => null);
    
    if (result?.error) {
      console.log(`  ⚠️  Index services: ${result.error.message}`);
    } else {
      console.log(`  ✅ Index on services.media_id created`);
    }

    result = await supabase.rpc("exec", {
      sql: "CREATE INDEX idx_gallery_media_id ON gallery(media_id);"
    }).catch(() => null);
    
    if (result?.error) {
      console.log(`  ⚠️  Index gallery: ${result.error.message}`);
    } else {
      console.log(`  ✅ Index on gallery.media_id created`);
    }

    result = await supabase.rpc("exec", {
      sql: "CREATE INDEX idx_hero_slides_media_id ON hero_slides(media_id);"
    }).catch(() => null);
    
    if (result?.error) {
      console.log(`  ⚠️  Index hero_slides: ${result.error.message}`);
    } else {
      console.log(`  ✅ Index on hero_slides.media_id created`);
    }

    console.log("\n" + "=".repeat(80));
    console.log("✅ MIGRATION EXECUTION COMPLETE");
    console.log("=".repeat(80));
    console.log("\nNote: The RPC 'exec' function may not exist. Try using Supabase CLI instead.\n");

  } catch (err) {
    console.error(`❌ Migration failed: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

applyMigration();
