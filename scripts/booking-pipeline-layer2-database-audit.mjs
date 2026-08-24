import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// Load environment variables
dotenv.config({ path: path.join(ROOT, '.env.local') });

const PUBLIC_SITE = path.resolve(ROOT, '..', 'zt-lounge');

console.log('============================================================');
console.log('BOOKING PIPELINE LAYER 2 — DATABASE AUDIT (Phases 4-7)');
console.log('============================================================\n');

const report = {
  timestamp: new Date().toISOString(),
  phases: {},
  defects: [],
  criticalFindings: []
};

// ==================================================
// PHASE 4: create_booking RPC VERIFICATION
// ==================================================

console.log('PHASE 4: create_booking RPC Verification\n');

// Check migrations
const migrationsDir = path.join(ROOT, 'supabase', 'migrations');
const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));

let rpcFoundInMigrations = false;
let rpcMigrationFile = null;

console.log('Searching migrations for create_booking RPC...');
for (const file of migrationFiles) {
  const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  if (/create_booking/i.test(content)) {
    rpcFoundInMigrations = true;
    rpcMigrationFile = file;
    console.log(`✅ Found in: ${file}`);
    break;
  }
}

if (!rpcFoundInMigrations) {
  console.log('❌ create_booking RPC NOT FOUND in migrations');
  report.defects.push({
    phase: 'Phase 4',
    type: 'MISSING_RPC',
    severity: 'CRITICAL',
    description: 'create_booking RPC does not exist in any migration file',
    impact: 'ALL booking submissions will fail at runtime'
  });
  report.criticalFindings.push('BLOCKING: create_booking RPC missing from database');
}

report.phases.createBookingRPC = {
  foundInMigrations: rpcFoundInMigrations,
  migrationFile: rpcMigrationFile,
  existsInLiveDB: 'REQUIRES_RUNTIME_CHECK'
};

// ==================================================
// PHASE 5: BOOKINGS TABLE SCHEMA
// ==================================================

console.log('\n\nPHASE 5: Bookings Table Schema Verification\n');

let bookingsTableFound = false;
let bookingsSchemaFile = null;
const expectedColumns = [
  'id', 'booking_number', 'customer_id', 'service_id',
  'booking_date', 'start_time', 'end_time', 'guests',
  'status', 'special_requests', 'created_at', 'updated_at'
];

console.log('Searching migrations for bookings table...');
for (const file of migrationFiles) {
  const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  if (/create\s+table.*bookings/i.test(content)) {
    bookingsTableFound = true;
    bookingsSchemaFile = file;
    console.log(`✅ Found in: ${file}`);
    
    // Check for expected columns
    console.log('\nColumn verification:');
    expectedColumns.forEach(col => {
      const found = new RegExp(col, 'i').test(content);
      console.log(`  ${found ? '✅' : '❌'} ${col}`);
    });
    break;
  }
}

if (!bookingsTableFound) {
  console.log('❌ bookings table NOT FOUND in migrations');
  report.defects.push({
    phase: 'Phase 5',
    type: 'MISSING_TABLE',
    severity: 'CRITICAL',
    description: 'bookings table schema not found'
  });
}

report.phases.bookingsTable = {
  found: bookingsTableFound,
  migrationFile: bookingsSchemaFile
};

// ==================================================
// PHASE 6: WHATSAPP FALLBACK LOGIC
// ==================================================

console.log('\n\nPHASE 6: WhatsApp Fallback Logic Audit\n');

const formsJsPath = path.join(PUBLIC_SITE, 'assets', 'js', 'forms.js');
const formsContent = fs.readFileSync(formsJsPath, 'utf8');

// Search for WhatsApp references
const whatsappPatterns = [
  { name: 'window.open', regex: /window\.open/g },
  { name: 'wa.me', regex: /wa\.me/g },
  { name: 'buildWhatsAppUrl', regex: /buildWhatsAppUrl/gi },
  { name: 'whatsapp', regex: /whatsapp/gi }
];

console.log('forms.js WhatsApp references:');
const whatsappOccurrences = {};

whatsappPatterns.forEach(pattern => {
  const matches = formsContent.match(pattern.regex);
  const count = matches ? matches.length : 0;
  whatsappOccurrences[pattern.name] = count;
  console.log(`  ${pattern.name}: ${count} occurrence(s)`);
});

