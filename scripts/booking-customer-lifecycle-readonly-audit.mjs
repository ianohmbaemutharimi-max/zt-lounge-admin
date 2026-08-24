#!/usr/bin/env node

/**
 * ZT LOUNGE — BOOKING & CUSTOMER LIFECYCLE
 * COMPREHENSIVE READ-ONLY AUDIT
 * 
 * This script performs a STRICT READ-ONLY audit without any modifications.
 * 
 * DOES NOT:
 * - modify code
 * - modify SQL
 * - create migrations
 * - execute mutations
 * - create test data
 * 
 * ONLY:
 * - inspects code
 * - reads metadata
 * - executes safe SELECT queries
 * - documents findings
 */

import { createClient } from '@supabase/supabase-js';
import { readFile, readdir, writeFile } from 'fs/promises';
import { join } from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const audit = {
  timestamp: new Date().toISOString(),
  project: 'jczwilrysvnhcjzjztbi',
  type: 'READ-ONLY COMPREHENSIVE AUDIT',
  phases: {}
};

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║  ZT LOUNGE — BOOKING & CUSTOMER LIFECYCLE                        ║');
console.log('║  READ-ONLY COMPREHENSIVE AUDIT                                   ║');
console.log('╚══════════════════════════════════════════════════════════════════╝\n');

// ============================================================
// PHASE 1 — PUBLIC BOOKING ARCHITECTURE
// ============================================================
console.log('📋 [PHASE 1] PUBLIC BOOKING ARCHITECTURE\n');

const phase1 = {
  status: 'IN_PROGRESS',
  services: [],
  findings: []
};

// Check if public website directory exists
const publicWebsiteRoot = 'd:/zt lounge/zt-lounge-demo/zt-lounge-public-website';

const services = [
  { name: 'restaurant', slug: 'restaurant' },
  { name: 'lounge-bar', slug: 'lounge-bar' },
  { name: 'vip-cabins', slug: 'vip-cabins' },
  { name: 'events', slug: 'events' },
  { name: 'conference', slug: 'conference' },
  { name: 'auto-spa', slug: 'auto-spa' }
];

console.log('🔍 Inspecting public booking forms...\n');

for (const service of services) {
  console.log(`   Checking ${service.name}...`);
  
  const serviceAudit = {
    service: service.name,
    slug: service.slug,
    page: `🔍 NOT PROVEN`,
    form: `🔍 NOT PROVEN`,
    formId: `🔍 NOT PROVEN`,
    handler: `🔍 NOT PROVEN`,
    rpcInvocation: `🔍 NOT PROVEN`,
    status: '🔍 NOT PROVEN'
  };
  
  // Try to find the HTML page
  try {
    const possiblePaths = [
      `${publicWebsiteRoot}/${service.name}.html`,
      `${publicWebsiteRoot}/pages/${service.name}.html`,
      `${publicWebsiteRoot}/${service.slug}.html`
    ];
    
    for (const path of possiblePaths) {
      try {
        const content = await readFile(path, 'utf-8');
        serviceAudit.page = path;
        serviceAudit.status = '✅ FOUND';
        
        // Look for form
        const formMatch = content.match(/<form[^>]*id="([^"]*booking[^"]*)"[^>]*>/i);
        if (formMatch) {
          serviceAudit.formId = formMatch[1];
          serviceAudit.form = '✅ FOUND';
        }
        
        // Look for forms.js
        if (content.includes('forms.js')) {
          serviceAudit.handler = '✅ forms.js loaded';
        }
        
        // Look for service slug
        if (content.includes(service.slug)) {
          serviceAudit.slug = `✅ ${service.slug}`;
        }
        
        break;
      } catch {}
    }
  } catch (error) {
    serviceAudit.status = '❌ FILE NOT ACCESSIBLE';
  }
  
  phase1.services.push(serviceAudit);
}

phase1.status = 'COMPLETE';
phase1.findings.push('Phase 1 limited by public website directory access');
audit.phases.phase1 = phase1;

