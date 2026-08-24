/**
 * ADMIN BOOKING E2E VERIFICATION
 * 
 * Real runtime test of the admin booking workflow:
 * 1. Authenticate as admin
 * 2. Navigate to /dashboard/bookings
 * 3. Create a uniquely identifiable test booking
 * 4. Verify successful submission
 * 5. Independently verify database persistence
 * 6. Verify booking appears in admin list
 * 7. Verify persistence after page reload
 * 8. Check for duplicates
 */

import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Test user credentials
const ADMIN_EMAIL = process.env.E2E_SUPER_ADMIN_EMAIL || 'e2e-super-admin@test.local';
const ADMIN_PASSWORD = process.env.E2E_SUPER_ADMIN_PASSWORD || 'E2E_TEST_PASSWORD_CHANGE_ME';

// Unique test identifier
const TEST_IDENTIFIER = `ZT-E2E-${Date.now()}`;
const TEST_SPECIAL_REQUESTS = `ZT ADMIN E2E Verification - ${TEST_IDENTIFIER}`;

interface BookingRecord {
  id: string;
  booking_number: string;
  customer_id: string | null;
  service_id: string | null;
  staff_id: string | null;
  booking_date: string;
  start_time: string;
  end_time: string;
  guests: number;
  status: string;
  special_requests: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

test.describe('Admin Booking E2E Workflow', () => {
  let supabaseClient: ReturnType<typeof createClient>;
  let bookingId: string | null = null;
  let bookingNumber: string | null = null;
  let customerId: string | null = null;
  let serviceId: string | null = null;
  let staffId: string | null = null;

  test.beforeAll(async () => {
    // Initialize Supabase client for direct database verification
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Authenticate
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });

    if (error) {
      throw new Error(`Failed to authenticate: ${error.message}. Check E2E_SUPER_ADMIN_EMAIL and E2E_SUPER_ADMIN_PASSWORD.`);
    }

    if (!data.session) {
      throw new Error('No session returned after authentication');
    }

    console.log('✓ Authenticated for database verification');

    // Fetch available customers
    const { data: customer, error: custError } = await supabaseClient
      .from('customers')
      .select('id')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (custError) {
      console.warn(`⚠ Could not query customers: ${custError.message}`);
    } else if (customer) {
      customerId = customer.id;
      console.log(`✓ Found customer: ${customerId}`);
    } else {
      console.warn('⚠ No active customers found - will need to create one first');
    }

    // Fetch available services
    const { data: service, error: svcError } = await supabaseClient
      .from('services')
      .select('id')
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (svcError) {
      console.warn(`⚠ Could not query services: ${svcError.message}`);
    } else if (service) {
      serviceId = service.id;
      console.log(`✓ Found service: ${serviceId}`);
    } else {
      console.warn('⚠ No services found - will need to create one first');
    }

    // Fetch available staff
    const { data: staffMember, error: staffError } = await supabaseClient
      .from('staff')
      .select('id')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle<{ id: string }>();

    if (staffError) {
      console.warn(`⚠ Could not query staff: ${staffError.message}`);
    } else if (staffMember) {
      staffId = staffMember.id;
      console.log(`✓ Found staff: ${staffId}`);
    } else {
      console.warn('⚠ No active staff found - will need to create one first');
    }
  });

  test.afterAll(async () => {
    // Cleanup: Delete test booking if created
    if (bookingId) {
      await supabaseClient.from('bookings').delete().eq('id', bookingId);
      console.log(`✓ Cleaned up test booking: ${bookingId}`);
    }
  });

