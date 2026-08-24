/**
 * Simple Runtime Verification - Contact Form & Database
 * Tests the actual running servers without browser automation
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment
const envPath = path.resolve(__dirname, '..', '.env.local');
let envContent = '';
try {
  envContent = fs.readFileSync(envPath, 'utf8');
} catch {
  try {
    envContent = fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8');
  } catch {}
}

const env = {};
envContent.split('\n').forEach(line => {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
});

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLIC_URL = 'http://localhost:8000';

const TEST_NAME = 'ZT Runtime Contact 20260822';
const TEST_EMAIL = 'runtime-contact-20260822@example.com';
const TEST_PHONE = '+254700000998';
const TEST_MESSAGE = 'Runtime E2E verification 20260822.';

console.log('=== SIMPLE RUNTIME VERIFICATION ===\n');

// Test 1: Verify server is running
console.log('TEST 1: Server Connectivity');
try {
  const response = await fetch(`${PUBLIC_URL}/pages/contact/contact.html`);
  console.log(`✓ Public server: HTTP ${response.status}`);
} catch (e) {
  console.log(`✗ Public server UNREACHABLE: ${e.message}`);
  console.log('\nSTOPPED: Cannot proceed without running server');
  process.exit(1);
}

// Test 2: Submit contact form via API
console.log('\nTEST 2: Contact Form Submission');
try {
  const formData = new URLSearchParams({
    name: TEST_NAME,
    email: TEST_EMAIL,
    phone: TEST_PHONE,
    message: TEST_MESSAGE
  });

  const response = await fetch(`${PUBLIC_URL}/api/contact`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString()
  });

  console.log(`Status: ${response.status}`);
  const text = await response.text();
  console.log(`Response: ${text.substring(0, 200)}`);
  
  if (response.ok) {
    console.log('✓ Form submission succeeded');
  } else {
    console.log('✗ Form submission failed');
  }
} catch (e) {
  console.log(`✗ Form submission error: ${e.message}`);
}

// Test 3: Database verification
console.log('\nTEST 3: Database Verification');
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.log('✗ Supabase credentials missing - cannot verify database');
} else {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    
    // Wait a moment for async processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const { data, error } = await supabase
      .from('contact_messages')
      .select('*')
      .eq('name', TEST_NAME)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.log(`✗ Database query error: ${error.message}`);
    } else {
      console.log(`Found ${data?.length || 0} record(s) matching "${TEST_NAME}"`);
      
      if (data && data.length > 0) {
        const record = data[0];
        console.log(`\nRecord details:`);
        console.log(`  ID: ${record.id}`);
        console.log(`  Name: ${record.name}`);
        console.log(`  Email: ${record.email}`);
        console.log(`  Phone: ${record.phone}`);
        console.log(`  Message: ${record.message?.substring(0, 50)}...`);
        console.log(`  Created: ${record.created_at}`);
        
        const matches = {
          name: record.name === TEST_NAME,
          email: record.email === TEST_EMAIL,
          phone: record.phone === TEST_PHONE,
          message: record.message === TEST_MESSAGE
        };
        
        console.log(`\nField verification:`);
        console.log(`  Name: ${matches.name ? '✓' : '✗'}`);
        console.log(`  Email: ${matches.email ? '✓' : '✗'}`);
        console.log(`  Phone: ${matches.phone ? '✓' : '✗'}`);
        console.log(`  Message: ${matches.message ? '✓' : '✗'}`);
        
        if (data.length > 1) {
          console.log(`\n⚠ WARNING: Found ${data.length} records (expected 1)`);
        }
        
        if (Object.values(matches).every(v => v)) {
          console.log('\n✓ Database verification PASSED');
        } else {
          console.log('\n✗ Database verification FAILED - field mismatch');
        }
      } else {
        console.log('✗ No database record found');
      }
    }
  } catch (e) {
    console.log(`✗ Database error: ${e.message}`);
  }
}

console.log('\n=== VERIFICATION COMPLETE ===');
console.log('\nNOTE: Admin dashboard verification requires manual browser check:');
console.log('Open: http://localhost:3000/dashboard/messages');
console.log(`Look for: "${TEST_NAME}"`);