console.log('\n✓ Phase 1 complete\n');

// ============================================================
// PHASE 2 — FRONTEND → RPC CONTRACT
// ============================================================
console.log('📋 [PHASE 2] FRONTEND → RPC CONTRACT\n');

const phase2 = {
  status: 'IN_PROGRESS',
  findings: []
};

console.log('🔍 Inspecting forms.js...\n');

try {
  const formsJsPath = `${publicWebsiteRoot}/assets/js/forms.js`;
  const formsContent = await readFile(formsJsPath, 'utf-8');
  
  phase2.formsJs = {
    found: true,
    path: formsJsPath,
    size: formsContent.length
  };
  
  // Extract booking-related function
  const bookingFunctionMatch = formsContent.match(/async\s+function\s+(\w*booking\w*)\s*\([^)]*\)\s*{[\s\S]{0,2000}}/i);
  if (bookingFunctionMatch) {
    phase2.bookingFunction = bookingFunctionMatch[0].substring(0, 500) + '...';
  }
  
  // Look for RPC call
  const rpcMatch = formsContent.match(/\.rpc\(['"](create_booking)['"]/);
  if (rpcMatch) {
    phase2.rpcCall = '✅ create_booking RPC found';
  }
  
  // Extract parameter names
  const paramMatches = formsContent.match(/p_\w+/g);
  if (paramMatches) {
    phase2.parameters = [...new Set(paramMatches)];
  }
  
} catch (error) {
  phase2.formsJs = {
    found: false,
    error: error.message
  };
}

console.log('🔍 Inspecting BookingRepository...\n');

try {
  const repoPath = `${publicWebsiteRoot}/assets/js/BookingRepository.js`;
  const repoContent = await readFile(repoPath, 'utf-8');
  
  phase2.bookingRepository = {
    found: true,
    path: repoPath
  };
  
  // Extract createBooking method
  const createBookingMatch = repoContent.match(/createBooking\s*\([^)]*\)\s*{[\s\S]{0,1000}}/);
  if (createBookingMatch) {
    phase2.createBookingMethod = createBookingMatch[0].substring(0, 500) + '...';
  }
  
} catch (error) {
  phase2.bookingRepository = {
    found: false,
    error: error.message
  };
}

phase2.status = 'COMPLETE';
audit.phases.phase2 = phase2;

console.log('✓ Phase 2 complete\n');

// ============================================================
// PHASE 3 — LIVE DATABASE SCHEMA
// ============================================================
console.log('📋 [PHASE 3] LIVE DATABASE SCHEMA\n');

const phase3 = {
  status: 'IN_PROGRESS',
  tables: {}
};

// Inspect bookings table
console.log('🔍 Inspecting public.bookings schema...\n');

const { data: bookingsColumns } = await supabase
  .from('bookings')
  .select('*')
  .limit(0);

if (bookingsColumns !== null) {
  phase3.tables.bookings = {
    exists: true,
    columns: '✅ Table accessible',
    note: 'Column details inferred from table structure'
  };
}

// Get foreign keys
const { data: fkData } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT
      conname AS constraint_name,
      pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid = 'public.bookings'::regclass
      AND contype = 'f'
    ORDER BY conname;
  `
});

phase3.tables.bookings.foreignKeys = fkData || [];

// Inspect customers table
console.log('🔍 Inspecting public.customers schema...\n');

const { data: customersData } = await supabase
  .from('customers')
  .select('*')
  .limit(0);

phase3.tables.customers = {
  exists: customersData !== null,
  accessible: '✅ Table accessible'
};

// Inspect services table
console.log('🔍 Inspecting public.services schema...\n');

const { data: servicesData } = await supabase
  .from('services')
  .select('slug, name, duration_minutes, is_active')
  .order('name');

phase3.tables.services = {
  exists: true,
  count: servicesData?.length || 0,
  services: servicesData || []
};

phase3.status = 'COMPLETE';
audit.phases.phase3 = phase3;

console.log('✓ Phase 3 complete\n');

// ============================================================
// PHASE 4 — CUSTOMER IDENTITY
// ============================================================
console.log('📋 [PHASE 4] CUSTOMER IDENTITY\n');

const phase4 = {
  status: 'IN_PROGRESS'
};

console.log('🔍 Analyzing customer phone formats...\n');

const { data: customers } = await supabase
  .from('customers')
  .select('id, phone, email')
  .order('created_at');

const phoneFormats = {};
const emailStats = {
  total: customers?.length || 0,
  withEmail: 0,
  nullEmail: 0,
  uniqueEmails: new Set()
};

customers?.forEach(c => {
  // Phone format analysis
  if (c.phone) {
    let format = 'other';
    if (c.phone.startsWith('+254')) format = 'international_+254';
    else if (c.phone.startsWith('254')) format = 'country_code_254';
    else if (c.phone.startsWith('07') || c.phone.startsWith('01')) format = 'local_07_01';
    else if (c.phone.startsWith('7') || c.phone.startsWith('1')) format = 'short_7_1';
    
    phoneFormats[format] = (phoneFormats[format] || 0) + 1;
  }
  
  // Email analysis
  if (c.email) {
    emailStats.withEmail++;
    emailStats.uniqueEmails.add(c.email);
  } else {
    emailStats.nullEmail++;
  }
});

phase4.phoneFormats = phoneFormats;
phase4.emailAnalysis = {
  total: emailStats.total,
  withEmail: emailStats.withEmail,
  nullEmail: emailStats.nullEmail,
  uniqueEmails: emailStats.uniqueEmails.size,
  hasDuplicates: emailStats.withEmail > emailStats.uniqueEmails.size
};

// Check for phone uniqueness constraint
const { data: customerConstraints } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT
      conname,
      pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid = 'public.customers'::regclass
      AND contype = 'u'
    ORDER BY conname;
  `
});

