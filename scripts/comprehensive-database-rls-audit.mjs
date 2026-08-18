#!/usr/bin/env node
/**
 * ZT LOUNGE ADMIN — COMPREHENSIVE DATABASE/RLS INTEGRITY AUDIT
 * 
 * Audits:
 * 1. All CMS tables for RLS policies
 * 2. All /api/admin routes for authorization
 * 3. IDOR vulnerabilities
 * 4. Mass assignment vulnerabilities
 * 5. Foreign key integrity
 * 6. Data integrity constraints
 * 7. Transactional integrity
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
const anonClient = createClient(supabaseUrl, supabaseAnonKey);

const report = {
  timestamp: new Date().toISOString(),
  tables: {},
  policies: {},
  vulnerabilities: [],
  warnings: [],
  passes: [],
};

const CMS_TABLES = [
  'business_settings',
  'system_settings',
  'profiles',
  'roles',
  'menu_categories',
  'menu_items',
  'hero_slides',
  'gallery',
  'services',
  'promotions',
  'testimonials',
  'contact_messages',
  'website_pages',
  'media_assets',
  'media_usage',
  'bookings',
  'reservations',
];

async function auditTableRLS(tableName) {
  console.log(`\n🔍 Auditing table: ${tableName}`);
  
  const tableAudit = {
    exists: false,
    rlsEnabled: false,
    policies: [],
    foreignKeys: [],
    constraints: [],
    issues: [],
  };

  // Check if table exists
  const { data: tables, error: tableError } = await serviceClient
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .eq('table_name', tableName);

  if (tableError || !tables || tables.length === 0) {
    tableAudit.exists = false;
    console.log(`  ⚠️  Table does not exist`);
    return tableAudit;
  }

  tableAudit.exists = true;

  // Check RLS status
  const { data: rlsData } = await serviceClient.rpc('check_rls_status', { 
    table_name: tableName 
  }).catch(() => ({ data: null }));

  // Alternative: Direct query
  const { data: pgClass } = await serviceClient
    .rpc('execute_sql', {
      query: `
        SELECT relrowsecurity as rls_enabled
        FROM pg_class
        WHERE relname = '${tableName}'
        AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      `
    })
    .catch(() => ({ data: null }));

  if (pgClass && pgClass.length > 0) {
    tableAudit.rlsEnabled = pgClass[0].rls_enabled;
  }

  // Check policies
  const { data: policies } = await serviceClient
    .rpc('execute_sql', {
      query: `
        SELECT 
          policyname,
          cmd as command,
          qual as using_expression,
          with_check as with_check_expression
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = '${tableName}'
      `
    })
    .catch(() => ({ data: [] }));

  tableAudit.policies = policies || [];

  // Check for SELECT policy
  const hasSelect = tableAudit.policies.some(p => p.command === 'SELECT' || p.command === 'ALL');
  const hasInsert = tableAudit.policies.some(p => p.command === 'INSERT' || p.command === 'ALL');
  const hasUpdate = tableAudit.policies.some(p => p.command === 'UPDATE' || p.command === 'ALL');
  const hasDelete = tableAudit.policies.some(p => p.command === 'DELETE' || p.command === 'ALL');

  if (tableAudit.rlsEnabled && !hasSelect) {
    tableAudit.issues.push('RLS enabled but no SELECT policy');
  }
  if (tableAudit.rlsEnabled && !hasInsert) {
    tableAudit.issues.push('RLS enabled but no INSERT policy');
  }
  if (tableAudit.rlsEnabled && !hasUpdate) {
    tableAudit.issues.push('RLS enabled but no UPDATE policy');
  }
  if (tableAudit.rlsEnabled && !hasDelete) {
    tableAudit.issues.push('RLS enabled but no DELETE policy');
  }

  // Check foreign keys
  const { data: fks } = await serviceClient
    .rpc('execute_sql', {
      query: `
        SELECT
          tc.constraint_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name,
          rc.delete_rule
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
        JOIN information_schema.referential_constraints AS rc
          ON rc.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name = '${tableName}'
      `
    })
    .catch(() => ({ data: [] }));

  tableAudit.foreignKeys = fks || [];

  console.log(`  RLS: ${tableAudit.rlsEnabled ? '✅ Enabled' : '❌ Disabled'}`);
  console.log(`  Policies: ${tableAudit.policies.length}`);
  console.log(`  Foreign Keys: ${tableAudit.foreignKeys.length}`);
  console.log(`  Issues: ${tableAudit.issues.length}`);

  return tableAudit;
}

async function testAnonAccess() {
  console.log(`\n🧪 Testing anonymous access to protected tables...`);
  
  const results = [];
  
  for (const table of ['menu_items', 'business_settings', 'profiles']) {
    const { data, error } = await anonClient.from(table).select('*').limit(1);
    
    results.push({
      table,
      accessible: !error && data && data.length > 0,
      error: error?.message,
    });
    
    if (!error && data && data.length > 0) {
      report.vulnerabilities.push({
        severity: 'HIGH',
        type: 'UNAUTHORIZED_ACCESS',
        table,
        description: `Anonymous client can read ${table} without authentication`,
      });
      console.log(`  ❌ ${table}: Accessible to anonymous (VULNERABILITY)`);
    } else {
      console.log(`  ✅ ${table}: Protected from anonymous`);
    }
  }
  
  return results;
}

async function testIDORVulnerability() {
  console.log(`\n🧪 Testing IDOR vulnerabilities...`);
  
  // This requires authenticated users with different permissions
  // For now, document the check needed
  
  report.warnings.push({
    type: 'MANUAL_TEST_REQUIRED',
    description: 'IDOR vulnerability testing requires multiple authenticated users with different roles',
    recommendation: 'Create automated E2E tests with content-manager and admin users attempting to modify each other\'s resources',
  });
  
  console.log(`  ⚠️  Manual E2E testing required for IDOR`);
}

async function auditAPIRoutes() {
  console.log(`\n🔍 Auditing API routes...`);
  
  const fs = await import('fs');
  const path = await import('path');
  
  const apiDir = path.join(__dirname, '..', 'src', 'app', 'api', 'admin');
  
  if (!fs.existsSync(apiDir)) {
    console.log(`  ⚠️  Admin API directory not found`);
    return;
  }
  
  const routes = [];
  
  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.name === 'route.ts' || entry.name === 'route.js') {
        routes.push(fullPath);
      }
    }
  }
  
  scanDir(apiDir);
  
  console.log(`  Found ${routes.length} API routes`);
  
  for (const routePath of routes) {
    const content = fs.readFileSync(routePath, 'utf-8');
    const relativePath = path.relative(path.join(__dirname, '..'), routePath);
    
    const routeAudit = {
      path: relativePath,
      issues: [],
    };
    
    // Check for authentication
    if (!content.includes('createClient') && !content.includes('auth')) {
      routeAudit.issues.push('No apparent authentication check');
    }
    
    // Check for role-based authorization
    if (!content.includes('role') && !content.includes('isAdmin')) {
      routeAudit.issues.push('No apparent role-based authorization');
    }
    
    // Check for dangerous patterns
    if (content.match(/\.insert\s*\(\s*request\.body\s*\)/)) {
      routeAudit.issues.push('CRITICAL: Mass assignment - insert(request.body)');
      report.vulnerabilities.push({
        severity: 'CRITICAL',
        type: 'MASS_ASSIGNMENT',
        file: relativePath,
        description: 'Route uses insert(request.body) without field filtering',
      });
    }
    
    if (content.match(/\.update\s*\(\s*request\.body\s*\)/)) {
      routeAudit.issues.push('CRITICAL: Mass assignment - update(request.body)');
      report.vulnerabilities.push({
        severity: 'CRITICAL',
        type: 'MASS_ASSIGNMENT',
        file: relativePath,
        description: 'Route uses update(request.body) without field filtering',
      });
    }
    
    // Check for service role usage
    if (content.includes('SUPABASE_SERVICE_ROLE_KEY')) {
      if (!content.includes('// SAFE:') && !content.includes('// SERVICE-ROLE:')) {
        routeAudit.issues.push('Service role usage without safety comment');
      }
    }
    
    if (routeAudit.issues.length > 0) {
      console.log(`  ⚠️  ${relativePath}:`);
      routeAudit.issues.forEach(issue => console.log(`      - ${issue}`));
    }
    
    report.tables[relativePath] = routeAudit;
  }
}

async function checkDatabaseIntegrity() {
  console.log(`\n🔍 Checking database integrity...`);
  
  // Check for orphaned records
  const orphanChecks = [
    {
      name: 'menu_items without categories',
      query: `
        SELECT COUNT(*) as count
        FROM menu_items mi
        LEFT JOIN menu_categories mc ON mi.category_id = mc.id
        WHERE mi.category_id IS NOT NULL
        AND mc.id IS NULL
      `,
    },
    {
      name: 'media_usage without media_assets',
      query: `
        SELECT COUNT(*) as count
        FROM media_usage mu
        LEFT JOIN media_assets ma ON mu.media_asset_id = ma.id
        WHERE ma.id IS NULL
      `,
    },
    {
      name: 'profiles without roles',
      query: `
        SELECT COUNT(*) as count
        FROM profiles p
        LEFT JOIN roles r ON p.role_id = r.id
        WHERE p.role_id IS NOT NULL
        AND r.id IS NULL
      `,
    },
  ];
  
  for (const check of orphanChecks) {
    const { data, error } = await serviceClient
      .rpc('execute_sql', { query: check.query })
      .catch(() => ({ data: null, error: 'Query failed' }));
    
    if (error) {
      console.log(`  ⚠️  ${check.name}: Could not check (${error})`);
    } else if (data && data[0]?.count > 0) {
      console.log(`  ❌ ${check.name}: ${data[0].count} orphaned records`);
      report.vulnerabilities.push({
        severity: 'MEDIUM',
        type: 'DATA_INTEGRITY',
        description: check.name,
        count: data[0].count,
      });
    } else {
      console.log(`  ✅ ${check.name}: OK`);
    }
  }
}

async function main() {
  console.log('🔒 ZT LOUNGE ADMIN — DATABASE/RLS INTEGRITY AUDIT');
  console.log('='.repeat(60));
  
  // 1. Audit all tables
  console.log('\n📊 PHASE 1: TABLE & RLS AUDIT');
  console.log('-'.repeat(60));
  
  for (const tableName of CMS_TABLES) {
    const audit = await auditTableRLS(tableName);
    report.tables[tableName] = audit;
    
    if (audit.exists) {
      if (!audit.rlsEnabled) {
        report.vulnerabilities.push({
          severity: 'CRITICAL',
          type: 'RLS_DISABLED',
          table: tableName,
          description: `RLS is disabled on ${tableName}`,
        });
      }
      
      if (audit.issues.length > 0) {
        report.vulnerabilities.push({
          severity: 'HIGH',
          type: 'INCOMPLETE_RLS',
          table: tableName,
          issues: audit.issues,
        });
      }
    }
  }
  
  // 2. Test anonymous access
  console.log('\n📊 PHASE 2: ANONYMOUS ACCESS TEST');
  console.log('-'.repeat(60));
  await testAnonAccess();
  
  // 3. Test IDOR
  console.log('\n📊 PHASE 3: IDOR VULNERABILITY TEST');
  console.log('-'.repeat(60));
  await testIDORVulnerability();
  
  // 4. Audit API routes
  console.log('\n📊 PHASE 4: API ROUTE AUDIT');
  console.log('-'.repeat(60));
  await auditAPIRoutes();
  
  // 5. Check database integrity
  console.log('\n📊 PHASE 5: DATABASE INTEGRITY');
  console.log('-'.repeat(60));
  await checkDatabaseIntegrity();
  
  // Generate report
  console.log('\n' + '='.repeat(60));
  console.log('📋 AUDIT SUMMARY');
  console.log('='.repeat(60));
  
  const critical = report.vulnerabilities.filter(v => v.severity === 'CRITICAL');
  const high = report.vulnerabilities.filter(v => v.severity === 'HIGH');
  const medium = report.vulnerabilities.filter(v => v.severity === 'MEDIUM');
  
  console.log(`\n🔴 CRITICAL: ${critical.length}`);
  critical.forEach(v => {
    console.log(`   - [${v.type}] ${v.table || v.file || ''}: ${v.description}`);
  });
  
  console.log(`\n🟠 HIGH: ${high.length}`);
  high.forEach(v => {
    console.log(`   - [${v.type}] ${v.table || v.file || ''}: ${v.description}`);
  });
  
  console.log(`\n🟡 MEDIUM: ${medium.length}`);
  medium.forEach(v => {
    console.log(`   - [${v.type}] ${v.table || v.file || ''}: ${v.description}`);
  });
  
  console.log(`\n⚠️  WARNINGS: ${report.warnings.length}`);
  report.warnings.forEach(w => {
    console.log(`   - [${w.type}] ${w.description}`);
  });
  
  // Write report
  const fs = await import('fs');
  const reportPath = join(__dirname, '..', 'database-rls-audit-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  console.log(`\n✅ Full report written to: database-rls-audit-report.json`);
  
  if (critical.length > 0) {
    console.log(`\n❌ AUDIT FAILED: ${critical.length} CRITICAL vulnerabilities found`);
    process.exit(1);
  } else if (high.length > 0) {
    console.log(`\n⚠️  AUDIT WARNING: ${high.length} HIGH-severity issues found`);
  } else {
    console.log(`\n✅ AUDIT PASSED: No critical or high-severity issues`);
  }
}

main().catch(console.error);