  test('Admin can create, persist, and view booking', async ({ page }) => {
    const report: Record<string, any> = {
      testId: TEST_IDENTIFIER,
      timestamp: new Date().toISOString(),
      checks: {},
    };

    try {
      // ============================================================
      // PHASE 1: AUTHENTICATE
      // ============================================================
      console.log('\n📋 PHASE 1: Admin Authentication');
      
      await page.goto(`${BASE_URL}/login`);
      await page.fill('input[type="email"]', ADMIN_EMAIL);
      await page.fill('input[type="password"]', ADMIN_PASSWORD);
      await page.click('button[type="submit"]');

      // Wait for redirect to dashboard
      await page.waitForURL('**/dashboard**', { timeout: 10000 });
      report.checks.authentication = 'PASS';
      console.log('✓ Admin authentication successful');

      // ============================================================
      // PHASE 2: NAVIGATE TO BOOKINGS
      // ============================================================
      console.log('\n📋 PHASE 2: Navigate to Bookings');
      
      await page.goto(`${BASE_URL}/dashboard/bookings`);
      await page.waitForLoadState('networkidle');
      
      // Check for booking management UI
      const hasBookingsTitle = await page.locator('text=/Bookings/i').isVisible();
      expect(hasBookingsTitle).toBeTruthy();
      report.checks.navigation = 'PASS';
      console.log('✓ Bookings page loaded');

      // ============================================================
      // PHASE 3: OPEN BOOKING FORM
      // ============================================================
      console.log('\n📋 PHASE 3: Open Booking Form');
      
      // Look for "Add Booking" or "New Booking" button
      const addButton = page.locator('button').filter({ hasText: /Add Booking|New Booking|\+/i }).first();
      await addButton.click();
      await page.waitForTimeout(1000);

      // Wait for modal/form to appear
      const formVisible = await page.locator('text=/New Booking|Create Booking/i').isVisible();
      expect(formVisible).toBeTruthy();
      report.checks.formOpen = 'PASS';
      console.log('✓ Booking form opened');

      // ============================================================
      // PHASE 4: FILL BOOKING FORM
      // ============================================================
      console.log('\n📋 PHASE 4: Fill Booking Form');
      
      // Ensure we have required data
      if (!customerId) {
        throw new Error('No customer available - cannot create booking');
      }
      if (!serviceId) {
        throw new Error('No service available - cannot create booking');
      }
      if (!staffId) {
        throw new Error('No staff available - cannot create booking');
      }

      // Calculate tomorrow's date
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const bookingDate = tomorrow.toISOString().split('T')[0];

      // Fill form fields
      await page.selectOption('select[name="customerId"]', customerId);
      await page.selectOption('select[name="serviceId"]', serviceId);
      await page.selectOption('select[name="staffId"]', staffId);
      await page.fill('input[name="bookingDate"]', bookingDate);
      await page.fill('input[name="startTime"]', '18:00');
      await page.fill('input[name="endTime"]', '20:00');
      await page.fill('input[name="guests"]', '4');
      
      // Fill special requests with unique identifier
      const specialRequestsField = page.locator('textarea[name="specialRequests"], input[name="specialRequests"]');
      if (await specialRequestsField.isVisible()) {
        await specialRequestsField.fill(TEST_SPECIAL_REQUESTS);
      }

      report.checks.formFilled = 'PASS';
      console.log('✓ Booking form filled');

      // ============================================================
      // PHASE 5: SUBMIT BOOKING
      // ============================================================
      console.log('\n📋 PHASE 5: Submit Booking');
      
      // Listen for network request
      const requestPromise = page.waitForResponse(
        (response) => response.url().includes('/api/admin/') && response.request().method() === 'POST',
        { timeout: 10000 }
      );

      // Submit form
      await page.click('button[type="submit"]');

      // Wait for API response
      const response = await requestPromise;
      const status = response.status();
      
      expect(status).toBeLessThan(400);
      report.checks.submissionStatus = status;
      report.checks.submission = 'PASS';
      console.log(`✓ Booking submitted (HTTP ${status})`);

      // Get response body to extract booking details
      try {
        const responseBody = await response.json();
        bookingId = responseBody.id;
        bookingNumber = responseBody.booking_number || responseBody.bookingNumber;
        report.bookingId = bookingId;
        report.bookingNumber = bookingNumber;
        console.log(`✓ Booking created: ${bookingNumber} (ID: ${bookingId})`);
      } catch (e) {
        console.warn('⚠ Could not parse response body');
      }

      // Wait for modal to close
      await page.waitForTimeout(2000);
      report.checks.modalClose = 'PASS';

      // ============================================================
      // PHASE 6: VERIFY NO CONSOLE ERRORS
      // ============================================================
      console.log('\n📋 PHASE 6: Check Console Errors');
      
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          errors.push(msg.text());
        }
      });

      await page.waitForTimeout(1000);
      
      if (errors.length > 0) {
        console.warn('⚠ Console errors detected:', errors);
        report.checks.consoleErrors = errors;
      } else {
        report.checks.browserConsole = 'PASS';
        console.log('✓ No browser console errors');
      }

      // ============================================================
      // PHASE 7: VERIFY DATABASE PERSISTENCE
      // ============================================================
      console.log('\n📋 PHASE 7: Verify Database Persistence');
      
      await page.waitForTimeout(2000); // Allow database write to complete

      let dbRecord: BookingRecord | null = null;

      if (bookingId) {
        const { data, error } = await supabaseClient
          .from('bookings')
          .select('*')
          .eq('id', bookingId)
          .single();

        if (error) {
          throw new Error(`Database query failed: ${error.message}`);
        }

        dbRecord = data as BookingRecord;
      } else {
        // Fallback: search by special requests
        const { data, error } = await supabaseClient
          .from('bookings')
          .select('*')
          .ilike('special_requests', `%${TEST_IDENTIFIER}%`)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (error) {
          throw new Error(`Database query failed: ${error.message}`);
        }

        dbRecord = data as BookingRecord;
        bookingId = dbRecord?.id;
        bookingNumber = dbRecord?.booking_number;
      }

      expect(dbRecord).toBeTruthy();
      report.databaseRecord = dbRecord;
      
