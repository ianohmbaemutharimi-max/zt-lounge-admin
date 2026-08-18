/**
 * Verify UI Price Change
 * 
 * Usage: node verify-ui-price-change.mjs <email> <password> <item-id>
 * 
 * This script queries Supabase directly to show the current price of a menu item.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const TEST_EMAIL = process.argv[2];
const TEST_PASSWORD = process.argv[3];
const ITEM_ID = process.argv[4];

if (!TEST_EMAIL || !TEST_PASSWORD || !ITEM_ID) {
  console.error('❌ Missing arguments');
  console.error('Usage: node verify-ui-price-change.mjs <email> <password> <item-id>');
  console.error('Example: node verify-ui-price-change.mjs "user@example.com" "password" "abc-123-uuid"');
  process.exit(1);
}

// Load environment
const envContent = readFileSync('.env.local', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([A-Z_]+)=(.+)$/);
  if (match) env[match[1]] = match[2];
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('═══════════════════════════════════════════════════════════════');
console.log('  VERIFY MENU ITEM PRICE');
console.log('═══════════════════════════════════════════════════════════════\n');

try {
  // Login
  console.log('🔐 Authenticating...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (authError) {
    console.error('❌ Login failed:', authError.message);
    process.exit(1);
  }
  console.log('✅ Authenticated\n');

  // Query the specific menu item
  console.log(`📋 Querying menu item: ${ITEM_ID}\n`);
  
  const { data, error } = await supabase
    .from('menu_items')
    .select('id, name, price, category_id, description, image_url, is_active, updated_at')
    .eq('id', ITEM_ID)
    .single();

  if (error) {
    console.error('❌ Query failed:', error.message);
    process.exit(1);
  }

  if (!data) {
    console.error('❌ Menu item not found');
    process.exit(1);
  }

  // Display results
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📊 CURRENT DATABASE STATE');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  console.log(`Name:        ${data.name}`);
  console.log(`ID:          ${data.id}`);
  console.log(`Price:       ${data.price} (type: ${typeof data.price})`);
  console.log(`Category ID: ${data.category_id || 'null'}`);
  console.log(`Description: ${data.description || '(none)'}`);
  console.log(`Image URL:   ${data.image_url || '(none)'}`);
  console.log(`Active:      ${data.is_active}`);
  console.log(`Updated:     ${data.updated_at}`);
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`✅ Current Price: ${data.price}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  await supabase.auth.signOut();

} catch (error) {
  console.error('\n❌ ERROR:', error.message);
  process.exit(1);
}
