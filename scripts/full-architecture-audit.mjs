#!/usr/bin/env node

/**
 * COMPREHENSIVE ARCHITECTURE AUDIT
 * 
 * This script audits the entire ZT Lounge system to identify:
 * 1. Fixed-count/hardcoded content patterns
 * 2. Database architecture soundness
 * 3. CRUD completeness
 * 4. Media architecture coherence
 * 5. Public website reactivity
 * 6. Cache/revalidation strategy
 * 7. RLS/Security
 * 8. Performance patterns
 * 9. Migration discipline
 * 10. Google Reviews readiness
 */

import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execAsync = promisify(exec);

const AUDIT_SECTIONS = {
  DATABASE: "🗄️ Database Architecture",
  REPOSITORY: "📚 Repository Layer",
  ADMIN_API: "🔌 Admin API",
  ADMIN_UI: "🎨 Admin UI Components",
  PUBLIC_WEBSITE: "🌐 Public Website",
  MEDIA: "📸 Media System",
  CACHE: "⚡ Caching Strategy",
  RLS: "🔐 RLS & Security",
  PERFORMANCE: "⚙️ Performance",
  MIGRATIONS: "🔄 Migration Discipline",
  GOOGLE_REVIEWS: "⭐ Google Reviews",
};

const findings = {
  database: [],
  repository: [],
  adminApi: [],
  adminUI: [],
  publicWebsite: [],
  media: [],
  cache: [],
  rls: [],
  performance: [],
  migrations: [],
  googleReviews: [],
};

console.log("\n" + "=".repeat(80));
console.log("🚀 ZT LOUNGE COMPREHENSIVE ARCHITECTURE AUDIT");
console.log("=".repeat(80) + "\n");

async function scanDirectory(dir, patterns) {
  const results = [];
  try {
    const files = fs.readdirSync(dir, { recursive: true });
    for (const file of files) {
      if (file.includes("node_modules") || file.includes(".next")) continue;

      const fullPath = path.join(dir, file);
      if (!fs.statSync(fullPath).isFile()) continue;

      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        for (const pattern of patterns) {
          if (pattern.regex.test(content)) {
            results.push({
              file: file.replace(dir, ""),
              count: (content.match(pattern.regex) || []).length,
              pattern: pattern.name,
            });
          }
        }
      } catch (err) {
        // Skip binary files
      }
    }
  } catch (err) {
    console.error(`Error scanning ${dir}: ${err.message}`);
  }
  return results;
}

async function auditDatabaseArchitecture() {
  console.log(`\n${AUDIT_SECTIONS.DATABASE}`);
  console.log("-".repeat(80));

  const migrationDir = "supabase/migrations";
  const migrations = fs.readdirSync(migrationDir).filter((f) => f.endsWith(".sql"));

  console.log(`📊 Migrations found: ${migrations.length}`);
  migrations.forEach((m) => console.log(`   • ${m}`));

  // Check for media_id columns
  const mediaIdMigrations = migrations.filter((m) => m.includes("media"));
  console.log(`\n📌 Media-related migrations: ${mediaIdMigrations.length}`);

  // Read schema patterns
  const patterns = [
    { name: "hero_1/hero_2 pattern", regex: /hero_[1-9]|hero_\d+/gi },
    { name: "gallery_1/gallery_2 pattern", regex: /gallery_[1-9]|gallery_\d+/gi },
    { name: "Fixed array columns", regex: /(hero|gallery|menu)_items JSONB|_array/gi },
  ];

  const results = await scanDirectory("supabase", patterns);
  if (results.length > 0) {
    console.log("\n⚠️  Fixed-count column patterns found:");
    results.forEach((r) => {
      console.log(`   ${r.pattern}: ${r.file}`);
      findings.database.push({
        severity: "HIGH",
        issue: `Fixed-count pattern: ${r.pattern}`,
        file: r.file,
      });
    });
  } else {
    console.log("\n✅ No obvious fixed-count column patterns found");
  }
}

