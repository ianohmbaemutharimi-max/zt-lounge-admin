#!/usr/bin/env node

/**
 * ZT LOUNGE ADMIN — APPLY MEDIA ID MIGRATIONS
 * 
 * Applies the two migrations needed for canonical media ID architecture:
 * 1. 20260817_add_media_id_to_cms_tables.sql
 * 2. 20260819_add_brand_assets_media_id.sql
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// Load environment variables
const envPath = join(ROOT, '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, ...values] = line.split('=');
  if (key && values.length) {
    env[key.trim()] = values.join('=').trim().replace(/^["']|["']$/g, '');
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   ZT LOUNGE — APPLY MEDIA ID MIGRATIONS                     ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const results = {
  migrations_applied: [],
  errors: []
};

// ============================================================
// MIGRATION 1: Add media_id to CMS tables
// ============================================================
console.log('📋 MIGRATION 1: Adding media_id to CMS tables...\n');

const migration1Path = join(ROOT, 'supabase', 'migrations', '20260817_add_media_id_to_cms_tables.sql');
const migration1SQL = readFileSync(migration1Path, 'utf-8');

// Extract only the executable SQL (remove comments and verification queries)
const migration1Statements = migration1SQL
  .split('\n')
  .filter(line => !line.trim().startsWith('--') && line.trim().length > 0)
  .join('\n')
  .split(';')
  .filter(stmt => stmt.trim().length > 0 && !stmt.includes('SELECT'))
  .map(stmt => stmt.trim() + ';');

try {
  for (const statement of migration1Statements) {
    const { error } = await supabase.rpc('exec_sql', { query: statement }).catch(async () => {
      // Fallback: try direct execution via REST API
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ query: statement })
      });
      
      if (!response.ok) {
        const text = await response.text();
        return { error: new Error(text) };
      }
      
      return { error: null };
    });
    
    if (error) {
      // Check if error is "already exists" which is OK
      if (error.message.includes('already exists') || error.message.includes('duplicate')) {
        console.log(`  ⊘ Already exists (OK): ${statement.substring(0, 50)}...`);
      } else {
        throw error;
      }
    } else {
      console.log(`  ✓ Applied: ${statement.substring(0, 50)}...`);
    }
  }
  
  results.migrations_applied.push('20260817_add_media_id_to_cms_tables.sql');
  console.log('\n  ✅ Migration 1 complete\n');
} catch (error) {
  console.error(`  ✗ Migration 1 failed: ${error.message}\n`);
  results.errors.push(`Migration 1: ${error.message}`);
}

// ============================================================
// MIGRATION 2: Add brand assets media_id
// ============================================================
console.log('📋 MIGRATION 2: Adding brand assets media_id...\n');

const migration2Path = join(ROOT, 'supabase', 'migrations', '20260819_add_brand_assets_media_id.sql');
const migration2SQL = readFileSync(migration2Path, 'utf-8');

const migration2Statements = migration2SQL
  .split('\n')
  .filter(line => !line.trim().startsWith('--') && line.trim().length > 0)
  .join('\n')
  .split(';')
  .filter(stmt => stmt.trim().length > 0)
  .map(stmt => stmt.trim() + ';');

try {
  for (const statement of migration2Statements) {
    const { error } = await supabase.rpc('exec_sql', { query: statement }).catch(async () => {
      // Fallback: try direct execution
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ query: statement })
      });
      
      if (!response.ok) {
        const text = await response.text();
        return { error: new Error(text) };
      }
      
      return { error: null };
    });
    
    if (error) {
      if (error.message.includes('already exists') || error.message.includes('duplicate')) {
        console.log(`  ⊘ Already exists (OK): ${statement.substring(0, 50)}...`);
      } else {
        throw error;
      }
    } else {
      console.log(`  ✓ Applied: ${statement.substring(0, 50)}...`);
    }
  }
  
  results.migrations_applied.push('20260819_add_brand_assets_media_id.sql');
  console.log('\n  ✅ Migration 2 complete\n');
} catch (error) {
  console.error(`  ✗ Migration 2 failed: ${error.message}\n`);
  results.errors.push(`Migration 2: ${error.message}`);
}

// ============================================================
// VERIFY MIGRATIONS
// ============================================================
console.log('📋 Verifying migrations...\n');

try {
  // Check menu_items has media_id
  const { data: menuSample } = await supabase
    .from('menu_items')
    .select('*')
    .limit(1)
    .single();
  
  const hasMenuMediaId = menuSample && 'media_id' in menuSample;
  console.log(`  menu_items.media_id: ${hasMenuMediaId ? '✅' : '❌'}`);
  
  // Check business_settings has logo_media_id
  const { data: settings } = await supabase
    .from('business_settings')
    .select('*')
    .single();
  
  const hasLogoMediaId = settings && 'logo_media_id' in settings;
  console.log(`  business_settings.logo_media_id: ${hasLogoMediaId ? '✅' : '❌'}`);
  
  if (!hasMenuMediaId || !hasLogoMediaId) {
    results.errors.push('Verification failed - columns not found after migration');
  }
} catch (error) {
  console.error(`  ✗ Verification error: ${error.message}`);
  results.errors.push(`Verification: ${error.message}`);
}

// ============================================================
// FINAL REPORT
// ============================================================
console.log('\n');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   MIGRATION APPLICATION COMPLETE                             ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

console.log(`📊 Summary:\n`);
console.log(`  Migrations applied: ${results.migrations_applied.length}`);
results.migrations_applied.forEach(m => console.log(`    ✓ ${m}`));

if (results.errors.length > 0) {
  console.log(`\n  ❌ Errors: ${results.errors.length}`);
  results.errors.forEach(e => console.error(`    • ${e}`));
  process.exit(1);
}

console.log('\n✅ All migrations applied successfully');
console.log('\nNext steps:');
console.log('  1. Run: node scripts/inspect-media-migration-status.mjs');
console.log('  2. Link existing CMS images to media_assets');
console.log('  3. Update repository to accept media_id\n');

process.exit(0);
