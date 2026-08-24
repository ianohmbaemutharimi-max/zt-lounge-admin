#!/usr/bin/env node

/**
 * ZT LOUNGE BOOKING PIPELINE
 * PHASE 2A-EXTENDED — INSPECT EXISTING BOOKING INFRASTRUCTURE
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log('🔍 INSPECTING EXISTING BOOKING INFRASTRUCTURE');
  console.log('='.repeat(60));
  
  // 1. Check existing bookings data
  console.log('\n📋 EXISTING BOOKINGS DATA:');
  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('*')
    .limit(5);
  
  if (bookingsError) {
    console.log('❌ Error:', bookingsError.message);
  } else {
    console.log(`Found ${bookings?.length || 0} bookings`);
    if (bookings && bookings.length > 0) {
      console.log('\nSample booking structure:');
      console.log(JSON.stringify(bookings[0], null, 2));
      
      console.log('\nAll columns:');
      console.log(Object.keys(bookings[0]).join(', '));
    } else {
      // Query with limit 0 to get column structure
      const { data: structure } = await supabase
        .from('bookings')
        .select('*')
        .limit(0);
      
      console.log('Table exists but is empty');
    }
  }
  
  // 2. Test existing create_booking RPC
  console.log('\n\n📞 TESTING EXISTING create_booking RPC:');
  try {
    const { data, error } = await supabase.rpc('create_booking', {
      p_full_name: 'Test Customer',
      p_phone: '+254700000000',
      p_booking_date: '2026-08-25',
      p_start_time: '14:00',
      p_guests: 2,
      p_email: 'test@example.com',
      p_service_slug: 'restaurant',
      p_special_requests: 'Test booking from inspection script'
    });
    
    if (error) {
      console.log('❌ RPC Error:', error.message);
      console.log('Full error:', JSON.stringify(error, null, 2));
    } else {
      console.log('✅ RPC executed successfully!');
      console.log('Returned data:');
      console.log(JSON.stringify(data, null, 2));
      
      // Clean up test booking
      if (data?.booking_id) {
        console.log('\n🧹 Cleaning up test booking...');
        await supabase
          .from('bookings')
          .delete()
          .eq('id', data.booking_id);
        console.log('✅ Test booking deleted');
      }
    }
  } catch (e) {
    console.log('❌ Exception:', e.message);
  }
  
  // 3. Check existing booking count
  console.log('\n\n📊 BOOKING STATISTICS:');
  const { count, error: countError } = await supabase
    .from('bookings')
    .select('*', { count: 'exact', head: true });
  
  if (countError) {
    console.log('❌ Error getting count:', countError.message);
  } else {
    console.log(`Total bookings in database: ${count}`);
  }
  
  // 4. Check status values
  console.log('\n\n📋 EXISTING STATUS VALUES:');
  const { data: statuses } = await supabase
    .from('bookings')
    .select('status')
    .limit(100);
  
  if (statuses) {
    const uniqueStatuses = [...new Set(statuses.map(s => s.status))];
    console.log('Found statuses:', uniqueStatuses.join(', '));
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Inspection complete');
}

main().catch(error => {
  console.error('❌ Inspection failed:', error);
  process.exit(1);
});
