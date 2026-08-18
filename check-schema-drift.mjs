#!/usr/bin/env node

/**
 * Check for migration drift between local migrations and live database schema
 * PHASE 7 - Database Schema Verification
 */

import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment
const envFile = path.join(__dirname, ".env.local");
if (!fs.existsSync(envFile)) {
  console.error("❌ .env.local not found");
  process.exit(1);
}

const env = {};
fs.readFileSync(envFile, "utf-8")
  .split("\n")
  .forEach((line) => {
    if (line.trim() && !line.startsWith("#")) {
      const [key, ...valueParts] = line.split("=");
      env[key.trim()] = valueParts.join("=").trim();
    }
  });

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function checkColumn(table, column) {
  const { data, error } = await supabase.rpc("get_column_info", {
    p_table: table,
    p_column: column,
  });

  if (error) {
    // Try direct SQL if RPC fails
    return null;
  }

  return data;
}

async function checkSchema() {
  console.log("╔════════════════════════════════════════════════════════════╗");
  console.log("║  PHASE 7: DATABASE SCHEMA DRIFT DETECTION                  ║");
  console.log("║  Checking if media_id columns exist in live database       ║");
  console.log("╚════════════════════════════════════════════════════════════╝");

  const tables = [
    { name: "menu_items", expectedColumns: ["media_id"] },
    { name: "hero_slides", expectedColumns: ["media_id"] },
  ];

  console.log("\n🔍 Checking live database schema...\n");

  for (const table of tables) {
    console.log(`📋 ${table.name}:`);

    // Try to query the table with media_id to see if column exists
    const { data, error } = await supabase
      .from(table.name)
      .select("id, media_id")
      .limit(1);

    if (error) {
      if (error.message.includes("media_id")) {
        console.log(`   ✗ Column media_id NOT FOUND in database`);
        console.log(`   Error: ${error.message}`);
        console.log(`   Status: MIGRATION DRIFT DETECTED`);
      } else {
        console.log(`   ✗ Query failed: ${error.message}`);
      }
    } else {
      console.log(`   ✓ Column media_id EXISTS in database`);
      if (data && data.length > 0) {
        console.log(`   ✓ Table has ${data.length}+ records`);
      }
    }
  }

  console.log("\n📋 Checking migration status...\n");

  // Check applied migrations
  const { data: migrations, error: migError } = await supabase
    .from("schema_migrations")
    .select("*")
    .order("name", { ascending: false });

  if (migError) {
    console.log("   ⚠ Could not query schema_migrations table");
  } else {
    console.log(`   Total applied migrations: ${migrations?.length || 0}`);

    const mediaIdMigration = migrations?.find((m) =>
      m.name.includes("add_media_id_to_cms")
    );

    if (mediaIdMigration) {
      console.log(`   ✓ Migration '${mediaIdMigration.name}' IS APPLIED`);
    } else {
      console.log(`   ✗ Migration '20260817_add_media_id_to_cms_tables' NOT APPLIED`);
      console.log(`   Status: MIGRATION DRIFT - Need to apply this migration`);
    }

    // Show recent migrations
    console.log(`\n   Recent migrations:`);
    migrations
      ?.slice(0, 5)
      .forEach((m) => {
        console.log(`     - ${m.name}`);
      });
  }
}

checkSchema().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
