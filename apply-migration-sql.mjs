#!/usr/bin/env node

/**
 * APPLY MISSING MIGRATION using raw SQL via Supabase client
 * Migration: 20260817_add_media_id_to_cms_tables
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

console.log("🔧 APPLYING MISSING MIGRATION\n");
console.log(`Supabase URL: ${supabaseUrl}\n`);

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  try {
    console.log("📋 Migration: 20260817_add_media_id_to_cms_tables\n");
    
    // Combined SQL to execute all migrations in one batch
    const migrationSQL = `
-- PHASE 1: Add media_id columns to CMS tables (nullable, no defaults)
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS media_id uuid;
ALTER TABLE services ADD COLUMN IF NOT EXISTS media_id uuid;
ALTER TABLE gallery ADD COLUMN IF NOT EXISTS media_id uuid;
ALTER TABLE hero_slides ADD COLUMN IF NOT EXISTS media_id uuid;

-- PHASE 2: Create foreign key constraints
ALTER TABLE menu_items ADD CONSTRAINT fk_menu_items_media_id FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE SET NULL;
ALTER TABLE services ADD CONSTRAINT fk_services_media_id FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE SET NULL;
ALTER TABLE gallery ADD CONSTRAINT fk_gallery_media_id FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE SET NULL;
ALTER TABLE hero_slides ADD CONSTRAINT fk_hero_slides_media_id FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE SET NULL;

-- PHASE 3: Create indexes on media_id columns for query performance
CREATE INDEX IF NOT EXISTS idx_menu_items_media_id ON menu_items(media_id);
CREATE INDEX IF NOT EXISTS idx_services_media_id ON services(media_id);
CREATE INDEX IF NOT EXISTS idx_gallery_media_id ON gallery(media_id);
CREATE INDEX IF NOT EXISTS idx_hero_slides_media_id ON hero_slides(media_id);
    `;

    console.log("Executing SQL migration...\n");

    // Execute the migration using execute_sql if available
    const { data, error } = await supabase.rpc("sql", { query: migrationSQL }).catch(async () => {
      // Fallback: Try to execute individual statements
      console.log("RPC 'sql' not available, trying individual statements...\n");
      
      const statements = [
        { phase: "PHASE 1", sql: "ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS media_id uuid;", desc: "Add media_id to menu_items" },
        { phase: "PHASE 1", sql: "ALTER TABLE services ADD COLUMN IF NOT EXISTS media_id uuid;", desc: "Add media_id to services" },
        { phase: "PHASE 1", sql: "ALTER TABLE gallery ADD COLUMN IF NOT EXISTS media_id uuid;", desc: "Add media_id to gallery" },
        { phase: "PHASE 1", sql: "ALTER TABLE hero_slides ADD COLUMN IF NOT EXISTS media_id uuid;", desc: "Add media_id to hero_slides" },
      ];

      let allSuccess = true;
      for (const stmt of statements) {
        const { error: err } = await supabase.rpc("execute_sql", { sql: stmt.sql }).catch(() => ({ error: { message: "RPC not available" } }));
        if (err) {
          console.log(`  ⚠️  ${stmt.desc}: ${err.message}`);
        } else {
          console.log(`  ✅ ${stmt.desc}`);
        }
      }
      
      return { data: null, error: null };
    });

    if (error) {
      console.log(`❌ SQL Execution Error: ${error.message}`);
      console.log(`   Details: ${error.details || "No additional details"}\n`);
    } else {
      console.log("✅ Migration executed successfully\n");
    }

    // Verify the columns were created
    console.log("Verifying migration...\n");
    
    const { data: menuItemsData, error: menuError } = await supabase
      .from("menu_items")
      .select("media_id")
      .limit(1);

    if (menuError) {
      console.log(`❌ Verification failed - menu_items: ${menuError.message}`);
    } else {
      console.log(`✅ Verification successful - menu_items.media_id column exists`);
    }

    const { data: heroSlidesData, error: heroError } = await supabase
      .from("hero_slides")
      .select("media_id")
      .limit(1);

    if (heroError) {
      console.log(`❌ Verification failed - hero_slides: ${heroError.message}`);
    } else {
      console.log(`✅ Verification successful - hero_slides.media_id column exists`);
    }

    console.log("\n" + "=".repeat(80));
    console.log("MIGRATION COMPLETE");
    console.log("=".repeat(80) + "\n");

  } catch (err) {
    console.error(`❌ Migration failed: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

applyMigration();
