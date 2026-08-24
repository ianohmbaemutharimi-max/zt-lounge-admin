#!/usr/bin/env node

/**
 * ZT LOUNGE ADMIN — COMPLETE REVENUE REMOVAL
 * 
 * This script performs a comprehensive removal of ALL revenue-related functionality
 * from the ZT Lounge Admin application per user requirements.
 * 
 * REMOVES:
 * - totalAmount references from dashboard UI
 * - totalAmount references from customers UI
 * - Revenue-related migration files
 * - Revenue calculation scripts
 * - Revenue validation from existing reports
 * 
 * PRESERVES:
 * - Operational pricing (services.price, menu_items.price)
 * - Booking workflows
 * - All non-revenue functionality
 */

import { readFileSync, writeFileSync, unlinkSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   ZT LOUNGE ADMIN — COMPLETE REVENUE REMOVAL                 ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const results = {
  removed: [],
  modified: [],
  errors: [],
  skipped: []
};

// ============================================================
// STEP 1: Remove totalAmount from dashboard overview
// ============================================================
console.log('📋 STEP 1: Removing totalAmount from dashboard overview...\n');

try {
  const overviewPath = join(ROOT, 'src', 'features', 'dashboard', 'overview.tsx');
  let overviewContent = readFileSync(overviewPath, 'utf-8');
  
  // Remove totalAmount from interface
  overviewContent = overviewContent.replace(
    /interface RecentBooking \{[^}]+\}/s,
    `interface RecentBooking {
  id: string;
  bookingNumber: string;
  customerName: string;
  serviceName: string;
  bookingDate: string;
  bookingTime: string;
  status: string;
}`
  );
  
  // Remove Amount column header
  overviewContent = overviewContent.replace(
    /<th className="px-5 py-3">Amount<\/th>/,
    ''
  );
  
  // Remove Amount cell
  overviewContent = overviewContent.replace(
    /<td className="whitespace-nowrap px-5 py-3">\{formatKES\(b\.totalAmount\)\}<\/td>/,
    ''
  );
  
  writeFileSync(overviewPath, overviewContent, 'utf-8');
  results.modified.push('src/features/dashboard/overview.tsx');
  console.log('  ✓ Removed totalAmount from dashboard overview');
} catch (error) {
  results.errors.push(`dashboard overview: ${error.message}`);
  console.error(`  ✗ Error: ${error.message}`);
}

// ============================================================
// STEP 2: Remove totalAmount from customers view
// ============================================================
console.log('\n📋 STEP 2: Removing totalAmount from customers view...\n');

try {
  const customersPath = join(ROOT, 'src', 'features', 'customers', 'customers-view.tsx');
  let customersContent = readFileSync(customersPath, 'utf-8');
  
  // Remove totalAmount display from booking history
  customersContent = customersContent.replace(
    /<span className="ml-auto">\{formatKES\(b\.totalAmount\)\}<\/span>/,
    ''
  );
  
  writeFileSync(customersPath, customersContent, 'utf-8');
  results.modified.push('src/features/customers/customers-view.tsx');
  console.log('  ✓ Removed totalAmount from customers view');
} catch (error) {
  results.errors.push(`customers view: ${error.message}`);
  console.error(`  ✗ Error: ${error.message}`);
}

// ============================================================
// STEP 3: Archive/rename revenue-containing migrations
// ============================================================
console.log('\n📋 STEP 3: Archiving revenue-containing migrations...\n');

const revenueMigrations = [
  'supabase/migrations/20260815_fix_dashboard_stats_rpc.sql',
  'supabase/migrations/20260815_dashboard_stats_rpc_corrected.sql'
];

for (const migPath of revenueMigrations) {
  try {
    const fullPath = join(ROOT, migPath);
    if (existsSync(fullPath)) {
      const archivePath = fullPath.replace('.sql', '.sql.revenue_removed');
      
      // Read and add header
      let content = readFileSync(fullPath, 'utf-8');
      const header = `-- ============================================================
-- ARCHIVED: This migration contained revenue analytics code
-- Date Archived: ${new Date().toISOString()}
-- Reason: Revenue analytics removal per project requirements
-- ============================================================

`;
      writeFileSync(archivePath, header + content, 'utf-8');
      unlinkSync(fullPath);
      
      results.removed.push(migPath);
      console.log(`  ✓ Archived ${migPath}`);
    } else {
      results.skipped.push(`${migPath} (not found)`);
      console.log(`  ⊘ Skipped ${migPath} (not found)`);
    }
  } catch (error) {
    results.errors.push(`${migPath}: ${error.message}`);
    console.error(`  ✗ Error with ${migPath}: ${error.message}`);
  }
}

