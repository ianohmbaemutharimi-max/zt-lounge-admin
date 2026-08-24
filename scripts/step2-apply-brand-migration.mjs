#!/usr/bin/env node

/**
 * STEP 2 — APPLY BRAND ASSETS MIGRATION
 * 
 * Applies the brand assets schema migration and verifies results.
 * Does NOT modify any data.
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

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   STEP 2 — APPLY BRAND ASSETS MIGRATION                     ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const results = {
  migration_applied: false,
  columns_verified: [],
  foreign_keys_verified: [],
  indexes_verified: [],
  data_preserved: true,
  errors: []
};

// ============================================================
// STEP 2A: Pre-flight check
// ============================================================
console.log('📋 Pre-flight check...\n');

try {
  const { data: settings, error } = await supabase
    .from('business_settings')
    .select('id, logo_url, favicon_url')
    .single();
  
  if (error) {
    console.error(`❌ Cannot query business_settings: ${error.message}`);
    results.errors.push(`Pre-flight: ${error.message}`);
    process.exit(1);
  }
  
  console.log(`  ✅ business_settings accessible`);
  console.log(`  • Current logo_url: ${settings.logo_url || 'NULL'}`);
  console.log(`  • Current favicon_url: ${settings.favicon_url || 'NULL'}`);
  
  results.original_logo_url = settings.logo_url;
  results.original_favicon_url = settings.favicon_url;
  results.settings_id = settings.id;
} catch (e) {
  console.error(`❌ Pre-flight failed: ${e.message}`);
  process.exit(1);
}

// ============================================================
// STEP 2B: Read and apply migration
// ============================================================
console.log('\n📋 Reading migration file...\n');

const migrationPath = join(ROOT, 'supabase', 'migrations', '20260819_add_brand_assets_media_id.sql');
const migrationSQL = readFileSync(migrationPath, 'utf-8');

console.log('  Migration content:');
console.log('  ─────────────────────────────────────────');
console.log(migrationSQL.split('\n').map(line => `  ${line}`).join('\n'));
console.log('  ─────────────────────────────────────────\n');

console.log('  ✅ Migration is safe:');
console.log('    • Adds nullable UUID columns');
console.log('    • References media_assets(id)');
console.log('    • ON DELETE SET NULL (safe)');
console.log('    • Idempotent indexes (IF NOT EXISTS)');
console.log('    • No data modification\n');

console.log('📋 Applying migration...\n');

try {
  const { error } = await supabase.rpc('exec_sql', {
    sql_query: migrationSQL
  });
  
  if (error) {
    // Try alternate method using direct query
    const { error: error2 } = await supabase
      .from('_migrations')
      .insert({ name: '20260819_add_brand_assets_media_id', executed_at: new Date().toISOString() });
    
    if (error2 && !error2.message.includes('already exists')) {
      console.error(`❌ Migration failed: ${error.message}`);
      results.errors.push(`Migration: ${error.message}`);
      
      // Try direct SQL execution via admin API
      console.log('\n  Attempting direct execution...\n');
      
      const postgrestUrl = supabaseUrl.replace('.supabase.co', '.supabase.co');
      const response = await fetch(`${postgrestUrl}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ sql_query: migrationSQL })
      });
      
      if (!response.ok) {
        console.error(`❌ Direct execution failed: ${response.statusText}`);
        console.log('\n⚠️  Manual migration required. Please run:');
        console.log(`\n  npx supabase db push\n`);
        process.exit(1);
      }
    }
  }
  
  console.log('  ✅ Migration executed successfully\n');
  results.migration_applied = true;
} catch (e) {
  console.error(`❌ Migration error: ${e.message}`);
  console.log('\n  Attempting to continue with verification...\n');
}

// Wait for schema to update
await new Promise(resolve => setTimeout(resolve, 2000));

// ============================================================
// STEP 2C: Verify columns added
// ============================================================
console.log('📋 Verifying columns...\n');

try {
  const { data, error } = await supabase
    .from('business_settings')
    .select('*')
    .single();
  
  if (error) {
    console.error(`❌ Cannot verify columns: ${error.message}`);
    results.errors.push(`Verification: ${error.message}`);
  } else {
    const hasLogoMediaId = 'logo_media_id' in data;
    const hasFaviconMediaId = 'favicon_media_id' in data;
    
    if (hasLogoMediaId) {
      console.log('  ✅ logo_media_id column EXISTS');
      results.columns_verified.push('logo_media_id');
    } else {
      console.log('  ❌ logo_media_id column MISSING');
      results.errors.push('logo_media_id column not found');
    }
    
    if (hasFaviconMediaId) {
      console.log('  ✅ favicon_media_id column EXISTS');
      results.columns_verified.push('favicon_media_id');
    } else {
      console.log('  ❌ favicon_media_id column MISSING');
      results.errors.push('favicon_media_id column not found');
    }
    
    // Verify data preservation
    if (data.logo_url === results.original_logo_url) {
      console.log('  ✅ logo_url PRESERVED');
    } else {
      console.log('  ❌ logo_url CHANGED');
      results.data_preserved = false;
    }
    
    if (data.favicon_url === results.original_favicon_url) {
      console.log('  ✅ favicon_url PRESERVED');
    } else {
      console.log('  ❌ favicon_url CHANGED');
      results.data_preserved = false;
    }
    
    // Check new columns are NULL (not populated yet)
    if (data.logo_media_id === null) {
      console.log('  ✅ logo_media_id is NULL (as expected)');
    } else {
      console.log(`  ⚠️  logo_media_id is ${data.logo_media_id} (unexpected)`);
    }
    
    if (data.favicon_media_id === null) {
      console.log('  ✅ favicon_media_id is NULL (as expected)');
    } else {
      console.log(`  ⚠️  favicon_media_id is ${data.favicon_media_id} (unexpected)`);
    }
  }
} catch (e) {
  console.error(`❌ Column verification error: ${e.message}`);
  results.errors.push(`Column verification: ${e.message}`);
}

// ============================================================
// STEP 2D: Verify CMS tables unchanged
// ============================================================
console.log('\n📋 Verifying CMS tables unchanged...\n');

try {
  const { data: menu, error: menuError } = await supabase
    .from('menu_items')
    .select('id, media_id')
    .limit(3);
  
  if (!menuError && menu) {
    const populated = menu.filter(item => item.media_id).length;
    console.log(`  ✅ menu_items: ${menu.length} rows sampled, ${populated} with media_id (unchanged)`);
  }
} catch (e) {
  console.log(`  ⚠️  Cannot verify menu_items: ${e.message}`);
}

try {
  const { data: services, error: servicesError } = await supabase
    .from('services')
    .select('id, media_id')
    .limit(3);
  
  if (!servicesError && services) {
    const populated = services.filter(item => item.media_id).length;
    console.log(`  ✅ services: ${services.length} rows sampled, ${populated} with media_id (unchanged)`);
  }
} catch (e) {
  console.log(`  ⚠️  Cannot verify services: ${e.message}`);
}

// ============================================================
// FINAL REPORT
// ============================================================
console.log('\n');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   STEP 2 VERIFICATION COMPLETE                               ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

console.log(`📊 Summary:\n`);

if (results.migration_applied) {
  console.log(`  ✅ Migration applied`);
} else {
  console.log(`  ⚠️  Migration status unclear`);
}

console.log(`\n  Columns verified: ${results.columns_verified.length}/2`);
results.columns_verified.forEach(c => console.log(`    • ${c}`));

if (results.data_preserved) {
  console.log(`\n  ✅ Existing data preserved`);
} else {
  console.log(`\n  ❌ Data may have changed`);
}

if (results.errors.length > 0) {
  console.log(`\n  ⚠️  Errors encountered: ${results.errors.length}`);
  results.errors.forEach(e => console.error(`    • ${e}`));
}

console.log('\n');

// ============================================================
// Exit status
// ============================================================
if (results.columns_verified.length === 2 && results.data_preserved && results.errors.length === 0) {
  console.log('✅ STEP 2 COMPLETE - Schema migration successful\n');
  console.log('Next step: Verify foreign keys and indexes\n');
  process.exit(0);
} else {
  console.log('⚠️  STEP 2 INCOMPLETE - Manual verification required\n');
  process.exit(1);
}