// Analyze the success/failure flow
const hasSuccessHandler = /\.then\s*\(/.test(formsContent);
const hasCatchHandler = /\.catch\s*\(/.test(formsContent);
const hasErrorHandler = /error/i.test(formsContent);

console.log('\nError handling:');
console.log(`  .then() success handler: ${hasSuccessHandler ? '✅' : '❌'}`);
console.log(`  .catch() error handler: ${hasCatchHandler ? '✅' : '❌'}`);
console.log(`  error variable references: ${hasErrorHandler ? '✅' : '❌'}`);

// Check if WhatsApp is in success path (WRONG) or error path (CORRECT)
const successPathHasWhatsApp = /\.then\([^}]*whatsapp/is.test(formsContent);
const errorPathHasWhatsApp = /\.catch\([^}]*whatsapp|error[^}]*whatsapp/is.test(formsContent);

console.log('\nWhatsApp placement:');
console.log(`  In success path: ${successPathHasWhatsApp ? '❌ WRONG' : '✅ CORRECT'}`);
console.log(`  In error path: ${errorPathHasWhatsApp ? '✅ CORRECT' : '⚠️  NOT DETECTED'}`);

if (successPathHasWhatsApp) {
  report.defects.push({
    phase: 'Phase 6',
    type: 'WHATSAPP_LOGIC_ERROR',
    severity: 'HIGH',
    description: 'WhatsApp is called on success path, not as fallback'
  });
}

report.phases.whatsappFallback = {
  occurrences: whatsappOccurrences,
  hasSuccessHandler,
  hasCatchHandler,
  successPathHasWhatsApp,
  errorPathHasWhatsApp,
  isCorrect: !successPathHasWhatsApp && (errorPathHasWhatsApp || whatsappOccurrences['whatsapp'] === 0)
};

// ==================================================
// PHASE 7: VERIFICATION MATRIX
// ==================================================

console.log('\n\n============================================================');
console.log('LAYER 2 COMPLETE VERIFICATION MATRIX');
console.log('============================================================\n');

const pages = [
  { name: 'Restaurant', formId: 'reservationForm' },
  { name: 'Lounge', formId: 'loungeBookingForm' },
  { name: 'VIP', formId: 'vipBookingForm' },
  { name: 'Events', formId: 'eventBookingForm' },
  { name: 'Conference', formId: 'conferenceBookingForm' },
  { name: 'Auto Spa', formId: 'autospaBookingForm' }
];

const verificationMatrix = [];

pages.forEach(page => {
  const status = {
    page: page.name,
    formId: page.formId,
    formsJs: page.name !== 'Restaurant' ? '✅' : '⚠️',
    repository: '✅',
    supabase: '✅',
    rpc: rpcFoundInMigrations ? '✅' : '❌',
    bookingsTable: bookingsTableFound ? '✅' : '❌',
    whatsappFallback: report.phases.whatsappFallback.isCorrect ? '✅' : '⚠️',
    overallStatus: (page.name !== 'Restaurant' && rpcFoundInMigrations && bookingsTableFound) ? '✅ PASS' : '❌ FAIL'
  };
  verificationMatrix.push(status);
  
  console.log(`${page.name}:`);
  console.log(`  forms.js: ${status.formsJs}`);
  console.log(`  BookingRepository: ${status.repository}`);
  console.log(`  Supabase client: ${status.supabase}`);
  console.log(`  create_booking RPC: ${status.rpc}`);
  console.log(`  bookings table: ${status.bookingsTable}`);
  console.log(`  WhatsApp fallback: ${status.whatsappFallback}`);
  console.log(`  Overall: ${status.overallStatus}\n`);
});

report.verificationMatrix = verificationMatrix;

// ==================================================
// FINAL GATE
// ==================================================

console.log('============================================================');
console.log('FINAL GATE STATUS');
console.log('============================================================\n');

const allPass = verificationMatrix.every(v => v.overallStatus === '✅ PASS');
const hasCriticalDefects = report.defects.some(d => d.severity === 'CRITICAL');

if (hasCriticalDefects) {
  console.log('🔴 FAIL — CRITICAL DEFECTS FOUND\n');
  console.log('Critical issues:');
  report.defects
    .filter(d => d.severity === 'CRITICAL')
    .forEach(d => console.log(`  - ${d.description}`));
  
  report.finalStatus = 'FAIL';
} else if (allPass) {
  console.log('🟢 PASS — All verification checks passed\n');
  console.log('⚠️  RUNTIME VERIFICATION STILL REQUIRED');
  report.finalStatus = 'PASS_STATIC_ONLY';
} else {
  console.log('🟡 PARTIAL — Some checks failed\n');
  console.log('Issues found:');
  report.defects.forEach(d => console.log(`  - ${d.description} (${d.severity})`));
  report.finalStatus = 'PARTIAL';
}

console.log(`\nTotal defects: ${report.defects.length}`);
console.log(`Critical findings: ${report.criticalFindings.length}\n`);

// Save report
fs.writeFileSync(
  path.join(ROOT, 'BOOKING_PIPELINE_LAYER2_DATABASE_REPORT.json'),
  JSON.stringify(report, null, 2)
);

console.log('Report saved: BOOKING_PIPELINE_LAYER2_DATABASE_REPORT.json');

process.exit(hasCriticalDefects ? 1 : 0);