// ============================================================
// STEP 4: Archive revenue-related scripts
// ============================================================
console.log('\n📋 STEP 4: Archiving revenue-related scripts...\n');

const revenueScripts = [
  'apply-revenue-removal.mjs',
  'scripts/verify-dashboard-rpc.mjs',
  'scripts/phase4cd-apply-and-verify-rpc.mjs',
  'scripts/phase4-apply-and-verify.mjs',
  'scripts/inspect-and-fix-enum.mjs',
  'scripts/deploy-dashboard-rpc-live.mjs',
  'scripts/apply-rpc-fix-live.mjs',
  'scripts/apply-dashboard-rpc-live.mjs'
];

for (const scriptPath of revenueScripts) {
  try {
    const fullPath = join(ROOT, scriptPath);
    if (existsSync(fullPath)) {
      const archivePath = fullPath + '.archived';
      const content = readFileSync(fullPath, 'utf-8');
      
      // Only archive if it contains revenue references
      if (/revenue|totalRevenue|monthlyRevenue|total_amount/i.test(content)) {
        writeFileSync(archivePath, content, 'utf-8');
        unlinkSync(fullPath);
        results.removed.push(scriptPath);
        console.log(`  ✓ Archived ${scriptPath}`);
      } else {
        results.skipped.push(`${scriptPath} (no revenue code)`);
        console.log(`  ⊘ Skipped ${scriptPath} (no revenue references)`);
      }
    } else {
      results.skipped.push(`${scriptPath} (not found)`);
    }
  } catch (error) {
    results.errors.push(`${scriptPath}: ${error.message}`);
    console.error(`  ✗ Error with ${scriptPath}: ${error.message}`);
  }
}

// ============================================================
// STEP 5: Update incorrect audit reports
// ============================================================
console.log('\n📋 STEP 5: Updating audit reports...\n');

const auditReports = [
  'REVENUE_REMOVAL_FINAL_AUDIT.md',
  'REVENUE_REMOVAL_FINAL_REPORT.md'
];

for (const reportPath of auditReports) {
  try {
    const fullPath = join(ROOT, reportPath);
    if (existsSync(fullPath)) {
      const archivePath = fullPath + '.incorrect';
      const content = readFileSync(fullPath, 'utf-8');
      writeFileSync(archivePath, content, 'utf-8');
      unlinkSync(fullPath);
      results.removed.push(reportPath);
      console.log(`  ✓ Archived incorrect report: ${reportPath}`);
    }
  } catch (error) {
    results.errors.push(`${reportPath}: ${error.message}`);
  }
}

// ============================================================
// FINAL REPORT
// ============================================================
console.log('\n');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   REMOVAL COMPLETE                                           ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

console.log(`📊 Summary:\n`);
console.log(`  Modified files:  ${results.modified.length}`);
results.modified.forEach(f => console.log(`    • ${f}`));

console.log(`\n  Removed/archived: ${results.removed.length}`);
results.removed.forEach(f => console.log(`    • ${f}`));

if (results.skipped.length > 0) {
  console.log(`\n  Skipped:         ${results.skipped.length}`);
  results.skipped.forEach(f => console.log(`    • ${f}`));
}

if (results.errors.length > 0) {
  console.log(`\n  ❌ Errors:        ${results.errors.length}`);
  results.errors.forEach(e => console.error(`    • ${e}`));
  process.exit(1);
}

console.log('\n✅ Revenue removal completed successfully');
console.log('\nNext steps:');
console.log('  1. Run: npm run build');
console.log('  2. Run: npm test');
console.log('  3. Search for remaining "revenue" references');
console.log('  4. Verify dashboard displays operational metrics only\n');
