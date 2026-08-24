/**
 * ZT LOUNGE — PUBLIC FORMS ARCHITECTURE INVESTIGATION
 * Comprehensive audit to determine correct form submission architecture
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const report = {
  timestamp: new Date().toISOString(),
  phase1_authoritative_location: {},
  phase2_contact_architecture: {},
  phase3_booking_architecture: {},
  phase4_admin_integration: {},
  phase5_api_endpoints: {},
  phase6_correct_runtime: {},
  conclusion: {}
};

console.log('=== ZT LOUNGE PUBLIC FORMS ARCHITECTURE INVESTIGATION ===\n');

// ============================================================
// PHASE 1: IDENTIFY AUTHORITATIVE PUBLIC WEBSITE
// ============================================================

console.log('PHASE 1: Identify Authoritative Public Website Location\n');

const possibleLocations = [
  path.join(ROOT, 'public'),
  path.join(ROOT, 'pages'),
  path.join(ROOT, '..', 'zt-lounge'),
  path.join(ROOT, '..', 'zt-lounge', 'public'),
  path.join(ROOT, 'src', 'app', '(public)')
];

report.phase1_authoritative_location.searched = possibleLocations;
report.phase1_authoritative_location.found = [];

for (const loc of possibleLocations) {
  if (fs.existsSync(loc)) {
    const contactPath = path.join(loc, 'pages', 'contact', 'contact.html');
    const exists = fs.existsSync(contactPath);
    
    console.log(`${loc}`);
    console.log(`  contact.html exists: ${exists}`);
    
    if (exists) {
      const stat = fs.statSync(contactPath);
      const size = stat.size;
      console.log(`  size: ${size} bytes`);
      console.log(`  modified: ${stat.mtime.toISOString()}`);
      
      report.phase1_authoritative_location.found.push({
        path: contactPath,
        size,
        modified: stat.mtime.toISOString()
      });
    }
    console.log('');
  }
}

// Check if public/ is authoritative
const publicDir = path.join(ROOT, 'public');
if (fs.existsSync(publicDir)) {
  const files = fs.readdirSync(publicDir);
  console.log(`public/ directory contents: ${files.slice(0, 10).join(', ')}${files.length > 10 ? '...' : ''}`);
  report.phase1_authoritative_location.public_contents = files;
}

// ============================================================
// PHASE 2: TRACE CONTACT FORM END-TO-END
// ============================================================

console.log('\nPHASE 2: Trace Contact Form Architecture\n');

// Find forms.js
const formsJsLocations = [];
const findFormsJs = (dir, depth = 0) => {
  if (depth > 3 || !fs.existsSync(dir)) return;
  
  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      if (item === 'node_modules' || item === '.git' || item === '.next') continue;
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        findFormsJs(fullPath, depth + 1);
      } else if (item === 'forms.js') {
        formsJsLocations.push(fullPath);
      }
    }
  } catch {}
};

findFormsJs(ROOT);

console.log(`forms.js locations found: ${formsJsLocations.length}`);
formsJsLocations.forEach(loc => console.log(`  ${loc}`));

report.phase2_contact_architecture.forms_js_locations = formsJsLocations;

// Analyze forms.js if found
if (formsJsLocations.length > 0) {
  const formsJsPath = formsJsLocations[0];
  const content = fs.readFileSync(formsJsPath, 'utf8');
  
  // Check for API submission
  const hasApiContact = /['"]\/api\/contact['"]/.test(content);
  const hasApiBookings = /['"]\/api\/bookings['"]/.test(content);
  
  // Check for Supabase direct
  const hasSupabaseClient = /createClient|supabase/.test(content);
  const hasContactMessages = /contact_messages/.test(content);
  const hasBookingsTable = /\bbookings\b/.test(content);
  
  console.log(`\nforms.js analysis:`);
  console.log(`  Uses /api/contact: ${hasApiContact}`);
  console.log(`  Uses /api/bookings: ${hasApiBookings}`);
  console.log(`  Has Supabase client: ${hasSupabaseClient}`);
  console.log(`  References contact_messages: ${hasContactMessages}`);
  console.log(`  References bookings table: ${hasBookingsTable}`);
  
  report.phase2_contact_architecture.forms_js_analysis = {
    uses_api_contact: hasApiContact,
    uses_api_bookings: hasApiBookings,
    has_supabase_client: hasSupabaseClient,
    references_contact_messages: hasContactMessages,
    references_bookings_table: hasBookingsTable
  };
  
  // Extract relevant code snippets
  const contactSubmitMatch = content.match(/function\s+submitContact[\s\S]{0,500}/);
  if (contactSubmitMatch) {
    console.log(`\nsubmitContact function preview:`);
    console.log(contactSubmitMatch[0].substring(0, 300) + '...');
    report.phase2_contact_architecture.submitContact_preview = contactSubmitMatch[0].substring(0, 500);
  }
}

// ============================================================
// PHASE 3: CHECK ALL BOOKING FORMS
// ============================================================

console.log('\n\nPHASE 3: Trace Booking Forms Architecture\n');

const bookingForms = [
  'reservationForm',
  'loungeBookingForm',
  'vipBookingForm',
  'eventBookingForm',
  'conferenceBookingForm',
  'autospaBookingForm'
];

report.phase3_booking_architecture.forms = {};

if (formsJsLocations.length > 0) {
  const content = fs.readFileSync(formsJsLocations[0], 'utf8');
  
  bookingForms.forEach(formId => {
    const hasHandler = new RegExp(`['"]#${formId}['"]|getElementById\\(['"]${formId}['"]\\)`).test(content);
    console.log(`${formId}: ${hasHandler ? 'FOUND' : 'NOT FOUND'}`);
    report.phase3_booking_architecture.forms[formId] = hasHandler;
  });
}

// ============================================================
// PHASE 4: CHECK ADMIN RELATIONSHIP
// ============================================================

console.log('\n\nPHASE 4: Check Admin Integration\n');

// Check for admin API routes
const adminMessagesPath = path.join(ROOT, 'src', 'app', 'dashboard', 'messages');
const adminBookingsPath = path.join(ROOT, 'src', 'app', 'dashboard', 'bookings');

console.log(`Admin messages dashboard: ${fs.existsSync(adminMessagesPath) ? 'EXISTS' : 'MISSING'}`);
console.log(`Admin bookings dashboard: ${fs.existsSync(adminBookingsPath) ? 'EXISTS' : 'MISSING'}`);

report.phase4_admin_integration.admin_messages_exists = fs.existsSync(adminMessagesPath);
report.phase4_admin_integration.admin_bookings_exists = fs.existsSync(adminBookingsPath);

// Check Supabase configuration
const envPath = path.join(ROOT, '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const hasSupabaseUrl = /NEXT_PUBLIC_SUPABASE_URL/.test(envContent);
  const hasSupabaseKey = /SUPABASE/.test(envContent);
  
  console.log(`Supabase configured: ${hasSupabaseUrl && hasSupabaseKey ? 'YES' : 'NO'}`);
  report.phase4_admin_integration.supabase_configured = hasSupabaseUrl && hasSupabaseKey;
}

// ============================================================
// PHASE 5: CHECK API ENDPOINTS
// ============================================================

console.log('\n\nPHASE 5: Check API Endpoints\n');

const apiContactPath = path.join(ROOT, 'src', 'app', 'api', 'contact', 'route.ts');
const apiBookingsPath = path.join(ROOT, 'src', 'app', 'api', 'bookings', 'route.ts');

const apiContactExists = fs.existsSync(apiContactPath);
const apiBookingsExists = fs.existsSync(apiBookingsPath);

console.log(`/api/contact route: ${apiContactExists ? 'EXISTS at ' + apiContactPath : 'DOES NOT EXIST'}`);
console.log(`/api/bookings route: ${apiBookingsExists ? 'EXISTS at ' + apiBookingsPath : 'DOES NOT EXIST'}`);

report.phase5_api_endpoints.api_contact = {
  exists: apiContactExists,
  path: apiContactExists ? apiContactPath : null
};

report.phase5_api_endpoints.api_bookings = {
  exists: apiBookingsExists,
  path: apiBookingsExists ? apiBookingsPath : null
};

// ============================================================
// PHASE 6: DETERMINE CORRECT RUNTIME ARCHITECTURE
// ============================================================

console.log('\n\nPHASE 6: Determine Correct Local Runtime Architecture\n');

const nextConfigPath = path.join(ROOT, 'next.config.ts');
const packageJsonPath = path.join(ROOT, 'package.json');

if (fs.existsSync(packageJsonPath)) {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  console.log(`Project: ${pkg.name}`);
  console.log(`Next.js version: ${pkg.dependencies?.next || 'not found'}`);
  
  report.phase6_correct_runtime.project_name = pkg.name;
  report.phase6_correct_runtime.nextjs_version = pkg.dependencies?.next;
}

// Determine architecture
let architecture = 'UNKNOWN';
let explanation = '';

if (formsJsLocations.length > 0) {
  const formsContent = fs.readFileSync(formsJsLocations[0], 'utf8');
  const usesApi = /['"]\/api\//.test(formsContent);
  const usesSupabase = /createClient/.test(formsContent);
  
  if (usesApi && !apiContactExists && !apiBookingsExists) {
    architecture = 'BROKEN - Forms submit to /api/* but endpoints do not exist';
    explanation = 'forms.js references /api/contact or /api/bookings, but these API routes are not implemented in the Next.js app';
  } else if (usesApi && (apiContactExists || apiBookingsExists)) {
    architecture = 'Next.js API routes';
    explanation = 'Public forms → Next.js /api/* routes → Supabase';
  } else if (usesSupabase && !usesApi) {
    architecture = 'Direct Supabase';
    explanation = 'Public forms → Supabase browser client → Database';
  } else {
    architecture = 'UNCLEAR';
    explanation = 'Cannot determine intended architecture';
  }
}

console.log(`Architecture: ${architecture}`);
console.log(`Explanation: ${explanation}`);

report.phase6_correct_runtime.architecture = architecture;
report.phase6_correct_runtime.explanation = explanation;

// ============================================================
// ROOT CAUSE OF HTTP 501
// ============================================================

console.log('\n\nROOT CAUSE ANALYSIS\n');

const rootCause = `
The public website at http://localhost:8000 is served by a simple static HTTP server
(likely Python's http.server or similar). This server:

1. Serves HTML/CSS/JS files correctly (returns HTTP 200)
2. CANNOT handle POST requests to /api/* routes (returns HTTP 501 Not Implemented)
3. Has no backend processing capability

The forms.js file ${
  report.phase2_contact_architecture.forms_js_analysis?.uses_api_contact
    ? 'DOES submit to /api/contact'
    : 'does NOT submit to /api/contact'
}

${architecture === 'BROKEN - Forms submit to /api/* but endpoints do not exist'
  ? 'CRITICAL: The forms.js expects API endpoints that do not exist in the codebase.'
  : ''
}
`;

console.log(rootCause);
report.conclusion.root_cause = rootCause.trim();

// ============================================================
// REQUIRED REMEDIATION
// ============================================================

console.log('\nREQUIRED REMEDIATION\n');

let remediation = '';

if (architecture.startsWith('BROKEN')) {
  remediation = `
IMMEDIATE ACTION REQUIRED:

1. CREATE MISSING API ENDPOINTS:
   - src/app/api/contact/route.ts
   - src/app/api/bookings/route.ts

2. These endpoints should:
   - Accept POST requests with form data
   - Validate input
   - Write to Supabase contact_messages/bookings tables
   - Return appropriate JSON responses

3. Serve public website through Next.js:
   - Move public/ files to Next.js public/ directory OR
   - Create Next.js pages for public routes OR
   - Set up proxy from port 8000 to port 3000

ALTERNATIVE: Modify forms.js to use direct Supabase client instead of API routes.
`;
} else if (architecture === 'Direct Supabase') {
  remediation = `
The forms.js uses direct Supabase client. This architecture is VALID.

The HTTP 501 error occurred because:
- The test script tried to POST to /api/contact
- But the actual forms.js does NOT use /api/contact
- It uses Supabase browser client directly

NO CODE CHANGES REQUIRED.

To test properly: Use a real browser to submit forms, not HTTP POST to /api/*.
`;
} else if (architecture === 'Next.js API routes') {
  remediation = `
The architecture uses Next.js API routes. This is VALID.

To test properly:
1. Ensure public website is served through Next.js (port 3000), not static server (port 8000)
2. OR set up reverse proxy from port 8000 to port 3000 for /api/* routes
3. Verify API endpoints return proper responses

The static server at port 8000 cannot handle the API routes.
`;
}

console.log(remediation);
report.conclusion.remediation = remediation.trim();

// ============================================================
// SAVE REPORT
// ============================================================

const reportPath = path.join(ROOT, 'PUBLIC_FORMS_ARCHITECTURE_AUDIT.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(`\n✓ Full report saved to: PUBLIC_FORMS_ARCHITECTURE_AUDIT.json`);