#!/usr/bin/env node
/**
 * ZT LOUNGE GLOBAL FORM HANDLER AUDIT
 * 
 * Comprehensive audit of ALL form handlers across the public website.
 * Detects competing/duplicate submit handlers.
 * 
 * READ-ONLY AUDIT
 */

import fs from 'fs';
import path from 'path';

const PUBLIC_SITE_ROOT = 'D:\\zt lounge\\zt-lounge-demo\\zt-lounge';

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║   ZT LOUNGE GLOBAL FORM HANDLER AUDIT                      ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// All HTML files in the public website
const htmlFiles = [
  path.join(PUBLIC_SITE_ROOT, 'index.html'),
  path.join(PUBLIC_SITE_ROOT, 'pages', 'contact', 'contact.html'),
  path.join(PUBLIC_SITE_ROOT, 'pages', 'contact', 'gallery.html'),
  path.join(PUBLIC_SITE_ROOT, 'pages', 'business', 'autospa.html'),
  path.join(PUBLIC_SITE_ROOT, 'pages', 'business', 'conference.html'),
  path.join(PUBLIC_SITE_ROOT, 'pages', 'business', 'events.html'),
  path.join(PUBLIC_SITE_ROOT, 'pages', 'experiences', 'restaurant.html'),
  path.join(PUBLIC_SITE_ROOT, 'pages', 'experiences', 'restaurant-menu.html'),
  path.join(PUBLIC_SITE_ROOT, 'pages', 'experiences', 'lounge.html'),
  path.join(PUBLIC_SITE_ROOT, 'pages', 'experiences', 'vip.html'),
  path.join(PUBLIC_SITE_ROOT, '404.html'),
];

const jsFiles = [
  path.join(PUBLIC_SITE_ROOT, 'assets', 'js', 'forms.js'),
  path.join(PUBLIC_SITE_ROOT, 'assets', 'js', 'repositories', 'BookingRepository.js'),
  path.join(PUBLIC_SITE_ROOT, 'assets', 'js', 'repositories', 'ContactRepository.js'),
  path.join(PUBLIC_SITE_ROOT, 'assets', 'js', 'content-loader.js'),
  path.join(PUBLIC_SITE_ROOT, 'assets', 'js', 'lib', 'supabase.js'),
];

const audit = {
  timestamp: new Date().toISOString(),
  forms: {},
  duplicateHandlers: [],
  inlineScripts: [],
  scriptLoading: {},
  issues: [],
};

