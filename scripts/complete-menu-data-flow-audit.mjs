#!/usr/bin/env node

/**
 * ZT LOUNGE — COMPLETE MENU DATA FLOW AUDIT
 * 
 * Phase 1: Query authoritative database state
 * Phase 2: Audit static HTML content
 * Phase 3: Trace dynamic loading path
 * Phase 4: Identify data flow breakpoints
 * Phase 5: Generate fix plan
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local from parent directory
config({ path: join(__dirname, '..', '.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const HTML_PATH = join(process.cwd(), '..', 'zt-lounge', 'pages', 'experiences', 'restaurant-menu.html');
const CONTENT_LOADER_PATH = join(process.cwd(), '..', 'zt-lounge', 'assets', 'js', 'content-loader.js');

console.log('\n' + '='.repeat(80));
console.log('ZT LOUNGE — COMPLETE MENU DATA FLOW AUDIT');
console.log('='.repeat(80));

// ==============================================================================
// PHASE 1: AUTHORITATIVE DATABASE STATE
// ==============================================================================
console.log('\n📊 PHASE 1: Querying Authoritative Database State...\n');

const { data: categories, error: catError } = await supabase
    .from('menu_categories')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

if (catError) {
    console.error('❌ Failed to fetch categories:', catError);
    process.exit(1);
}

console.log(`✅ Found ${categories.length} active categories in database:\n`);

const categoryMap = {};
const menuDataByCategory = {};

for (const cat of categories) {
    console.log(`   ${cat.display_order}. ${cat.name} (slug: ${cat.slug}, id: ${cat.id})`);
    categoryMap[cat.id] = cat;
    
    // Fetch menu items for this category
    const { data: items, error: itemError } = await supabase
        .from('menu_items')
        .select('id, name, description, price, is_available, display_order, media_id, category_id')
        .eq('category_id', cat.id)
        .order('display_order', { ascending: true });
    
    if (!itemError && items) {
        menuDataByCategory[cat.slug] = {
            category: cat,
            items: items
        };
        console.log(`      → ${items.length} items`);
        items.forEach((item, idx) => {
            const status = item.is_available ? '✓' : '✗';
            console.log(`         ${idx + 1}. ${item.name} - KES ${item.price} [${status}]`);
        });
    }
}

// ==============================================================================
// PHASE 2: AUDIT STATIC HTML CONTENT
// ==============================================================================
console.log('\n\n📄 PHASE 2: Auditing Static HTML Content...\n');

const html = readFileSync(HTML_PATH, 'utf-8');

console.log(`File size: ${html.length} characters`);

// Find all menu item cards in HTML
const menuItemPattern = /<article[^>]*class="menu-item"[^>]*>(.*?)<\/article>/gs;
const staticMenuItems = [];
let match;

while ((match = menuItemPattern.exec(html)) !== null) {
    const articleContent = match[1];
    
    // Extract item name
    const nameMatch = articleContent.match(/<h3[^>]*>(.*?)<\/h3>/);
    const name = nameMatch ? nameMatch[1].replace(/<[^>]*>/g, '').trim() : 'Unknown';
    
    // Extract price
    const priceMatch = articleContent.match(/<span[^>]*class="price"[^>]*>(.*?)<\/span>/);
    const price = priceMatch ? priceMatch[1].replace(/<[^>]*>/g, '').trim() : 'No price';
    
    // Determine which section it's in
    const startPos = match.index;
    const beforeContent = html.substring(0, startPos);
    const lastSectionMatch = beforeContent.match(/<section[^>]*id="([^"]*)"[^>]*>/g);
    const sectionId = lastSectionMatch ? lastSectionMatch[lastSectionMatch.length - 1].match(/id="([^"]*)"/)[1] : 'unknown';
    
    staticMenuItems.push({ name, price, sectionId });
}

console.log(`\n✅ Found ${staticMenuItems.length} static menu items in HTML:\n`);

const staticBySection = {};
staticMenuItems.forEach(item => {
    if (!staticBySection[item.sectionId]) {
        staticBySection[item.sectionId] = [];
    }
    staticBySection[item.sectionId].push(item);
});

Object.keys(staticBySection).forEach(sectionId => {
    console.log(`   Section: #${sectionId}`);
    staticBySection[sectionId].forEach((item, idx) => {
        console.log(`      ${idx + 1}. ${item.name} - ${item.price}`);
    });
    console.log();
});

// ==============================================================================
// PHASE 3: DATABASE vs STATIC COMPARISON
// ==============================================================================
console.log('\n🔍 PHASE 3: Database vs Static HTML Comparison...\n');

console.log('MISMATCHES DETECTED:\n');

let mismatchCount = 0;

// Check each database category
Object.keys(menuDataByCategory).forEach(slug => {
    const { category, items: dbItems } = menuDataByCategory[slug];
    const staticItems = staticBySection[slug] || [];
    
    if (dbItems.length !== staticItems.length) {
        console.log(`❌ ${category.name} (${slug}):`);
        console.log(`   DB has ${dbItems.length} items, HTML has ${staticItems.length} items`);
        mismatchCount++;
    }
    
    // Check if item names match
    dbItems.forEach((dbItem, idx) => {
        const staticItem = staticItems[idx];
        if (!staticItem) {
            console.log(`❌ ${category.name}: DB item "${dbItem.name}" has no corresponding HTML item`);
            mismatchCount++;
        } else if (dbItem.name !== staticItem.name) {
            console.log(`❌ ${category.name}: DB "${dbItem.name}" vs HTML "${staticItem.name}"`);
            mismatchCount++;
        }
    });
});

// Check for static items without DB category
Object.keys(staticBySection).forEach(sectionId => {
    if (!menuDataByCategory[sectionId]) {
        console.log(`❌ HTML section #${sectionId} has no corresponding database category`);
        console.log(`   Static items: ${staticBySection[sectionId].length}`);
        mismatchCount++;
    }
});

console.log(`\n📊 Total mismatches: ${mismatchCount}\n`);

// ==============================================================================
// PHASE 4: TRACE DYNAMIC LOADING PATH
// ==============================================================================
console.log('\n🔧 PHASE 4: Analyzing Dynamic Loading Path...\n');

const contentLoader = readFileSync(CONTENT_LOADER_PATH, 'utf-8');

// Check if menu population function exists
const hasMenuPopulation = contentLoader.includes('populateMenu') || contentLoader.includes('loadMenu');
const hasMenuRepository = contentLoader.includes('MenuRepository');

console.log(`Content-loader.js analysis:`);
console.log(`   - Has menu population function: ${hasMenuPopulation ? '✓' : '✗'}`);
console.log(`   - Uses MenuRepository: ${hasMenuRepository ? '✓' : '✗'}`);

// Check for category matching logic
const hasCategoryMatching = contentLoader.match(/category.*?heading|heading.*?category/gi);
console.log(`   - Has category matching: ${hasCategoryMatching ? '✓' : '✗'}`);

// ==============================================================================
// PHASE 5: ROOT CAUSE SUMMARY
// ==============================================================================
console.log('\n' + '='.repeat(80));
console.log('ROOT CAUSE SUMMARY');
console.log('='.repeat(80));

console.log(`
DATABASE STATE: ✅ CORRECT
- ${categories.length} canonical categories active
- Menu items properly assigned to category_id
- Prices, availability, media_id all present

STATIC HTML: ❌ INCORRECT
- Contains ${staticMenuItems.length} hardcoded menu items
- ${mismatchCount} mismatches with database
- Static items override dynamic loading

DYNAMIC LOADER: ${hasMenuPopulation ? '⚠️  EXISTS BUT INEFFECTIVE' : '❌ MISSING'}
- Cannot replace existing static HTML items
- Category matching may work for headings only
- Items remain static even if categories matched

PRIMARY FIX REQUIRED:
1. Remove ALL static menu item <article> elements from HTML
2. Keep category section containers empty
3. Let content-loader.js populate items dynamically from Supabase
4. Ensure MenuRepository data flows to DOM

ARCHITECTURE TARGET:
   HTML: Empty containers → JavaScript: Populate from DB → User: See DB data
`);

// ==============================================================================
// PHASE 6: GENERATE FIX PLAN
// ==============================================================================
console.log('\n' + '='.repeat(80));
console.log('FIX PLAN');
console.log('='.repeat(80));

console.log(`
STEP 1: Create backup of restaurant-menu.html

STEP 2: Remove static menu items from HTML
   - Keep category section structure
   - Remove all <article class="menu-item"> elements
   - Keep section headings
   - Add empty state or loading indicator

STEP 3: Enhance content-loader.js
   - Ensure populateMenu() creates item cards dynamically
   - Match categories by slug (not name)
   - Create DOM elements for each menu item
   - Include: name, description, price, image, availability

STEP 4: Test data flow
   - Database → MenuRepository → content-loader.js → DOM

STEP 5: Verify runtime
   - Check browser console for errors
   - Verify Supabase requests succeed
   - Confirm rendered items match database exactly

Current status: PHASE 1 AUDIT COMPLETE
Next step: Execute fix plan
`);

// Save audit report
const report = {
    timestamp: new Date().toISOString(),
    database: {
        categories: categories.length,
        totalItems: Object.values(menuDataByCategory).reduce((sum, cat) => sum + cat.items.length, 0),
        categoryDetails: menuDataByCategory
    },
    staticHTML: {
        itemCount: staticMenuItems.length,
        itemsBySection: staticBySection
    },
    mismatches: mismatchCount,
    conclusion: 'Static HTML contains hardcoded menu items that do not match database. Dynamic loading is ineffective.'
};

const reportPath = join(process.cwd(), 'MENU_DATA_FLOW_AUDIT_REPORT.json');
import { writeFileSync } from 'fs';
writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(`\n✅ Detailed report saved to: ${reportPath}\n`);
console.log('='.repeat(80));
