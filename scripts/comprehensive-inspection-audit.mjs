#!/usr/bin/env node

/**
 * COMPREHENSIVE INSPECTION AUDIT
 * 
 * Before executing PHASES 2-13, inspect:
 * 1. Repository methods
 * 2. Resource configuration
 * 3. Authentication/RBAC
 * 4. Migration history
 * 5. Database schema
 * 6. CMS UI implementations
 * 7. Public website data fetching
 * 8. Cache strategy
 * 9. Error handling
 * 10. Performance patterns
 * 
 * DO NOT assume anything.
 * Inspect the ACTUAL implementation.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

// Color codes
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

function readFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    return null;
  }
}

function findFiles(dir, pattern) {
  const files = [];
  
  function traverse(currentDir) {
    try {
      const entries = fs.readdirSync(currentDir);
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry);
        if (fs.statSync(fullPath).isDirectory()) {
          if (!entry.startsWith('.') && entry !== 'node_modules') {
            traverse(fullPath);
          }
        } else if (pattern.test(entry)) {
          files.push(fullPath);
        }
      }
    } catch (err) {
      // skip
    }
  }
  
  traverse(dir);
  return files;
}

class InspectionAudit {
  constructor() {
    this.findings = {
      repositoryMethods: {},
      resourceConfig: {},
      authImplementation: {},
      migrations: {},
      cmsUIPages: {},
      publicDataFetching: {},
      cacheStrategy: {},
      errorHandling: {},
      performancePatterns: {},
      defectsFound: [],
    };
  }

  // 1. Inspect repository.ts
  auditRepository() {
    log('\n1. REPOSITORY INSPECTION', 'cyan');
    
    const repoPath = path.join(rootDir, 'src/lib/repository.ts');
    const content = readFile(repoPath);
    
    if (!content) {
      log('  ✗ repository.ts not found', 'red');
      return;
    }

    log('  ✓ repository.ts found', 'green');

    // Check for getCollection method
    if (content.includes('getCollection')) {
      log('  ✓ getCollection method exists', 'green');
      this.findings.repositoryMethods.getCollection = true;
    } else {
      log('  ✗ getCollection method NOT found', 'red');
      this.findings.defectsFound.push('Repository: getCollection missing');
    }

    // Check for CRUD methods
    const methods = ['create', 'update', 'delete', 'getById'];
    for (const method of methods) {
      if (content.includes(method + '(')) {
        log(`  ✓ ${method}() method exists`, 'green');
        this.findings.repositoryMethods[method] = true;
      } else {
        log(`  ✗ ${method}() method NOT found`, 'yellow');
      }
    }

    // Check for authorization patterns
    if (content.includes('auth.user') || content.includes('auth.supabase')) {
      log('  ✓ Auth context used in repository', 'green');
      this.findings.repositoryMethods.authContext = true;
    } else {
      log('  ✗ Auth context NOT used in repository', 'red');
      this.findings.defectsFound.push('Repository: Auth context missing');
    }

    // Check for allowlist/validation
    if (content.includes('ALLOWED_RESOURCES') || content.includes('validateResource') || content.includes('resource-config')) {
      log('  ✓ Resource allowlist pattern found', 'green');
      this.findings.repositoryMethods.allowlist = true;
    } else {
      log('  ✗ Resource allowlist pattern NOT found', 'yellow');
    }

    // Check for readonly field protection
    if (content.includes('created_at') || content.includes('created_by') || content.includes('READONLY')) {
      log('  ✓ Readonly field protection pattern found', 'green');
      this.findings.repositoryMethods.readonlyProtection = true;
    } else {
      log('  ✗ Readonly field protection NOT found', 'yellow');
    }
  }

  // 2. Inspect resource-config.ts
  auditResourceConfig() {
    log('\n2. RESOURCE CONFIG INSPECTION', 'cyan');
    
    const configPath = path.join(rootDir, 'src/lib/resource-config.ts');
    const content = readFile(configPath);
    
    if (!content) {
      log('  ✗ resource-config.ts not found', 'red');
      this.findings.defectsFound.push('ResourceConfig: File missing');
      return;
    }

    log('  ✓ resource-config.ts found', 'green');

    // Check for CMS collections
    const collections = ['menu-items', 'services', 'gallery', 'hero-slides', 'promotions'];
    const configObj = { collections: [] };
    
    for (const collection of collections) {
      if (content.includes(`'${collection}'`) || content.includes(`"${collection}"`)) {
        log(`  ✓ ${collection} configured`, 'green');
        configObj.collections.push(collection);
      } else {
        log(`  ✗ ${collection} NOT in config`, 'yellow');
        configObj.collections.push(`MISSING: ${collection}`);
      }
    }

    this.findings.resourceConfig = configObj;

    // Check for readonly/writable field definitions
    if (content.includes('readonly') || content.includes('writable') || content.includes('mutable')) {
      log('  ✓ Field mutability configuration found', 'green');
      this.findings.resourceConfig.fieldConfig = true;
    } else {
      log('  ✗ Field mutability configuration NOT found', 'yellow');
    }

    // Check for validation rules
    if (content.includes('validation') || content.includes('rules') || content.includes('schema')) {
      log('  ✓ Validation rules configuration found', 'green');
      this.findings.resourceConfig.validation = true;
    } else {
      log('  ✗ Validation rules configuration NOT found', 'yellow');
    }
  }

  // 3. Inspect auth implementation
  auditAuthImplementation() {
    log('\n3. AUTH IMPLEMENTATION INSPECTION', 'cyan');
    
    const authPath = path.join(rootDir, 'src/lib/auth/server.ts');
    const content = readFile(authPath);
    
    if (!content) {
      log('  ✗ auth/server.ts not found', 'red');
      return;
    }

    log('  ✓ auth/server.ts found', 'green');

    // Check for withAdminAuth
    if (content.includes('withAdminAuth')) {
      log('  ✓ withAdminAuth wrapper found', 'green');
      this.findings.authImplementation.withAdminAuth = true;
    } else {
      log('  ✗ withAdminAuth wrapper NOT found', 'red');
      this.findings.defectsFound.push('Auth: withAdminAuth missing');
    }

    // Check for withContentManagerAuth
    if (content.includes('withContentManagerAuth')) {
      log('  ✓ withContentManagerAuth wrapper found', 'green');
      this.findings.authImplementation.withContentManagerAuth = true;
    } else {
      log('  ✗ withContentManagerAuth wrapper NOT found', 'yellow');
    }

    // Check for JWT extraction
    if (content.includes('JWT') || content.includes('token') || content.includes('Authorization')) {
      log('  ✓ JWT/token extraction found', 'green');
      this.findings.authImplementation.jwtExtraction = true;
    } else {
      log('  ✗ JWT/token extraction NOT found', 'red');
      this.findings.defectsFound.push('Auth: JWT extraction missing');
    }

    // Check for Supabase client initialization
    if (content.includes('createClient') || content.includes('supabase')) {
      log('  ✓ Supabase client initialization found', 'green');
      this.findings.authImplementation.supabaseClient = true;
    } else {
      log('  ✗ Supabase client initialization NOT found', 'red');
      this.findings.defectsFound.push('Auth: Supabase client initialization missing');
    }
  }

  // 4. Inspect migrations
  auditMigrations() {
    log('\n4. MIGRATIONS INSPECTION', 'cyan');
    
    const migrationsDir = path.join(rootDir, 'supabase/migrations');
    
    if (!fs.existsSync(migrationsDir)) {
      log('  ✗ migrations directory not found', 'red');
      return;
    }

    const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
    
    log(`  ✓ Found ${migrationFiles.length} migration files`, 'green');

    // Check for key tables
    const keyTables = ['media_assets', 'media_usage', 'menu_items', 'services', 'gallery', 'hero_slides', 'promotions'];
    const tableMigrations = {};

    for (const table of keyTables) {
      const hasMigration = migrationFiles.some(f => {
        const content = readFile(path.join(migrationsDir, f));
        return content && content.includes(`CREATE TABLE ${table}`) || content.includes(`"${table}"`);
      });
      
      if (hasMigration) {
        log(`  ✓ ${table} table migration found`, 'green');
        tableMigrations[table] = true;
      } else {
        log(`  ✗ ${table} table migration NOT found`, 'yellow');
        tableMigrations[table] = false;
      }
    }

    this.findings.migrations = tableMigrations;

    // Check for media_id relationships
    const hasMediaIdMigration = migrationFiles.some(f => {
      const content = readFile(path.join(migrationsDir, f));
      return content && content.includes('media_id');
    });

    if (hasMediaIdMigration) {
      log('  ✓ media_id relationships migration found', 'green');
      this.findings.migrations.mediaIdRelationships = true;
    } else {
      log('  ✗ media_id relationships migration NOT found', 'red');
      this.findings.defectsFound.push('Migrations: media_id relationships missing');
    }
  }

  // 5. Inspect CMS UI pages
  auditCMSUIPages() {
    log('\n5. CMS UI PAGES INSPECTION', 'cyan');
    
    const dashboardDir = path.join(rootDir, 'src/app/dashboard');
    
    if (!fs.existsSync(dashboardDir)) {
      log('  ✗ dashboard directory not found', 'red');
      return;
    }

    const pages = ['menu', 'services', 'gallery', 'website', 'media', 'team'];
    const pagesObj = {};

    for (const page of pages) {
      const pagePath = path.join(dashboardDir, page, 'page.tsx');
      if (fs.existsSync(pagePath)) {
        log(`  ✓ /dashboard/${page} page found`, 'green');
        pagesObj[page] = true;
      } else {
        log(`  ✗ /dashboard/${page} page NOT found`, 'yellow');
        pagesObj[page] = false;
      }
    }

    this.findings.cmsUIPages = pagesObj;
  }

  // 6. Check error handling patterns
  auditErrorHandling() {
    log('\n6. ERROR HANDLING INSPECTION', 'cyan');
    
    const validationPath = path.join(rootDir, 'src/lib/validation/admin.ts');
    const content = readFile(validationPath);
    
    if (!content) {
      log('  ✗ validation/admin.ts not found', 'red');
      return;
    }

    log('  ✓ validation/admin.ts found', 'green');

    // Check for error functions
    const errorFunctions = ['validationError', 'notFoundError', 'unauthorizedError'];
    for (const func of errorFunctions) {
      if (content.includes(func)) {
        log(`  ✓ ${func} found`, 'green');
        this.findings.errorHandling[func] = true;
      } else {
        log(`  ✗ ${func} NOT found`, 'yellow');
      }
    }
  }

  // 7. Inspect public data fetching
  auditPublicDataFetching() {
    log('\n7. PUBLIC DATA FETCHING INSPECTION', 'cyan');
    
    const publicDir = path.join(rootDir, 'src/app');
    const files = findFiles(publicDir, /\.(tsx|ts)$/);

    let hasMenuDataFetch = false;
    let hasServicesDataFetch = false;
    let hasGalleryDataFetch = false;
    let hasHeroDataFetch = false;

    for (const file of files) {
      const content = readFile(file);
      if (!content) continue;

      // Look for CMS data fetching patterns
      if (content.includes('menu') && (content.includes('/api/') || content.includes('from("menu_items'))) {
        hasMenuDataFetch = true;
      }
      if (content.includes('services') && (content.includes('/api/') || content.includes('from("services'))) {
        hasServicesDataFetch = true;
      }
      if (content.includes('gallery') && (content.includes('/api/') || content.includes('from("gallery'))) {
        hasGalleryDataFetch = true;
      }
      if (content.includes('hero') && (content.includes('/api/') || content.includes('from("hero_slides'))) {
        hasHeroDataFetch = true;
      }
    }

    if (hasMenuDataFetch) log('  ✓ Menu data fetching found', 'green');
    else log('  ✗ Menu data fetching NOT found', 'yellow');

    if (hasServicesDataFetch) log('  ✓ Services data fetching found', 'green');
    else log('  ✗ Services data fetching NOT found', 'yellow');

    if (hasGalleryDataFetch) log('  ✓ Gallery data fetching found', 'green');
    else log('  ✗ Gallery data fetching NOT found', 'yellow');

    if (hasHeroDataFetch) log('  ✓ Hero slides data fetching found', 'green');
    else log('  ✗ Hero slides data fetching NOT found', 'yellow');

    this.findings.publicDataFetching = {
      menu: hasMenuDataFetch,
      services: hasServicesDataFetch,
      gallery: hasGalleryDataFetch,
      heroes: hasHeroDataFetch,
    };
  }

  // 8. Inspect cache strategy
  auditCacheStrategy() {
    log('\n8. CACHE STRATEGY INSPECTION', 'cyan');
    
    const routePath = path.join(rootDir, 'src/app/api/admin/[resource]/route.ts');
    const content = readFile(routePath);
    
    if (!content) {
      log('  ✗ Route file not found', 'red');
      return;
    }

    log('  ✓ Route file found', 'green');

    // Check for cache-related patterns
    if (content.includes('revalidate') || content.includes('revalidateTag') || content.includes('cache')) {
      log('  ✓ Cache revalidation pattern found', 'green');
      this.findings.cacheStrategy.revalidation = true;
    } else {
      log('  ~ No explicit cache revalidation in route', 'gray');
      this.findings.cacheStrategy.revalidation = false;
    }

    // Check for router.refresh()
    if (content.includes('router.refresh')) {
      log('  ✓ router.refresh() pattern found', 'green');
      this.findings.cacheStrategy.routerRefresh = true;
    } else {
      log('  ~ No router.refresh() in route', 'gray');
    }

    // Check for dynamic export
    if (content.includes('export const dynamic')) {
      log('  ✓ dynamic export found', 'green');
      if (content.includes('force-dynamic')) {
        log('    └─ Set to force-dynamic', 'green');
        this.findings.cacheStrategy.forceDynamic = true;
      }
    }
  }

  // Run all audits
  async run() {
    log('\n' + '='.repeat(60), 'blue');
    log('COMPREHENSIVE INSPECTION AUDIT', 'blue');
    log('='.repeat(60), 'blue');

    this.auditRepository();
    this.auditResourceConfig();
    this.auditAuthImplementation();
    this.auditMigrations();
    this.auditCMSUIPages();
    this.auditErrorHandling();
    this.auditPublicDataFetching();
    this.auditCacheStrategy();

    log('\n' + '='.repeat(60), 'blue');
    log('SUMMARY', 'blue');
    log('='.repeat(60), 'blue');

    log('\nDefects Found:', this.findings.defectsFound.length ? 'red' : 'green');
    if (this.findings.defectsFound.length > 0) {
      for (const defect of this.findings.defectsFound) {
        log(`  - ${defect}`, 'red');
      }
    } else {
      log('  ✓ No critical defects found', 'green');
    }

    // Save findings
    const reportPath = path.join(rootDir, 'INSPECTION_AUDIT_REPORT.json');
    fs.writeFileSync(reportPath, JSON.stringify(this.findings, null, 2));
    log(`\nFindings saved to: ${reportPath}`, 'cyan');

    return this.findings;
  }
}

const audit = new InspectionAudit();
await audit.run();
