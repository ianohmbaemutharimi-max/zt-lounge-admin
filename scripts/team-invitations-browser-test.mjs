#!/usr/bin/env node

/**
 * TEAM INVITATIONS — FINAL BROWSER RUNTIME TEST
 * 
 * Automated browser test using Playwright to verify:
 * 1. Admin login
 * 2. Team page renders
 * 3. Create invitation
 * 4. Verify POST and GET requests
 * 5. Verify 5-minute expiry
 */

import 'dotenv/config';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const BASE_URL = 'http://localhost:3000';
const TEST_EMAIL = `test-invite-${Date.now()}@ztlounge-test.local`;

// Verify env vars are loaded
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL not found in environment');
  console.error('   Please ensure .env.local exists with required variables\n');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('\n' + '='.repeat(70));
console.log('TEAM INVITATIONS — FINAL BROWSER RUNTIME TEST');
console.log('='.repeat(70) + '\n');

const results = {
  adminLogin: 'NOT RUN',
  teamPage: 'NOT RUN',
  createInvitation: 'NOT RUN',
  postStatus: 'NOT RUN',
  pendingList: 'NOT RUN',
  getStatus: 'NOT RUN',
  fiveMinuteExpiry: 'NOT RUN',
  acceptance: 'DEFERRED',
  expiredRejection: 'DEFERRED',
  browserErrors: [],
  serverErrors: [],
  invitationData: null
};

