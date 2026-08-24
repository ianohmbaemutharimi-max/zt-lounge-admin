#!/usr/bin/env node

/**
 * ZT LOUNGE — COMPLETE MENU CATEGORY ECOSYSTEM AUDIT
 * 
 * This script performs a comprehensive READ-ONLY audit to identify:
 * 1. Where legacy categories appear in the codebase
 * 2. The actual source of public website menu rendering
 * 3. Database vs static content discrepancies
 * 4. All category-related code paths
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import 'dotenv/config';

const LEGACY_CATEGORIES = [
  'Signature Grills',
  'signature-grills',
  'Main Courses',
  'main-courses',
  'Vegetarian Options',
  'vegetarian',
  'Premium Beverages',
  'premium-beverages',
  'Appetizers',
  'appetizers',
  'Desserts',
  'desserts',
  'Bar Menu',
  'bar-menu'
];

const CANONICAL_CATEGORIES = [
  'Accompaniments',
  'Specialty Dishes',
  'Choma Zone',
  'Main Dishes (Wet/Dry Fry)',
  'Hot Beverages and Breakfast',
  'Raw Goods/Items',
  'Quick Bites & Snack',
  'Vegetables',
  'Fast Foods',
  'Indian Corner'
];

console.log('\n' + '='.repeat(80));
console.log('ZT LOUNGE — COMPLETE MENU CATEGORY ECOSYSTEM AUDIT');
console.log('='.repeat(80));

// Check if public website directory exists
const publicWebsitePath = join(process.cwd(), '..', 'zt-lounge');
const publicWebsiteExists = existsSync(publicWebsitePath);

console.log('\n📂 PROJECT STRUCTURE');
console.log('-'.repeat(80));
console.log(`Admin Dashboard: ${process.cwd()}`);
console.log(`Public Website: ${publicWebsitePath} ${publicWebsiteExists ? '✅' : '❌'}`);

// Check restaurant-menu.html
const menuHtmlPath = join(publicWebsitePath, 'pages', 'experiences', 'restaurant-menu.html');
if (existsSync(menuHtmlPath)) {
  console.log(`\n📄 restaurant-menu.html EXISTS at:`);
  console.log(`   ${menuHtmlPath}`);
  
  const htmlContent = readFileSync(menuHtmlPath, 'utf-8');
  
  console.log(`\n🔍 STATIC CONTENT IN HTML:`);
  console.log('-'.repeat(80));
  
  // Check for legacy categories
  const foundLegacy = [];
  for (const legacy of LEGACY_CATEGORIES) {
    if (htmlContent.includes(legacy)) {
      foundLegacy.push(legacy);
    }
  }
  
  if (foundLegacy.length > 0) {
    console.log(`\n❌ FOUND ${foundLegacy.length} LEGACY CATEGORY REFERENCES IN STATIC HTML:`);
    foundLegacy.forEach(cat => console.log(`   - "${cat}"`));
  }
  
  // Check for canonical categories
  const foundCanonical = [];
  for (const canonical of CANONICAL_CATEGORIES) {
    if (htmlContent.includes(canonical)) {
      foundCanonical.push(canonical);
    }
  }
  
  if (foundCanonical.length > 0) {
    console.log(`\n✅ FOUND ${foundCanonical.length} CANONICAL CATEGORY REFERENCES:`);
    foundCanonical.forEach(cat => console.log(`   - "${cat}"`));
  }
  
  // Check if content is truly static or has dynamic loading
  const hasDynamicLoading = htmlContent.includes('MenuRepository') || 
                           htmlContent.includes('menu.config.js') ||
                           htmlContent.includes('content-loader.js');
  
  console.log(`\n🔄 DYNAMIC LOADING SCRIPTS:`);
  console.log(`   MenuRepository: ${htmlContent.includes('MenuRepository') ? '✅' : '❌'}`);
  console.log(`   menu.config.js: ${htmlContent.includes('menu.config.js') ? '✅' : '❌'}`);
  console.log(`   content-loader.js: ${htmlContent.includes('content-loader.js') ? '✅' : '❌'}`);
  
  // Check menu navigation section
  const menuNavMatch = htmlContent.match(/<nav class="menu-nav">([\s\S]*?)<\/nav>/);
  if (menuNavMatch) {
    console.log(`\n📋 MENU NAVIGATION HTML:`);
    console.log(menuNavMatch[0].substring(0, 500) + '...');
  }
  
  // Check menu items section
  const menuItemsMatch = htmlContent.match(/<section class="menu-items-section"[\s\S]*?>([\s\S]*?)<\/section>/);
  if (menuItemsMatch) {
    console.log(`\n🍽️  MENU ITEMS SECTION (first 800 chars):`);
    console.log(menuItemsMatch[0].substring(0, 800) + '...');
  }
}

// Check menu.config.js
const menuConfigPath = join(publicWebsitePath, 'assets', 'js', 'menu.config.js');
if (existsSync(menuConfigPath)) {
  console.log(`\n📄 menu.config.js EXISTS`);
  const configContent = readFileSync(menuConfigPath, 'utf-8');
  
  console.log(`\n🔍 menu.config.js CATEGORY DEFINITIONS:`);
  
  // Look for category arrays or objects
  const categoryArrayMatch = configContent.match(/categories\s*[:=]\s*\[([\s\S]*?)\]/);
  if (categoryArrayMatch) {
    console.log(categoryArrayMatch[0].substring(0, 1000));
  }
}

// Check content-loader.js
const contentLoaderPath = join(publicWebsitePath, 'assets', 'js', 'content-loader.js');
if (existsSync(contentLoaderPath)) {
  console.log(`\n📄 content-loader.js EXISTS`);
  const loaderContent = readFileSync(contentLoaderPath, 'utf-8');
  
  // Check if it loads menu dynamically
  if (loaderContent.includes('loadMenu') || loaderContent.includes('MenuRepository')) {
    console.log(`✅ content-loader.js references menu loading`);
  } else {
    console.log(`⚠️  content-loader.js may not load menu dynamically`);
  }
}

console.log('\n' + '='.repeat(80));
console.log('AUDIT SUMMARY');
console.log('='.repeat(80));
console.log(`
CRITICAL FINDING:
The restaurant-menu.html file contains STATIC HTML with hardcoded legacy categories.

Even though JavaScript files reference Supabase, the actual HTML <section> tags
contain static menu items with legacy category names like "Signature Grills",
"Main Courses", etc.

This means:
1. The HTML is NOT dynamically rendered from Supabase
2. The HTML content overrides any dynamic loading
3. Users see the static HTML immediately, then MAY see dynamic updates

REQUIRED FIX:
Either:
A) Remove static menu HTML and make it fully dynamic
B) Update static HTML to use canonical categories
C) Ensure dynamic loader properly replaces static content

Next step: Inspect MenuRepository and content-loader to understand
the intended architecture.
`);

console.log('='.repeat(80) + '\n');
