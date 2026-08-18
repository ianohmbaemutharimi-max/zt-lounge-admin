#!/usr/bin/env node

/**
 * PHASE 2B: LIVE DATABASE SCHEMA VERIFICATION
 * 
 * Query the actual media_assets table schema from Supabase
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing Supabase configuration');
  process.exit(1);
}

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

console.log('🔍 PHASE 2B: LIVE DATABASE SCHEMA VERIFICATION\n');
console.log('Querying media_assets table schema from Supabase...\n');

async function verifySchema() {
  try {
    // Query media_assets with select * to see what columns actually exist
    const { data: sample, error: sampleError } = await adminClient
      .from('media_assets')
      .select('*')
      .limit(1);

    if (sampleError) {
      console.error('❌ Failed to query media_assets:', sampleError.message);
      process.exit(1);
    }

    const columnNames = sample && sample.length > 0 ? Object.keys(sample[0]) : [];
    
    if (columnNames.length === 0) {
      console.error('❌ media_assets table appears to be empty or inaccessible');
      process.exit(1);
    }

    console.log('✅ media_assets table found with', columnNames.length, 'columns:\n');
    console.log('LIVE SCHEMA:');
    console.log('='.repeat(80));
    
    columnNames.forEach(col => {
      console.log(`  ${col}`);
    });
    
    console.log('\n' + '='.repeat(80));
    
    console.log('\n📊 COLUMN VERIFICATION:');
    console.log('='.repeat(80));
    
    const expectedColumns = [
      'id', 'bucket', 'path', 'public_url', 'original_name', 'mime_type',
      'file_size', 'width', 'height', 'alt_text', 'title', 'content_hash',
      'uploaded_by', 'created_at', 'updated_at'
    ];
    
    expectedColumns.forEach(col => {
      const exists = columnNames.includes(col);
      console.log(`  ${exists ? '✅' : '❌'} ${col}`);
    });
    
    // Check for file_name (should NOT exist)
    if (columnNames.includes('file_name')) {
      console.log('\n⚠️  WARNING: file_name column exists (unexpected)');
    } else {
      console.log('\n✅ file_name column does NOT exist (correct)');
    }
    
    // Show sample data
    console.log('\n📦 SAMPLE DATA:');
    console.log('='.repeat(80));
    
    if (sample && sample.length > 0) {
      console.log('Sample record:');
      console.log(JSON.stringify(sample[0], null, 2));
    } else {
      console.log('No records found in media_assets table');
    }
    
    console.log('\n✅ PHASE 2B COMPLETE');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

verifySchema();
