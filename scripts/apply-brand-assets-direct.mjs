#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const sql = `
-- Add media_id columns to business_settings for centralized brand asset management
ALTER TABLE business_settings
ADD COLUMN IF NOT EXISTS logo_media_id UUID REFERENCES media_assets(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS favicon_media_id UUID REFERENCES media_assets(id) ON DELETE SET NULL;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_business_settings_logo_media_id ON business_settings(logo_media_id);
CREATE INDEX IF NOT EXISTS idx_business_settings_favicon_media_id ON business_settings(favicon_media_id);
`;

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   APPLY BRAND ASSETS MIGRATION DIRECTLY                     ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

console.log('📋 Executing SQL...\n');

try {
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
  
  if (error) {
    // Try direct query if exec_sql doesn't exist
    console.log('⚠️  exec_sql not available, trying direct approach...\n');
    
    const queries = sql.split(';').filter(q => q.trim());
    
    for (const query of queries) {
      if (!query.trim()) continue;
      
      const { error: queryError } = await supabase.from('_sql').select('*').limit(0);
      
      if (queryError) {
        console.log(`❌ Cannot execute SQL directly: ${queryError.message}\n`);
        console.log('📋 Please run this SQL manually in Supabase Dashboard:\n');
        console.log('─────────────────────────────────────────');
        console.log(sql);
        console.log('─────────────────────────────────────────\n');
        process.exit(1);
      }
    }
  } else {
    console.log('✅ Migration applied successfully!\n');
    
    // Verify columns exist
    const { data: settings } = await supabase
      .from('business_settings')
      .select('logo_media_id, favicon_media_id')
      .limit(1)
      .single();
    
    if (settings) {
      console.log('✅ Verified: logo_media_id and favicon_media_id columns exist\n');
    }
  }
  
  process.exit(0);
} catch (err) {
  console.error('❌ Error:', err.message);
  console.log('\n📋 Please run this SQL manually in Supabase Dashboard:\n');
  console.log('─────────────────────────────────────────');
  console.log(sql);
  console.log('─────────────────────────────────────────\n');
  process.exit(1);
}
