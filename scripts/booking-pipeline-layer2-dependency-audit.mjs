import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_SITE = path.resolve(__dirname, '..', '..', 'zt-lounge');

console.log('============================================================');
console.log('BOOKING PIPELINE LAYER 2 — DEPENDENCY AUDIT');
console.log('============================================================\n');

const report = {
  timestamp: new Date().toISOString(),
  phases: {},
  defects: [],
  verificationMatrix: []
};

// ==================================================
// PHASE 1: SCRIPT DEPENDENCY VERIFICATION
// ==================================================

console.log('PHASE 1: Script Dependency Verification\n');

const bookingPages = [
  { path: 'pages/restaurant/restaurant.html', name: 'Restaurant', formId: 'reservationForm' },
  { path: 'pages/experiences/lounge.html', name: 'Lounge', formId: 'loungeBookingForm' },
  { path: 'pages/experiences/vip.html', name: 'VIP', formId: 'vipBookingForm' },
  { path: 'pages/business/events.html', name: 'Events', formId: 'eventBookingForm' },
  { path: 'pages/business/conference.html', name: 'Conference', formId: 'conferenceBookingForm' },
  { path: 'pages/business/autospa.html', name: 'Auto Spa', formId: 'autospaBookingForm' }
];

const requiredDependencies = [
  'supabase.config.js',
  'lib/supabase.js',
  'lib/BaseRepository.js',
  'repositories/BookingRepository.js',
  'booking.config.js',
  'forms.js'
];

report.phases.scriptDependencies = {};

bookingPages.forEach(page => {
  const fullPath = path.join(PUBLIC_SITE, page.path);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`❌ ${page.name}: FILE NOT FOUND`);
    return;
  }
  
  const content = fs.readFileSync(fullPath, 'utf8');
  const scriptTags = [];
  const scriptRegex = /<script[^>]*src=["']([^"']+)["'][^>]*>/g;
  let match;
  
  while ((match = scriptRegex.exec(content)) !== null) {
    scriptTags.push(match[1]);
  }
  
  console.log(`${page.name}:`);
  
  const dependencies = {};
  let allPresent = true;
  
  requiredDependencies.forEach(dep => {
    const found = scriptTags.some(tag => tag.includes(dep));
    dependencies[dep] = found ? 'AVAILABLE' : 'MISSING';
    
    if (found) {
      const index = scriptTags.findIndex(tag => tag.includes(dep));
      console.log(`  ✅ ${dep} (load order: ${index + 1})`);
    } else {
      console.log(`  ❌ ${dep} MISSING`);
      allPresent = false;
    }
  });
  
  report.phases.scriptDependencies[page.name] = {
    formId: page.formId,
    dependencies,
    allPresent,
    scriptCount: scriptTags.length
  };
  
  if (!allPresent) {
    report.defects.push({
      phase: 'Phase 1',
      page: page.name,
      type: 'MISSING_DEPENDENCIES',
      severity: 'CRITICAL',
      details: Object.entries(dependencies)
        .filter(([_, status]) => status === 'MISSING')
        .map(([dep]) => dep)
    });
  }
  
  console.log('');
});

// ==================================================
// PHASE 2: forms.js ANALYSIS
// ==================================================

console.log('\nPHASE 2: forms.js → BookingRepository Trace\n');

const formsJsPath = path.join(PUBLIC_SITE, 'assets', 'js', 'forms.js');

