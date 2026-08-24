#!/usr/bin/env node

/**
 * ZT LOUNGE — AUTOMATED CATEGORY REPLACEMENT
 * 
 * This script executes the complete category replacement without prompts.
 */

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

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

const CATEGORY_MAPPING = {
  'Signature Grills': 'Choma Zone',
  'Appetizers': 'Quick Bites & Snack',
  'Main Dishes': 'Main Dishes (Wet/Dry Fry)',
  'Desserts': 'Specialty Dishes',
  'Beverages': 'Hot Beverages and Breakfast',
  'Bar Menu': 'Fast Foods'
};

const report = {
  timestamp: new Date().toISOString(),
  backup: null,
  newCategories: [],
  migrations: [],
  deactivated: [],
  verification: null
};

console.log('\n🔧 ZT LOUNGE — AUTOMATED CATEGORY REPLACEMENT\n');
console.log('═'.repeat(80));

async function backup() {
  console.log('\n📦 PHASE 1: BACKING UP DATA\n');
  
  const { data: categories, error: catError } = await supabase
    .from('menu_categories')
    .select('*');
  
  const { data: items, error: itemError } = await supabase
    .from('menu_items')
    .select('*');
  
  if (catError || itemError) {
    throw new Error(`Backup failed: ${catError?.message || itemError?.message}`);
  }
  
  report.backup = { categories, items, timestamp: new Date().toISOString() };
  
  const backupPath = join(process.cwd(), `MENU_CATEGORY_BACKUP_${Date.now()}.json`);
  writeFileSync(backupPath, JSON.stringify(report.backup, null, 2));
  
  console.log(`✓ Backed up ${categories.length} categories, ${items.length} items`);
  console.log(`✓ Backup: ${backupPath}\n`);
  
  return { categories, items };
}

async function createCanonicalCategories() {
  console.log('\n📝 PHASE 2: CREATING CANONICAL CATEGORIES\n');
  
  const created = [];
  
  for (const canonical of CANONICAL_CATEGORIES) {
    const { data: existing } = await supabase
      .from('menu_categories')
      .select('*')
      .eq('slug', canonical.slug)
      .single();
    
    if (existing) {
      console.log(`✓ ${canonical.name} exists (${existing.id})`);
      created.push(existing);
      continue;
    }
    
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
    
    if (error) throw new Error(`Failed to create ${canonical.name}: ${error.message}`);
    
    console.log(`✓ Created ${canonical.name} (${data.id})`);
    created.push(data);
    report.newCategories.push(data);
  }
  
  console.log(`\n✓ ${created.length} canonical categories ready\n`);
  return created;
}

async function migrateItems(oldCategories, newCategories) {
  console.log('\n🔄 PHASE 3: MIGRATING MENU ITEMS\n');
  
  const { data: items } = await supabase.from('menu_items').select('*');
  
  for (const item of items) {
    const oldCat = oldCategories.find(c => c.id === item.category_id);
    if (!oldCat) continue;
    
    const targetName = CATEGORY_MAPPING[oldCat.name];
    if (!targetName) {
      console.log(`⚠️  No mapping for "${oldCat.name}", leaving: ${item.name}`);
      continue;
    }
    
    const newCat = newCategories.find(c => c.name === targetName);
    if (!newCat) {
      console.log(`❌ Target not found: ${targetName}`);
      continue;
    }
    
    const { error } = await supabase
      .from('menu_items')
      .update({ category_id: newCat.id })
      .eq('id', item.id);
    
    if (error) throw new Error(`Failed to migrate ${item.name}: ${error.message}`);
    
    console.log(`✓ ${item.name}: ${oldCat.name} → ${newCat.name}`);
    report.migrations.push({
      itemId: item.id,
      itemName: item.name,
      from: oldCat.name,
      to: newCat.name
    });
  }
  
  console.log(`\n✓ Migrated ${report.migrations.length} items\n`);
}

async function deactivateOld(oldCategories, newCategories) {
  console.log('\n🔒 PHASE 4: DEACTIVATING OLD CATEGORIES\n');
  
  const canonicalIds = newCategories.map(c => c.id);
  
  for (const oldCat of oldCategories) {
    if (canonicalIds.includes(oldCat.id)) {
      console.log(`✓ Keeping: ${oldCat.name}`);
      continue;
    }
    
    const { error } = await supabase
      .from('menu_categories')
      .update({ is_active: false })
      .eq('id', oldCat.id);
    
    if (error) throw new Error(`Failed to deactivate ${oldCat.name}: ${error.message}`);
    
    console.log(`✓ Deactivated: ${oldCat.name}`);
    report.deactivated.push(oldCat);
  }
  
  console.log(`\n✓ Deactivated ${report.deactivated.length} old categories\n`);
}

async function verify() {
  console.log('\n✅ PHASE 5: VERIFICATION\n');
  
  const { data: categories } = await supabase
    .from('menu_categories')
    .select('*')
    .eq('is_active', true)
    .order('display_order');
  
  const { data: items } = await supabase
    .from('menu_items')
    .select('id, name, category_id, media_id');
  
  console.log('Active Categories:\n');
  const distribution = {};
  
  categories.forEach(cat => {
    const count = items.filter(i => i.category_id === cat.id).length;
    distribution[cat.name] = count;
    console.log(`   ${cat.display_order}. ${cat.name} (${count} items)`);
    console.log(`      Slug: ${cat.slug}\n`);
  });
  
  const validIds = categories.map(c => c.id);
  const orphans = items.filter(i => !validIds.includes(i.category_id));
  
  if (orphans.length > 0) {
    console.log(`⚠️  ${orphans.length} orphaned items found!`);
    orphans.forEach(i => console.log(`   - ${i.name}`));
  } else {
    console.log('✓ No orphaned items');
  }
  
  // Verify media_id preserved
  const itemsWithMedia = items.filter(i => i.media_id);
  console.log(`\n✓ ${itemsWithMedia.length} items with media_id preserved`);
  
  report.verification = {
    activeCategories: categories.length,
    totalItems: items.length,
    distribution,
    orphans: orphans.length,
    itemsWithMedia: itemsWithMedia.length
  };
  
  console.log(`\n✓ Verification complete\n`);
  return distribution;
}

async function main() {
  try {
    const { categories: oldCategories } = await backup();
    const newCategories = await createCanonicalCategories();
    await migrateItems(oldCategories, newCategories);
    await deactivateOld(oldCategories, newCategories);
    const distribution = await verify();
    
    const reportPath = join(process.cwd(), `MENU_CATEGORY_REPLACEMENT_${Date.now()}.json`);
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log('═'.repeat(80));
    console.log(`\n✅ REPLACEMENT COMPLETE!\n`);
    console.log(`Report: ${reportPath}\n`);
    
    // Generate distribution diagram
    console.log('📊 MENU ITEM DISTRIBUTION:\n');
    console.log('```mermaid');
    console.log('pie title "ZT Lounge Menu Category Distribution"');
    Object.entries(distribution).forEach(([name, count]) => {
      console.log(`    "${name}" : ${count}`);
    });
    console.log('```\n');
    
  } catch (error) {
    console.error('\n❌ FAILED:', error.message);
    process.exit(1);
  }
}

main();
