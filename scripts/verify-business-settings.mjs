#!/usr/bin/env node

/**
 * BUSINESS SETTINGS VERIFICATION SCRIPT
 * 
 * Verifies the complete business settings implementation:
 * 1. Database schema has all required fields
 * 2. Singleton row exists or can be created
 * 3. API allowlists include all fields
 * 4. UI form includes all required fields
 * 5. Field name mapping is correct (snake_case)
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config({ path: join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

const REQUIRED_FIELDS = {
  // Core Business Information
  business_name: { type: 'text', required: true },
  description: { type: 'text', required: false },
  phone: { type: 'text', required: true },
  whatsapp: { type: 'text', required: false },
  email: { type: 'text', required: true },
  address: { type: 'text', required: true },
  
  // Location & Maps
  city: { type: 'text', required: false },
  country: { type: 'text', required: false },
  google_maps_url: { type: 'text', required: false },
  latitude: { type: 'numeric', required: false },
  longitude: { type: 'numeric', required: false },
  
  // System
  currency: { type: 'text', required: true },
  timezone: { type: 'text', required: true },
};

const results = {
  schema: { pass: false, details: {} },
  singleton: { pass: false, details: {} },
  repository: { pass: false, details: {} },
  ui: { pass: false, details: {} },
  overall: false,
};

console.log('🔍 BUSINESS SETTINGS VERIFICATION\n');
console.log('='.repeat(80));

// ============================================================================
// STEP 1: Verify Database Schema
// ============================================================================
console.log('\n📊 STEP 1: Verifying Database Schema...\n');

try {
  const { data: columns, error } = await supabase
    .from('business_settings')
    .select('*')
    .limit(0);

  if (error) {
    console.error('❌ Cannot access business_settings table:', error.message);
    results.schema.details.error = error.message;
  } else {
    results.schema.pass = true;
    results.schema.details.accessible = true;
    console.log('✅ business_settings table is accessible');
  }

  // Check column existence via information_schema
  const { data: schemaInfo } = await supabase
    .rpc('exec_sql', { 
      sql: `SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'business_settings' 
            AND table_schema = 'public'
            ORDER BY ordinal_position` 
    })
    .catch(() => ({ data: null }));

  if (schemaInfo) {
    const existingColumns = new Set(schemaInfo.map(col => col.column_name));
    const missing = [];
    const present = [];

    for (const [field, meta] of Object.entries(REQUIRED_FIELDS)) {
      if (existingColumns.has(field)) {
        present.push(field);
        console.log(`  ✅ ${field}`);
      } else {
        missing.push(field);
        console.log(`  ❌ ${field} - MISSING`);
      }
    }

    results.schema.details.present = present;
    results.schema.details.missing = missing;
    results.schema.pass = missing.length === 0;
  }
} catch (err) {
  console.error('❌ Schema verification failed:', err.message);
  results.schema.details.error = err.message;
}

// ============================================================================
// STEP 2: Verify Singleton Row
// ============================================================================
console.log('\n📊 STEP 2: Verifying Singleton Row...\n');

try {
  const { data: rows, error, count } = await supabase
    .from('business_settings')
    .select('*', { count: 'exact' });

  if (error) {
    console.error('❌ Cannot query business_settings:', error.message);
    results.singleton.details.error = error.message;
  } else if (!rows || rows.length === 0) {
    console.log('❌ NO SINGLETON ROW EXISTS');
    console.log('\n📝 To fix this, run the following SQL:');
    console.log(`
INSERT INTO business_settings (
  id, business_name, email, phone, address, currency, timezone
) VALUES (
  1, 
  'ZT Lounge', 
  'info@ztlounge.com', 
  '+254 700 000 000', 
  'Nairobi, Kenya',
  'KES',
  'Africa/Nairobi'
) ON CONFLICT (id) DO NOTHING;
`);
    results.singleton.details.exists = false;
  } else {
    console.log(`✅ Singleton row exists (count: ${count})`);
    const row = rows[0];
    
    results.singleton.pass = true;
    results.singleton.details.exists = true;
    results.singleton.details.row = row;

    console.log('\n📋 Current Values:');
    for (const [field, meta] of Object.entries(REQUIRED_FIELDS)) {
      const value = row[field];
      const status = (meta.required && !value) ? '⚠️ ' : '  ';
      console.log(`${status}${field}: ${value || '(empty)'}`);
    }
  }
} catch (err) {
  console.error('❌ Singleton verification failed:', err.message);
  results.singleton.details.error = err.message;
}

// ============================================================================
// STEP 3: Verify Repository Allowlists
// ============================================================================
console.log('\n📊 STEP 3: Verifying Repository Allowlists...\n');

try {
  const repoPath = join(__dirname, '..', 'src', 'lib', 'repository.ts');
  const repoContent = readFileSync(repoPath, 'utf-8');

  // Extract business_settings allowlists using regex
  const responseMatch = repoContent.match(/business_settings:\s*\[([\s\S]*?)\]/);
  const writableMatch = repoContent.match(/business_settings:\s*\[([\s\S]*?)\]/g);

  if (!responseMatch || !writableMatch || writableMatch.length < 2) {
    console.error('❌ Cannot parse repository allowlists');
    results.repository.details.error = 'Parse failed';
  } else {
    const responseFields = responseMatch[1]
      .split(',')
      .map(s => s.trim().replace(/['"]/g, ''))
      .filter(Boolean);

    const writableFields = writableMatch[1]
      .split(',')
      .map(s => s.trim().replace(/['"]/g, ''))
      .filter(Boolean);

    const missingFromResponse = [];
    const missingFromWritable = [];

    for (const field of Object.keys(REQUIRED_FIELDS)) {
      if (!responseFields.includes(field)) {
        missingFromResponse.push(field);
        console.log(`  ❌ RESPONSE_ALLOWLISTS missing: ${field}`);
      }
      if (!writableFields.includes(field)) {
        missingFromWritable.push(field);
        console.log(`  ❌ WRITABLE_FIELDS missing: ${field}`);
      }
    }

    if (missingFromResponse.length === 0 && missingFromWritable.length === 0) {
      console.log('✅ All required fields are in repository allowlists');
      results.repository.pass = true;
    }

    results.repository.details = {
      responseFields,
      writableFields,
      missingFromResponse,
      missingFromWritable,
    };
  }
} catch (err) {
  console.error('❌ Repository verification failed:', err.message);
  results.repository.details.error = err.message;
}

// ============================================================================
// STEP 4: Verify UI Form Fields
// ============================================================================
console.log('\n📊 STEP 4: Verifying UI Form Fields...\n');

try {
  const uiPath = join(__dirname, '..', 'src', 'features', 'settings', 'settings-view.tsx');
  const uiContent = readFileSync(uiPath, 'utf-8');

  // Check if form includes all required fields
  const fieldIssues = [];

  for (const field of Object.keys(REQUIRED_FIELDS)) {
    // Check for both snake_case and camelCase variants
    const camelCase = field.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    
    if (!uiContent.includes(`register("${field}")`) && !uiContent.includes(`register("${camelCase}")`)) {
      fieldIssues.push(`${field} not found in form`);
      console.log(`  ❌ ${field} - NOT IN FORM`);
    } else {
      // Check which variant is used
      if (uiContent.includes(`register("${field}")`)) {
        console.log(`  ✅ ${field} (snake_case) ✓`);
      } else if (uiContent.includes(`register("${camelCase}")`)) {
        console.log(`  ⚠️  ${camelCase} (camelCase) - SHOULD BE ${field}`);
        fieldIssues.push(`${field} uses camelCase (${camelCase}) instead of snake_case`);
      }
    }
  }

  results.ui.details.issues = fieldIssues;
  results.ui.pass = fieldIssues.length === 0;

  if (results.ui.pass) {
    console.log('\n✅ All fields present with correct naming');
  } else {
    console.log(`\n⚠️  Found ${fieldIssues.length} field naming issues`);
  }
} catch (err) {
  console.error('❌ UI verification failed:', err.message);
  results.ui.details.error = err.message;
}

// ============================================================================
// FINAL REPORT
// ============================================================================
console.log('\n' + '='.repeat(80));
console.log('\n📊 FINAL VERIFICATION REPORT\n');

const checks = [
  { name: 'Database Schema', ...results.schema },
  { name: 'Singleton Row', ...results.singleton },
  { name: 'Repository Allowlists', ...results.repository },
  { name: 'UI Form Fields', ...results.ui },
];

checks.forEach(check => {
  const icon = check.pass ? '✅' : '❌';
  console.log(`${icon} ${check.name}`);
});

results.overall = checks.every(c => c.pass);

console.log('\n' + '='.repeat(80));
if (results.overall) {
  console.log('\n✅ ALL CHECKS PASSED - Business Settings is fully configured\n');
} else {
  console.log('\n❌ SOME CHECKS FAILED - Review the details above\n');
}

// Write detailed results to file
const fs = await import('fs/promises');
await fs.writeFile(
  join(__dirname, '..', 'BUSINESS_SETTINGS_VERIFICATION.json'),
  JSON.stringify(results, null, 2)
);

console.log('📄 Detailed results saved to: BUSINESS_SETTINGS_VERIFICATION.json\n');

process.exit(results.overall ? 0 : 1);
