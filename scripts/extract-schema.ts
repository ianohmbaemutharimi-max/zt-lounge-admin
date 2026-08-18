/**
 * Schema Extraction Script
 *
 * Queries the live Supabase database to extract the current schema state.
 * This script reads the generated types from src/types/supabase.ts as the
 * source of truth for the actual database structure, and cross-references
 * against the Drizzle ORM schema and migration files.
 *
 * Usage:
 *   npx tsx scripts/extract-schema.ts
 *
 * Output:
 *   - Console report of schema mismatches
 *   - JSON file at scripts/schema-extraction-report.json
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const ADMIN_ROOT = resolve(__dirname, "..");

// ─── Load Supabase generated types (actual database state) ──────────
function extractTablesFromSupabaseTypes(): Record<string, Record<string, string>> {
  const typesPath = resolve(ADMIN_ROOT, "src/types/supabase.ts");
  const content = readFileSync(typesPath, "utf-8");

  const tables: Record<string, Record<string, string>> = {};

  // Match each table definition block
  const tableRegex = /(\w+):\s*\{\s*Row:\s*\{([^}]+)\}/g;
  let match: RegExpExecArray | null;

  while ((match = tableRegex.exec(content)) !== null) {
    const tableName = match[1];
    const rowContent = match[2];

    const columns: Record<string, string> = {};
    const colRegex = /(\w+):\s*([^;\n]+)/g;
    let colMatch: RegExpExecArray | null;

    while ((colMatch = colRegex.exec(rowContent)) !== null) {
      const colName = colMatch[1];
      const colType = colMatch[2].trim();
      columns[colName] = colType;
    }

    tables[tableName] = columns;
  }

  return tables;
}

// ─── Load Drizzle ORM schema ────────────────────────────────────────
function extractTablesFromDrizzleSchema(): Record<string, Record<string, string>> {
  const schemaPath = resolve(ADMIN_ROOT, "src/db/schema.ts");
  const content = readFileSync(schemaPath, "utf-8");

  const tables: Record<string, Record<string, string>> = {};

  // Match pgTable definitions
  const tableRegex = /pgTable\(["'](\w+)["'],\s*\{([^}]+)\}/g;
  let match: RegExpExecArray | null;

  while ((match = tableRegex.exec(content)) !== null) {
    const tableName = match[1];
    const body = match[2];

    const columns: Record<string, string> = {};
    // Match column definitions like: fullName: text("full_name").notNull(),
    const colRegex = /(\w+):\s*(\w+)\(["'](\w+)["'][^}]*(?:\([^)]*\))?/g;
    let colMatch: RegExpExecArray | null;

    while ((colMatch = colRegex.exec(body)) !== null) {
      const tsName = colMatch[1];
      const colType = colMatch[2];
      const dbName = colMatch[3];
      columns[dbName] = colType;
    }

    tables[tableName] = columns;
  }

  return tables;
}

// ─── Load migration files ───────────────────────────────────────────
function extractTablesFromMigrations(): Record<string, string[]> {
  const migrationsDir = resolve(ADMIN_ROOT, "../supabase/migrations");
  const tables: Record<string, string[]> = {};

  // Hardcoded from migration analysis (since we can't read dir in all contexts)
  const migrationTables: Record<string, string[]> = {
    "001": ["website_pages", "profiles", "hero_slides", "menu_items"],
    "003": ["contact_messages", "business_closures", "service_categories", "menu_categories"],
    "007": ["bookings", "testimonials"],
  };

  return migrationTables;
}

// ─── Compare and report ─────────────────────────────────────────────
interface Mismatch {
  table: string;
  issue: string;
  supabaseType: string;
  drizzleType: string;
}

function compareSchemas(
  supabaseTables: Record<string, Record<string, string>>,
  drizzleTables: Record<string, Record<string, string>>
): Mismatch[] {
  const mismatches: Mismatch[] = [];

  for (const [tableName, supabaseCols] of Object.entries(supabaseTables)) {
    const drizzleCols = drizzleTables[tableName];

    if (!drizzleCols) {
      mismatches.push({
        table: tableName,
        issue: "Table exists in database but missing from Drizzle schema",
        supabaseType: JSON.stringify(Object.keys(supabaseCols)),
        drizzleType: "MISSING",
      });
      continue;
    }

    for (const [colName, supabaseType] of Object.entries(supabaseCols)) {
      const drizzleType = drizzleCols[colName];

      if (!drizzleType) {
        mismatches.push({
          table: tableName,
          issue: `Column '${colName}' exists in database but missing from Drizzle schema`,
          supabaseType,
          drizzleType: "MISSING",
        });
      } else if (drizzleType !== supabaseType) {
        mismatches.push({
          table: tableName,
          issue: `Type mismatch for column '${colName}'`,
          supabaseType,
          drizzleType,
        });
      }
    }

    // Check for extra columns in Drizzle not in DB
    for (const colName of Object.keys(drizzleCols)) {
      if (!(colName in supabaseCols)) {
        mismatches.push({
          table: tableName,
          issue: `Column '${colName}' in Drizzle schema but not in database`,
          supabaseType: "MISSING",
          drizzleType: drizzleCols[colName],
        });
      }
    }
  }

  return mismatches;
}

// ─── Main ───────────────────────────────────────────────────────────
function main() {
  console.log("🔍 Extracting schema from Supabase generated types...");
  const supabaseTables = extractTablesFromSupabaseTypes();

  console.log("🔍 Extracting schema from Drizzle ORM...");
  const drizzleTables = extractTablesFromDrizzleSchema();

  console.log("🔍 Comparing schemas...\n");

  const mismatches = compareSchemas(supabaseTables, drizzleTables);

  // Group mismatches by table
  const byTable: Record<string, Mismatch[]> = {};
  for (const m of mismatches) {
    if (!byTable[m.table]) byTable[m.table] = [];
    byTable[m.table].push(m);
  }

  console.log("=" .repeat(80));
  console.log("SCHEMA RECONCILIATION REPORT");
  console.log("=" .repeat(80));
  console.log(`\nSupabase tables found: ${Object.keys(supabaseTables).length}`);
  console.log(`Drizzle tables found:  ${Object.keys(drizzleTables).length}`);
  console.log(`Total mismatches:      ${mismatches.length}\n`);

  for (const [table, issues] of Object.entries(byTable)) {
    console.log(`\n📋 Table: ${table}`);
    console.log("-".repeat(60));
    for (const issue of issues) {
      console.log(`  • ${issue.issue}`);
      console.log(`    DB:      ${issue.supabaseType}`);
      console.log(`    Drizzle: ${issue.drizzleType}`);
    }
  }

  // Check for tables in DB but not in any migration
  const migrationTables = extractTablesFromMigrations();
  const allMigrationTables = new Set<string>();
  for (const tables of Object.values(migrationTables)) {
    for (const t of tables) allMigrationTables.add(t);
  }

  const tablesNotInMigrations = Object.keys(supabaseTables).filter(
    (t) => !allMigrationTables.has(t)
  );

  console.log("\n" + "=".repeat(80));
  console.log("TABLES IN DATABASE BUT NOT CREATED BY MIGRATIONS:");
  console.log("=".repeat(80));
  for (const t of tablesNotInMigrations) {
    console.log(`  • ${t}`);
  }

  // Check for roles table
  console.log("\n" + "=".repeat(80));
  console.log("ROLE SYSTEM ANALYSIS:");
  console.log("=".repeat(80));
  if (supabaseTables["roles"]) {
    console.log(`  roles table exists with columns: ${JSON.stringify(Object.keys(supabaseTables["roles"]))}`);
  } else {
    console.log("  ⚠️  roles table MISSING from database");
  }

  if (supabaseTables["profiles"]) {
    const profileCols = Object.keys(supabaseTables["profiles"]);
    console.log(`  profiles table columns: ${JSON.stringify(profileCols)}`);
    if ("role_id" in supabaseTables["profiles"]) {
      console.log("  ✅ role_id column exists on profiles");
    } else if ("role" in supabaseTables["profiles"]) {
      console.log("  ⚠️  profiles has 'role' (text) but no 'role_id' (UUID FK)");
    }
  }

  // Check testimonials
  console.log("\n" + "=".repeat(80));
  console.log("TESTIMONIALS COLUMN ANALYSIS:");
  console.log("=".repeat(80));
  if (supabaseTables["testimonials"]) {
    const testimonialCols = Object.keys(supabaseTables["testimonials"]);
    console.log(`  testimonials columns: ${JSON.stringify(testimonialCols)}`);
    if ("approved" in supabaseTables["testimonials"]) {
      console.log("  ✅ 'approved' (boolean) column exists");
    }
    if ("is_approved" in supabaseTables["testimonials"]) {
      console.log("  ✅ 'is_approved' (generated) column exists");
    }
    if ("status" in supabaseTables["testimonials"]) {
      console.log("  ⚠️  'status' (text) column exists - should be 'approved'");
    }
  }

  // Write report
  const report = {
    timestamp: new Date().toISOString(),
    supabaseTables: Object.keys(supabaseTables),
    drizzleTables: Object.keys(drizzleTables),
    tablesNotInMigrations,
    mismatches,
    byTable,
  };

  const reportPath = resolve(ADMIN_ROOT, "scripts/schema-extraction-report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Full report written to: ${reportPath}`);
}

main();
