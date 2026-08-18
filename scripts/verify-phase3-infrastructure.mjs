#!/usr/bin/env node
/**
 * Phase 3 Infrastructure Verification
 * Checks file_uploads table and public-assets bucket
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
dotenv.config({ path: join(root, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('Phase 3 Infrastructure Verification');
  console.log('====================================\n');

  // 1. Check file_uploads table
  console.log('1. Checking file_uploads table...');
  try {
    // Try to select with limit 0 to check table existence
    const { data, error } = await supabase
      .from('file_uploads')
      .select('*')
      .limit(0);
    
    if (error) {
      console.log('   ❌ ERROR:', error.message);
      console.log('   Code:', error.code);
    } else {
      console.log('   ✅ Table EXISTS');
      
      // Try to insert a dummy row to discover column names
      const { data: insertResult, error: insertError } = await supabase
        .from('file_uploads')
        .insert({
          bucket: 'test',
          path: 'test/path.webp',
        })
        .select()
        .single();
      
      if (insertError) {
        console.log('   Column discovery via insert error:', insertError.message);
      } else {
        // Get a row to see what columns exist
        const { data: cols, error: colsError } = await supabase
          .from('file_uploads')
          .select('*')
          .eq('id', insertResult.id)
          .single();
        
        if (colsError) {
          console.log('   Column inspection error:', colsError.message);
        } else {
          console.log('   ✅ Table columns discovered:');
          for (const key of Object.keys(cols)) {
            console.log(`      - ${key}: ${typeof cols[key]}`);
          }
        }
        
        // Clean up
        await supabase
          .from('file_uploads')
          .delete()
          .eq('id', insertResult.id);
      }
    }
  } catch (error) {
    console.log('   ❌ EXCEPTION:', error.message);
  }

  // 2. Check public-assets bucket
  console.log('\n2. Checking public-assets bucket...');
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    
    if (error) {
      console.log('   ❌ ERROR:', error.message);
    } else {
      const bucket = buckets?.find(b => b.name === 'public-assets');
      
      if (bucket) {
        console.log('   ✅ Bucket EXISTS');
        console.log('   Name:', bucket.name);
        console.log('   Public:', bucket.public);
        console.log('   File Size Limit:', bucket.file_size_limit ? `${bucket.file_size_limit / (1024*1024)} MB` : 'NOT SET');
        console.log('   Allowed MIME Types:', bucket.allowed_mime_types || 'NOT SET (all allowed)');
      } else {
        console.log('   ❌ Bucket NOT FOUND');
        console.log('   Available buckets:', buckets?.map(b => b.name) || 'none');
      }
    }
  } catch (error) {
    console.log('   ❌ EXCEPTION:', error.message);
  }

  console.log('\n====================================');
  console.log('Verification complete.');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
