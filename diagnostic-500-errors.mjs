#!/usr/bin/env node

/**
 * Diagnostic script to test menu-items and hero-slides endpoints
 * with proper authentication to identify 500 errors
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

// Read environment
const envPath = join(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const envLines = envContent.split('\n');

let supabaseUrl = '';
let supabaseAnonKey = '';
let supabaseServiceKey = '';

for (const line of envLines) {
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) {
    supabaseUrl = line.split('=')[1].trim();
  }
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) {
    supabaseAnonKey = line.split('=')[1].trim();
  }
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) {
    supabaseServiceKey = line.split('=')[1].trim();
  }
}

console.log('🔍 Diagnostic: Testing menu-items and hero-slides endpoints\n');

// Create admin client (service role)
const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

async function queryTable(tableName) {
  console.log(`\n📊 Querying ${tableName}...`);
  try {
    const { data, error, status } = await adminClient
      .from(tableName)
      .select('*')
      .limit(1);

    if (error) {
      console.log(`  ❌ Error: ${error.message} (${error.code})`);
      return false;
    }
    console.log(`  ✅ Success: Found ${data?.length || 0} record(s)`);
    if (data && data.length > 0) {
      console.log(`  📋 Sample record:`, JSON.stringify(data[0], null, 2).substring(0, 200));
    }
    return true;
  } catch (err) {
    console.log(`  ❌ Exception: ${err.message}`);
    return false;
  }
}

async function testDatabaseSchema() {
  console.log('\n=== DATABASE SCHEMA TEST ===');

  // Test menu_items
  await queryTable('menu_items');

  // Test menu_categories
  await queryTable('menu_categories');

  // Test hero_slides
  await queryTable('hero_slides');

  // Test website_pages
  await queryTable('website_pages');
}

async function testRepository() {
  console.log('\n=== REPOSITORY TEST ===');

  try {
    const { Repository } = await import('./src/lib/repository.js');
    const repo = new Repository(adminClient);

    console.log('\n📦 Testing Repository.findAll()...');

    // Test menu-items
    try {
      console.log('\n  Testing menu-items...');
      const result = await repo.findAll('menu-items', { limit: 5 });
      if (result.data) {
        console.log(`  ✅ menu-items: ${result.data.length} items`);
      } else {
        console.log(`  ⚠️  menu-items returned no data`);
      }
      if (result.error) {
        console.log(`  ❌ Error: ${result.error}`);
      }
    } catch (err) {
      console.log(`  ❌ Exception: ${err.message}`);
      console.log(err.stack);
    }

    // Test hero-slides
    try {
      console.log('\n  Testing hero-slides...');
      const result = await repo.findAll('hero-slides', { limit: 5 });
      if (result.data) {
        console.log(`  ✅ hero-slides: ${result.data.length} items`);
      } else {
        console.log(`  ⚠️  hero-slides returned no data`);
      }
      if (result.error) {
        console.log(`  ❌ Error: ${result.error}`);
      }
    } catch (err) {
      console.log(`  ❌ Exception: ${err.message}`);
      console.log(err.stack);
    }
  } catch (err) {
    console.log(`  ❌ Failed to load Repository: ${err.message}`);
  }
}

async function run() {
  try {
    await testDatabaseSchema();
    await testRepository();
    console.log('\n=== TEST COMPLETE ===\n');
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  }
}

run();