if (!fs.existsSync(formsJsPath)) {
  console.log('❌ forms.js NOT FOUND');
  report.defects.push({
    phase: 'Phase 2',
    type: 'MISSING_FILE',
    severity: 'CRITICAL',
    file: 'forms.js'
  });
} else {
  const formsContent = fs.readFileSync(formsJsPath, 'utf8');
  
  // Check for submitBooking function
  const hasSubmitBooking = /function\s+submitBooking|const\s+submitBooking|submitBooking\s*=/.test(formsContent);
  console.log(`submitBooking function: ${hasSubmitBooking ? '✅ FOUND' : '❌ NOT FOUND'}`);
  
  // Check for BookingRepository usage
  const usesBookingRepo = /BookingRepository/.test(formsContent);
  console.log(`BookingRepository reference: ${usesBookingRepo ? '✅ FOUND' : '❌ NOT FOUND'}`);
  
  // Check for .insert() call
  const hasInsertCall = /\.insert\s*\(/.test(formsContent);
  console.log(`BookingRepository.insert() call: ${hasInsertCall ? '✅ FOUND' : '❌ NOT FOUND'}`);
  
  // Check for each form ID
  console.log('\nForm ID handlers:');
  bookingPages.forEach(page => {
    const hasFormHandler = new RegExp(page.formId).test(formsContent);
    console.log(`  ${page.formId}: ${hasFormHandler ? '✅ FOUND' : '❌ NOT FOUND'}`);
  });
  
  // Check for WhatsApp in forms.js
  const hasWhatsApp = /whatsapp|wa\.me|buildWhatsAppUrl/i.test(formsContent);
  console.log(`\nWhatsApp references: ${hasWhatsApp ? '⚠️  FOUND' : '✅ NONE'}`);
  
  report.phases.formsJs = {
    exists: true,
    hasSubmitBooking,
    usesBookingRepo,
    hasInsertCall,
    hasWhatsApp,
    formHandlers: bookingPages.map(p => ({
      formId: p.formId,
      handled: new RegExp(p.formId).test(formsContent)
    }))
  };
  
  if (!hasSubmitBooking || !usesBookingRepo || !hasInsertCall) {
    report.defects.push({
      phase: 'Phase 2',
      type: 'INCOMPLETE_HANDLER',
      severity: 'CRITICAL',
      details: { hasSubmitBooking, usesBookingRepo, hasInsertCall }
    });
  }
}

// ==================================================
// PHASE 3: BookingRepository.js ANALYSIS
// ==================================================

console.log('\n\nPHASE 3: BookingRepository Verification\n');

const repoPath = path.join(PUBLIC_SITE, 'assets', 'js', 'repositories', 'BookingRepository.js');

if (!fs.existsSync(repoPath)) {
  console.log('❌ BookingRepository.js NOT FOUND');
  report.defects.push({
    phase: 'Phase 3',
    type: 'MISSING_FILE',
    severity: 'CRITICAL',
    file: 'BookingRepository.js'
  });
} else {
  const repoContent = fs.readFileSync(repoPath, 'utf8');
  
  // Check for insert method
  const hasInsert = /insert\s*\([^)]*\)\s*{/.test(repoContent);
  console.log(`insert() method: ${hasInsert ? '✅ FOUND' : '❌ NOT FOUND'}`);
  
  // Check for create_booking RPC call
  const usesCreateBookingRPC = /create_booking/.test(repoContent);
  console.log(`create_booking RPC: ${usesCreateBookingRPC ? '✅ FOUND' : '❌ NOT FOUND'}`);
  
  // Check for Supabase client usage
  const usesSupabase = /this\.supabase|supabase\.rpc/.test(repoContent);
  console.log(`Supabase client: ${usesSupabase ? '✅ USED' : '❌ NOT USED'}`);
  
  // Check for WhatsApp in repository
  const hasWhatsApp = /whatsapp|wa\.me|window\.open/i.test(repoContent);
  console.log(`WhatsApp calls: ${hasWhatsApp ? '❌ FOUND (WRONG)' : '✅ NONE'}`);
  
  // Check for /api/bookings endpoint call
  const usesApiEndpoint = /\/api\/bookings/.test(repoContent);
  console.log(`/api/bookings endpoint: ${usesApiEndpoint ? '❌ FOUND (WRONG)' : '✅ NOT USED'}`);
  
  // Extract RPC parameters
  const rpcMatch = repoContent.match(/\.rpc\s*\(\s*['"]create_booking['"]\s*,\s*{([^}]+)}/);
  if (rpcMatch) {
    console.log('\nRPC Payload structure detected:');
    const params = rpcMatch[1].split(',').map(p => p.trim().split(':')[0].trim());
    params.forEach(p => console.log(`  - ${p}`));
  }
  
  report.phases.bookingRepository = {
    exists: true,
    hasInsert,
    usesCreateBookingRPC,
    usesSupabase,
    hasWhatsApp,
    usesApiEndpoint,
    rpcParameters: rpcMatch ? rpcMatch[1] : null
  };
  
  if (!hasInsert || !usesCreateBookingRPC || !usesSupabase || hasWhatsApp || usesApiEndpoint) {
    report.defects.push({
      phase: 'Phase 3',
      type: 'REPOSITORY_ARCHITECTURE_VIOLATION',
      severity: 'CRITICAL',
      details: { hasInsert, usesCreateBookingRPC, usesSupabase, hasWhatsApp, usesApiEndpoint }
    });
  }
}

console.log('\n============================================================');
console.log('LAYER 2 DEPENDENCY AUDIT COMPLETE (Phases 1-3)');
console.log('============================================================');
console.log(`\nDefects found: ${report.defects.length}`);
console.log('\nNext: Run booking-pipeline-layer2-database-audit.mjs for Phases 4-7');

// Save report
fs.writeFileSync(
  path.join(__dirname, '..', 'BOOKING_PIPELINE_LAYER2_DEPENDENCY_REPORT.json'),
  JSON.stringify(report, null, 2)
);

console.log('\nReport saved: BOOKING_PIPELINE_LAYER2_DEPENDENCY_REPORT.json');
