/**
 * DIAGNOSE MENU PRICE UPDATE ISSUE
 * 
 * This script tests whether price updates work when sent as:
 * 1. Number
 * 2. String
 * 3. Both formats
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Load environment
const envContent = readFileSync('.env.local', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([A-Z_]+)=(.+)$/);
  if (match) env[match[1]] = match[2];
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const BASE_URL = 'http://localhost:3000';

const TEST_EMAIL = process.argv[2];
const TEST_PASSWORD = process.argv[3];

if (!TEST_EMAIL || !TEST_PASSWORD) {
  console.error('Usage: node diagnose-price-update.mjs <email> <password>');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('═══════════════════════════════════════════════════════════════');
console.log('  MENU PRICE UPDATE DIAGNOSIS');
console.log('═══════════════════════════════════════════════════════════════\n');

try {
  // Step 1: Login
  console.log('🔐 Step 1: Authenticating...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });

  if (authError || !authData.session) {
    console.error('❌ Login failed:', authError?.message);
    process.exit(1);
  }
  console.log('✅ Authenticated\n');

  // Build cookies (URL-encoded)
  const projectRef = SUPABASE_URL.split('//')[1].split('.')[0];
  const cookieValue = encodeURIComponent(JSON.stringify(authData.session));
  const cookieHeader = `sb-${projectRef}-auth-token=${cookieValue}`;

  // Step 2: Get existing menu items
  console.log('📋 Step 2: Fetching existing menu items...');
  const menuRes = await fetch(`${BASE_URL}/api/admin/menu-items`, {
    headers: { Cookie: cookieHeader }
  });

  if (!menuRes.ok) {
    console.error('❌ Failed to fetch menu items:', menuRes.status);
    process.exit(1);
  }

  const menuItems = await menuRes.json();
  if (menuItems.length === 0) {
    console.error('❌ No menu items found');
    process.exit(1);
  }

  // Pick the first item for testing
  const testItem = menuItems[0];
  console.log(`✅ Found test item: "${testItem.name}"`);
  console.log(`   Current price: ${testItem.price} (type: ${typeof testItem.price})\n`);

  const originalPrice = testItem.price;

  // Step 3: Test price update with NUMBER
  console.log('🧪 Step 3: Testing price update with NUMBER...');
  const testPrice1 = 999;
  const payload1 = { price: testPrice1 }; // Send as number

  console.log(`   Sending: ${JSON.stringify(payload1)}`);
  const update1 = await fetch(`${BASE_URL}/api/admin/menu-items/${testItem.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader
    },
    body: JSON.stringify(payload1),
  });

  if (!update1.ok) {
    console.error(`❌ Update failed: HTTP ${update1.status}`);
    const error = await update1.text();
    console.error(`   Response: ${error}`);
  } else {
    const updated1 = await update1.json();
    console.log(`✅ API returned: HTTP 200`);
    console.log(`   Returned price: ${updated1.price} (type: ${typeof updated1.price})`);

    // Verify in database
    const { data: dbCheck1 } = await supabase
      .from('menu_items')
      .select('price')
      .eq('id', testItem.id)
      .single();

    console.log(`   Database price: ${dbCheck1.price} (type: ${typeof dbCheck1.price})`);

    if (dbCheck1.price == testPrice1) {
      console.log('✅ Database updated correctly\n');
    } else {
      console.log(`❌ Database NOT updated (expected ${testPrice1}, got ${dbCheck1.price})\n`);
    }
  }

  // Step 4: Test price update with STRING
  console.log('🧪 Step 4: Testing price update with STRING...');
  const testPrice2 = "1234";
  const payload2 = { price: testPrice2 }; // Send as string

  console.log(`   Sending: ${JSON.stringify(payload2)}`);
  const update2 = await fetch(`${BASE_URL}/api/admin/menu-items/${testItem.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader
    },
    body: JSON.stringify(payload2),
  });

  if (!update2.ok) {
    console.error(`❌ Update failed: HTTP ${update2.status}`);
    const error = await update2.text();
    console.error(`   Response: ${error}`);
  } else {
    const updated2 = await update2.json();
    console.log(`✅ API returned: HTTP 200`);
    console.log(`   Returned price: ${updated2.price} (type: ${typeof updated2.price})`);

    // Verify in database
    const { data: dbCheck2 } = await supabase
      .from('menu_items')
      .select('price')
      .eq('id', testItem.id)
      .single();

    console.log(`   Database price: ${dbCheck2.price} (type: ${typeof dbCheck2.price})`);

    if (dbCheck2.price == testPrice2) {
      console.log('✅ Database updated correctly\n');
    } else {
      console.log(`❌ Database NOT updated (expected ${testPrice2}, got ${dbCheck2.price})\n`);
    }
  }

  // Step 5: Test full payload (like the UI sends)
  console.log('🧪 Step 5: Testing full UI-style payload...');
  const testPrice3 = 500;
  const payload3 = {
    name: testItem.name,
    description: testItem.description,
    price: String(testPrice3), // UI converts to string
    categoryId: testItem.category_id,
    imageUrl: testItem.image_url || null,
  };

  console.log(`   Sending: ${JSON.stringify(payload3)}`);
  const update3 = await fetch(`${BASE_URL}/api/admin/menu-items/${testItem.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader
    },
    body: JSON.stringify(payload3),
  });

  if (!update3.ok) {
    console.error(`❌ Update failed: HTTP ${update3.status}`);
    const error = await update3.text();
    console.error(`   Response: ${error}`);
  } else {
    const updated3 = await update3.json();
    console.log(`✅ API returned: HTTP 200`);
    console.log(`   Returned price: ${updated3.price} (type: ${typeof updated3.price})`);

    // Verify in database
    const { data: dbCheck3 } = await supabase
      .from('menu_items')
      .select('price')
      .eq('id', testItem.id)
      .single();

    console.log(`   Database price: ${dbCheck3.price} (type: ${typeof dbCheck3.price})`);

    if (dbCheck3.price == testPrice3) {
      console.log('✅ Database updated correctly\n');
    } else {
      console.log(`❌ Database NOT updated (expected ${testPrice3}, got ${dbCheck3.price})\n`);
    }
  }

  // Step 6: Restore original price
  console.log('🔄 Step 6: Restoring original price...');
  const restorePayload = { price: originalPrice };
  const restore = await fetch(`${BASE_URL}/api/admin/menu-items/${testItem.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieHeader
    },
    body: JSON.stringify(restorePayload),
  });

  if (restore.ok) {
    const { data: final } = await supabase
      .from('menu_items')
      .select('price')
      .eq('id', testItem.id)
      .single();

    console.log(`✅ Restored to: ${final.price}\n`);
  }

  // Step 7: Logout
  await supabase.auth.signOut();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('✅ DIAGNOSIS COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════');

} catch (error) {
  console.error('\n❌ FATAL ERROR:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}
