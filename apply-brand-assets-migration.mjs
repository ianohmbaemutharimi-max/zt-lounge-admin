#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  console.log('🔧 Applying brand assets migration...\n');

  try {
    // Read migration file
    const migrationPath = join(__dirname, 'supabase', 'migrations', '20260819_add_brand_assets_media_id.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration SQL:');
    console.log(migrationSQL);
    console.log('\n');

    // Execute migration
    const { data, error } = await supabase.rpc('exec_sql', { sql: migrationSQL });

    if (error) {
      console.error('❌ Migration failed:', error.message);
      process.exit(1);
    }

    console.log('✅ Migration applied successfully!');

    // Verify schema
    console.log('\n🔍 Verifying schema...');
    const { data: columns, error: verifyError } = await supabase
      .from('business_settings')
      .select('*')
      .limit(1);

    if (verifyError) {
      console.error('❌ Verification failed:', verifyError.message);
    } else {
      const record = columns?.[0] || {};
      const hasLogoMediaId = 'logo_media_id' in record;
      const hasFaviconMediaId = 'favicon_media_id' in record;

      console.log(`logo_media_id column exists: ${hasLogoMediaId ? '✅' : '❌'}`);
      console.log(`favicon_media_id column exists: ${hasFaviconMediaId ? '✅' : '❌'}`);

      if (hasLogoMediaId && hasFaviconMediaId) {
        console.log('\n✅ Brand assets migration completed successfully!');
      } else {
        console.log('\n⚠️  Migration may need manual verification');
      }
    }

  } catch (err) {
    console.error('❌ Unexpected error:', err.message);
    process.exit(1);
  }
}

applyMigration();
