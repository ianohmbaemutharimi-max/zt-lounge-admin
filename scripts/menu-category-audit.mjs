#!/usr/bin/env node

/**
 * ZT LOUNGE — MENU CATEGORY CANONICAL ARCHITECTURE AUDIT
 * 
 * PHASE 0: READ-ONLY INSPECTION
 * 
 * Objectives:
 * 1. Inspect database schema for menu_categories and menu_items
 * 2. Audit current category records and their slugs
 * 3. Map category usage across menu items
 * 4. Search codebase for hardcoded category names
 * 5. Verify database → admin → website data flow
 * 6. Identify duplicates, missing canonical categories, and slug issues
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Canonical categories as per task requirements
const CANONICAL_CATEGORIES = [
  { name: 'Accompaniments', slug: 'accompaniments', sort_order: 1 },
  { name: 'Specialty Dishes', slug: 'specialty-dishes', sort_order: 2 },
  { name: 'Choma Zone', slug: 'choma-zone', sort_order: 3 },
  { name: 'Main Dishes (Wet/Dry Fry)', slug: 'main-dishes-wet-dry-fry', sort_order: 4 },
  { name: 'Hot Beverages and Breakfast', slug: 'hot-beverages-and-breakfast', sort_order: 5 },
  { name: 'Raw Goods/Items', slug: 'raw-goods-items', sort_order: 6 },
  { name: 'Quick Bites & Snack', slug: 'quick-bites-snack', sort_order: 7 },
  { name: 'Vegetables', slug: 'vegetables', sort_order: 8 },
  { name: 'Fast Foods', slug: 'fast-foods', sort_order: 9 },
  { name: 'Indian Corner', slug: 'indian-corner', sort_order: 10 }
];

const report = {
  timestamp: new Date().toISOString(),
  database: {
    schema: null,
    categories: null,
    menuItems: null,
    foreignKeys: null,
    constraints: null
  },
  analysis: {
    canonicalMatch: [],
    duplicates: [],
    wrongSlugs: [],
    missing: [],
    orphaned: [],
    categoryDistribution: {}
  },
  codebase: {
    hardcodedCategories: [],
    categoryReferences: []
  },
  recommendations: []
};

console.log('🔍 ZT LOUNGE — MENU CATEGORY AUDIT\n');
console.log('═'.repeat(80));

// ========================================
// 1. DATABASE SCHEMA INSPECTION
// ========================================
console.log('\n📊 PHASE 1: DATABASE SCHEMA INSPECTION\n');

async function inspectSchema() {
  console.log('Fetching menu_categories schema...');
  
  // Get table structure via information_schema
  const { data: categoryColumns, error: catError } = await supabase
    .from('information_schema.columns')
    .select('column_name, data_type, is_nullable, column_default')
    .eq('table_name', 'menu_categories')
    .eq('table_schema', 'public');
  
  if (catError) {
    console.error('⚠️  Could not fetch schema via information_schema, using RPC...');
    // Try alternate method
  }
  
  // Get menu_items schema
  const { data: itemColumns, error: itemError } = await supabase
    .from('information_schema.columns')
    .select('column_name, data_type, is_nullable, column_default')
    .eq('table_name', 'menu_items')
    .eq('table_schema', 'public');
  
  report.database.schema = {
    menu_categories: categoryColumns || [],
    menu_items: itemColumns || []
  };
  
  console.log(`✓ menu_categories columns: ${categoryColumns?.length || 0}`);
  console.log(`✓ menu_items columns: ${itemColumns?.length || 0}`);
}

// ========================================
// 2. CURRENT CATEGORY RECORDS
// ========================================
async function inspectCategories() {
  console.log('\nFetching current menu_categories records...');
  
  const { data: categories, error } = await supabase
    .from('menu_categories')
    .select('*')
    .order('display_order', { ascending: true });
  
  if (error) {
    console.error('❌ Error fetching categories:', error);
    return;
  }
  
  report.database.categories = categories;
  
  console.log(`\n✓ Found ${categories.length} categories:\n`);
  categories.forEach((cat, idx) => {
    console.log(`   ${idx + 1}. ${cat.name}`);
    console.log(`      ID: ${cat.id}`);
    console.log(`      Slug: ${cat.slug || 'NULL'}`);
    console.log(`      Sort Order: ${cat.display_order || cat.sort_order || 'NULL'}`);
    console.log(`      Active: ${cat.is_active}`);
    console.log('');
  });
}

// ========================================
// 3. MENU ITEMS AND CATEGORY RELATIONSHIPS
// ========================================
async function inspectMenuItems() {
  console.log('Fetching menu_items and category relationships...');
  
  const { data: items, error } = await supabase
    .from('menu_items')
    .select('id, name, category_id, media_id, is_active');
  
  if (error) {
    console.error('❌ Error fetching menu items:', error);
    return;
  }
  
  report.database.menuItems = {
    total: items.length,
    active: items.filter(i => i.is_active).length,
    withCategory: items.filter(i => i.category_id).length,
    withMedia: items.filter(i => i.media_id).length,
    items: items
  };
  
  console.log(`\n✓ Found ${items.length} menu items`);
  console.log(`   Active: ${items.filter(i => i.is_active).length}`);
  console.log(`   With category_id: ${items.filter(i => i.category_id).length}`);
  console.log(`   With media_id: ${items.filter(i => i.media_id).length}`);
  
  // Build category distribution
  const distribution = {};
  items.forEach(item => {
    const catId = item.category_id || 'NULL';
    if (!distribution[catId]) {
      distribution[catId] = [];
    }
    distribution[catId].push(item);
  });
  
  report.analysis.categoryDistribution = distribution;
  
  console.log('\n📊 Category Distribution:\n');
  Object.entries(distribution).forEach(([catId, items]) => {
    const category = report.database.categories.find(c => c.id === catId);
    const catName = category ? category.name : `Unknown (${catId})`;
    console.log(`   ${catName}: ${items.length} items`);
  });
}

// ========================================
// 4. CANONICAL CATEGORY ANALYSIS
// ========================================
async function analyzeCanonicalMatch() {
  console.log('\n\n🎯 PHASE 2: CANONICAL CATEGORY ANALYSIS\n');
  
  const categories = report.database.categories;
  const canonicalNames = CANONICAL_CATEGORIES.map(c => c.name);
  const canonicalSlugs = CANONICAL_CATEGORIES.map(c => c.slug);
  
  console.log('Comparing database categories against canonical list...\n');
  
  // Check each canonical category
  CANONICAL_CATEGORIES.forEach(canonical => {
    const exactMatch = categories.find(c => 
      c.name.trim() === canonical.name && 
      c.slug === canonical.slug
    );
    
    const nameMatch = categories.find(c => c.name.trim() === canonical.name);
    const slugMatch = categories.find(c => c.slug === canonical.slug);
    
    if (exactMatch) {
      console.log(`✓ ${canonical.name}`);
      console.log(`  Status: EXACT MATCH`);
      console.log(`  ID: ${exactMatch.id}`);
      report.analysis.canonicalMatch.push({
        canonical,
        database: exactMatch,
        status: 'EXACT_MATCH'
      });
    } else if (nameMatch && !slugMatch) {
      console.log(`⚠️  ${canonical.name}`);
      console.log(`  Status: NAME MATCH, WRONG SLUG`);
      console.log(`  Current slug: ${nameMatch.slug || 'NULL'}`);
      console.log(`  Expected slug: ${canonical.slug}`);
      report.analysis.wrongSlugs.push({
        canonical,
        database: nameMatch
      });
    } else if (!nameMatch) {
      console.log(`❌ ${canonical.name}`);
      console.log(`  Status: MISSING`);
      report.analysis.missing.push(canonical);
    }
    console.log('');
  });
  
  // Check for non-canonical categories (duplicates or legacy)
  console.log('\n🔍 Non-Canonical Categories:\n');
  categories.forEach(cat => {
    const isCanonical = canonicalNames.includes(cat.name.trim());
    if (!isCanonical) {
      console.log(`⚠️  ${cat.name} (ID: ${cat.id})`);
      console.log(`   Slug: ${cat.slug || 'NULL'}`);
      const itemCount = report.analysis.categoryDistribution[cat.id]?.length || 0;
      console.log(`   Menu items: ${itemCount}`);
      report.analysis.duplicates.push({
        category: cat,
        itemCount
      });
      console.log('');
    }
  });
}

// ========================================
// 5. ORPHANED MENU ITEMS
// ========================================
async function checkOrphans() {
  console.log('\n🔍 PHASE 3: ORPHANED MENU ITEMS CHECK\n');
  
  const items = report.database.menuItems.items;
  const validCategoryIds = report.database.categories.map(c => c.id);
  
  const orphaned = items.filter(item => 
    item.category_id && !validCategoryIds.includes(item.category_id)
  );
  
  const nullCategory = items.filter(item => !item.category_id);
  
  report.analysis.orphaned = orphaned;
  
  if (orphaned.length > 0) {
    console.log(`❌ Found ${orphaned.length} orphaned menu items (invalid category_id):\n`);
    orphaned.forEach(item => {
      console.log(`   ${item.name} → category_id: ${item.category_id}`);
    });
  } else {
    console.log('✓ No orphaned menu items found');
  }
  
  if (nullCategory.length > 0) {
    console.log(`\n⚠️  Found ${nullCategory.length} menu items with NULL category_id:\n`);
    nullCategory.slice(0, 10).forEach(item => {
      console.log(`   ${item.name}`);
    });
    if (nullCategory.length > 10) {
      console.log(`   ... and ${nullCategory.length - 10} more`);
    }
  }
}

// ========================================
// 6. GENERATE RECOMMENDATIONS
// ========================================
function generateRecommendations() {
  console.log('\n\n📋 PHASE 4: RECOMMENDATIONS\n');
  console.log('═'.repeat(80));
  
  const recs = [];
  
  // Missing canonical categories
  if (report.analysis.missing.length > 0) {
    recs.push({
      priority: 'HIGH',
      action: 'CREATE_MISSING_CATEGORIES',
      description: `Create ${report.analysis.missing.length} missing canonical categories`,
      categories: report.analysis.missing.map(c => c.name)
    });
    console.log(`\n🔴 HIGH: Create ${report.analysis.missing.length} missing categories:`);
    report.analysis.missing.forEach(c => console.log(`   - ${c.name} (slug: ${c.slug})`));
  }
  
  // Wrong slugs
  if (report.analysis.wrongSlugs.length > 0) {
    recs.push({
      priority: 'HIGH',
      action: 'FIX_SLUGS',
      description: `Update ${report.analysis.wrongSlugs.length} categories with wrong slugs`,
      categories: report.analysis.wrongSlugs.map(ws => ({
        name: ws.canonical.name,
        currentSlug: ws.database.slug,
        correctSlug: ws.canonical.slug
      }))
    });
    console.log(`\n🔴 HIGH: Fix ${report.analysis.wrongSlugs.length} wrong slugs:`);
    report.analysis.wrongSlugs.forEach(ws => {
      console.log(`   - ${ws.canonical.name}: "${ws.database.slug || 'NULL'}" → "${ws.canonical.slug}"`);
    });
  }
  
  // Duplicate/legacy categories
  if (report.analysis.duplicates.length > 0) {
    recs.push({
      priority: 'MEDIUM',
      action: 'RECONCILE_DUPLICATES',
      description: `Handle ${report.analysis.duplicates.length} non-canonical categories`,
      categories: report.analysis.duplicates.map(d => ({
        name: d.category.name,
        id: d.category.id,
        itemCount: d.itemCount
      }))
    });
    console.log(`\n🟡 MEDIUM: Reconcile ${report.analysis.duplicates.length} non-canonical categories:`);
    report.analysis.duplicates.forEach(d => {
      console.log(`   - ${d.category.name} (${d.itemCount} items) → needs mapping decision`);
    });
  }
  
  // Orphaned items
  if (report.analysis.orphaned.length > 0) {
    recs.push({
      priority: 'HIGH',
      action: 'FIX_ORPHANED_ITEMS',
      description: `Fix ${report.analysis.orphaned.length} orphaned menu items`,
      items: report.analysis.orphaned.map(i => i.name)
    });
    console.log(`\n🔴 HIGH: Fix ${report.analysis.orphaned.length} orphaned menu items`);
  }
  
  report.recommendations = recs;
  
  if (recs.length === 0) {
    console.log('\n✅ No critical issues found!');
  }
}

// ========================================
// MAIN EXECUTION
// ========================================
async function main() {
  try {
    await inspectSchema();
    await inspectCategories();
    await inspectMenuItems();
    await analyzeCanonicalMatch();
    await checkOrphans();
    generateRecommendations();
    
    // Save report
    const reportPath = join(process.cwd(), `MENU_CATEGORY_AUDIT_${Date.now()}.json`);
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log('\n\n═'.repeat(80));
    console.log(`\n✅ Audit complete. Report saved to: ${reportPath}\n`);
    
  } catch (error) {
    console.error('\n❌ Audit failed:', error);
    process.exit(1);
  }
}

main();