async function auditRepositoryLayer() {
  console.log(`\n${AUDIT_SECTIONS.REPOSITORY}`);
  console.log("-".repeat(80));

  const repoPath = "src/lib/repository.ts";
  if (!fs.existsSync(repoPath)) {
    console.log("❌ repository.ts not found");
    return;
  }

  const content = fs.readFileSync(repoPath, "utf-8");

  // Check for RESPONSE_ALLOWLISTS
  const allowlistMatch = content.match(/RESPONSE_ALLOWLISTS\s*=\s*\{[\s\S]*?\n\}/);
  if (allowlistMatch) {
    console.log("✅ RESPONSE_ALLOWLISTS found (allowlist-based access control)");

    // Extract table names
    const tableMatches = allowlistMatch[0].match(/(\w+):\s*\[/g);
    if (tableMatches) {
      console.log(`\n📋 Tables with defined allowlists:`);
      tableMatches.forEach((t) => {
        const tableName = t.match(/(\w+):/)[1];
        console.log(`   • ${tableName}`);
      });
    }
  }

  // Check for hard-coded limits
  const limitPatterns = [
    { pattern: /\.limit\([0-9]+\)/g, desc: "Hard-coded limit()" },
    { pattern: /first\(\)/g, desc: "first() calls" },
    { pattern: /\.take\([0-9]+\)/g, desc: "Hard-coded take()" },
  ];

  for (const p of limitPatterns) {
    const matches = content.match(p.pattern);
    if (matches) {
      console.log(`\n⚠️  ${p.desc}: ${matches.length} occurrences`);
      findings.repository.push({
        severity: "MEDIUM",
        issue: `${p.desc}: ${matches.length} occurrences`,
        file: repoPath,
      });
    }
  }
}

async function auditAdminAPIs() {
  console.log(`\n${AUDIT_SECTIONS.ADMIN_API}`);
  console.log("-".repeat(80));

  const apiDir = "src/app/api/admin";
  const routes = fs.readdirSync(apiDir, { recursive: true }).filter((f) => f.endsWith("route.ts"));

  console.log(`📊 Admin API routes found: ${routes.length}`);

  // Check for CRUD support
  const crudOperations = {
    GET: 0,
    POST: 0,
    PATCH: 0,
    PUT: 0,
    DELETE: 0,
  };

  routes.forEach((route) => {
    const content = fs.readFileSync(path.join(apiDir, route), "utf-8");
    Object.keys(crudOperations).forEach((op) => {
      if (new RegExp(`export const ${op.toLowerCase()}|export async function ${op.toLowerCase()}`).test(content)) {
        crudOperations[op]++;
      }
    });
  });

  console.log("\n📋 CRUD Operation Coverage:");
  console.log(`   GET:    ${crudOperations.GET} endpoints`);
  console.log(`   POST:   ${crudOperations.POST} endpoints`);
  console.log(`   PATCH:  ${crudOperations.PATCH} endpoints`);
  console.log(`   PUT:    ${crudOperations.PUT} endpoints`);
  console.log(`   DELETE: ${crudOperations.DELETE} endpoints`);
}

async function auditAdminUI() {
  console.log(`\n${AUDIT_SECTIONS.ADMIN_UI}`);
  console.log("-".repeat(80));

  const uiDir = "src/features";
  const components = fs.readdirSync(uiDir, { recursive: true }).filter((f) => f.endsWith(".tsx"));

  console.log(`📊 Admin UI components found: ${components.length}`);

  // Look for hardcoded arrays
  const patterns = [
    { name: "Hero arrays", regex: /heroSlides\s*=|hero\s*=\s*\[/gi },
    { name: "Gallery arrays", regex: /galleryItems\s*=|gallery\s*=\s*\[/gi },
    { name: "Menu arrays", regex: /menuItems\s*=|menu\s*=\s*\[/gi },
    { name: "Service arrays", regex: /services\s*=|service\s*=\s*\[/gi },
  ];

  const results = await scanDirectory(uiDir, patterns);
  if (results.length > 0) {
    console.log("\n⚠️  Potential hardcoded array patterns:");
    const unique = [...new Set(results.map((r) => r.pattern))];
    unique.forEach((pattern) => {
      const count = results.filter((r) => r.pattern === pattern).length;
      console.log(`   ${pattern}: ${count} files`);
      findings.adminUI.push({
        severity: "HIGH",
        issue: `Hardcoded ${pattern} pattern`,
        count,
      });
    });
  } else {
    console.log("\n✅ No obvious hardcoded array patterns found");
  }
}

async function auditPublicWebsite() {
  console.log(`\n${AUDIT_SECTIONS.PUBLIC_WEBSITE}`);
  console.log("-".repeat(80));

  const publicAppDir = "../zt-lounge-public/src";
  if (!fs.existsSync(publicAppDir)) {
    console.log("⚠️  Public website not found at expected location");
    return;
  }

  // Look for data fetching patterns
  const patterns = [
    { name: "Server-side data fetching", regex: /getServerSideProps|unstable_noStore/g },
    { name: "Client-side data fetching", regex: /useQuery|useEffect.*fetch/g },
    { name: "ISR/revalidate", regex: /revalidate|unstable_cache/g },
  ];

  const results = await scanDirectory(publicAppDir, patterns);
  console.log("\n📊 Data Fetching Patterns:");
  [...new Set(results.map((r) => r.pattern))].forEach((pattern) => {
    const count = results.filter((r) => r.pattern === pattern).length;
    console.log(`   ${pattern}: ${count} files`);
  });
}

async function auditMediaArchitecture() {
  console.log(`\n${AUDIT_SECTIONS.MEDIA}`);
  console.log("-".repeat(80));

  const mediaFiles = [
    "src/lib/media/resolver.ts",
    "src/lib/media/selection.ts",
    "src/lib/storage/paths.ts",
    "src/lib/images/processor.ts",
  ];

  for (const file of mediaFiles) {
    if (fs.existsSync(file)) {
      console.log(`✅ ${file}`);
    } else {
      console.log(`❌ ${file} missing`);
      findings.media.push({
        severity: "MEDIUM",
        issue: `Missing media architecture file: ${file}`,
      });
    }
  }

  // Check for media_id references
  const patterns = [{ name: "media_id references", regex: /media_id/g }];
  const repoContent = fs.readFileSync("src/lib/repository.ts", "utf-8");
  const mediaIdMatches = repoContent.match(patterns[0].regex);

  if (mediaIdMatches) {
    console.log(`\n✅ media_id references in repository: ${mediaIdMatches.length}`);
  } else {
    console.log("\n⚠️  No media_id references found in repository");
    findings.media.push({
      severity: "HIGH",
      issue: "media_id not integrated into repository",
    });
  }
}

async function auditCaching() {
  console.log(`\n${AUDIT_SECTIONS.CACHE}`);
  console.log("-".repeat(80));

  const patterns = [
    { name: "unstable_cache", regex: /unstable_cache/g },
    { name: "revalidateTag", regex: /revalidateTag/g },
    { name: "revalidatePath", regex: /revalidatePath/g },
    { name: "Next.js cache", regex: /cache:\s*["']force-cache["']|cache:\s*["']no-store["']/g },
    { name: "React Query/SWR", regex: /useQuery|useSWR/g },
  ];

  const results = await scanDirectory("src", patterns);
  if (results.length === 0) {
    console.log("⚠️  No explicit caching patterns found");
    findings.cache.push({
      severity: "MEDIUM",
      issue: "No explicit cache invalidation strategy detected",
    });
  } else {
    console.log("📊 Caching Strategy Found:");
    [...new Set(results.map((r) => r.pattern))].forEach((pattern) => {
      const count = results.filter((r) => r.pattern === pattern).length;
      console.log(`   ${pattern}: ${count} files`);
    });
  }
}

async function auditRLS() {
  console.log(`\n${AUDIT_SECTIONS.RLS}`);
  console.log("-".repeat(80));

  const tables = [
    "menu_items",
    "services",
    "gallery",
    "hero_slides",
    "media_assets",
    "profiles",
    "bookings",
  ];

  // Check migrations for RLS
  const migrationDir = "supabase/migrations";
  const migrations = fs.readdirSync(migrationDir);

  let rlsCount = 0;
  migrations.forEach((m) => {
    const content = fs.readFileSync(path.join(migrationDir, m), "utf-8");
    if (content.includes("ENABLE ROW LEVEL SECURITY")) {
      rlsCount++;
    }
  });

  console.log(`📊 RLS-enabled migrations: ${rlsCount}`);

  if (rlsCount < 3) {
    console.log("⚠️  Low RLS migration count - may indicate incomplete security");
    findings.rls.push({
      severity: "HIGH",
      issue: `Only ${rlsCount} RLS migrations found`,
    });
  } else {
    console.log("✅ RLS appears to be implemented");
  }
}

async function auditMigrations() {
  console.log(`\n${AUDIT_SECTIONS.MIGRATIONS}`);
  console.log("-".repeat(80));

  const migrationDir = "supabase/migrations";
  const migrations = fs.readdirSync(migrationDir).filter((f) => f.endsWith(".sql"));

  console.log(`📊 Total migrations: ${migrations.length}`);

  // Check for media_id migration
  const mediaIdMigration = migrations.find((m) => m.includes("media_id"));
  if (mediaIdMigration) {
    console.log(`✅ Media centralization migration found: ${mediaIdMigration}`);

    // Check if it's applied
    const content = fs.readFileSync(path.join(migrationDir, mediaIdMigration), "utf-8");
    if (content.includes("ALTER TABLE")) {
      console.log("   Adds columns to existing tables ✅");
    }
  } else {
    console.log("❌ No media_id migration found");
    findings.migrations.push({
      severity: "CRITICAL",
      issue: "Missing media_id migration",
    });
  }

  // Check for migration tracking
  if (fs.existsSync("supabase/migrations/.index")) {
    console.log("✅ Migration index/tracking found");
  } else {
    console.log("⚠️  No migration index tracking detected");
  }
}

async function generateReport() {
  console.log("\n" + "=".repeat(80));
  console.log("📋 AUDIT SUMMARY");
  console.log("=".repeat(80));

  const allFindings = [
    ...findings.database,
    ...findings.repository,
    ...findings.adminApi,
    ...findings.adminUI,
    ...findings.publicWebsite,
    ...findings.media,
    ...findings.cache,
    ...findings.rls,
    ...findings.performance,
    ...findings.migrations,
    ...findings.googleReviews,
  ];

  const critical = allFindings.filter((f) => f.severity === "CRITICAL");
  const high = allFindings.filter((f) => f.severity === "HIGH");
  const medium = allFindings.filter((f) => f.severity === "MEDIUM");

  console.log(`\n🔴 CRITICAL: ${critical.length}`);
  console.log(`🟠 HIGH:     ${high.length}`);
  console.log(`🟡 MEDIUM:   ${medium.length}`);

  if (critical.length > 0) {
    console.log("\n🔴 Critical Issues:");
    critical.forEach((f) => console.log(`   • ${f.issue}`));
  }

  if (high.length > 0) {
    console.log("\n🟠 High Priority:");
    high.slice(0, 5).forEach((f) => console.log(`   • ${f.issue}`));
  }

  console.log("\n" + "=".repeat(80));
  console.log("✅ AUDIT COMPLETE");
  console.log("=".repeat(80) + "\n");
}

async function main() {
  try {
    await auditDatabaseArchitecture();
    await auditRepositoryLayer();
    await auditAdminAPIs();
    await auditAdminUI();
    await auditPublicWebsite();
    await auditMediaArchitecture();
    await auditCaching();
    await auditRLS();
    await auditMigrations();
    await generateReport();
  } catch (err) {
    console.error(`Audit error: ${err.message}`);
    process.exit(1);
  }
}

main();
