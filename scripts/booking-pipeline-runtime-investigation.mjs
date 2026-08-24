#!/usr/bin/env node

/**
 * BOOKING PIPELINE RUNTIME ERROR INVESTIGATION
 * 
 * This script performs a comprehensive runtime investigation of the booking pipeline.
 * 
 * PHASES:
 * 1. Verify website loads on localhost:3000
 * 2. Navigate to each of 6 booking pages
 * 3. Submit test bookings with unique identifiers
 * 4. Capture console errors and network activity
 * 5. Query database to verify insertion
 * 6. Identify exact failure point
 */

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const BOOKINGS = [
  {
    service: 'restaurant',
    url: 'http://localhost:3000/booking/restaurant',
    testName: 'ZT RUNTIME DEBUG RESTAURANT',
    testIdentifier: 'RUNTIME_DEBUG_RESTAURANT_20260822',
    phone: '0712345011',
    email: 'runtime-debug-restaurant@example.test',
    date: '2099-12-30',
    time: '09:00',
    guests: 2
  },
  {
    service: 'lounge-bar',
    url: 'http://localhost:3000/booking/lounge-bar',
    testName: 'ZT RUNTIME DEBUG LOUNGE',
    testIdentifier: 'RUNTIME_DEBUG_LOUNGE_20260822',
    phone: '0712345012',
    email: 'runtime-debug-lounge@example.test',
    date: '2099-12-31',
    time: '10:00',
    guests: 3
  },
  {
    service: 'vip-cabins',
    url: 'http://localhost:3000/booking/vip-cabins',
    testName: 'ZT RUNTIME DEBUG VIP',
    testIdentifier: 'RUNTIME_DEBUG_VIP_20260822',
    phone: '0712345013',
    email: 'runtime-debug-vip@example.test',
    date: '2100-01-01',
    time: '11:00',
    guests: 4
  },
  {
    service: 'events',
    url: 'http://localhost:3000/booking/events',
    testName: 'ZT RUNTIME DEBUG EVENTS',
    testIdentifier: 'RUNTIME_DEBUG_EVENTS_20260822',
    phone: '0712345014',
    email: 'runtime-debug-events@example.test',
    date: '2100-01-02',
    time: '12:00',
    guests: 5
  },
  {
    service: 'conference',
    url: 'http://localhost:3000/booking/conference',
    testName: 'ZT RUNTIME DEBUG CONFERENCE',
    testIdentifier: 'RUNTIME_DEBUG_CONFERENCE_20260822',
    phone: '0712345015',
    email: 'runtime-debug-conference@example.test',
    date: '2100-01-03',
    time: '13:00',
    guests: 6
  },
  {
    service: 'auto-spa',
    url: 'http://localhost:3000/booking/auto-spa',
    testName: 'ZT RUNTIME DEBUG AUTOSPA',
    testIdentifier: 'RUNTIME_DEBUG_AUTOSPA_20260822',
    phone: '0712345016',
    email: 'runtime-debug-autospa@example.test',
    date: '2100-01-04',
    time: '14:00',
    guests: 2
  }
];

const results = {
  timestamp: new Date().toISOString(),
  bookings: []
};

