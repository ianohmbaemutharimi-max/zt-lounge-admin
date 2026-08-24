#!/usr/bin/env node

/**
 * ZT LOUNGE ADMIN — APPLY MEDIA ID MIGRATIONS (FIXED)
 * 
 * Applies media_id migrations using direct SQL execution
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
console.log('║   ZT LOUNGE — APPLY MEDIA ID MIGRATIONS (FIXED)             ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

const results = {
  migrations_applied: [],
  columns_added: [],
  already_exists: [],
  errors: []
};

// ============================================================
// Helper: Execute SQL with proper error handling
// ============================================================
async function executeSql(sql, description) {
  try {
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
      // Check if it's an "already exists" error
      const errorMsg = error.message || error.toString();
      if (errorMsg.includes('already exists') || errorMsg.includes('duplicate')) {
        console.log(`  ⊘ ${description}: Already exists (OK)`);
        results.already_exists.push(description);
        return { success: true, alreadyExists: true };
      }
      throw error;
    }
    
    console.log(`  ✓ ${description}: Applied`);
    results.columns_added.push(description);
    return { success: true, alreadyExists: false };
  } catch (error) {
    const errorMsg = error.message || error.toString();
    if (errorMsg.includes('already exists') || errorMsg.includes('duplicate')) {
      console.log(`  ⊘ ${description}: Already exists (OK)`);
      results.already_exists.push(description);
      return { success: true, alreadyExists: true };
    }
    
    console.error(`  ✗ ${description}: ${errorMsg}`);
    results.errors.push(`${description}: ${errorMsg}`);
    return { success: false, error: errorMsg };
  }
}

// ============================================================
// MIGRATION 1: Add media_id to CMS tables
// ============================================================
console.log('📋 MIGRATION 1: Adding media_id to CMS tables...\n');

await executeSql(
  'ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS media_id UUID;',
  'menu_items.media_id column'
);

await executeSql(
  'ALTER TABLE services ADD COLUMN IF NOT EXISTS media_id UUID;',
  'services.media_id column'
);

await executeSql(
  'ALTER TABLE gallery ADD COLUMN IF NOT EXISTS media_id UUID;',
  'gallery.media_id column'
);

await executeSql(
  'ALTER TABLE hero_slides ADD COLUMN IF NOT EXISTS media_id UUID;',
  'hero_slides.media_id column'
);

// Foreign keys (these might fail if already exist, that's OK)
console.log('\n📋 Adding foreign key constraints...\n');

await executeSql(
  `ALTER TABLE menu_items 
   ADD CONSTRAINT IF NOT EXISTS fk_menu_items_media_id 
   FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE SET NULL;`,
  'menu_items FK constraint'
);

await executeSql(
  `ALTER TABLE services 
   ADD CONSTRAINT IF NOT EXISTS fk_services_media_id 
   FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE SET NULL;`,
  'services FK constraint'
);

await executeSql(
  `ALTER TABLE gallery 
   ADD CONSTRAINT IF NOT EXISTS fk_gallery_media_id 
   FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE SET NULL;`,
  'gallery FK constraint'
);

await executeSql(
  `ALTER TABLE hero_slides 
   ADD CONSTRAINT IF NOT EXISTS fk_hero_slides_media_id 
   FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE SET NULL;`,
  'hero_slides FK constraint'
);

// Indexes
console.log('\n📋 Adding indexes...\n');

await executeSql(
  'CREATE INDEX IF NOT EXISTS idx_menu_items_media_id ON menu_items(media_id);',
  'menu_items index'
);

await executeSql(
  'CREATE INDEX IF NOT EXISTS idx_services_media_id ON services(media_id);',
  'services index'
);

await executeSql(
  'CREATE INDEX IF NOT EXISTS idx_gallery_media_id ON gallery(media_id);',
  'gallery index'
);

await executeSql(
  'CREATE INDEX IF NOT EXISTS idx_hero_slides_media_id ON hero_slides(media_id);',
  'hero_slides index'
);

results.migrations_applied.push('20260817_add_media_id_to_cms_tables.sql');

// ============================================================
// MIGRATION 2: Add brand assets media_id
// ============================================================
console.log('\n📋 MIGRATION 2: Adding brand assets media_id...\n');

await executeSql(
  'ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS logo_media_id UUID;',
  'business_settings.logo_media_id column'
);

await executeSql(
  'ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS favicon_media_id UUID;',
  'business_settings.favicon_media_id column'
);

await executeSql(
  `ALTER TABLE business_settings 
   ADD CONSTRAINT IF NOT EXISTS fk_business_settings_logo_media_id 
   FOREIGN KEY (logo_media_id) REFERENCES media_assets(id) ON DELETE SET NULL;`,
  'business_settings.logo_media_id FK'
);

await executeSql(
  `ALTER TABLE business_settings 
   ADD CONSTRAINT IF NOT EXISTS fk_business_settings_favicon_media_id 
   FOREIGN KEY (favicon_media_id) REFERENCES media_assets(id) ON DELETE SET NULL;`,
  'business_settings.favicon_media_id FK'
);

await executeSql(
  'CREATE INDEX IF NOT EXISTS idx_business_settings_logo_media_id ON business_settings(logo_media_id);',
  'business_settings.logo_media_id index'
);

await executeSql(
  'CREATE INDEX IF NOT EXISTS idx_business_settings_favicon_media_id ON business_settings(favicon_media_id);',
  'business_settings.favicon_media_id index'
);

results.migrations_applied.push('20260819_add_brand_assets_media_id.sql');

// ============================================================
// VERIFY MIGRATIONS
// ============================================================
console.log('\n📋 Verifying migrations...\n');

const verification = {
  menu_items_media_id: false,
  services_media_id: false,
  gallery_media_id: false,
  hero_slides_media_id: false,
  logo_media_id: false,
  favicon_media_id: false
};

try {
  const { data: menuSample } = await supabase.from('menu_items').select('*').limit(1).maybeSingle();
  verification.menu_items_media_id = menuSample && 'media_id' in menuSample;
  
  const { data: servicesSample } = await supabase.from('services').select('*').limit(1).maybeSingle();
  verification.services_media_id = servicesSample && 'media_id' in servicesSample;
  
  const { data: gallerySample } = await supabase.from('gallery').select('*').limit(1).maybeSingle();
  verification.gallery_media_id = gallerySample && 'media_id' in gallerySample;
  
  const { data: heroSample } = await supabase.from('hero_slides').select('*').limit(1).maybeSingle();
  verification.hero_slides_media_id = heroSample && 'media_id' in heroSample;
  
  const { data: settings } = await supabase.from('business_settings').select('*').single();
  verification.logo_media_id = settings && 'logo_media_id' in settings;
  verification.favicon_media_id = settings && 'favicon_media_id' in settings;
  
  console.log(`  menu_items.media_id:           ${verification.menu_items_media_id ? '✅' : '❌'}`);
  console.log(`  services.media_id:             ${verification.services_media_id ? '✅' : '❌'}`);
  console.log(`  gallery.media_id:              ${verification.gallery_media_id ? '✅' : '❌'}`);
  console.log(`  hero_slides.media_id:          ${verification.hero_slides_media_id ? '✅' : '❌'}`);
  console.log(`  business_settings.logo_media_id:    ${verification.logo_media_id ? '✅' : '❌'}`);
  console.log(`  business_settings.favicon_media_id: ${verification.favicon_media_id ? '✅' : '❌'}`);
  
  const allVerified = Object.values(verification).every(v => v === true);
  if (!allVerified) {
    results.errors.push('Verification failed - some columns not found');
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
console.log(`  Migrations processed: ${results.migrations_applied.length}`);
results.migrations_applied.forEach(m => console.log(`    • ${m}`));

console.log(`\n  Columns added: ${results.columns_added.length}`);
results.columns_added.forEach(c => console.log(`    ✓ ${c}`));

console.log(`\n  Already existed: ${results.already_exists.length}`);
results.already_exists.forEach(c => console.log(`    ⊘ ${c}`));

if (results.errors.length > 0) {
  console.log(`\n  ⚠️  Errors: ${results.errors.length}`);
  results.errors.forEach(e => console.error(`    • ${e}`));
}

const allVerified = Object.values(verification).every(v => v === true);
if (allVerified) {
  console.log('\n✅ All media_id columns verified in live database');
  console.log('\nNext step: Run mapping script to link existing CMS images\n');
  process.exit(0);
} else {
  console.log('\n❌ Some columns failed verification');
  process.exit(1);
}
