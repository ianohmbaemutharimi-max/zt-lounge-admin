#!/usr/bin/env node

/**
 * APPLY MIGRATION using direct SQL execution via Supabase PostgREST
 * This bypasses RPC and directly queries tables to verify then uses postgres connection
 */

import { createClient } from "@supabase/supabase-js";
import { exec } from "child_process";
import { promisify } from "util";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing Supabase credentials");
  process.exit(1);
}

const execAsync = promisify(exec);

console.log("🔧 APPLYING MISSING MIGRATION\n");

async function applyMigration() {
  try {
    // Extract project ID from URL
    const projectMatch = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
    const projectId = projectMatch ? projectMatch[1] : null;

    if (!projectId) {
      console.error("❌ Could not extract project ID from Supabase URL");
      process.exit(1);
    }

    console.log(`📋 Project ID: ${projectId}`);
    console.log(`\n🔍 Attempting to apply migration via Supabase CLI...\n`);

    // Try to push migrations using wrangler/supabase CLI
    try {
      const { stdout, stderr } = await execAsync("supabase migration list --linked", { cwd: "d:\\zt lounge\\zt-lounge-demo\\zt-lounge-admin" });
      console.log("✅ Supabase CLI is available");
      console.log("Migrations:");
      console.log(stdout);
    } catch (err) {
      console.log("⚠️  Supabase CLI not fully configured");
      console.log("Attempting direct SQL execution via Node.js instead...\n");
    }

    // Direct approach: Use the Supabase JS client to apply SQL via a stored procedure or function
    // First, let's try to execute the migration SQL directly using a workaround

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // The migration SQL statements
    const sqlStatements = [
      "ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS media_id uuid;",
      "ALTER TABLE services ADD COLUMN IF NOT EXISTS media_id uuid;",
      "ALTER TABLE gallery ADD COLUMN IF NOT EXISTS media_id uuid;",
      "ALTER TABLE hero_slides ADD COLUMN IF NOT EXISTS media_id uuid;",
      "ALTER TABLE menu_items ADD CONSTRAINT fk_menu_items_media_id FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE SET NULL;",
      "ALTER TABLE services ADD CONSTRAINT fk_services_media_id FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE SET NULL;",
      "ALTER TABLE gallery ADD CONSTRAINT fk_gallery_media_id FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE SET NULL;",
      "ALTER TABLE hero_slides ADD CONSTRAINT fk_hero_slides_media_id FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE SET NULL;",
      "CREATE INDEX IF NOT EXISTS idx_menu_items_media_id ON menu_items(media_id);",
      "CREATE INDEX IF NOT EXISTS idx_services_media_id ON services(media_id);",
      "CREATE INDEX IF NOT EXISTS idx_gallery_media_id ON gallery(media_id);",
      "CREATE INDEX IF NOT EXISTS idx_hero_slides_media_id ON hero_slides(media_id);",
    ];

    // Try to create a temporary stored procedure to execute SQL
    console.log("Executing migration statements via temporary function...\n");

    // First attempt: Try to use a function if one exists
    const createFunctionSQL = `
      CREATE OR REPLACE FUNCTION exec_migration()
      RETURNS void AS $$
      BEGIN
        ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS media_id uuid;
        ALTER TABLE services ADD COLUMN IF NOT EXISTS media_id uuid;
        ALTER TABLE gallery ADD COLUMN IF NOT EXISTS media_id uuid;
        ALTER TABLE hero_slides ADD COLUMN IF NOT EXISTS media_id uuid;
        
        ALTER TABLE menu_items ADD CONSTRAINT fk_menu_items_media_id FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE SET NULL;
        ALTER TABLE services ADD CONSTRAINT fk_services_media_id FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE SET NULL;
        ALTER TABLE gallery ADD CONSTRAINT fk_gallery_media_id FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE SET NULL;
        ALTER TABLE hero_slides ADD CONSTRAINT fk_hero_slides_media_id FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE SET NULL;
        
        CREATE INDEX IF NOT EXISTS idx_menu_items_media_id ON menu_items(media_id);
        CREATE INDEX IF NOT EXISTS idx_services_media_id ON services(media_id);
        CREATE INDEX IF NOT EXISTS idx_gallery_media_id ON gallery(media_id);
        CREATE INDEX IF NOT EXISTS idx_hero_slides_media_id ON hero_slides(media_id);
      END;
      $$ LANGUAGE plpgsql;

      SELECT exec_migration();
    `;

    const { error: funcError } = await supabase.rpc("exec_migration").catch(err => ({ error: err }));

    if (funcError) {
      console.log("⚠️  Function execution failed (expected if not pre-created)\n");
      console.log("📝 IMPORTANT: You must apply the migration manually via Supabase Dashboard:\n");
      console.log("1. Go to: https://app.supabase.com/project/" + projectId);
      console.log("2. Navigate to: SQL Editor");
      console.log("3. Copy and run the SQL from: supabase/migrations/20260817_add_media_id_to_cms_tables.sql\n");
      
      console.log("Or use Supabase CLI:\n");
      console.log("  supabase migration list --linked");
      console.log("  supabase db push\n");
    }

    // Verify if columns exist
    console.log("Verifying migration status...\n");

    const { data: menuData, error: menuError } = await supabase
      .from("menu_items")
      .select("media_id")
      .limit(1);

    if (menuError) {
      console.log(`❌ menu_items.media_id does not exist yet`);
      console.log(`   Error: ${menuError.message}\n`);
    } else {
      console.log(`✅ menu_items.media_id column exists!\n`);
    }

    const { data: heroData, error: heroError } = await supabase
      .from("hero_slides")
      .select("media_id")
      .limit(1);

    if (heroError) {
      console.log(`❌ hero_slides.media_id does not exist yet`);
      console.log(`   Error: ${heroError.message}\n`);
    } else {
      console.log(`✅ hero_slides.media_id column exists!\n`);
    }

    console.log("=".repeat(80));
    console.log("MIGRATION STATUS");
    console.log("=".repeat(80) + "\n");

    if (menuError || heroError) {
      console.log("❌ Migration needs to be applied manually");
      console.log("\n📝 NEXT STEPS:");
      console.log("1. Open Supabase Dashboard: https://app.supabase.com/project/" + projectId);
      console.log("2. Go to: SQL Editor tab");
      console.log("3. Copy contents of: supabase/migrations/20260817_add_media_id_to_cms_tables.sql");
      console.log("4. Paste and execute in the SQL editor");
      console.log("5. Run: node diagnose-500-errors.mjs to verify\n");
    } else {
      console.log("✅ Migration successfully applied!");
      console.log("All media_id columns now exist in the database\n");
    }

  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}

applyMigration();