      // Verify key fields
      expect(dbRecord!.customer_id).toBe(customerId);
      expect(dbRecord!.service_id).toBe(serviceId);
      expect(dbRecord!.staff_id).toBe(staffId);
      expect(dbRecord!.booking_date).toBe(bookingDate);
      expect(dbRecord!.start_time).toContain('18:00');
      expect(dbRecord!.end_time).toContain('20:00');
      expect(dbRecord!.guests).toBe(4);
      expect(dbRecord!.status).toBe('pending');
      expect(dbRecord!.special_requests).toContain(TEST_IDENTIFIER);

      report.checks.databasePersistence = 'PASS';
      console.log('✓ Database record verified');
      console.log(`  Booking Number: ${dbRecord!.booking_number}`);
      console.log(`  Status: ${dbRecord!.status}`);
      console.log(`  Created: ${dbRecord!.created_at}`);

      // ============================================================
      // PHASE 8: VERIFY BOOKING APPEARS IN LIST
      // ============================================================
      console.log('\n📋 PHASE 8: Verify Booking in Admin List');
      
      // Reload page to ensure fresh data
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Search for booking number in the page
      const bookingVisible = await page.locator(`text=${bookingNumber}`).isVisible();
      expect(bookingVisible).toBeTruthy();
      
      report.checks.adminListVisibility = 'PASS';
      console.log('✓ Booking appears in admin list');

      // ============================================================
      // PHASE 9: CHECK FOR DUPLICATES
      // ============================================================
      console.log('\n📋 PHASE 9: Check for Duplicates');
      
      const { data: duplicates, error: dupError } = await supabaseClient
        .from('bookings')
        .select('id')
        .ilike('special_requests', `%${TEST_IDENTIFIER}%`);

      if (dupError) {
        throw new Error(`Duplicate check failed: ${dupError.message}`);
      }

      expect(duplicates).toHaveLength(1);
      report.checks.duplicateCheck = 'PASS';
      report.checks.duplicateCount = duplicates?.length || 0;
      console.log(`✓ No duplicates found (${duplicates?.length} record)`);

      // ============================================================
      // PHASE 10: FINAL REPORT
      // ============================================================
      console.log('\n' + '='.repeat(60));
      console.log('ADMIN BOOKING E2E VERIFICATION REPORT');
      console.log('='.repeat(60));
      console.log(`Test ID: ${TEST_IDENTIFIER}`);
      console.log(`Booking ID: ${bookingId}`);
      console.log(`Booking Number: ${bookingNumber}`);
      console.log('');
      console.log('CHECKS:');
      console.log(`  ✓ Admin authentication: ${report.checks.authentication}`);
      console.log(`  ✓ Navigation: ${report.checks.navigation}`);
      console.log(`  ✓ Form open: ${report.checks.formOpen}`);
      console.log(`  ✓ Form filled: ${report.checks.formFilled}`);
      console.log(`  ✓ Submission (HTTP ${report.checks.submissionStatus}): ${report.checks.submission}`);
      console.log(`  ✓ Database persistence: ${report.checks.databasePersistence}`);
      console.log(`  ✓ Admin list visibility: ${report.checks.adminListVisibility}`);
      console.log(`  ✓ Refresh persistence: PASS`);
      console.log(`  ✓ Duplicate check: ${report.checks.duplicateCheck}`);
      console.log(`  ✓ Browser console: ${report.checks.browserConsole || 'WARNINGS'}`);
      console.log('');
      console.log('DATABASE RECORD:');
      console.log(`  booking_number: ${dbRecord!.booking_number}`);
      console.log(`  status: ${dbRecord!.status}`);
      console.log(`  customer_id: ${dbRecord!.customer_id}`);
      console.log(`  service_id: ${dbRecord!.service_id}`);
      console.log(`  staff_id: ${dbRecord!.staff_id}`);
      console.log(`  booking_date: ${dbRecord!.booking_date}`);
      console.log(`  start_time: ${dbRecord!.start_time}`);
      console.log(`  end_time: ${dbRecord!.end_time}`);
      console.log(`  guests: ${dbRecord!.guests}`);
      console.log(`  created_at: ${dbRecord!.created_at}`);
      console.log('');
      console.log('FINAL VERDICT: 🟢 ADMIN BOOKING E2E VERIFIED');
      console.log('='.repeat(60));

      // Write report to file
      const fs = await import('fs');
      fs.writeFileSync(
        `ADMIN_BOOKING_E2E_REPORT_${Date.now()}.json`,
        JSON.stringify(report, null, 2)
      );

    } catch (error) {
      report.error = error instanceof Error ? error.message : String(error);
      report.finalVerdict = '🔴 ADMIN BOOKING FAILED';
      
      console.log('\n' + '='.repeat(60));
      console.log('ADMIN BOOKING E2E VERIFICATION REPORT');
      console.log('='.repeat(60));
      console.log('FINAL VERDICT: 🔴 ADMIN BOOKING FAILED');
      console.log('');
      console.log('ERROR:', report.error);
      console.log('='.repeat(60));

      throw error;
    }
  });
});