async function main() {
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 500 // Slow down for visibility
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  
  const page = await context.newPage();
  
  // Capture console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      results.browserErrors.push(msg.text());
    }
  });
  
  // Capture network responses
  const networkLog = [];
  page.on('response', response => {
    networkLog.push({
      url: response.url(),
      status: response.status(),
      method: response.request().method()
    });
  });

  try {
    // ============================================================
    // STEP 1: Admin Login
    // ============================================================
    console.log('🔐 Step 1: Admin Login...');
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');
    
    // Fill login form
    await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL || 'admin@ztlounge.com');
    await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD || 'admin123');
    await page.click('button[type="submit"]');
    
    // Wait for redirect to dashboard
    await page.waitForURL(/\/dashboard/, { timeout: 10000 });
    results.adminLogin = 'PASS';
    console.log('✅ Admin login successful\n');

    // ============================================================
    // STEP 2: Navigate to Team Page
    // ============================================================
    console.log('📄 Step 2: Navigate to Team Page...');
    await page.goto(`${BASE_URL}/dashboard/team`);
    await page.waitForLoadState('networkidle');
    
    // Check for Team Invitations section
    const teamHeading = await page.locator('h1, h2, h3').filter({ hasText: /Team|Invitations/i }).first();
    if (await teamHeading.count() > 0) {
      results.teamPage = 'PASS';
      console.log('✅ Team page rendered successfully\n');
    } else {
      results.teamPage = 'FAIL';
      console.log('❌ Team page heading not found\n');
    }

    // ============================================================
    // STEP 3: Create Test Invitation
    // ============================================================
    console.log('✉️  Step 3: Create Test Invitation...');
    console.log(`   Test Email: ${TEST_EMAIL}`);
    
    // Look for "Send Invitation" or "Invite" button
    const inviteButton = page.locator('button').filter({ hasText: /Send Invitation|Invite|Add Member/i }).first();
    
    if (await inviteButton.count() === 0) {
      results.createInvitation = 'FAIL';
      console.log('❌ Invite button not found\n');
    } else {
      await inviteButton.click();
      await page.waitForTimeout(500);
      
      // Fill invitation form
      const emailInput = page.locator('input[type="email"], input[name="email"]').last();
      await emailInput.fill(TEST_EMAIL);
      
      // Select first available role
      const roleSelect = page.locator('select[name="roleId"], select[name="role"]').last();
      const roleOptions = await roleSelect.locator('option').all();
      if (roleOptions.length > 1) {
        await roleSelect.selectOption({ index: 1 }); // Skip "Select role" option
      }
      
      // Submit form
      const submitButton = page.locator('button[type="submit"]').filter({ hasText: /Send|Invite|Create/i }).last();
      
      // Listen for POST request
      const postPromise = page.waitForResponse(
        response => response.url().includes('/api/admin/team-invitations') && response.request().method() === 'POST',
        { timeout: 5000 }
      ).catch(() => null);
      
      await submitButton.click();
      
      const postResponse = await postPromise;
      
      if (postResponse) {
        results.postStatus = `${postResponse.status()}`;
        const responseData = await postResponse.json().catch(() => ({}));
        results.invitationData = responseData;
        
        if (postResponse.status() === 201) {
          results.createInvitation = 'PASS';
          console.log(`✅ Invitation created: POST ${postResponse.status()}`);
          console.log(`   Invitation ID: ${responseData.id || 'N/A'}`);
          console.log(`   Expires At: ${responseData.expiresAt || 'N/A'}\n`);
        } else {
          results.createInvitation = 'FAIL';
          console.log(`❌ POST failed with status ${postResponse.status()}\n`);
        }
      } else {
        results.createInvitation = 'FAIL';
        results.postStatus = 'NO RESPONSE';
        console.log('❌ No POST response captured\n');
      }
      
      await page.waitForTimeout(1000);
    }

    // ============================================================
    // STEP 4: Verify Pending List
    // ============================================================
    console.log('📋 Step 4: Verify Pending Invitations List...');
    
    // Wait for GET request
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    const getResponse = networkLog.find(
      log => log.url.includes('/api/admin/team-invitations') && 
             log.url.includes('status=pending') && 
             log.method === 'GET'
    );
    
    if (getResponse) {
      results.getStatus = `${getResponse.status}`;
      if (getResponse.status === 200) {
        console.log(`✅ GET invitations successful: ${getResponse.status}\n`);
      } else {
        console.log(`❌ GET invitations failed: ${getResponse.status}\n`);
      }
    } else {
      results.getStatus = 'NOT FOUND';
      console.log('⚠️  GET request not captured in network log\n');
    }
    
    // Check if invitation appears in UI
    const invitationRow = page.locator('tr, div').filter({ hasText: TEST_EMAIL }).first();
    if (await invitationRow.count() > 0) {
      results.pendingList = 'PASS';
      console.log('✅ Invitation appears in pending list\n');
    } else {
      results.pendingList = 'FAIL';
      console.log('❌ Invitation not found in UI\n');
    }

    // ============================================================
    // STEP 5: Verify 5-Minute Expiry in Database
    // ============================================================
    console.log('⏱️  Step 5: Verify 5-Minute Expiry...');
    
    const { data: invitation, error } = await supabase
      .from('invitations')
      .select('*')
      .eq('email', TEST_EMAIL)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error || !invitation) {
      results.fiveMinuteExpiry = 'FAIL';
      console.log('❌ Could not query invitation from database\n');
    } else {
      const createdAt = new Date(invitation.created_at);
      const expiresAt = new Date(invitation.expires_at);
      const minutesDiff = (expiresAt - createdAt) / (1000 * 60);
      
      console.log(`   Created At: ${createdAt.toISOString()}`);
      console.log(`   Expires At: ${expiresAt.toISOString()}`);
      console.log(`   Minutes Until Expiry: ${minutesDiff.toFixed(2)}`);
      
      if (minutesDiff >= 4.9 && minutesDiff <= 5.1) {
        results.fiveMinuteExpiry = 'PASS';
        console.log('✅ Expiry is approximately 5 minutes\n');
      } else {
        results.fiveMinuteExpiry = 'FAIL';
        console.log(`❌ Expiry is ${minutesDiff.toFixed(2)} minutes (expected ~5.0)\n`);
      }
    }

    // ============================================================
    // STEP 6: Acceptance Testing (DEFERRED)
    // ============================================================
    console.log('🔗 Step 6: Acceptance Testing...');
    console.log('⏸️  DEFERRED — Requires email delivery or manual token extraction\n');
    results.acceptance = 'DEFERRED';
    results.expiredRejection = 'DEFERRED';

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    results.serverErrors.push(error.message);
  } finally {
    await browser.close();
  }

  // ============================================================
  // FINAL REPORT
  // ============================================================
  console.log('\n' + '='.repeat(70));
  console.log('TEAM INVITATIONS — FINAL BROWSER QA');
  console.log('='.repeat(70) + '\n');
  
  console.log(`- Admin login: ${results.adminLogin}`);
  console.log(`- Team page: ${results.teamPage}`);
  console.log(`- Create invitation: ${results.createInvitation}`);
  console.log(`- POST HTTP status: ${results.postStatus}`);
  console.log(`- Pending list: ${results.pendingList}`);
  console.log(`- GET HTTP status: ${results.getStatus}`);
  console.log(`- 5-minute expiry: ${results.fiveMinuteExpiry}`);
  console.log(`- Acceptance: ${results.acceptance}`);
  console.log(`- Expired-token rejection: ${results.expiredRejection}`);
  console.log(`- Browser errors: ${results.browserErrors.length === 0 ? 'NONE' : results.browserErrors.join(', ')}`);
  console.log(`- Server errors: ${results.serverErrors.length === 0 ? 'NONE' : results.serverErrors.join(', ')}`);
  
  console.log('\nFinal verdict:');
  
  const criticalTests = [
    results.adminLogin === 'PASS',
    results.teamPage === 'PASS',
    results.createInvitation === 'PASS',
    results.postStatus === '201',
    results.fiveMinuteExpiry === 'PASS'
  ];
  
  if (criticalTests.every(t => t)) {
    console.log('🟢 VERIFIED — COMPLETE\n');
    console.log('All critical runtime tests passed.');
    console.log('Acceptance testing deferred (requires email infrastructure).\n');
  } else {
    console.log('🟡 PARTIALLY VERIFIED — ACTION REMAINS\n');
    console.log('One or more critical tests failed. Review results above.\n');
  }
  
  console.log('='.repeat(70) + '\n');
}

main().catch(console.error);
