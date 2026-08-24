/**
 * Global Setup for E2E Tests
 * Runs once before all tests
 */

import { chromium, FullConfig } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

async function globalSetup(config: FullConfig) {
  console.log('\n' + '='.repeat(60));
  console.log('ZT LOUNGE E2E TEST SUITE - GLOBAL SETUP');
  console.log('='.repeat(60));

  // Load .env.local if it exists
  const envLocalPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envLocalPath)) {
    console.log('\n📁 Loading environment from .env.local');
    dotenv.config({ path: envLocalPath });
  } else {
    console.log('\n⚠️  .env.local not found - using system environment variables');
  }

  // Verify environment
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const e2eEmail = process.env.E2E_SUPER_ADMIN_EMAIL;
  const e2ePassword = process.env.E2E_SUPER_ADMIN_PASSWORD;

  console.log('\n📋 Environment Check:');
  console.log(`  ✓ Supabase URL: ${supabaseUrl ? 'SET' : 'MISSING'}`);
  console.log(`  ✓ Supabase Key: ${supabaseKey ? 'SET' : 'MISSING'}`);
  console.log(`  ✓ E2E Email: ${e2eEmail ? 'SET' : 'MISSING'}`);
  console.log(`  ✓ E2E Password: ${e2ePassword ? 'SET' : 'MISSING'}`);

  if (!supabaseUrl || !supabaseKey) {
    console.log('\n⚠️  Supabase configuration incomplete. API tests will run but DB verification will be limited.');
  }

  if (!e2eEmail || !e2ePassword) {
    console.log('\n⚠️  E2E credentials not configured. RBAC and authenticated tests will be SKIPPED.');
    console.log('   Set E2E_SUPER_ADMIN_EMAIL and E2E_SUPER_ADMIN_PASSWORD to enable full testing.');
  }

  console.log('\n✓ Global setup complete\n');
}

export default globalSetup;