phase4.uniqueConstraints = customerConstraints || [];

phase4.status = 'COMPLETE';
audit.phases.phase4 = phase4;

console.log('✓ Phase 4 complete\n');

// ============================================================
// PHASE 5 — CUSTOMER UPSERT
// ============================================================
console.log('📋 [PHASE 5] CUSTOMER UPSERT\n');

const phase5 = {
  status: 'IN_PROGRESS'
};

console.log('🔍 Inspecting create_booking() implementation...\n');

const { data: functionDef } = await supabase.rpc('exec_sql', {
  sql: `
    SELECT pg_get_functiondef(oid) AS definition
    FROM pg_proc
    WHERE proname = 'create_booking'
      AND pronamespace = 'public'::regnamespace;
  `
});

if (functionDef && functionDef[0]) {
  phase5.functionDefinition = functionDef[0].definition;
  phase5.found = true;
  
  const def = functionDef[0].definition;
  
  // Analyze customer handling
  phase5.analysis = {
    securityDefiner: def.includes('SECURITY DEFINER'),
    searchPath: def.match(/SET search_path[^;]+/)?.[0] || '🔍 NOT FOUND',
    customerInsert: def.includes('INSERT INTO') && def.includes('customers'),
    customerSelect: def.includes('SELECT') && def.includes('FROM') && def.includes('customers'),
    phoneNormalization: def.includes('normalize') || def.includes('phone'),
    upsertPattern: def.includes('ON CONFLICT') || def.includes('INSERT') && def.includes('UPDATE')
  };
} else {
  phase5.found = false;
}

phase5.status = 'COMPLETE';
audit.phases.phase5 = phase5;

console.log('✓ Phase 5 complete\n');

// Save intermediate results
const intermediateReport = `BOOKING_LIFECYCLE_AUDIT_INTERMEDIATE_${Date.now()}.json`;
await writeFile(intermediateReport, JSON.stringify(audit, null, 2));
console.log(`💾 Intermediate audit saved: ${intermediateReport}\n`);

console.log('✅ First 5 phases complete. Continue with remaining phases...\n');

process.exit(0);
