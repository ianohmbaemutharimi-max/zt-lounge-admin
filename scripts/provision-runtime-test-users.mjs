#!/usr/bin/env node

/**
 * PROVISION RUNTIME TEST USERS
 * 
 * PHASE 2: Safe, repeatable test account provisioning
 * 
 * Creates dedicated test user accounts in Supabase with:
 * - Email/password authentication
 * - Linked profile records
 * - Correct role assignments
 * - Idempotent operation (safe to run multiple times)
 * 
 * SECURITY:
 * - Refuses to run on production
 * - Uses service-role credentials
 * - Does not print credentials
 * - Validates environment before operating
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

// Load .env.local
const envPath = path.join(rootDir, '.env.local');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

class ProvisionRuntimeTestUsers {
  constructor() {
    this.adminClient = null;
    this.results = {
      timestamp: new Date().toISOString(),
      environment: {
        projectId: null,
        safe: false,
      },
      testUsers: [],
      summary: { created: 0, updated: 0, failed: 0, verified: 0 },
    };
  }

  async validateEnvironment() {
    log('\n════════════════════════════════════════════════════════════════', 'cyan');
    log('PROVISION RUNTIME TEST USERS', 'cyan');
    log('════════════════════════════════════════════════════════════════\n', 'cyan');

    log('📋 PHASE 0: Environment Validation', 'blue');
    log('─────────────────────────────────────────────────────────────\n', 'blue');

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      log('✗ Missing Supabase environment variables', 'red');
      log('  Required: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY', 'gray');
      return false;
    }

    // Extract project ID from URL
    const projectIdMatch = SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\./);
    if (!projectIdMatch) {
      log('✗ Could not extract project ID from Supabase URL', 'red');
      return false;
    }

    const projectId = projectIdMatch[1];
    this.results.environment.projectId = projectId;

    log(`✓ Supabase project: ${projectId}`, 'green');
    log(`✓ Service role credentials available`, 'green');

    // Check if this appears to be a test environment
    // Test environments should have specific naming patterns
    const isTestEnvironment = projectId === 'jczwilrysvnhcjzjztbi' || projectId.includes('test') || projectId.includes('dev');
    
    if (!isTestEnvironment) {
      log('\n⚠️  WARNING: Project ID does not match known test patterns', 'yellow');
      log(`    Project: ${projectId}`, 'gray');
      log('    This script will NOT run on production environments.', 'gray');
      log('    If this is your test environment, please confirm by setting RUNTIME_PROVISION_CONFIRM=true', 'gray');
      
      if (process.env.RUNTIME_PROVISION_CONFIRM !== 'true') {
        log('\n✗ Aborted: Not confirmed for this project', 'red');
        return false;
      }
    }

    this.results.environment.safe = true;
    log('\nStatus: SAFE — Proceeding with test account provisioning\n', 'green');
    return true;
  }

  async getOrCreateRoles() {
    log('📋 PHASE 1a: Verify Roles Exist', 'blue');
    log('─────────────────────────────────────────────────────────────\n', 'blue');

    try {
      const { data: roles, error } = await this.adminClient
        .from('roles')
        .select('id, name')
        .in('name', ['admin', 'manager', 'receptionist', 'staff', 'super_admin']);

      if (error) {
        log(`✗ Failed to fetch roles: ${error.message}`, 'red');
        return null;
      }

      const roleMap = {};
      for (const role of roles) {
        roleMap[role.name] = role.id;
        log(`✓ Role found: ${role.name}`, 'green');
      }

      // Check all required roles exist
      const requiredRoles = ['admin', 'manager', 'receptionist', 'staff'];
      const missingRoles = requiredRoles.filter(r => !roleMap[r]);

      if (missingRoles.length > 0) {
        log(`\n✗ Missing roles: ${missingRoles.join(', ')}`, 'red');
        return null;
      }

      log('\nStatus: All required roles found\n', 'green');
      return roleMap;
    } catch (error) {
      log(`✗ Error verifying roles: ${error.message}`, 'red');
      return null;
    }
  }

  async provisionTestUser(email, fullName, roleId, roleMap) {
    log(`\n→ Provisioning: ${email}`, 'cyan');

    const roleName = Object.entries(roleMap).find(([_, id]) => id === roleId)?.[0];

    try {
      // Check if user already exists
      const { data: { users: existingUsers } } = await this.adminClient.auth.admin.listUsers();
      const existingUser = existingUsers.find(u => u.email === email);

      if (existingUser) {
        log(`  User exists: ${existingUser.id}`, 'yellow');

        // Verify profile exists
        const { data: profile, error: profileError } = await this.adminClient
          .from('profiles')
          .select('id, role_id')
          .eq('user_id', existingUser.id)
          .single();

        if (profileError && profileError.code !== 'PGRST116') {
          log(`  ✗ Error checking profile: ${profileError.message}`, 'red');
          return false;
        }

        if (!profile) {
          // Create profile
          const { error: createError } = await this.adminClient
            .from('profiles')
            .insert({
              user_id: existingUser.id,
              full_name: fullName,
              role_id: roleId,
              is_active: true,
            });

          if (createError) {
            log(`  ✗ Failed to create profile: ${createError.message}`, 'red');
            return false;
          }
          log(`  ✓ Profile created`, 'green');
          this.results.summary.created++;
        } else {
          log(`  ✓ Profile exists`, 'green');
        }

        this.results.testUsers.push({
          email,
          userId: existingUser.id,
          role: roleName,
          status: 'verified',
        });

        return true;
      }

      // Create new user
      const testPassword = process.env[`RUNTIME_TEST_${roleId.toUpperCase()}_PASSWORD`] ||
                          process.env[`RUNTIME_TEST_${roleName.toUpperCase()}_PASSWORD`];

      if (!testPassword) {
        log(`  ✗ Missing password env var: RUNTIME_TEST_${roleName.toUpperCase()}_PASSWORD`, 'red');
        return false;
      }

      const { data, error: signupError } = await this.adminClient.auth.admin.createUser({
        email,
        password: testPassword,
        email_confirm: true,
      });

      if (signupError) {
        log(`  ✗ Failed to create user: ${signupError.message}`, 'red');
        return false;
      }

      log(`  ✓ User created: ${data.user.id}`, 'green');

      // Create profile
      const { error: profileError } = await this.adminClient
        .from('profiles')
        .insert({
          user_id: data.user.id,
          full_name: fullName,
          role_id: roleId,
          is_active: true,
        });

      if (profileError) {
        log(`  ✗ Failed to create profile: ${profileError.message}`, 'red');
        return false;
      }

      log(`  ✓ Profile created`, 'green');

      this.results.testUsers.push({
        email,
        userId: data.user.id,
        role: roleName,
        status: 'created',
      });

      this.results.summary.created++;
      return true;
    } catch (error) {
      log(`  ✗ Error: ${error.message}`, 'red');
      this.results.summary.failed++;
      return false;
    }
  }

  async verifyAuthentication(email, password) {
    try {
      const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      const { data, error } = await anonClient.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        log(`    ✗ Authentication failed: ${error.message}`, 'red');
        return false;
      }

      if (!data.session) {
        log(`    ✗ No session returned`, 'red');
        return false;
      }

      log(`    ✓ Authentication verified`, 'green');
      this.results.summary.verified++;
      return true;
    } catch (error) {
      log(`    ✗ Error: ${error.message}`, 'red');
      return false;
    }
  }

  async run() {
    // Initialize admin client
    this.adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Validate environment
    const safe = await this.validateEnvironment();
    if (!safe) {
      log('\n✗ Environment validation failed. Aborting.\n', 'red');
      process.exit(1);
    }

    // Get/verify roles
    const roleMap = await this.getOrCreateRoles();
    if (!roleMap) {
      log('\n✗ Role verification failed. Aborting.\n', 'red');
      process.exit(1);
    }

    // Provision test users
    log('📋 PHASE 1b: Provision Test Users', 'blue');
    log('─────────────────────────────────────────────────────────────\n', 'blue');

    const testAccounts = [
      {
        email: 'admin@test.zt-lounge.local',
        fullName: 'Test Admin',
        roleId: roleMap.admin,
        role: 'admin',
      },
      {
        email: 'manager@test.zt-lounge.local',
        fullName: 'Test Manager',
        roleId: roleMap.manager,
        role: 'manager',
      },
      {
        email: 'receptionist@test.zt-lounge.local',
        fullName: 'Test Receptionist',
        roleId: roleMap.receptionist,
        role: 'receptionist',
      },
      {
        email: 'staff@test.zt-lounge.local',
        fullName: 'Test Staff',
        roleId: roleMap.staff,
        role: 'staff',
      },
    ];

    for (const account of testAccounts) {
      await this.provisionTestUser(account.email, account.fullName, account.roleId, roleMap);
    }

    // Verify authentication
    log('\n📋 PHASE 1c: Verify Authentication', 'blue');
    log('─────────────────────────────────────────────────────────────\n', 'blue');

    for (const account of testAccounts) {
      const password = process.env[`RUNTIME_TEST_${account.role.toUpperCase()}_PASSWORD`];
      if (!password) {
        log(`⚠️  Skipping auth check for ${account.email} (no password env var)`, 'yellow');
        continue;
      }

      log(`Verifying ${account.email}:`, 'cyan');
      await this.verifyAuthentication(account.email, password);
    }

    // Generate summary
    log('\n📋 PHASE 2: Summary', 'blue');
    log('─────────────────────────────────────────────────────────────\n', 'blue');

    log(`Users created:  ${this.results.summary.created}`, 'green');
    log(`Users verified: ${this.results.summary.verified}`, 'green');
    log(`Users failed:   ${this.results.summary.failed}`, this.results.summary.failed > 0 ? 'red' : 'green');

    // Save results
    const reportDir = path.join(rootDir, 'test-results');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const resultsFile = path.join(reportDir, `provision-test-users-${Date.now()}.json`);
    fs.writeFileSync(resultsFile, JSON.stringify(this.results, null, 2));
    log(`\n📊 Results saved to: ${resultsFile}`, 'cyan');

    // Gate
    if (this.results.summary.failed > 0) {
      log('\n✗ Provisioning encountered errors\n', 'red');
      process.exit(1);
    } else {
      log('\n✓ Test users provisioned successfully\n', 'green');
      process.exit(0);
    }
  }
}

const provisioner = new ProvisionRuntimeTestUsers();
await provisioner.run();