async function investigateBooking(browser, booking) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`INVESTIGATING: ${booking.service.toUpperCase()}`);
  console.log(`${'='.repeat(70)}`);

  const page = await browser.newPage();
  const bookingResult = {
    service: booking.service,
    url: booking.url,
    phases: {
      pageLoad: null,
      formFound: null,
      submitEvent: null,
      formsJsExecution: null,
      repositoryCall: null,
      rpcRequest: null,
      rpcResponse: null,
      databaseInsertion: null,
      confirmationUI: null,
      whatsAppOpen: null
    },
    errors: [],
    network: [],
    console: []
  };

  try {
    // Capture console messages
    page.on('console', msg => {
      const log = {
        type: msg.type(),
        text: msg.text(),
        location: msg.location()
      };
      bookingResult.console.push(log);
      console.log(`[CONSOLE ${msg.type().toUpperCase()}] ${msg.text()}`);
    });

    // Capture network requests
    page.on('response', response => {
      if (response.url().includes('/create_booking') || response.url().includes('supabase') || response.url().includes('booking')) {
        const networkLog = {
          url: response.url(),
          method: response.request().method(),
          status: response.status(),
          timestamp: new Date().toISOString()
        };
        bookingResult.network.push(networkLog);
        console.log(`[NETWORK] ${response.request().method()} ${response.url()} → ${response.status()}`);
      }
    });

    // Capture errors
    page.on('pageerror', error => {
      bookingResult.errors.push({
        type: 'page-error',
        message: error.message,
        stack: error.stack
      });
      console.log(`[PAGE ERROR] ${error.message}`);
    });

    // Phase 1: Load page
    console.log(`\n[PHASE 1] Loading page: ${booking.url}`);
    await page.goto(booking.url, { waitUntil: 'networkidle' });
    bookingResult.phases.pageLoad = 'SUCCESS';
    console.log('✓ Page loaded');

    // Phase 2: Find form
    console.log(`\n[PHASE 2] Finding form #reservationForm`);
    const formExists = await page.$('#reservationForm');
    if (!formExists) {
      throw new Error('Form #reservationForm not found on page');
    }
    bookingResult.phases.formFound = 'SUCCESS';
    console.log('✓ Form found');

    // Phase 3: Fill form
    console.log(`\n[PHASE 3] Filling form with test data`);
    await page.fill('input[name="fullName"]', booking.testName);
    await page.fill('input[name="phone"]', booking.phone);
    await page.fill('input[name="email"]', booking.email);
    await page.fill('input[name="bookingDate"]', booking.date);
    await page.fill('input[name="startTime"]', booking.time);
    await page.fill('input[name="guests"]', String(booking.guests));
    await page.fill('textarea[name="specialRequests"]', booking.testIdentifier);
    console.log('✓ Form filled');

    // Phase 4: Monitor form submission
    console.log(`\n[PHASE 4] Submitting form and monitoring execution`);
    
    // Listen for XHR/Fetch to create_booking
    let rpcRequestCaptured = false;
    let rpcResponseCaptured = false;
    
    page.on('request', request => {
      if (request.url().includes('create_booking')) {
        rpcRequestCaptured = true;
        console.log(`[RPC REQUEST] ${request.method()} ${request.url()}`);
        bookingResult.phases.rpcRequest = 'SENT';
        try {
          const postData = request.postDataJSON();
          console.log(`[RPC PAYLOAD] ${JSON.stringify(postData)}`);
          bookingResult.rpcPayload = postData;
        } catch (e) {
          console.log(`[RPC PAYLOAD] Could not parse as JSON`);
        }
      }
    });

    // Try to submit the form
    try {
      await Promise.race([
        page.click('button[type="submit"]'),
        new Promise(r => setTimeout(r, 2000))
      ]);
      bookingResult.phases.submitEvent = 'TRIGGERED';
      console.log('✓ Submit button clicked');
    } catch (e) {
      bookingResult.phases.submitEvent = 'FAILED';
      console.log(`✗ Submit failed: ${e.message}`);
    }

    // Wait for potential RPC response or error
    await page.waitForTimeout(3000);

    // Phase 5: Check for success/error messages
    console.log(`\n[PHASE 5] Checking for confirmation or error messages`);
    const successMessage = await page.$('[data-testid="booking-success"]');
    const errorMessage = await page.$('[data-testid="booking-error"]');
    const whatsAppButton = await page.$('a[href*="wa.me"]');

    if (successMessage) {
      bookingResult.phases.confirmationUI = 'SUCCESS_SHOWN';
      console.log('✓ Success message displayed');
    } else if (errorMessage) {
      const errorText = await errorMessage.innerText();
      bookingResult.phases.confirmationUI = `ERROR_SHOWN: ${errorText}`;
      console.log(`✗ Error message displayed: ${errorText}`);
    } else {
      bookingResult.phases.confirmationUI = 'NO_MESSAGE';
      console.log('⚠ No success or error message found');
    }

    if (whatsAppButton) {
      bookingResult.phases.whatsAppOpen = 'BUTTON_FOUND';
      console.log('⚠ WhatsApp button found');
    }

    // Phase 6: Query database
    console.log(`\n[PHASE 6] Querying database for booking insertion`);
    if (SUPABASE_URL && SUPABASE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
      
      const { data, error } = await supabase
        .from('bookings')
        .select('*')
        .ilike('special_requests', `%${booking.testIdentifier}%`)
        .single();

      if (data) {
        bookingResult.phases.databaseInsertion = 'SUCCESS';
        bookingResult.databaseBooking = data;
        console.log(`✓ Booking found in database: ID ${data.id}`);
      } else if (error?.code === 'PGRST116') {
        bookingResult.phases.databaseInsertion = 'NOT_FOUND';
        console.log('✗ Booking NOT found in database');
      } else {
        bookingResult.phases.databaseInsertion = `ERROR: ${error?.message}`;
        console.log(`✗ Database error: ${error?.message}`);
      }
    }

  } catch (error) {
    bookingResult.errors.push({
      type: 'investigation-error',
      message: error.message,
      stack: error.stack
    });
    console.log(`\n✗ INVESTIGATION FAILED: ${error.message}`);
  } finally {
    await page.close();
  }

  results.bookings.push(bookingResult);
  return bookingResult;
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║  BOOKING PIPELINE RUNTIME ERROR INVESTIGATION                      ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');

  const browser = await chromium.launch({ headless: false });

  try {
    // Investigate only the Restaurant form first
    console.log('\n🔍 PHASE 1: RESTAURANT BOOKING INVESTIGATION');
    await investigateBooking(browser, BOOKINGS[0]);

    // Ask user before continuing to other forms
    console.log('\n✓ Restaurant investigation complete. Results saved.');
    console.log('📊 Check BOOKING_PIPELINE_RUNTIME_INVESTIGATION_REPORT.json for full details.\n');

  } finally {
    await browser.close();
  }

  // Save results
  await fs.writeFile(
    'BOOKING_PIPELINE_RUNTIME_INVESTIGATION_REPORT.json',
    JSON.stringify(results, null, 2)
  );

  console.log('\n╔════════════════════════════════════════════════════════════════════╗');
  console.log('║  INVESTIGATION COMPLETE                                            ║');
  console.log('║  Report saved: BOOKING_PIPELINE_RUNTIME_INVESTIGATION_REPORT.json   ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');
}

main().catch(console.error);
