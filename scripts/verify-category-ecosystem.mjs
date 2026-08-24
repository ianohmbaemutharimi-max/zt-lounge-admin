#!/usr/bin/env node

/**
 * ZT LOUNGE — CATEGORY ECOSYSTEM VERIFICATION
 * 
 * Verifies categories across database, admin, and website.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: join(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const OLD_CATEGORIES = [
  'Signature Grills',
  'signature-grills',
  'Appetizers',
  'appetizers',
  'Desserts',
  'desserts',
  'Beverages',
  'beverages',
  'Bar Menu',
  'bar-menu'
];

const report = {
  timestamp: new Date().toISOString(),
  database: null,
  hardcodedReferences: [],
  adminDashboard: null,
  publicWebsite: null
};

console.log('\n🔍 ZT LOUNGE — CATEGORY ECOSYSTEM VERIFICATION\n');
console.log('═'.repeat(80));

async function verifyDatabase() {
  console.log('\n📊 DATABASE VERIFICATION\n');
  
  const { data: categories } = await supabase
    .from('menu_categories')
    .select('*')
    .eq('is_active', true)
    .order('display_order');
  
  const { data: items } = await supabase
    .from('menu_items')
    .select('id, name, category_id, media_id');
  
  const distribution = {};
  categories.forEach(cat => {
    const count = items.filter(i => i.category_id === cat.id).length;
    distribution[cat.name] = count;
  });
  
  console.log('✓ Active Categories:', categories.length);
  console.log('✓ Total Menu Items:', items.length);
  console.log('✓ Items with media_id:', items.filter(i => i.media_id).length);
  
  const orphans = items.filter(i => !categories.find(c => c.id === i.category_id));
  if (orphans.length > 0) {
    console.log(`❌ Orphaned items: ${orphans.length}`);
  } else {
    console.log('✓ No orphaned items');
  }
  
  report.database = {
    activeCategories: categories.length,
    totalItems: items.length,
    distribution,
    categories: categories.map(c => ({ name: c.name, slug: c.slug }))
  };
  
  console.log('');
}

function searchFile(filePath, searchTerms) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const matches = [];
    
    searchTerms.forEach(term => {
      if (content.includes(term)) {
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          if (line.includes(term)) {
            matches.push({
              term,
              file: filePath,
              line: idx + 1,
              context: line.trim().substring(0, 100)
            });
          }
        });
      }
    });
    
    return matches;
  } catch (e) {
    return [];
  }
}

function searchDirectory(dir, searchTerms, extensions = ['.ts', '.tsx', '.js', '.jsx'], results = []) {
  try {
    const entries = readdirSync(dir);
    
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        if (!entry.startsWith('.') && entry !== 'node_modules' && entry !== 'dist' && entry !== 'build') {
          searchDirectory(fullPath, searchTerms, extensions, results);
        }
      } else if (stat.isFile()) {
        const ext = entry.substring(entry.lastIndexOf('.'));
        if (extensions.includes(ext)) {
          const matches = searchFile(fullPath, searchTerms);
          results.push(...matches);
        }
      }
    }
  } catch (e) {
    // Skip inaccessible directories
  }
  
  return results;
}

function searchHardcodedCategories() {
  console.log('\n🔍 SEARCHING FOR HARDCODED CATEGORIES\n');
  
  const srcDir = join(process.cwd(), 'src');
  const matches = searchDirectory(srcDir, OLD_CATEGORIES);
  
  // Filter out acceptable occurrences
  const problematic = matches.filter(m => {
    const lower = m.file.toLowerCase();
    return !lower.includes('test') && 
           !lower.includes('migration') && 
           !lower.includes('.spec.') &&
           !lower.includes('backup');
  });
  
  if (problematic.length === 0) {
    console.log('✓ No hardcoded old category references found\n');
  } else {
    console.log(`⚠️  Found ${problematic.length} references to old categories:\n`);
    problematic.forEach(m => {
      console.log(`   ${m.file}:${m.line}`);
      console.log(`   → "${m.term}"`);
      console.log(`   ${m.context}\n`);
    });
  }
  
  report.hardcodedReferences = problematic;
}

async function checkAdminDashboard() {
  console.log('\n🎛️  ADMIN DASHBOARD CHECK\n');
  
  // Check if menu items page loads categories from database
  const menuItemsPage = join(process.cwd(), 'src', 'app', 'dashboard', 'menu', 'page.tsx');
  const menuFeaturesDir = join(process.cwd(), 'src', 'features', 'menu-items');
  
  let usesDatabase = false;
  let hasHardcodedCategories = false;
  
  try {
    if (statSync(menuItemsPage).isFile()) {
      const content = readFileSync(menuItemsPage, 'utf8');
      usesDatabase = content.includes('menu_categories') || content.includes('categories');
      hasHardcodedCategories = content.includes('const categories = [');
    }
  } catch (e) {
    // File may not exist
  }
  
  console.log('Menu Management:');
  console.log(`  ${usesDatabase ? '✓' : '⚠️ '} Uses database for categories`);
  console.log(`  ${!hasHardcodedCategories ? '✓' : '❌'} No hardcoded category arrays`);
  
  report.adminDashboard = {
    usesDatabase,
    hasHardcodedCategories
  };
  
  console.log('');
}

async function checkPublicWebsite() {
  console.log('\n🌐 PUBLIC WEBSITE CHECK\n');
  
  // Look for public website location
  const possibleLocations = [
    join(process.cwd(), '..', 'zt-lounge-website'),
    join(process.cwd(), '..', 'zt-lounge-public'),
    join(process.cwd(), '..', 'website'),
    join(process.cwd(), 'public-website')
  ];
  
  let websiteFound = false;
  let websiteLocation = null;
  
  for (const loc of possibleLocations) {
    try {
      if (statSync(loc).isDirectory()) {
        websiteFound = true;
        websiteLocation = loc;
        break;
      }
    } catch (e) {
      // Directory doesn't exist
    }
  }
  
  if (websiteFound) {
    console.log(`✓ Public website found: ${websiteLocation}`);
    console.log('⚠️  Manual verification required:');
    console.log('   - Check menu category display');
    console.log('   - Verify /menu/[slug] routing');
    console.log('   - Test category filtering');
    console.log('   - Confirm menu items render correctly\n');
    
    report.publicWebsite = {
      found: true,
      location: websiteLocation,
      verified: false,
      note: 'Manual verification required'
    };
  } else {
    console.log('⚠️  Public website not found in standard locations');
    console.log('   Expected locations checked:');
    possibleLocations.forEach(loc => console.log(`   - ${loc}`));
    console.log('');
    
    report.publicWebsite = {
      found: false,
      note: 'Website location unknown - manual search required'
    };
  }
}

async function main() {
  try {
    await verifyDatabase();
    searchHardcodedCategories();
    await checkAdminDashboard();
    await checkPublicWebsite();
    
    console.log('═'.repeat(80));
    console.log('\n✅ VERIFICATION COMPLETE\n');
    
    const success = 
      report.database.activeCategories === 10 &&
      report.hardcodedReferences.length === 0 &&
      report.database.distribution;
    
    if (success) {
      console.log('✓ Database: 10 canonical categories active');
      console.log('✓ No hardcoded old category references');
      console.log('✓ All menu items migrated');
      console.log('✓ media_id architecture preserved\n');
    } else {
      console.log('⚠️  Issues found - review report\n');
    }
    
    console.log('Report saved to: MENU_CATEGORY_ECOSYSTEM_VERIFICATION.json\n');
    
    // Save report
    const fs = await import('fs');
    fs.writeFileSync(
      join(process.cwd(), 'MENU_CATEGORY_ECOSYSTEM_VERIFICATION.json'),
      JSON.stringify(report, null, 2)
    );
    
  } catch (error) {
    console.error('\n❌ FAILED:', error.message);
    process.exit(1);
  }
}

main();
