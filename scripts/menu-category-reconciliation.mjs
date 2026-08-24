#!/usr/bin/env node

/**
 * ZT LOUNGE — MENU CATEGORY RECONCILIATION
 * 
 * This script reconciles the database to use ZT Lounge's canonical restaurant categories.
 * 
 * STRATEGY:
 * 1. Backup existing categories and items
 * 2. Create the 10 canonical categories
 * 3. Map existing menu items to appropriate canonical categories
 * 4. Deactivate old test categories (preserve data, don't delete)
 * 5. Verify integrity
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';
import { createInterface } from 'readline';

dotenv.config({ path: join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Canonical categories for ZT Lounge restaurant
const CANONICAL_CATEGORIES = [
  { name: 'Accompaniments', slug: 'accompaniments', description: 'Side dishes and accompaniments', sort_order: 1 },
  { name: 'Specialty Dishes', slug: 'specialty-dishes', description: 'Chef\'s special creations', sort_order: 2 },
  { name: 'Choma Zone', slug: 'choma-zone', description: 'Grilled and roasted specialties', sort_order: 3 },
  { name: 'Main Dishes (Wet/Dry Fry)', slug: 'main-dishes-wet-dry-fry', description: 'Main course dishes', sort_order: 4 },
  { name: 'Hot Beverages and Breakfast', slug: 'hot-beverages-and-breakfast', description: 'Morning meals and hot drinks', sort_order: 5 },
  { name: 'Raw Goods/Items', slug: 'raw-goods-items', description: 'Fresh ingredients and raw items', sort_order: 6 },
  { name: 'Quick Bites & Snack', slug: 'quick-bites-snack', description: 'Light snacks and quick bites', sort_order: 7 },
  { name: 'Vegetables', slug: 'vegetables', description: 'Vegetable dishes', sort_order: 8 },
  { name: 'Fast Foods', slug: 'fast-foods', description: 'Quick service items', sort_order: 9 },
  { name: 'Indian Corner', slug: 'indian-corner', description: 'Indian cuisine specialties', sort_order: 10 }
];

// Mapping from test categories to canonical categories
const CATEGORY_MAPPING = {
  'Signature Grills': 'Choma Zone',           // Grills → Choma Zone
  'Appetizers': 'Quick Bites & Snack',        // Appetizers → Quick Bites
  'Main Dishes': 'Main Dishes (Wet/Dry Fry)', // Main Dishes → Main Dishes (Wet/Dry Fry)
  'Desserts': 'Specialty Dishes',             // Desserts → Specialty Dishes
  'Beverages': 'Hot Beverages and Breakfast', // Beverages → Hot Beverages
  'Bar Menu': 'Fast Foods'                    // Bar Menu → Fast Foods
};

const report = {
  timestamp: new Date().toISOString(),
  backup: null,
  newCategories: [],
  migrations: [],
  deactivated: [],
  verification: null
};

console.log('🔧 ZT LOUNGE — MENU CATEGORY RECONCILIATION\n');
console.log('═'.repeat(80));

// ========================================
// PHASE 1: BACKUP
// ========================================
async function backupExistingData() {
  console.log('\n📦 PHASE 1: BACKING UP EXISTING DATA\n');
  
  const { data: categories, error: catError } = await supabase
    .from('menu_categories')
    .select('*');
  
  const { data: items, error: itemError } = await supabase
    .from('menu_items')
    .select('*');
  
  if (catError || itemError) {
    console.error('❌ Backup failed:', catError || itemError);
    process.exit(1);
  }
  
  report.backup = {
    categories,
    items,
    timestamp: new Date().toISOString()
  };
  
  const backupPath = join(process.cwd(), `MENU_CATEGORY_BACKUP_${Date.now()}.json`);
  writeFileSync(backupPath, JSON.stringify(report.backup, null, 2));
  
  console.log(`✓ Backed up ${categories.length} categories`);
  console.log(`✓ Backed up ${items.length} menu items`);
  console.log(`✓ Backup saved to: ${backupPath}\n`);
  
  return { categories, items };
}

// ========================================
// PHASE 2: CREATE CANONICAL CATEGORIES
// ========================================
async function createCanonicalCategories() {
  console.log('\n📝 PHASE 2: CREATING CANONICAL CATEGORIES\n');
  
  const createdCategories = [];
  
  for (const canonical of CANONICAL_CATEGORIES) {
    // Check if it already exists
    const { data: existing } = await supabase
      .from('menu_categories')
      .select('*')
      .eq('slug', canonical.slug)
      .single();
    
    if (existing) {
      console.log(`✓ ${canonical.name} already exists (ID: ${existing.id})`);
      createdCategories.push(existing);
      continue;
    }
    
    // Create new category
    const { data, error } = await supabase
      .from('menu_categories')
      .insert({
        name: canonical.name,
        slug: canonical.slug,
        description: canonical.description,
        display_order: canonical.sort_order,
        is_active: true
      })
      .select()
      .single();
    
    if (error) {
      console.error(`❌ Failed to create ${canonical.name}:`, error);
      continue;
    }
    
    console.log(`✓ Created ${canonical.name} (ID: ${data.id})`);
    createdCategories.push(data);
    report.newCategories.push(data);
  }
  
  console.log(`\n✓ ${createdCategories.length} canonical categories ready\n`);
  return createdCategories;
}

// ========================================
// PHASE 3: MIGRATE MENU ITEMS
// ========================================
async function migrateMenuItems(oldCategories, newCategories) {
  console.log('\n🔄 PHASE 3: MIGRATING MENU ITEMS\n');
  
  const categoryMap = {};
  newCategories.forEach(cat => {
    categoryMap[cat.slug] = cat.id;
  });
  
  const { data: items } = await supabase
    .from('menu_items')
    .select('*');
  
  for (const item of items) {
    const oldCategory = oldCategories.find(c => c.id === item.category_id);
    if (!oldCategory) continue;
    
    const mappedCategoryName = CATEGORY_MAPPING[oldCategory.name];
    if (!mappedCategoryName) {
      console.log(`⚠️  No mapping for ${oldCategory.name}, skipping item: ${item.name}`);
      continue;
    }
    
    const canonicalCategory = newCategories.find(c => c.name === mappedCategoryName);
    if (!canonicalCategory) {
      console.log(`❌ Canonical category not found: ${mappedCategoryName}`);
      continue;
    }
    
    // Update menu item with new category_id
    const { error } = await supabase
      .from('menu_items')
      .update({ category_id: canonicalCategory.id })
      .eq('id', item.id);
    
    if (error) {
      console.error(`❌ Failed to migrate ${item.name}:`, error);
      continue;
    }
    
    console.log(`✓ ${item.name}: ${oldCategory.name} → ${canonicalCategory.name}`);
    report.migrations.push({
      itemId: item.id,
      itemName: item.name,
      from: oldCategory.name,
      to: canonicalCategory.name
    });
  }
  
  console.log(`\n✓ Migrated ${report.migrations.length} menu items\n`);
}

// ========================================
// PHASE 4: DEACTIVATE OLD CATEGORIES
// ========================================
async function deactivateOldCategories(oldCategories, newCategories) {
  console.log('\n🔒 PHASE 4: DEACTIVATING OLD TEST CATEGORIES\n');
  
  const canonicalIds = newCategories.map(c => c.id);
  
  for (const oldCat of oldCategories) {
    if (canonicalIds.includes(oldCat.id)) {
      console.log(`✓ Keeping canonical: ${oldCat.name}`);
      continue;
    }
    
    // Deactivate instead of delete (preserve data)
    const { error } = await supabase
      .from('menu_categories')
      .update({ is_active: false })
      .eq('id', oldCat.id);
    
    if (error) {
      console.error(`❌ Failed to deactivate ${oldCat.name}:`, error);
      continue;
    }
    
    console.log(`✓ Deactivated: ${oldCat.name}`);
    report.deactivated.push(oldCat);
  }
  
  console.log(`\n✓ Deactivated ${report.deactivated.length} old categories\n`);
}

// ========================================
// PHASE 5: VERIFICATION
// ========================================
async function verifyReconciliation() {
  console.log('\n✅ PHASE 5: VERIFICATION\n');
  
  const { data: categories } = await supabase
    .from('menu_categories')
    .select('*')
    .eq('is_active', true)
    .order('display_order');
  
  const { data: items } = await supabase
    .from('menu_items')
    .select('id, name, category_id');
  
  console.log('Active Categories:\n');
  const distribution = {};
  
  categories.forEach(cat => {
    const itemCount = items.filter(i => i.category_id === cat.id).length;
    distribution[cat.name] = itemCount;
    console.log(`   ${cat.display_order}. ${cat.name} (${itemCount} items)`);
    console.log(`      Slug: ${cat.slug}`);
    console.log('');
  });
  
  // Check for orphans
  const validCategoryIds = categories.map(c => c.id);
  const orphans = items.filter(i => !validCategoryIds.includes(i.category_id));
  
  if (orphans.length > 0) {
    console.log(`\n⚠️  Found ${orphans.length} orphaned items!`);
    orphans.forEach(i => console.log(`   - ${i.name}`));
  } else {
    console.log('✓ No orphaned menu items');
  }
  
  report.verification = {
    activeCategories: categories.length,
    totalItems: items.length,
    distribution,
    orphans: orphans.length
  };
  
  console.log(`\n✓ Verification complete: ${categories.length} active categories, ${items.length} items\n`);
}

// ========================================
// MAIN EXECUTION
// ========================================
async function main() {
  console.log('\n⚠️  This script will:');
  console.log('   1. Backup existing data');
  console.log('   2. Create 10 canonical ZT Lounge categories');
  console.log('   3. Migrate menu items to appropriate categories');
  console.log('   4. Deactivate old test categories');
  console.log('   5. Verify the reconciliation\n');
  
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const answer = await new Promise(resolve => {
    rl.question('Proceed with reconciliation? (yes/no): ', resolve);
  });
  rl.close();
  
  if (answer.toLowerCase() !== 'yes') {
    console.log('\n❌ Reconciliation cancelled');
    process.exit(0);
  }
  
  try {
    const { categories: oldCategories, items } = await backupExistingData();
    const newCategories = await createCanonicalCategories();
    await migrateMenuItems(oldCategories, newCategories);
    await deactivateOldCategories(oldCategories, newCategories);
    await verifyReconciliation();
    
    // Save final report
    const reportPath = join(process.cwd(), `MENU_CATEGORY_RECONCILIATION_${Date.now()}.json`);
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log('═'.repeat(80));
    console.log(`\n✅ Reconciliation complete! Report saved to: ${reportPath}\n`);
    
  } catch (error) {
    console.error('\n❌ Reconciliation failed:', error);
    process.exit(1);
  }
}

main();
