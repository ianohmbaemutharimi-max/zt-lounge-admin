/**
 * ZT LOUNGE — BOOKING PIPELINE LAYER 0 BASELINE
 * Read-only inspection before any modifications
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_SITE = path.resolve(__dirname, '..', '..', 'zt-lounge');

const report = {
  timestamp: new Date().toISOString(),
  layer: 0,
  description: 'READ-ONLY BASELINE',
  html_pages: {},
  javascript_files: {},
  form_ids: {},
  script_loading: {},
  booking_architecture: {},
  whatsapp_fallback: {}
};

console.log('============================================================');
console.log('LAYER 0 — READ-ONLY BASELINE INSPECTION');
console.log('============================================================\n');

// ============================================================
// 1. INSPECT SIX BOOKING HTML PAGES
// ============================================================

console.log('1. INSPECTING SIX BOOKING HTML PAGES\n');

const pages = [
  { path: 'pages/experiences/restaurant.html', formId: 'reservationForm', name: 'Restaurant' },
  { path: 'pages/experiences/lounge.html', formId: 'loungeBookingForm', name: 'Lounge' },
  { path: 'pages/experiences/vip.html', formId: 'vipBookingForm', name: 'VIP' },
  { path: 'pages/business/events.html', formId: 'eventBookingForm', name: 'Events' },
  { path: 'pages/business/conference.html', formId: 'conferenceBookingForm', name: 'Conference' },
  { path: 'pages/business/autospa.html', formId: 'autospaBookingForm', name: 'Auto Spa' }
];

pages.forEach(page => {
  const fullPath = path.join(PUBLIC_SITE, page.path);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`❌ ${page.name}: FILE NOT FOUND`);
    report.html_pages[page.name] = { exists: false, path: page.path };
    return;
  }
  
  const content = fs.readFileSync(fullPath, 'utf8');
  
  // Check for form ID
  const hasFormId = content.includes(`id="${page.formId}"`);
  
  // Check for forms.js
  const hasFormsJs = /forms\.js/.test(content);
  const formsJsMatches = content.match(/forms\.js/g);
  const formsJsCount = formsJsMatches ? formsJsMatches.length : 0;
  
  // Check for BookingRepository
  const hasBookingRepo = /BookingRepository/.test(content);
  
  // Check for supabase client
  const hasSupabaseClient = /supabase.*\.js|createClient/.test(content);
  
  // Check for inline submit handler
  const hasInlineSubmit = content.includes('addEventListener') && content.includes('submit');
  const hasOnsubmit = /onsubmit\s*=/.test(content);
  
  // Check for WhatsApp
  const hasWhatsApp = /wa\.me|whatsapp/i.test(content);
  
  console.log(`${page.name}:`);
  console.log(`  Form ID (${page.formId}): ${hasFormId ? '✓' : '✗'}`);
  console.log(`  forms.js loaded: ${hasFormsJs ? '✓ (' + formsJsCount + ' reference' + (formsJsCount > 1 ? 's' : '') + ')' : '✗'}`);
  console.log(`  BookingRepository: ${hasBookingRepo ? '✓' : '✗'}`);
  console.log(`  Supabase client: ${hasSupabaseClient ? '✓' : '✗'}`);
  console.log(`  Inline submit handler: ${hasInlineSubmit ? '⚠️ YES' : '✓ NO'}`);
  console.log(`  onsubmit attribute: ${hasOnsubmit ? '⚠️ YES' : '✓ NO'}`);
  console.log(`  WhatsApp references: ${hasWhatsApp ? 'YES' : 'NO'}`);
  console.log('');
  
  report.html_pages[page.name] = {
    exists: true,
    path: page.path,
    formId: page.formId,
    hasFormId,
    formsJsCount,
    hasBookingRepo,
    hasSupabaseClient,
    hasInlineSubmit,
    hasOnsubmit,
    hasWhatsApp
  };
});

// ============================================================
// 2. INSPECT JAVASCRIPT FILES
// ============================================================

console.log('\n2. INSPECTING JAVASCRIPT FILES\n');

const jsFiles = [
  'assets/js/forms.js',
  'assets/js/booking.js',
  'assets/js/legacy/booking.js',
  'assets/js/repositories/BookingRepository.js',
  'assets/js/lib/supabase.js',
  'assets/js/booking.config.js'
];

jsFiles.forEach(file => {
  const fullPath = path.join(PUBLIC_SITE, file);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`${file}: ❌ NOT FOUND`);
    report.javascript_files[file] = { exists: false };
    return;
  }
  
  const stat = fs.statSync(fullPath);
  console.log(`${file}: ✓ EXISTS (${stat.size} bytes)`);
  
  report.javascript_files[file] = {
    exists: true,
    size: stat.size,
    modified: stat.mtime.toISOString()
  };
});

// ============================================================
// 3. VERIFY FORM IDS IN FORMS.JS
// ============================================================

console.log('\n3. VERIFYING FORM IDS IN FORMS.JS\n');

const formsJsPath = path.join(PUBLIC_SITE, 'assets/js/forms.js');
if (fs.existsSync(formsJsPath)) {
  const formsContent = fs.readFileSync(formsJsPath, 'utf8');
  
  const formIds = [
    'reservationForm',
    'loungeBookingForm',
    'vipBookingForm',
    'eventBookingForm',
    'conferenceBookingForm',
    'autospaBookingForm'
  ];
  
  formIds.forEach(id => {
    const found = formsContent.includes(id) || formsContent.includes(`#${id}`);
    console.log(`${id}: ${found ? '✓ FOUND' : '✗ MISSING'}`);
    report.form_ids[id] = found;
  });
}

// ============================================================
// 4. VERIFY BOOKING ARCHITECTURE
// ============================================================

console.log('\n4. VERIFYING BOOKING ARCHITECTURE PATH\n');

if (fs.existsSync(formsJsPath)) {
  const formsContent = fs.readFileSync(formsJsPath, 'utf8');
  
  const hasSubmitBooking = /function\s+submitBooking/.test(formsContent);
  const hasBookingRepoCall = /BookingRepository\s*\.\s*insert/.test(formsContent);
  const hasBindBookingForm = /function\s+bindBookingForm/.test(formsContent);
  
  console.log(`submitBooking function: ${hasSubmitBooking ? '✓' : '✗'}`);
  console.log(`BookingRepository.insert() call: ${hasBookingRepoCall ? '✓' : '✗'}`);
  console.log(`bindBookingForm function: ${hasBindBookingForm ? '✓' : '✗'}`);
  
  report.booking_architecture = {
    hasSubmitBooking,
    hasBookingRepoCall,
    hasBindBookingForm
  };
}

// Check BookingRepository
const bookingRepoPath = path.join(PUBLIC_SITE, 'assets/js/repositories/BookingRepository.js');
if (fs.existsSync(bookingRepoPath)) {
  const repoContent = fs.readFileSync(bookingRepoPath, 'utf8');
  
  const hasInsertMethod = /insert\s*[:=]\s*function|insert\s*\(/.test(repoContent);
  const hasCreateBookingRPC = /create_booking/.test(repoContent);
  const hasSupabaseCall = /supabase/.test(repoContent);
  
  console.log(`\nBookingRepository.js:`);
  console.log(`  insert method: ${hasInsertMethod ? '✓' : '✗'}`);
  console.log(`  create_booking RPC: ${hasCreateBookingRPC ? '✓' : '✗'}`);
  console.log(`  Supabase calls: ${hasSupabaseCall ? '✓' : '✗'}`);
  
  report.booking_architecture.repository = {
    hasInsertMethod,
    hasCreateBookingRPC,
    hasSupabaseCall
  };
}

// ============================================================
// 5. VERIFY WHATSAPP FALLBACK LOGIC
// ============================================================

console.log('\n5. VERIFYING WHATSAPP FALLBACK LOGIC\n');

if (fs.existsSync(formsJsPath)) {
  const formsContent = fs.readFileSync(formsJsPath, 'utf8');
  
  const hasBuildWhatsAppUrl = /function\s+buildWhatsAppUrl/.test(formsContent);
  const hasWaMe = /wa\.me/.test(formsContent);
  const hasWindowOpen = /window\.open/.test(formsContent);
  
  // Check if WhatsApp is conditional on failure
  const whatsappInCatch = /catch[\s\S]{0,500}wa\.me|catch[\s\S]{0,500}whatsapp/i.test(formsContent);
  const whatsappInSuccess = /success\s*===\s*true[\s\S]{0,200}wa\.me|success\s*===\s*true[\s\S]{0,200}whatsapp/i.test(formsContent);
  
  console.log(`buildWhatsAppUrl function: ${hasBuildWhatsAppUrl ? '✓' : '✗'}`);
  console.log(`wa.me references: ${hasWaMe ? '✓' : '✗'}`);
  console.log(`window.open calls: ${hasWindowOpen ? '✓' : '✗'}`);
  console.log(`WhatsApp in catch/error: ${whatsappInCatch ? '✓' : '✗'}`);
  console.log(`WhatsApp on success: ${whatsappInSuccess ? '⚠️ PROBLEM' : '✓ GOOD'}`);
  
  report.whatsapp_fallback = {
    hasBuildWhatsAppUrl,
    hasWaMe,
    hasWindowOpen,
    whatsappInCatch,
    whatsappInSuccess
  };
}

// ============================================================
// 6. CHECK FOR COMPETING HANDLERS
// ============================================================

console.log('\n6. CHECKING FOR COMPETING HANDLERS\n');

const bookingJsPath = path.join(PUBLIC_SITE, 'assets/js/booking.js');
const legacyBookingPath = path.join(PUBLIC_SITE, 'assets/js/legacy/booking.js');

if (fs.existsSync(bookingJsPath)) {
  const bookingContent = fs.readFileSync(bookingJsPath, 'utf8');
  const hasSubmitHandler = /addEventListener\s*\(\s*['"]submit['"]/.test(bookingContent);
  console.log(`assets/js/booking.js: EXISTS, has submit handler: ${hasSubmitHandler ? 'YES ⚠️' : 'NO'}`);
} else {
  console.log(`assets/js/booking.js: NOT FOUND ✓`);
}

if (fs.existsSync(legacyBookingPath)) {
  const legacyContent = fs.readFileSync(legacyBookingPath, 'utf8');
  const hasSubmitHandler = /addEventListener\s*\(\s*['"]submit['"]/.test(legacyContent);
  console.log(`assets/js/legacy/booking.js: EXISTS, has submit handler: ${hasSubmitHandler ? 'YES ⚠️' : 'NO'}`);
} else {
  console.log(`assets/js/legacy/booking.js: NOT FOUND ✓`);
}

// ============================================================
// SAVE REPORT
// ============================================================

const reportPath = path.join(__dirname, '..', 'BOOKING_PIPELINE_LAYER0_BASELINE.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(`\n============================================================`);
console.log('LAYER 0 BASELINE COMPLETE');
console.log(`Report saved: BOOKING_PIPELINE_LAYER0_BASELINE.json`);
console.log(`============================================================`);