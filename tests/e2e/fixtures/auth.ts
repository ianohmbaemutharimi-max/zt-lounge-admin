/**
 * E2E Authentication Fixtures
 * 
 * Provides real Supabase authentication for E2E tests.
 * Uses credentials from environment variables to authenticate
 * with the actual Supabase instance.
 */

import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export interface TestUser {
  email: string;
  password: string;
  role: string;
}

/**
 * Test users for E2E testing.
 * These must be created in Supabase auth and assigned appropriate roles.
 */
export const testUsers: Record<string, TestUser> = {
  super_admin: {
    email: process.env.E2E_SUPER_ADMIN_EMAIL || 'e2e-super-admin@test.local',
    password: process.env.E2E_SUPER_ADMIN_PASSWORD || 'E2E_TEST_PASSWORD_CHANGE_ME',
    role: 'super_admin',
  },
  admin: {
    email: process.env.E2E_ADMIN_EMAIL || 'e2e-admin@test.local',
    password: process.env.E2E_ADMIN_PASSWORD || 'E2E_TEST_PASSWORD_CHANGE_ME',
    role: 'admin',
  },
  manager: {
    email: process.env.E2E_MANAGER_EMAIL || 'e2e-manager@test.local',
    password: process.env.E2E_MANAGER_PASSWORD || 'E2E_TEST_PASSWORD_CHANGE_ME',
    role: 'manager',
  },
  receptionist: {
    email: process.env.E2E_RECEPTIONIST_EMAIL || 'e2e-receptionist@test.local',
    password: process.env.E2E_RECEPTIONIST_PASSWORD || 'E2E_TEST_PASSWORD_CHANGE_ME',
    role: 'receptionist',
  },
  staff: {
    email: process.env.E2E_STAFF_EMAIL || 'e2e-staff@test.local',
    password: process.env.E2E_STAFF_PASSWORD || 'E2E_TEST_PASSWORD_CHANGE_ME',
    role: 'staff',
  },
};

/**
 * Create an authenticated Supabase client for a specific test user.
 * 
 * @param userRole - The role of the test user to authenticate as
 * @returns Authenticated Supabase client
 */
export async function createAuthenticatedClient(
  userRole: string = 'super_admin'
): Promise<SupabaseClient> {
  const user = testUsers[userRole as keyof typeof testUsers];
  if (!user) {
    throw new Error(`Test user '${userRole}' not found`);
  }

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data, error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });

  if (error) {
    throw new Error(
      `Failed to authenticate as ${userRole}: ${error.message}. ` +
      `Ensure E2E_${userRole.toUpperCase()}_EMAIL and E2E_${userRole.toUpperCase()}_PASSWORD are set correctly.`
    );
  }

  if (!data.session) {
    throw new Error(`No session returned for ${userRole}`);
  }

  return client;
}

/**
 * Get the JWT token for a specific test user.
 * Useful for API testing via Bearer token.
 */
export async function getAuthToken(userRole: string = 'super_admin'): Promise<string> {
  const client = await createAuthenticatedClient(userRole);
  const { data } = await client.auth.getSession();
  
  if (!data.session?.access_token) {
    throw new Error(`No access token for ${userRole}`);
  }

  return data.session.access_token;
}

/**
 * Check if test credentials are properly configured.
 */
export function areTestCredentialsConfigured(): boolean {
  return (
    SUPABASE_URL.length > 0 &&
    SUPABASE_ANON_KEY.length > 0 &&
    (process.env.E2E_SUPER_ADMIN_EMAIL?.length ?? 0) > 0 &&
    (process.env.E2E_SUPER_ADMIN_PASSWORD?.length ?? 0) > 0
  );
}
