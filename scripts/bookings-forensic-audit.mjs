#!/usr/bin/env node

/**
 * ZT LOUNGE — BOOKINGS MANAGEMENT 100% FORENSIC AUDIT
 * 
 * READ-ONLY COMPREHENSIVE AUDIT
 * 
 * This script performs a complete forensic investigation of the
 * Bookings Management implementation without modifying any files.
 * 
 * Evidence-based analysis of:
 * - Database schema
 * - Application code
 * - Validation rules
 * - API contracts
 * - Authentication/authorization
 * - Test coverage
 * - Runtime verification status
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment
config({ path: join(__dirname, '..', '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('╔════════════════════════════════════════════════════════════════════════╗');
console.log('║  ZT LOUNGE — BOOKINGS MANAGEMENT FORENSIC AUDIT                        ║');
console.log('║  READ-ONLY EVIDENCE-BASED ANALYSIS                                     ║');
console.log('╚════════════════════════════════════════════════════════════════════════╝\n');

const audit = {
  timestamp: new Date().toISOString(),
  phases: {},
  evidence: {},
  findings: [],
  gaps: [],
  risks: []
};

// ═══════════════════════════════════════════════════════════════════════
// PHASE 1: FILE INVENTORY
// ═══════════════════════════════════════════════════════════════════════
console.log('📁 PHASE 1: Mapping Bookings Implementation Files\n');

const bookingsFiles = {
  schema: [],
  migrations: [],
  api: [],
  components: [],
  validation: [],
  types: [],
  tests: [],
  scripts: [],
  config: []
};

function scanDirectory(dir, pattern, category) {
  try {
    if (!existsSync(dir)) return;
    
    const files = readdirSync(dir, { withFileTypes: true });
    
    for (const file of files) {
      const fullPath = join(dir, file.name);
      
      if (file.isDirectory()) {
        scanDirectory(fullPath, pattern, category);
      } else if (file.isFile() && pattern.test(file.name)) {
        const content = readFileSync(fullPath, 'utf-8');
        if (/booking/i.test(content)) {
          bookingsFiles[category].push({
            path: fullPath.replace(__dirname + '\\..\\', '').replace(/\\/g, '/'),
            size: statSync(fullPath).size,
            lines: content.split('\n').length
          });
        }
      }
    }
  } catch (error) {
    console.error(`Error scanning ${dir}:`, error.message);
  }
}

// Scan project structure
scanDirectory(join(__dirname, '..', 'src', 'db'), /schema\.ts$/, 'schema');
scanDirectory(join(__dirname, '..', 'supabase', 'migrations'), /\.sql$/, 'migrations');
scanDirectory(join(__dirname, '..', 'src', 'app', 'api'), /route\.ts$/, 'api');
scanDirectory(join(__dirname, '..', 'src', 'features'), /\.tsx?$/, 'components');
scanDirectory(join(__dirname, '..', 'src', 'lib', 'validation'), /\.ts$/, 'validation');
scanDirectory(join(__dirname, '..', 'src', 'types'), /\.ts$/, 'types');
scanDirectory(join(__dirname, '..', 'tests'), /\.test\.(ts|tsx|mjs)$/, 'tests');
scanDirectory(join(__dirname, '..', 'scripts'), /\.mjs$/, 'scripts');

audit.phases.fileInventory = {
  status: 'COMPLETE',
  files: bookingsFiles,
  summary: {
    schema: bookingsFiles.schema.length,
    migrations: bookingsFiles.migrations.length,
    api: bookingsFiles.api.length,
    components: bookingsFiles.components.length,
    validation: bookingsFiles.validation.length,
    types: bookingsFiles.types.length,
    tests: bookingsFiles.tests.length,
    scripts: bookingsFiles.scripts.length
  }
};

console.log(`✓ Schema files:      ${bookingsFiles.schema.length}`);
console.log(`✓ Migrations:        ${bookingsFiles.migrations.length}`);
console.log(`✓ API routes:        ${bookingsFiles.api.length}`);
console.log(`✓ Components:        ${bookingsFiles.components.length}`);
console.log(`✓ Validation:        ${bookingsFiles.validation.length}`);
console.log(`✓ Type definitions:  ${bookingsFiles.types.length}`);
console.log(`✓ Tests:             ${bookingsFiles.tests.length}`);
console.log(`✓ Scripts:           ${bookingsFiles.scripts.length}\n`);

// ═══════════════════════════════════════════════════════════════════════
// PHASE 2: DATABASE SCHEMA ANALYSIS
// ═══════════════════════════════════════════════════════════════════════
console.log('🗄️  PHASE 2: Analyzing Database Schema\n');

const schemaPath = join(__dirname, '..', 'src', 'db', 'schema.ts');
const schemaContent = readFileSync(schemaPath, 'utf-8');

// Extract bookings table definition
const bookingsTableMatch = schemaContent.match(/export const bookings = pgTable\("bookings",\s*{([^}]+)}\);/s);
if (bookingsTableMatch) {
  const tableDefRegex = /(\w+):\s*(\w+)\("([^"]+)"\)([^,\n]*)/g;
  const fields = [];
  let match;
  
  while ((match = tableDefRegex.exec(bookingsTableMatch[1])) !== null) {
    fields.push({
      field: match[1],
      type: match[2],
      column: match[3],
      modifiers: match[4].trim()
    });
  }
  
  audit.evidence.bookingsSchema = {
    source: 'src/db/schema.ts',
    fields: fields,
    fieldCount: fields.length
  };
  
  console.log('Bookings table schema (from Drizzle):');
  fields.forEach(f => {
    console.log(`  • ${f.field.padEnd(20)} ${f.type.padEnd(12)} → ${f.column}`);
  });
  console.log('');
  
  // Check for obsolete fields
  const obsoleteFields = ['bookingTime', 'partySize', 'totalAmount', 'booking_time', 'party_size', 'total_amount'];
  const foundObsolete = fields.filter(f => 
    obsoleteFields.includes(f.field) || obsoleteFields.includes(f.column)
  );
  
  if (foundObsolete.length > 0) {
    audit.findings.push({
      severity: 'HIGH',
      phase: 'schema',
      issue: 'Obsolete fields found in schema',
      fields: foundObsolete.map(f => f.field),
      recommendation: 'Remove obsolete fields from Drizzle schema'
    });
    console.log(`⚠️  WARNING: Found ${foundObsolete.length} obsolete fields\n`);
  } else {
    console.log('✓ No obsolete fields detected\n');
  }
} else {
  audit.findings.push({
    severity: 'CRITICAL',
    phase: 'schema',
    issue: 'Could not parse bookings table definition',
    recommendation: 'Manual schema review required'
  });
}

// Check related tables
const relatedTables = ['bookingHistory', 'bookingNotes'];
audit.evidence.relatedSchemas = {};

relatedTables.forEach(table => {
  const tableRegex = new RegExp(`export const ${table} = pgTable\\("[^"]+",\\s*{([^}]+)}\\);`, 's');
  const tableMatch = schemaContent.match(tableRegex);
  
  if (tableMatch) {
    const fieldRegex = /(\w+):/g;
    const fields = [];
    let fieldMatch;
    
    while ((fieldMatch = fieldRegex.exec(tableMatch[1])) !== null) {
      fields.push(fieldMatch[1]);
    }
    
    audit.evidence.relatedSchemas[table] = {
      exists: true,
      fields: fields,
      fieldCount: fields.length
    };
    console.log(`✓ ${table}: ${fields.length} fields`);
  } else {
    audit.evidence.relatedSchemas[table] = { exists: false };
    console.log(`✗ ${table}: NOT FOUND`);
  }
});

console.log('');

// ═══════════════════════════════════════════════════════════════════════
// PHASE 3: DATABASE LIVE INTROSPECTION
// ═══════════════════════════════════════════════════════════════════════
console.log('🔍 PHASE 3: Live Database Introspection\n');

if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  
  try {
    // Query information_schema for actual database structure
    const { data: columns, error: colError } = await supabase
      .rpc('exec_sql', {
        query: `
          SELECT 
            column_name,
            data_type,
            is_nullable,
            column_default,
            character_maximum_length
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'bookings'
          ORDER BY ordinal_position;
        `
      });
    
    if (!colError && columns) {
      audit.evidence.liveDatabase = {
        table: 'bookings',
        columns: columns,
        columnCount: columns.length
      };
      
      console.log('Live database columns:');
      columns.forEach(col => {
        console.log(`  • ${col.column_name.padEnd(20)} ${col.data_type.padEnd(15)} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULLABLE'}`);
      });
      console.log('');
      
      // Compare with schema
      if (audit.evidence.bookingsSchema) {
        const schemaColumns = audit.evidence.bookingsSchema.fields.map(f => f.column);
        const dbColumns = columns.map(c => c.column_name);
        
        const missingInDb = schemaColumns.filter(c => !dbColumns.includes(c));
        const missingInSchema = dbColumns.filter(c => !schemaColumns.includes(c));
        
        if (missingInDb.length > 0) {
          audit.findings.push({
            severity: 'HIGH',
            phase: 'database',
            issue: 'Schema-database mismatch: columns in schema but not in database',
            columns: missingInDb,
            recommendation: 'Apply missing migrations or update schema'
          });
          console.log(`⚠️  Columns in schema but NOT in database: ${missingInDb.join(', ')}\n`);
        }
        
        if (missingInSchema.length > 0) {
          audit.findings.push({
            severity: 'MEDIUM',
            phase: 'database',
            issue: 'Schema-database mismatch: columns in database but not in schema',
            columns: missingInSchema,
            recommendation: 'Update schema or drop unused columns'
          });
          console.log(`⚠️  Columns in database but NOT in schema: ${missingInSchema.join(', ')}\n`);
        }
        
        if (missingInDb.length === 0 && missingInSchema.length === 0) {
          console.log('✓ Schema and database are synchronized\n');
        }
      }
    } else {
      console.log(`✗ Could not query database schema: ${colError?.message || 'Unknown error'}\n`);
      audit.gaps.push({
        phase: 'database',
        item: 'Live schema introspection',
        reason: colError?.message || 'Query failed'
      });
    }
    
    // Check for booking_status enum
    const { data: enums, error: enumError } = await supabase
      .rpc('exec_sql', {
        query: `
          SELECT 
            e.enumlabel as value
          FROM pg_type t 
          JOIN pg_enum e ON t.oid = e.enumtypid  
          JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = 'booking_status'
            AND n.nspname = 'public'
          ORDER BY e.enumsortorder;
        `
      });
    
    if (!enumError && enums && enums.length > 0) {
      audit.evidence.statusEnum = {
        type: 'enum',
        values: enums.map(e => e.value)
      };
      
      console.log('Booking status enum values:');
      enums.forEach(e => console.log(`  • ${e.value}`));
      console.log('');
    } else {
      console.log('✗ No booking_status enum found (using text field)\n');
      audit.evidence.statusEnum = {
        type: 'text',
        constraint: 'none'
      };
    }
    
    // Check constraints
    const { data: constraints, error: constError } = await supabase
      .rpc('exec_sql', {
        query: `
          SELECT
            tc.constraint_name,
            tc.constraint_type,
            kcu.column_name,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name
          FROM information_schema.table_constraints AS tc
          LEFT JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          LEFT JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
          WHERE tc.table_schema = 'public'
            AND tc.table_name = 'bookings'
          ORDER BY tc.constraint_type, tc.constraint_name;
        `
      });
    
    if (!constError && constraints) {
      audit.evidence.constraints = constraints;
      
      console.log('Database constraints:');
      constraints.forEach(c => {
        if (c.constraint_type === 'FOREIGN KEY') {
          console.log(`  • FK: ${c.column_name} → ${c.foreign_table_name}.${c.foreign_column_name}`);
        } else {
          console.log(`  • ${c.constraint_type}: ${c.column_name || c.constraint_name}`);
        }
      });
      console.log('');
    }
    
  } catch (error) {
    console.log(`✗ Database introspection failed: ${error.message}\n`);
    audit.gaps.push({
      phase: 'database',
      item: 'Live database analysis',
      reason: error.message
    });
  }
} else {
  console.log('⚠️  Skipping live database analysis: missing credentials\n');
  audit.gaps.push({
    phase: 'database',
    item: 'Live database introspection',
    reason: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
  });
}

// ═══════════════════════════════════════════════════════════════════════
// PHASE 4: VALIDATION ANALYSIS
// ═══════════════════════════════════════════════════════════════════════
console.log('✓ PHASE 4: Analyzing Validation Rules\n');

const validationPath = join(__dirname, '..', 'src', 'features', 'bookings', 'bookings-view.tsx');
if (existsSync(validationPath)) {
  const validationContent = readFileSync(validationPath, 'utf-8');
  
  // Extract Zod schema
  const schemaMatch = validationContent.match(/const bookingSchema = z\.object\(\{([^}]+)\}\);/s);
  
  if (schemaMatch) {
    audit.evidence.validationSchema = {
      source: 'src/features/bookings/bookings-view.tsx',
      raw: schemaMatch[0]
    };
    
    console.log('Zod validation schema:');
    console.log(schemaMatch[0].split('\n').map(line => `  ${line}`).join('\n'));
    console.log('');
    
    // Check for specific validations
    const validations = {
      customerId: /customerId.*uuid/.test(schemaMatch[1]),
      serviceId: /serviceId.*uuid/.test(schemaMatch[1]),
      staffId: /staffId.*uuid/.test(schemaMatch[1]),
      bookingDate: /bookingDate.*min/.test(schemaMatch[1]),
      startTime: /startTime.*min/.test(schemaMatch[1]),
      endTime: /endTime.*min/.test(schemaMatch[1]),
      guests: /guests.*min\(\d+\).*max\(\d+\)/.test(schemaMatch[1]),
      status: /status.*enum/.test(schemaMatch[1])
    };
    
    audit.evidence.validationChecks = validations;
    
    console.log('Validation coverage:');
    Object.entries(validations).forEach(([field, hasValidation]) => {
      console.log(`  ${hasValidation ? '✓' : '✗'} ${field}`);
    });
    console.log('');
    
    const missingValidations = Object.entries(validations)
      .filter(([_, hasValidation]) => !hasValidation)
      .map(([field]) => field);
    
    if (missingValidations.length > 0) {
      audit.findings.push({
        severity: 'MEDIUM',
        phase: 'validation',
        issue: 'Missing validation for required fields',
        fields: missingValidations,
        recommendation: 'Add comprehensive Zod validation'
      });
    }
  } else {
    console.log('✗ Could not find bookingSchema definition\n');
    audit.gaps.push({
      phase: 'validation',
      item: 'Zod schema definition',
      reason: 'Pattern not found in bookings-view.tsx'
    });
  }
} else {
  console.log('✗ Validation file not found\n');
  audit.gaps.push({
    phase: 'validation',
    item: 'Validation rules',
    reason: 'bookings-view.tsx not found'
  });
}

// ═══════════════════════════════════════════════════════════════════════
// PHASE 5: API CONTRACT ANALYSIS
// ═══════════════════════════════════════════════════════════════════════
console.log('🔌 PHASE 5: Analyzing API Contracts\n');

const apiPath = join(__dirname, '..', 'src', 'app', 'api', 'admin', '[resource]', 'route.ts');
if (existsSync(apiPath)) {
  const apiContent = readFileSync(apiPath, 'utf-8');
  
  const methods = {
    GET: /export async function GET/.test(apiContent),
    POST: /export async function POST/.test(apiContent),
    PATCH: /export async function PATCH/.test(apiContent),
    DELETE: /export async function DELETE/.test(apiContent)
  };
  
  audit.evidence.apiMethods = methods;
  
  console.log('API methods implemented:');
  Object.entries(methods).forEach(([method, implemented]) => {
    console.log(`  ${implemented ? '✓' : '✗'} ${method}`);
  });
  console.log('');
  
  // Check for auth
  const hasAuth = /getUser|requireAuth|getSupabaseServer/.test(apiContent);
  audit.evidence.apiAuth = hasAuth;
  
  console.log(`${hasAuth ? '✓' : '✗'} Authentication check present\n`);
  
  if (!hasAuth) {
    audit.findings.push({
      severity: 'CRITICAL',
      phase: 'api',
      issue: 'No authentication check detected in API route',
      recommendation: 'Add getUser() or requireAuth() check'
    });
  }
} else {
  console.log('✗ API route file not found\n');
  audit.gaps.push({
    phase: 'api',
    item: 'API implementation',
    reason: 'route.ts not found'
  });
}

// ═══════════════════════════════════════════════════════════════════════
// PHASE 6: CONFLICT DETECTION LOGIC
// ═══════════════════════════════════════════════════════════════════════
console.log('⚔️  PHASE 6: Booking Conflict Detection\n');

const projectFiles = [];
function searchForConflictLogic(dir) {
  try {
    if (!existsSync(dir)) return;
    
    const files = readdirSync(dir, { withFileTypes: true });
    
    for (const file of files) {
      const fullPath = join(dir, file.name);
      
      if (file.isDirectory() && !file.name.startsWith('.') && file.name !== 'node_modules') {
        searchForConflictLogic(fullPath);
      } else if (file.isFile() && /\.(ts|tsx|mjs|sql)$/.test(file.name)) {
        const content = readFileSync(fullPath, 'utf-8');
        if (/overlap|conflict|tsrange|exclusion|concurrent/i.test(content) && /booking/i.test(content)) {
          projectFiles.push({
            file: fullPath.replace(__dirname + '\\..\\', '').replace(/\\/g, '/'),
            hasConflictLogic: true
          });
        }
      }
    }
  } catch (error) {
    // Silently skip inaccessible directories
  }
}

searchForConflictLogic(join(__dirname, '..', 'src'));
searchForConflictLogic(join(__dirname, '..', 'supabase'));

audit.evidence.conflictDetection = {
  filesWithLogic: projectFiles,
  count: projectFiles.length
};

if (projectFiles.length > 0) {
  console.log('Conflict detection logic found in:');
  projectFiles.forEach(f => console.log(`  • ${f.file}`));
  console.log('');
} else {
  console.log('✗ NO booking conflict detection logic found\n');
  audit.findings.push({
    severity: 'HIGH',
    phase: 'business-logic',
    issue: 'No booking conflict prevention detected',
    recommendation: 'Implement overlap detection or add exclusion constraint'
  });
}

// ═══════════════════════════════════════════════════════════════════════
// PHASE 7: TEST COVERAGE
// ═══════════════════════════════════════════════════════════════════════
console.log('🧪 PHASE 7: Test Coverage Analysis\n');

const testFiles = bookingsFiles.tests.concat(bookingsFiles.scripts);

audit.evidence.testCoverage = {
  testFiles: testFiles,
  count: testFiles.length
};

if (testFiles.length > 0) {
  console.log('Test files:');
  testFiles.forEach(f => console.log(`  • ${f.path} (${f.lines} lines)`));
  console.log('');
} else {
  console.log('✗ NO test files found\n');
  audit.findings.push({
    severity: 'HIGH',
    phase: 'testing',
    issue: 'No automated tests for bookings',
    recommendation: 'Create unit and integration tests'
  });
}

// Check runtime verification script
const runtimeScriptPath = join(__dirname, 'verify-bookings-runtime.mjs');
if (existsSync(runtimeScriptPath)) {
  const scriptContent = readFileSync(runtimeScriptPath, 'utf-8');
  const scriptStatus = readFileSync(runtimeScriptPath, 'utf-8');
  
  audit.evidence.runtimeVerification = {
    exists: true,
    path: 'scripts/verify-bookings-runtime.mjs',
    hasEnvironmentLoading: /config\(\{ path/.test(scriptContent),
    hasValidation: /if \(!SUPABASE_URL/.test(scriptContent),
    phases: (scriptContent.match(/PHASE \d+:/g) || []).length
  };
  
  console.log('✓ Runtime verification script exists');
  console.log(`  • Environment loading: ${audit.evidence.runtimeVerification.hasEnvironmentLoading ? 'FIXED' : 'BROKEN'}`);
  console.log(`  • Validation: ${audit.evidence.runtimeVerification.hasValidation ? 'YES' : 'NO'}`);
  console.log(`  • Test phases: ${audit.evidence.runtimeVerification.phases}\n`);
} else {
  console.log('✗ Runtime verification script not found\n');
  audit.gaps.push({
    phase: 'testing',
    item: 'Runtime verification script',
    reason: 'Script not found'
  });
}

// ═══════════════════════════════════════════════════════════════════════
// PHASE 8: BUILD STATUS
// ═══════════════════════════════════════════════════════════════════════
console.log('🔨 PHASE 8: Type Safety & Build Status\n');

const packagePath = join(__dirname, '..', 'package.json');
if (existsSync(packagePath)) {
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
  
  audit.evidence.buildScripts = {
    typecheck: !!packageJson.scripts?.typecheck,
    build: !!packageJson.scripts?.build,
    test: !!packageJson.scripts?.test
  };
  
  console.log('Build scripts available:');
  console.log(`  ${packageJson.scripts?.typecheck ? '✓' : '✗'} typecheck`);
  console.log(`  ${packageJson.scripts?.build ? '✓' : '✗'} build`);
  console.log(`  ${packageJson.scripts?.test ? '✓' : '✗'} test\n`);
}

// Search for unsafe type usage
const unsafePatterns = {
  any: 0,
  tsIgnore: 0,
  tsExpectError: 0
};

bookingsFiles.components.concat(bookingsFiles.api).forEach(f => {
  try {
    const content = readFileSync(join(__dirname, '..', f.path), 'utf-8');
    unsafePatterns.any += (content.match(/:\s*any/g) || []).length;
    unsafePatterns.tsIgnore += (content.match(/@ts-ignore/g) || []).length;
    unsafePatterns.tsExpectError += (content.match(/@ts-expect-error/g) || []).length;
  } catch (error) {
    // Skip if file can't be read
  }
});

audit.evidence.typeSafety = unsafePatterns;

console.log('Type safety issues:');
console.log(`  • : any             ${unsafePatterns.any}`);
console.log(`  • @ts-ignore        ${unsafePatterns.tsIgnore}`);
console.log(`  • @ts-expect-error  ${unsafePatterns.tsExpectError}\n`);

if (unsafePatterns.any > 10 || unsafePatterns.tsIgnore > 0) {
  audit.findings.push({
    severity: 'MEDIUM',
    phase: 'build',
    issue: 'Unsafe type usage detected',
    counts: unsafePatterns,
    recommendation: 'Replace any with proper types, remove @ts-ignore'
  });
}

// ═══════════════════════════════════════════════════════════════════════
// FINAL REPORT GENERATION
// ═══════════════════════════════════════════════════════════════════════
console.log('═══════════════════════════════════════════════════════════════════════════');
console.log('FORENSIC AUDIT SUMMARY');
console.log('═══════════════════════════════════════════════════════════════════════════\n');

console.log(`TIMESTAMP: ${audit.timestamp}\n`);

console.log('EVIDENCE GATHERED:');
console.log(`  • Files analyzed:        ${Object.values(bookingsFiles).flat().length}`);
console.log(`  • Schema fields:         ${audit.evidence.bookingsSchema?.fieldCount || 0}`);
console.log(`  • Database columns:      ${audit.evidence.liveDatabase?.columnCount || 'N/A'}`);
console.log(`  • Validation rules:      ${audit.evidence.validationSchema ? 'FOUND' : 'NOT FOUND'}`);
console.log(`  • API methods:           ${Object.values(audit.evidence.apiMethods || {}).filter(Boolean).length}/4`);
console.log(`  • Test files:            ${audit.evidence.testCoverage?.count || 0}\n`);

console.log(`FINDINGS: ${audit.findings.length}`);
audit.findings.forEach((f, i) => {
  console.log(`  ${i + 1}. [${f.severity}] ${f.phase}: ${f.issue}`);
});
console.log('');

console.log(`GAPS: ${audit.gaps.length}`);
audit.gaps.forEach((g, i) => {
  console.log(`  ${i + 1}. ${g.phase}: ${g.item} (${g.reason})`);
});
console.log('');

// Overall status
const criticalFindings = audit.findings.filter(f => f.severity === 'CRITICAL').length;
const highFindings = audit.findings.filter(f => f.severity === 'HIGH').length;
const mediumFindings = audit.findings.filter(f => f.severity === 'MEDIUM').length;

let overallStatus = 'NOT READY';
if (criticalFindings === 0 && highFindings === 0 && audit.gaps.length < 3) {
  overallStatus = 'PARTIALLY VERIFIED';
}
if (criticalFindings === 0 && highFindings === 0 && mediumFindings === 0 && audit.gaps.length === 0) {
  overallStatus = 'PRODUCTION READY';
}

console.log('═══════════════════════════════════════════════════════════════════════════');
console.log(`OVERALL STATUS: ${overallStatus}`);
console.log('═══════════════════════════════════════════════════════════════════════════\n');

console.log('PRIORITY RECOMMENDATIONS:');
if (criticalFindings > 0) {
  console.log(`  1. FIX ${criticalFindings} CRITICAL ISSUE(S)`);
}
if (highFindings > 0) {
  console.log(`  ${criticalFindings > 0 ? 2 : 1}. ADDRESS ${highFindings} HIGH-SEVERITY ISSUE(S)`);
}
if (audit.gaps.length > 0) {
  console.log(`  ${criticalFindings + highFindings > 0 ? 3 : 1}. RESOLVE ${audit.gaps.length} BLOCKED/MISSING ITEM(S)`);
}
console.log('');

// Save detailed report
const reportPath = join(__dirname, '..', 'BOOKINGS_FORENSIC_AUDIT_REPORT.json');
import('fs').then(fs => {
  fs.writeFileSync(reportPath, JSON.stringify(audit, null, 2));
  console.log(`📄 Detailed report saved: BOOKINGS_FORENSIC_AUDIT_REPORT.json\n`);
});
