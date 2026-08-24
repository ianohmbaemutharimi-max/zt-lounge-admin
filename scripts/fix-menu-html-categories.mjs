#!/usr/bin/env node

/**
 * ZT LOUNGE — FIX RESTAURANT MENU HTML CATEGORIES
 * 
 * Surgically replaces legacy category references in restaurant-menu.html
 * with canonical categories that match the database.
 * 
 * This allows content-loader.js to successfully match and populate
 * menu items from Supabase.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const HTML_PATH = join(process.cwd(), '..', 'zt-lounge', 'pages', 'experiences', 'restaurant-menu.html');

console.log('\n' + '='.repeat(80));
console.log('ZT LOUNGE — FIX RESTAURANT MENU HTML CATEGORIES');
console.log('='.repeat(80));

console.log(`\n📄 Target file: ${HTML_PATH}`);

// Read current HTML
let html = readFileSync(HTML_PATH, 'utf-8');

console.log(`\n📊 Current file size: ${html.length} characters`);

// ==============================================================================
// PHASE 1: Update Navigation Links
// ==============================================================================
console.log(`\n🔧 PHASE 1: Updating Navigation Links...`);

const navReplacements = [
    { old: '<a href="#grills" class="active">Signature Grills</a>', new: '<a href="#accompaniments" class="active">Accompaniments</a>' },
    { old: '<a href="#main-courses">Main Courses</a>', new: '<a href="#specialty-dishes">Specialty Dishes</a>' },
    { old: '<a href="#vegetarian">Vegetarian</a>', new: '<a href="#choma-zone">Choma Zone</a>' },
    { old: '<a href="#beverages">Beverages</a>', new: '<a href="#main-dishes-wet-dry-fry">Main Dishes (Wet/Dry Fry)</a>' }
];

navReplacements.forEach(({ old, new: newVal }) => {
    if (html.includes(old)) {
        html = html.replace(old, newVal);
        console.log(`  ✅ Replaced: ${old.substring(0, 50)}...`);
    } else {
        console.log(`  ⚠️  Not found: ${old.substring(0, 50)}...`);
    }
});

// ==============================================================================
// PHASE 2: Update Category Sections
// ==============================================================================
console.log(`\n🔧 PHASE 2: Updating Category Section IDs and Titles...`);

const categoryReplacements = [
    {
        oldId: 'id="grills"',
        newId: 'id="accompaniments"',
        oldTitle: '<h2 class="menu-category-title">Signature <span>Grills</span></h2>',
        newTitle: '<h2 class="menu-category-title">Accompaniments</h2>',
        oldComment: '<!-- Signature Grills - 3 Items -->',
        newComment: '<!-- Accompaniments -->'
    },
    {
        oldId: 'id="main-courses"',
        newId: 'id="specialty-dishes"',
        oldTitle: '<h2 class="menu-category-title">Main <span>Courses</span></h2>',
        newTitle: '<h2 class="menu-category-title">Specialty <span>Dishes</span></h2>',
        oldComment: '<!-- Main Courses - 3 Items -->',
        newComment: '<!-- Specialty Dishes -->'
    },
    {
        oldId: 'id="vegetarian"',
        newId: 'id="choma-zone"',
        oldTitle: '<h2 class="menu-category-title">Vegetarian <span>Options</span></h2>',
        newTitle: '<h2 class="menu-category-title">Choma <span>Zone</span></h2>',
        oldComment: '<!-- Vegetarian Options - 3 Items -->',
        newComment: '<!-- Choma Zone -->'
    },
    {
        oldId: 'id="beverages"',
        newId: 'id="main-dishes-wet-dry-fry"',
        oldTitle: '<h2 class="menu-category-title">Premium <span>Beverages</span></h2>',
        newTitle: '<h2 class="menu-category-title">Main Dishes <span>(Wet/Dry Fry)</span></h2>',
        oldComment: '<!-- Premium Beverages - 3 Items -->',
        newComment: '<!-- Main Dishes (Wet/Dry Fry) -->'
    }
];

categoryReplacements.forEach(({ oldId, newId, oldTitle, newTitle, oldComment, newComment }) => {
    // Replace ID
    if (html.includes(oldId)) {
        html = html.replace(oldId, newId);
        console.log(`  ✅ Updated section ID: ${oldId} → ${newId}`);
    }
    
    // Replace title
    if (html.includes(oldTitle)) {
        html = html.replace(oldTitle, newTitle);
        console.log(`  ✅ Updated title: ${oldTitle.substring(0, 40)}...`);
    }
    
    // Replace comment
    if (html.includes(oldComment)) {
        html = html.replace(oldComment, newComment);
        console.log(`  ✅ Updated comment`);
    }
});

// ==============================================================================
// PHASE 3: Update SEO Metadata
// ==============================================================================
console.log(`\n🔧 PHASE 3: Updating SEO Metadata...`);

const seoReplacements = [
    {
        old: '<title>Restaurant Menu - ZT Lounge Meru | Signature Dishes & Gourmet Cuisine</title>',
        new: '<title>Restaurant Menu - ZT Lounge Meru | Specialty Dishes & Authentic Kenyan Cuisine</title>'
    },
    {
        old: '<meta name="description" content="Explore the full menu at ZT Lounge Restaurant Meru. Specialty dishes, choma zone, Indian corner, main dishes, accompaniments, hot beverages, breakfast, quick bites, vegetables, fast foods, and raw goods." />',
        new: '<meta name="description" content="Explore the full menu at ZT Lounge Restaurant Meru. Specialty dishes, choma zone, Indian corner, main dishes, accompaniments, hot beverages, breakfast, quick bites, vegetables, fast foods, and raw goods." />'
    },
    {
        old: '<meta property="og:title" content="Restaurant Menu - ZT Lounge Meru | Signature Dishes" />',
        new: '<meta property="og:title" content="Restaurant Menu - ZT Lounge Meru | Specialty Dishes & Authentic Cuisine" />'
    }
];

seoReplacements.forEach(({ old, new: newVal }) => {
    if (html.includes(old)) {
        html = html.replace(old, newVal);
        console.log(`  ✅ Updated SEO meta tag`);
    }
});

// ==============================================================================
// PHASE 4: Write Updated HTML
// ==============================================================================
console.log(`\n💾 PHASE 4: Writing Updated HTML...`);

writeFileSync(HTML_PATH, html, 'utf-8');

console.log(`  ✅ File written: ${html.length} characters`);

// ==============================================================================
// PHASE 5: Verification
// ==============================================================================
console.log(`\n🔍 PHASE 5: Verification...`);

const verificationChecks = [
    { legacy: 'Signature Grills', canonical: 'Accompaniments' },
    { legacy: 'Main Courses', canonical: 'Specialty Dishes' },
    { legacy: 'Vegetarian Options', canonical: 'Choma Zone' },
    { legacy: 'Premium Beverages', canonical: 'Main Dishes' }
];

let allPassed = true;
verificationChecks.forEach(({ legacy, canonical }) => {
    const hasLegacy = html.includes(legacy);
    const hasCanonical = html.includes(canonical);
    
    if (hasLegacy) {
        console.log(`  ❌ Legacy term still found: "${legacy}"`);
        allPassed = false;
    }
    if (hasCanonical) {
        console.log(`  ✅ Canonical term found: "${canonical}"`);
    } else {
        console.log(`  ⚠️  Canonical term NOT found: "${canonical}"`);
    }
});

console.log('\n' + '='.repeat(80));
if (allPassed) {
    console.log('✅ FIX COMPLETE — All legacy categories replaced');
} else {
    console.log('⚠️  FIX PARTIAL — Some legacy terms remain (may be in comments/metadata)');
}
console.log('='.repeat(80));

console.log(`
NEXT STEPS:

1. Review the changes in restaurant-menu.html
2. Test the public website locally
3. Verify dynamic content loading works
4. Check browser console for errors
5. Verify all 10 canonical categories appear

The content-loader.js should now successfully match and populate
menu items from Supabase because the category names align.
`);


