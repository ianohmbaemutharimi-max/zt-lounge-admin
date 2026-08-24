import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_SITE = path.resolve(__dirname, '..', '..', 'zt-lounge');

console.log('============================================================');
console.log('BOOKING PIPELINE LAYER 1 — COMPREHENSIVE INVESTIGATION');
console.log('============================================================\n');

const pages = [
  { path: 'pages/experiences/restaurant.html', formId: 'reservationForm', name: 'Restaurant' },
  { path: 'pages/experiences/lounge.html', formId: 'loungeBookingForm', name: 'Lounge' },
  { path: 'pages/experiences/vip.html', formId: 'vipBookingForm', name: 'VIP' },
  { path: 'pages/business/events.html', formId: 'eventBookingForm', name: 'Events' },
  { path: 'pages/business/conference.html', formId: 'conferenceBookingForm', name: 'Conference' },
  { path: 'pages/business/autospa.html', formId: 'autospaBookingForm', name: 'Auto Spa' }
];

const report = { pages: {}, externalScripts: {}, summary: {} };

console.log('TASK 1 & 2: PAGE INSPECTION\n');

// TASK 1 & 2: Inspect each page
pages.forEach(page => {
  const fullPath = path.join(PUBLIC_SITE, page.path);
  if (!fs.existsSync(fullPath)) {
    console.log(`❌ ${page.name}: NOT FOUND\n`);
    return;
  }
  
  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');
  
  console.log(`${page.name}:`);
  
  // Count forms.js SCRIPT TAGS ONLY
  const formsJsScriptMatches = content.match(/<script[^>]*src=['"].*forms\.js['"][^>]*>/gi) || [];
  console.log(`  forms.js <script> tags: ${formsJsScriptMatches.length}`);
  
  formsJsScriptMatches.forEach((match, idx) => {
    const lineNum = lines.findIndex(l => l.includes(match.substring(0, 50))) + 1;
    console.log(`    [${idx + 1}] Line ${lineNum}: ${match.trim()}`);
  });
  
  // Check for booking.js
  const bookingJsLoaded = /<script[^>]*src=['"].*\/booking\.js['"][^>]*>/i.test(content);
  const legacyBookingJsLoaded = /<script[^>]*src=['"].*legacy\/booking\.js['"][^>]*>/i.test(content);
  
  console.log(`  booking.js loaded: ${bookingJsLoaded ? '⚠️ YES' : '✓ NO'}`);
  console.log(`  legacy/booking.js loaded: ${legacyBookingJsLoaded ? '⚠️ YES' : '✓ NO'}`);
  
  // Check for addEventListener on the form
  const formAddEventListenerPattern = new RegExp(`${page.formId}[\\s\\S]{0,100}\\.addEventListener\\s*\\(\\s*['"]submit['"]`, 'gi');
  const hasFormListener = formAddEventListenerPattern.test(content);
  
  console.log(`  Inline form.addEventListener('submit'): ${hasFormListener ? '⚠️ YES' : '✓ NO'}`);
  
  if (hasFormListener) {
    // Find the line
    const match = content.match(formAddEventListenerPattern);
    if (match) {
      const lineNum = content.substring(0, content.indexOf(match[0])).split('\n').length;
      console.log(`    Found at ~line ${lineNum}`);
    }
  }
  
  report.pages[page.name] = {
    formsJsScriptCount: formsJsScriptMatches.length,
    bookingJsLoaded,
    legacyBookingJsLoaded,
    hasInlineFormListener: hasFormListener
  };
  
  console.log('');
});

// TASK 3: Check booking.js files
console.log('\nTASK 3: EXTERNAL BOOKING.JS FILES\n');

['assets/js/booking.js', 'assets/js/legacy/booking.js'].forEach(file => {
  const fullPath = path.join(PUBLIC_SITE, file);
  if (!fs.existsSync(fullPath)) {
    console.log(`${file}: NOT FOUND`);
    report.externalScripts[file] = { exists: false };
    return;
  }
  
  const content = fs.readFileSync(fullPath, 'utf8');
  
  const hasSubmitListener = /addEventListener\s*\(\s*['"]submit['"]/.test(content);
  const targetsReservationForm = /reservationForm|loungeBookingForm|vipBookingForm|eventBookingForm|conferenceBookingForm|autospaBookingForm/.test(content);
  const usesBookingRepo = /BookingRepository\s*\.\s*insert/.test(content);
  const hasSupabaseCall = /supabase\s*\.\s*from\s*\(\s*['"]bookings['"]/.test(content);
  
  console.log(`${file}:`);
  console.log(`  Exists: YES`);
  console.log(`  Has submit listener: ${hasSubmitListener ? 'YES' : 'NO'}`);
  console.log(`  Targets booking forms: ${targetsReservationForm ? 'YES' : 'NO'}`);
  console.log(`  Uses BookingRepository: ${usesBookingRepo ? 'YES' : 'NO'}`);
  console.log(`  Direct Supabase calls: ${hasSupabaseCall ? 'YES' : 'NO'}`);
  
  report.externalScripts[file] = {
    exists: true,
    hasSubmitListener,
    targetsReservationForm,
    usesBookingRepo,
    hasSupabaseCall
  };
  
  console.log('');
});

// TASK 4: ACTIVE HANDLER COUNT
console.log('\nTASK 4: ACTIVE HANDLER SUMMARY\n');

Object.entries(report.pages).forEach(([name, data]) => {
  let activeHandlers = 0;
  const handlers = [];
  
  if (data.formsJsScriptCount > 0) {
    activeHandlers++;
    handlers.push('forms.js');
  }
  
  if (data.bookingJsLoaded) {
    activeHandlers++;
    handlers.push('booking.js');
  }
  
  if (data.legacyBookingJsLoaded) {
    activeHandlers++;
    handlers.push('legacy/booking.js');
  }
  
  if (data.hasInlineFormListener) {
    activeHandlers++;
    handlers.push('inline handler');
  }
  
  const status = activeHandlers === 1 ? '✅' : (activeHandlers === 0 ? '❌ NONE' : '🔴 MULTIPLE');
  console.log(`${name}: ${activeHandlers} potential handler(s) ${status}`);
  console.log(`  Handlers: ${handlers.join(', ')}`);
});

console.log('\n============================================================');
console.log('LAYER 1 INVESTIGATION COMPLETE');
console.log('============================================================');

// Write JSON report
const reportPath = path.join(__dirname, '..', 'BOOKING_PIPELINE_LAYER1_REPORT.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`\nReport saved: BOOKING_PIPELINE_LAYER1_REPORT.json`);
