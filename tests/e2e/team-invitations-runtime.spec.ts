/**
 * Team Invitations Runtime E2E Test
 * 
 * Tests the complete Team Invitations workflow with real authentication,
 * real database operations, and full security verification.
 */

import { test, expect } from '@playwright/test';
import { createAuthenticatedClient, getAuthToken } from './fixtures/auth';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

test.describe('Team Invitations Runtime Verification', () => {
  let adminToken: string;
  let testInvitationId: string;
  const testEmail = `e2e-test-${Date.now()}@test.local`;

  test.beforeAll(async () => {
    // Get authenticated admin token
    try {
      adminToken = await getAuthToken('super_admin');
      console.log('[AUTH] Successfully obtained super_admin token');
    } catch (error) {
      console.error('[AUTH] Failed to authenticate:', error);
      throw error;
    }
  });

  test('Phase 1: GET /api/admin/team-invitations returns 200', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/admin/team-invitations?status=pending`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`,
      },
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    console.log(`[GET] Retrieved ${data.invitations?.length || 0} pending invitations`);
    
    expect(Array.isArray(data.invitations)).toBeTruthy();
  });

  test('Phase 2: POST /api/admin/team-invitations creates invitation', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/admin/team-invitations`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        email: testEmail,
        role_id: 1, // Assuming role_id 1 exists (manager or similar)
      },
    });

    expect(response.status()).toBe(201);
    const data = await response.json();
    
    expect(data.invitation).toBeDefined();
    expect(data.invitation.email).toBe(testEmail);
    expect(data.invitation.status).toBe('pending');
    expect(data.invitation.expires_at).toBeDefined();
    expect(data.invitation.token_hash).toBeDefined();
    
    // Store for later tests
    testInvitationId = data.invitation.id;
    
    console.log(`[POST] Created invitation ID: ${testInvitationId}`);
    console.log(`[POST] Email: ${testEmail}`);
    console.log(`[POST] Status: ${data.invitation.status}`);
    console.log(`[POST] Expires: ${data.invitation.expires_at}`);
  });

  test('Phase 3: GET retrieves the created invitation', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/admin/team-invitations?status=pending`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`,
      },
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    
    const found = data.invitations.find((inv: any) => inv.email === testEmail);
    expect(found).toBeDefined();
    expect(found.id).toBe(testInvitationId);
    
    console.log(`[GET] Found created invitation in list`);
  });

  test('Phase 4: Duplicate pending invitation is prevented', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/api/admin/team-invitations`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        email: testEmail,
        role_id: 1, // Same email + same role
      },
    });

    // Should fail with 409 Conflict or 400 Bad Request
    expect([400, 409]).toContain(response.status());
    
    console.log(`[DUPLICATE] Correctly rejected duplicate invitation (status: ${response.status()})`);
  });

  test('Phase 5: Unauthorized access is blocked', async ({ request }) => {
    const response = await request.get(`${BASE_URL}/api/admin/team-invitations?status=pending`);
    
    // Should return 401 Unauthorized
    expect([401, 403]).toContain(response.status());
    
    console.log(`[SECURITY] Correctly blocked unauthorized access (status: ${response.status()})`);
  });

  test('Phase 6: Cleanup - Delete test invitation', async ({ request }) => {
    if (!testInvitationId) {
      console.log('[CLEANUP] No invitation to delete');
      return;
    }

    const response = await request.delete(
      `${BASE_URL}/api/admin/team-invitations/${testInvitationId}`,
      {
        headers: {
          'Authorization': `Bearer ${adminToken}`,
        },
      }
    );

    expect([200, 204]).toContain(response.status());
    console.log(`[CLEANUP] Deleted test invitation ${testInvitationId}`);
  });

  test('Phase 7: Team page renders without errors', async ({ page }) => {
    // Set up auth cookies
    const client = await createAuthenticatedClient('super_admin');
    const { data: session } = await client.auth.getSession();
    
    if (session.session) {
      await page.context().addCookies([
        {
          name: 'sb-access-token',
          value: session.session.access_token,
          domain: 'localhost',
          path: '/',
          httpOnly: false,
          secure: false,
          sameSite: 'Lax',
        },
        {
          name: 'sb-refresh-token',
          value: session.session.refresh_token,
          domain: 'localhost',
          path: '/',
          httpOnly: false,
          secure: false,
          sameSite: 'Lax',
        },
      ]);
    }

    const consoleLogs: string[] = [];
    const consoleErrors: string[] = [];
    
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      } else {
        consoleLogs.push(msg.text());
      }
    });

    await page.goto(`${BASE_URL}/dashboard/team`);
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Check for page title or expected element
    const titleVisible = await page.locator('h1, h2').first().isVisible().catch(() => false);
    expect(titleVisible).toBeTruthy();
    
    // Log any console errors
    if (consoleErrors.length > 0) {
      console.log('[BROWSER] Console errors detected:');
      consoleErrors.forEach(err => console.log(`  - ${err}`));
    } else {
      console.log('[BROWSER] No console errors detected');
    }
    
    // Should not have critical errors
    const criticalErrors = consoleErrors.filter(e => 
      !e.includes('favicon') && 
      !e.includes('_next/static') &&
      !e.includes('DevTools')
    );
    expect(criticalErrors.length).toBe(0);
  });
});
