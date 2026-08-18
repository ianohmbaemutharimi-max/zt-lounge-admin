#!/usr/bin/env node
/**
 * FOCUSED DIAGNOSTIC: Menu Items & Hero Slides 500 Errors
 * 
 * Per task requirements:
 * - DO NOT guess
 * - Capture actual error messages
 * - Trace execution path completely
 * - Verify actual database schema
 * - Check migration drift
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// Load .env.local
function loadEnv() {
  const envPath = path.join(ROOT, '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match && !match[1].startsWith('#')) {
        process.env[match[1].trim()] = match[2].trim();
      }
    });
  }
}

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('═'.repeat(80));
console.log('ZT LOUNGE — FOCUSED 500 ERROR DIAGNOSIS');
console.log('═'.repeat(80));
console.log();

if (!SUPABASE_URL || !SUPABASE_SERVICE) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE);

// ============================================================================
// PHASE 1: DATABASE SCHEMA VERIFICATION
// ============================================================================

console.log('PHASE 1: Database Schema Verification');
console.log('─'.repeat(80));

async function inspectTable(tableName) {
  console.log(`\n📊 Inspecting table: ${tableName}`);
  
  try {
    // Get table info from information_schema
    const { data, error } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, is_nullable, column_default')
      .eq('table_name', tableName)
      .eq('table_schema', 'public');

    if (error) {
      console.error(`   ❌ Error: ${error.message}`);
      return null;
    }

    if (!data || data.length === 0) {
      console.error(`   ❌ Table not found`);
      return null;
    }

    console.log(`   ✓ Found ${data.length} columns:`);
    data.forEach(col => {
      console.log(`     - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });

    return data;
  } catch (e) {
    console.error(`   ❌ Exception: ${e.message}`);
    return null;
  }
}

async function verifySchema() {
  // Check critical tables
  const tables = [
    'menu_items',
    'menu_categories',
    'hero_slides',
    'website_pages',
    'business_settings',
    'media_assets',
  ];

  for (const table of tables) {
    await inspectTable(table);
  }
}

// ============================================================================
// PHASE 2: API ROUTE INSPECTION
// ============================================================================

console.log();
console.log('PHASE 2: API Route Implementation Inspection');
console.log('─'.repeat(80));

function readSourceFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (e) {
    return null;
  }
}

function inspectRoute(resource) {
  console.log(`\n🔍 Inspecting route: /api/admin/${resource}`);
  
  const routePath = path.join(ROOT, 'src/app/api/admin/[resource]/route.ts');
  const content = readSourceFile(routePath);
  
  if (!content) {
    console.error(`   ❌ Route file not found: ${routePath}`);
    return null;
  }

  // Find the GET handler
  const getMatch = content.match(/export\s+async\s+function\s+GET\s*\([^)]*\)\s*\{[\s\S]*?\n\}/);
  if (!getMatch) {
    console.error(`   ❌ GET handler not found`);
    return null;
  }

  console.log(`   ✓ Route found`);
  
  // Look for repository/query calls
  if (content.includes('repository.')) {
    console.log(`   ✓ Uses repository pattern`);
  }
  
  if (content.includes('supabase.from')) {
    console.log(`   ✓ Calls supabase.from directly`);
  }

  // Look for error handling
  if (content.includes('try') && content.includes('catch')) {
    console.log(`   ✓ Has error handling`);
  } else {
    console.log(`   ⚠️ May not have proper error handling`);
  }

  return content;
}

function inspectRepository(resource) {
  console.log(`\n📚 Inspecting repository: ${resource}`);
  
  const repoPath = path.join(ROOT, 'src/lib/repository.ts');
  const content = readSourceFile(repoPath);
  
  if (!content) {
    console.error(`   ❌ Repository file not found: ${repoPath}`);
    return null;
  }

  // Look for resource handler
  const pattern = new RegExp(`['"]${resource}['"]`, 'i');
  if (pattern.test(content)) {
    console.log(`   ✓ Handler found for ${resource}`);
  } else {
    console.log(`   ⚠️ No handler found for ${resource}`);
  }

  return content;
}

// ============================================================================
// PHASE 3: ACTUAL API TESTING (with error capture)
// ============================================================================

console.log();
console.log('PHASE 3: Direct API Testing');
console.log('─'.repeat(80));

async function testMenuItemsAPI() {
  console.log(`\n🧪 Testing: GET /api/admin/menu-items`);
  
  try {
    const response = await fetch('http://localhost:3000/api/admin/menu-items', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON}`,
      },
    });

    console.log(`   Status: ${response.status}`);
    
    let body;
    try {
      body = await response.json();
    } catch {
      body = await response.text();
    }

    if (response.status === 500) {
      console.error(`   ❌ 500 ERROR`);
      console.error(`   Error details:`, body);
      return { status: 500, error: body };
    }

    if (response.status === 200) {
      console.log(`   ✓ 200 OK`);
      console.log(`   Response type: ${Array.isArray(body) ? 'Array' : typeof body}`);
      if (Array.isArray(body)) {
        console.log(`   Count: ${body.length}`);
      }
      return { status: 200, body };
    }

    console.log(`   Status: ${response.status}`);
    console.log(`   Body:`, body);
    return { status: response.status, body };
  } catch (e) {
    console.error(`   ❌ Exception: ${e.message}`);
    return { error: e.message };
  }
}

async function testHeroSlidesAPI() {
  console.log(`\n🧪 Testing: GET /api/admin/hero-slides`);
  
  try {
    const response = await fetch('http://localhost:3000/api/admin/hero-slides', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON}`,
      },
    });

    console.log(`   Status: ${response.status}`);
    
    let body;
    try {
      body = await response.json();
    } catch {
      body = await response.text();
    }

    if (response.status === 500) {
      console.error(`   ❌ 500 ERROR`);
      console.error(`   Error details:`, body);
      return { status: 500, error: body };
    }

    if (response.status === 200) {
      console.log(`   ✓ 200 OK`);
      console.log(`   Response type: ${Array.isArray(body) ? 'Array' : typeof body}`);
      if (Array.isArray(body)) {
        console.log(`   Count: ${body.length}`);
      }
      return { status: 200, body };
    }

    console.log(`   Status: ${response.status}`);
    console.log(`   Body:`, body);
    return { status: response.status, body };
  } catch (e) {
    console.error(`   ❌ Exception: ${e.message}`);
    return { error: e.message };
  }
}

// ============================================================================
// PHASE 4: QUERY EXECUTION TEST
// ============================================================================

console.log();
console.log('PHASE 4: Direct Query Execution');
console.log('─'.repeat(80));

async function testMenuItemsQuery() {
  console.log(`\n📋 Testing direct query: menu_items`);
  
  try {
    const { data, error, status } = await supabase
      .from('menu_items')
      .select('*');

    if (error) {
      console.error(`   ❌ Query error: ${error.message}`);
      console.error(`   Code: ${error.code}`);
      return { error };
    }

    console.log(`   ✓ Query succeeded`);
    console.log(`   Rows returned: ${data?.length || 0}`);
    return { data };
  } catch (e) {
    console.error(`   ❌ Exception: ${e.message}`);
    return { error: e.message };
  }
}

async function testHeroSlidesQuery() {
  console.log(`\n📋 Testing direct query: hero_slides`);
  
  try {
    const { data, error, status } = await supabase
      .from('hero_slides')
      .select('*');

    if (error) {
      console.error(`   ❌ Query error: ${error.message}`);
      console.error(`   Code: ${error.code}`);
      return { error };
    }

    console.log(`   ✓ Query succeeded`);
    console.log(`   Rows returned: ${data?.length || 0}`);
    return { data };
  } catch (e) {
    console.error(`   ❌ Exception: ${e.message}`);
    return { error: e.message };
  }
}

// ============================================================================
// PHASE 5: MIGRATION DRIFT CHECK
// ============================================================================

console.log();
console.log('PHASE 5: Migration Drift Analysis');
console.log('─'.repeat(80));

function checkMigrations() {
  const migrationsDir = path.join(ROOT, 'supabase/migrations');
  
  if (!fs.existsSync(migrationsDir)) {
    console.error(`   ❌ Migrations directory not found`);
    return;
  }

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`\n📁 Found ${files.length} migrations:`);
  
  // Find migrations related to menu, hero_slides, media
  const relevant = files.filter(f => 
    f.includes('menu') || 
    f.includes('hero') || 
    f.includes('media') ||
    f.includes('cms')
  );

  if (relevant.length === 0) {
    console.log(`   ⚠️ No menu/hero/media migrations found`);
  } else {
    console.log(`   ✓ Relevant migrations:`);
    relevant.forEach(f => {
      console.log(`     - ${f}`);
    });
  }

  // Check for media_id addition
  const mediaIdMigration = files.find(f => f.includes('media_id'));
  if (mediaIdMigration) {
    console.log(`\n   ✓ Found media_id migration: ${mediaIdMigration}`);
    const content = fs.readFileSync(path.join(migrationsDir, mediaIdMigration), 'utf-8');
    if (content.includes('menu_items')) {
      console.log(`     - Adds media_id to menu_items ✓`);
    }
    if (content.includes('hero_slides')) {
      console.log(`     - Adds media_id to hero_slides ✓`);
    }
  }
}

// ============================================================================
// EXECUTION
// ============================================================================

async function main() {
  // Verify schema
  await verifySchema();

  // Inspect routes
  inspectRoute('menu-items');
  inspectRoute('hero-slides');
  inspectRepository('menu-items');
  inspectRepository('hero-slides');

  // Direct queries
  await testMenuItemsQuery();
  await testHeroSlidesQuery();

  // Check migrations
  checkMigrations();

  // Test APIs (requires running server)
  console.log();
  console.log('PHASE 6: API Runtime Test');
  console.log('─'.repeat(80));
  console.log('\n⚠️ Attempting to connect to http://localhost:3000');
  console.log('   (Requires `npm run dev` to be running)\n');

  const menuResult = await testMenuItemsAPI();
  const heroResult = await testHeroSlidesAPI();

  // Summary
  console.log();
  console.log('═'.repeat(80));
  console.log('DIAGNOSIS SUMMARY');
  console.log('═'.repeat(80));
  
  if (menuResult.status === 500) {
    console.error(`\n❌ MENU ITEMS: 500 ERROR`);
    console.error(menuResult.error);
  } else if (menuResult.status === 200) {
    console.log(`\n✓ MENU ITEMS: 200 OK`);
  } else {
    console.log(`\n⚠️ MENU ITEMS: ${menuResult.status}`);
  }

  if (heroResult.status === 500) {
    console.error(`\n❌ HERO SLIDES: 500 ERROR`);
    console.error(heroResult.error);
  } else if (heroResult.status === 200) {
    console.log(`\n✓ HERO SLIDES: 200 OK`);
  } else {
    console.log(`\n⚠️ HERO SLIDES: ${heroResult.status}`);
  }

  console.log();
}

main().catch(console.error);