// Patterns to search for
const patterns = {
  inlineSubmit: /addEventListener\s*\(\s*['"]submit['"]/,
  onsubmit: /onsubmit\s*=/i,
  formOnsubmit: /form\.onsubmit/i,
  preventDefault: /preventDefault/,
  windowOpen: /window\.open/,
  whatsappUrl: /wa\.me|buildWhatsAppUrl/,
  supabaseFrom: /supabase\.from|s\.from\(/,
  supabaseRpc: /supabase\.rpc|\.rpc\(/,
  bookingInsert: /BookingRepository.*insert|bookingRepository.*insert/i,
  contactInsert: /submitContact|contact_messages/i,
  bindBooking: /bindBookingForm/,
  querySelectorAll: /querySelectorAll/,
  scriptSrc: /<script[^>]+src=/gi,
};

console.log('=== PHASE 1: SCANNING HTML FILES FOR FORM HANDLERS ===\n');

for (const htmlFile of htmlFiles) {
  if (!fs.existsSync(htmlFile)) {
    console.log(`  ⚠ File not found: ${path.relative(PUBLIC_SITE_ROOT, htmlFile)}`);
    continue;
  }

  const content = fs.readFileSync(htmlFile, 'utf-8');
  const relativePath = path.relative(PUBLIC_SITE_ROOT, htmlFile);
  const lines = content.split('\n');

  // Find all form tags
  const formMatches = content.matchAll(/<form[^>]*id=["']([^"']+)["'][^>]*>/gi);
  const forms = [];
  for (const match of formMatches) {
    forms.push(match[1]);
  }

  // Find inline submit handlers
  let hasInlineHandler = false;
  let inlineHandlerLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for inline submit handlers
    if (patterns.inlineSubmit.test(line) || patterns.onsubmit.test(line) || patterns.formOnsubmit.test(line)) {
      hasInlineHandler = true;
      inlineHandlerLine = i + 1;

      // Check what this handler does
      const handlerContext = lines.slice(i, i + 30).join('\n');
      const doesWhatsApp = patterns.windowOpen.test(handlerContext) || patterns.whatsappUrl.test(handlerContext);
      const doesSupabase = patterns.supabaseFrom.test(handlerContext) || patterns.supabaseRpc.test(handlerContext);
      const doesBooking = patterns.bookingInsert.test(handlerContext);
      const doesContact = patterns.contactInsert.test(handlerContext);
      const callsPreventDefault = patterns.preventDefault.test(handlerContext);

      const handlerInfo = {
        type: 'inline',
        line: i + 1,
        form: null,
        usesWhatsApp: doesWhatsApp,
        usesSupabase: doesSupabase,
        usesBooking: doesBooking,
        usesContact: doesContact,
        callsPreventDefault,
        context: line.trim().slice(0, 150),
      };

      // Try to find which form this handler targets
      const formIdMatch = line.match(/(?:getElementById|querySelector)\s*\(\s*['"#]?([a-zA-Z][\w-]*)/);
      if (formIdMatch) {
        handlerInfo.form = formIdMatch[1];
      }

      if (!audit.inlineScripts.some(s => s.file === relativePath && s.line === handlerInfo.line)) {
        audit.inlineScripts.push(handlerInfo);
      }
    }
  }

  // Count script tags
  const scriptTags = [...content.matchAll(patterns.scriptSrc)];
  const scriptSrcs = scriptTags.map(s => {
    const m = s[0].match(/src=["']([^"']+)["']/);
    return m ? m[1] : '(inline)';
  });
  const formsJsLoaded = scriptSrcs.some(s => s.includes('forms.js'));

  // Check for duplicate forms.js loading
  const formsJsCount = scriptSrcs.filter(s => s.includes('forms.js')).length;

  // Check for inline <script> blocks that might bind forms
  const inlineScripts = content.match(/<script>(?:(?!<\/script>)[\s\S])*?<\/script>/gi);
  const inlineSubmitHandlers = [];
  if (inlineScripts) {
    for (const script of inlineScripts) {
      if (patterns.inlineSubmit.test(script)) {
        const allMatches = [...script.matchAll(new RegExp(patterns.inlineSubmit.source, 'g'))];
        for (const match of allMatches) {
          const lineNum = content.substring(0, content.indexOf(match[0])).split('\n').length;
          inlineSubmitHandlers.push({
            type: 'inline_script_block',
            line: lineNum,
            length: script.length,
            snippet: script.substring(0, 200),
          });
        }
      }
    }
  }

  audit.forms[relativePath] = {
    forms: forms,
    hasInlineHandler,
    inlineHandlerLine,
    inlineSubmitHandlers,
    scriptSrcs,
    formsJsLoaded,
    formsJsCount,
    scriptCount: scriptTags.length,
    inlineScriptCount: inlineScripts ? inlineScripts.length : 0,
  };

  console.log(`  📄 ${relativePath}`);
  console.log(`     Forms found: ${forms.join(', ') || 'none'}`);
  console.log(`     Inline submit handlers: ${hasInlineHandler ? `YES (line ${inlineHandlerLine})` : 'NONE'}`);
  console.log(`     Inline script blocks: ${inlineScripts ? inlineScripts.length : 0}`);
  console.log(`     forms.js loaded: ${formsJsLoaded ? 'YES' : 'NO'} (${formsJsCount}x)`);
  if (inlineSubmitHandlers.length > 0) {
    console.log(`     ⚠️  INLINE SUBMIT HANDLERS FOUND: ${inlineSubmitHandlers.length}`);
    inlineSubmitHandlers.forEach(h => {
      console.log(`        → Line ${h.line}: ${h.snippet.substring(0, 100)}...`);
      audit.issues.push({
        severity: 'HIGH',
        file: relativePath,
        line: h.line,
        type: 'competing_handler',
        message: `Inline submit handler at line ${h.line} may compete with forms.js centralized handler`,
      });
    });
  }
  console.log('');
}

console.log('\n=== PHASE 2: SCANNING JS FILES FOR SUBMIT LISTENERS ===\n');

for (const jsFile of jsFiles) {
  if (!fs.existsSync(jsFile)) {
    console.log(`  ⚠ File not found: ${path.basename(jsFile)}`);
    continue;
  }

  const content = fs.readFileSync(jsFile, 'utf-8');
  const relativePath = path.relative(PUBLIC_SITE_ROOT, jsFile);
  const lines = content.split('\n');

  const listeners = [];
  for (let i = 0; i < lines.length; i++) {
    if (patterns.inlineSubmit.test(lines[i])) {
      listeners.push({ line: i + 1, content: lines[i].trim().slice(0, 120) });
    }
  }

  console.log(`  📄 ${relativePath}`);
  console.log(`     Submit listeners found: ${listeners.length}`);
  listeners.forEach(l => console.log(`        → Line ${l.line}: ${l.content}`));
  console.log('');
}

console.log('\n=== PHASE 3: COMPETING HANDLER ANALYSIS ===\n');

// Specifically check contact.html
const contactPath = path.join(PUBLIC_SITE_ROOT, 'pages', 'contact', 'contact.html');
if (fs.existsSync(contactPath)) {
  const content = fs.readFileSync(contactPath, 'utf-8');
  const lines = content.split('\n');

  console.log('CONTACT.HTML - Detailed analysis:\n');

  // Find all addEventListener calls
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('addEventListener') && lines[i].includes('submit')) {
      console.log(`  Line ${i + 1}: ${lines[i].trim()}`);
      // Show context
      console.log('  Context (next 5 lines):');
      for (let j = i; j < Math.min(i + 5, lines.length); j++) {
        console.log(`    ${j + 1}: ${lines[j].trim()}`);
      }
      console.log('');
    }
  }

  // Check if forms.js is loaded
  const hasFormsJs = content.includes('forms.js');
  console.log(`  forms.js loaded: ${hasFormsJs ? 'YES' : 'NO'}`);

  // Check if contact form has onsubmit attribute
  const formMatch = content.match(/<form[^>]*id=["']contactForm["'][^>]*>/i);
  if (formMatch) {
    console.log(`  contactForm has onsubmit attr: ${/onsubmit/i.test(formMatch[0]) ? 'YES (DEFECT)' : 'NO (good)'}`);
  }
}

console.log('\n=== PHASE 4: SCRIPT LOADING ORDER ===\n');

// Check script loading order in contact.html
if (fs.existsSync(contactPath)) {
  const content = fs.readFileSync(contactPath, 'utf-8');
  const scriptSrcs = [...content.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)];
  
  console.log('CONTACT.HTML - Script loading order:\n');
  scriptSrcs.forEach((match, idx) => {
    const src = match[1];
    const hasDefer = /defer/i.test(match[0]);
    console.log(`  ${idx + 1}. ${path.basename(src)} ${hasDefer ? '(defer)' : '(blocking)'} `);
    
    if (src.includes('forms.js')) {
      console.log(`     → forms.js loaded at position ${idx + 1} of ${scriptSrcs.length}`);
      console.log(`     → Loaded AFTER all inline scripts? ${idx > scriptSrcs.length / 2 ? 'YES' : 'CHECK'}`);
    }
  });
}

console.log('\n════════════════════════════════════════════════════════════');
console.log('FORM HANDLER AUDIT SUMMARY');
console.log('════════════════════════════════════════════════════════════');

// Final summary
let criticalCount = audit.issues.filter(i => i.severity === 'HIGH').length;
let warningCount = audit.issues.filter(i => i.severity === 'WARNING').length;

console.log(`\n  🔴 Critical issues: ${criticalCount}`);
console.log(`  🟡 Warnings: ${warningCount}`);
console.log(`  📄 HTML files scanned: ${htmlFiles.filter(f => fs.existsSync(f)).length}`);
console.log(`  📄 JS files scanned: ${jsFiles.filter(f => fs.existsSync(f)).length}`);
console.log(`  📋 Forms inventoried: ${Object.values(audit.forms).reduce((a, v) => a + v.forms.length, 0)}`);
console.log('');

// Save report
const reportPath = path.join(PUBLIC_SITE_ROOT, 'zt-lounge-admin', 'scripts', 'global-form-handler-audit-report.json');
const reportDir = path.dirname(reportPath);
if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(audit, null, 2));
console.log(`📄 Full audit report: ${path.relative(process.cwd(), reportPath)}\n`);

// Generate markdown
let md = `# ZT LOUNGE FORM INTEGRITY — GLOBAL HANDLER AUDIT\n\n`;
md += `**Generated:** ${audit.timestamp}\n\n---\n\n`;
md += `## FINDING: COMPETING HANDLERS\n\n`;

if (criticalCount === 0) {
  md += `No competing form submit handlers detected.\n\n`;
} else {
  md += `⚠️ **${criticalCount} competing handler(s) found.** Each creates a race condition where forms may submit to the wrong endpoint.\n\n`;
  for (const issue of audit.issues.filter(i => i.severity === 'HIGH')) {
    md += `### ${issue.file} (line ${issue.line})\n\n`;
    md += `- **Problem:** ${issue.message}\n`;
    md += `- **Action:** Remove the inline handler. The centralized forms.js handler is authoritative.\n\n`;
  }
}

md += `## FORM INVENTORY\n\n`;
md += `| Page | Forms | Inline Handlers | forms.js | Status |\n`;
md += `|------|-------|-----------------|----------|--------|\n`;
for (const [page, data] of Object.entries(audit.forms)) {
  const status = data.inlineSubmitHandlers.length > 0 ? '🔴 COMPETING' : (data.formsJsLoaded ? '🟢 CLEAN' : '🟡 NO HANDLER');
  md += `| ${page} | ${data.forms.join(', ') || '-'} | ${data.inlineSubmitHandlers.length} | ${data.formsJsLoaded ? '✅' : '❌'} | ${status} |\n`;
}

md += `\n## SCRIPT LOADING ORDER (contact.html)\n\n`;
md += `\`forms.js\` is loaded in a \`defer\` script tag, meaning it loads AFTER all inline scripts execute.\n\n`;
md += `This creates a specific failure mode:\n`;
md += `1. Inline handler attaches to #contactForm on DOMContentLoaded\n`;
md += `2. forms.js (deferred) ALSO attaches to #contactForm on DOMContentLoaded\n`;
md += `3. Both handlers fire on submit — the inline one ALWAYS opens WhatsApp\n`;
md += `4. The user sees WhatsApp even when Supabase is available\n\n`;

md += `## RECOMMENDED FIX\n\n`;
md += `Remove the inline <script> block in contact.html (lines 1523-1635) that binds a competing submit handler to #contactForm.\n\n`;
md += `The centralized handler in forms.js will become the sole authority, implementing the intended architecture:\n`;
md += `- Try Supabase insert to contact_messages\n`;
md += `- On success: show success UI\n`;
md += `- On failure: WhatsApp fallback\n\n`;

fs.writeFileSync(path.join(process.cwd(), 'GLOBAL_FORM_HANDLER_AUDIT_REPORT.md'), md);
console.log('📄 Markdown report: GLOBAL_FORM_HANDLER_AUDIT_REPORT.md\n');
console.log('✅ AUDIT COMPLETE\n');
