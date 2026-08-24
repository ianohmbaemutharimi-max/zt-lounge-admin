#!/usr/bin/env node
/**
 * ZT LOUNGE PUBLIC WEBSITE — FORM INTEGRATION AUDIT
 * 
 * Comprehensive audit of every form on the public website.
 * Traces complete data flow from customer submission to database to admin.
 * 
 * READ-ONLY AUDIT — NO MODIFICATIONS
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Public website root
const PUBLIC_SITE_ROOT = path.resolve(__dirname, '../../zt-lounge');

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║   ZT LOUNGE PUBLIC FORM INTEGRATION AUDIT                  ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

const audit = {
  timestamp: new Date().toISOString(),
  publicSiteRoot: PUBLIC_SITE_ROOT,
  forms: [],
  repositories: [],
  handlers: [],
  databaseTables: [],
  adminEndpoints: [],
  issues: [],
  dataFlows: [],
  recommendations: []
};

// ============================================================
// PHASE 1: FIND ALL HTML FORMS
// ============================================================
console.log('📋 PHASE 1: Scanning HTML files for forms...\n');

function scanDirectory(dir, pattern) {
  const results = [];
  
  function scan(currentPath) {
    try {
      const items = fs.readdirSync(currentPath);
      
      for (const item of items) {
        const fullPath = path.join(currentPath, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          // Skip node_modules, .git, etc.
          if (!item.startsWith('.') && item !== 'node_modules' && item !== 'zt-lounge-admin') {
            scan(fullPath);
          }
        } else if (stat.isFile() && pattern.test(item)) {
          results.push(fullPath);
        }
      }
    } catch (error) {
      console.warn(`⚠ Could not scan ${currentPath}: ${error.message}`);
    }
  }
  
  scan(dir);
  return results;
}

// Find all HTML files
const htmlFiles = scanDirectory(PUBLIC_SITE_ROOT, /\.html$/);
console.log(`✓ Found ${htmlFiles.length} HTML files\n`);

// Scan each HTML file for forms
for (const htmlFile of htmlFiles) {
  try {
    const content = fs.readFileSync(htmlFile, 'utf-8');
    const relativePath = path.relative(PUBLIC_SITE_ROOT, htmlFile);
    
    // Find all <form> tags
    const formMatches = content.matchAll(/<form[^>]*>([\s\S]*?)<\/form>/gi);
    
    for (const match of formMatches) {
      const formHTML = match[0];
      const formContent = match[1];
      
      // Extract form attributes
      const idMatch = formHTML.match(/id=["']([^"']+)["']/i);
      const classMatch = formHTML.match(/class=["']([^"']+)["']/i);
      const actionMatch = formHTML.match(/action=["']([^"']+)["']/i);
      const methodMatch = formHTML.match(/method=["']([^"']+)["']/i);
      
      // Extract inputs
      const inputs = [];
      const inputMatches = formContent.matchAll(/<(input|textarea|select)[^>]*>/gi);
      
      for (const inputMatch of inputMatches) {
        const inputHTML = inputMatch[0];
        const nameMatch = inputHTML.match(/name=["']([^"']+)["']/i);
        const typeMatch = inputHTML.match(/type=["']([^"']+)["']/i);
        const idMatch = inputHTML.match(/id=["']([^"']+)["']/i);
        
        if (nameMatch) {
          inputs.push({
            name: nameMatch[1],
            type: typeMatch ? typeMatch[1] : (inputMatch[1] === 'textarea' ? 'textarea' : 'text'),
            id: idMatch ? idMatch[1] : null
          });
        }
      }
      
      const form = {
        file: relativePath,
        id: idMatch ? idMatch[1] : null,
        class: classMatch ? classMatch[1] : null,
        action: actionMatch ? actionMatch[1] : null,
        method: methodMatch ? methodMatch[1] : 'GET',
        inputs: inputs,
        handler: null,
        repository: null,
        database: null,
        admin: null,
        status: 'UNKNOWN'
      };
      
      audit.forms.push(form);
      console.log(`  📝 Form found: ${relativePath}`);
      console.log(`     ID: ${form.id || 'none'}`);
      console.log(`     Inputs: ${inputs.length} fields`);
      console.log('');
    }
  } catch (error) {
    console.warn(`⚠ Could not parse ${htmlFile}: ${error.message}`);
  }
}

console.log(`\n✓ Total forms found: ${audit.forms.length}\n`);

// ============================================================
// PHASE 2: FIND ALL JAVASCRIPT HANDLERS
// ============================================================
console.log('📋 PHASE 2: Scanning JavaScript files...\n');

const jsFiles = scanDirectory(PUBLIC_SITE_ROOT, /\.js$/);
console.log(`✓ Found ${jsFiles.length} JavaScript files\n`);

for (const jsFile of jsFiles) {
  try {
    const content = fs.readFileSync(jsFile, 'utf-8');
    const relativePath = path.relative(PUBLIC_SITE_ROOT, jsFile);
    
    // Find form event listeners
    const eventListenerMatches = content.matchAll(/(?:document\.getElementById|document\.querySelector)\s*\(\s*['"]([^'"]+)['"]\s*\)[\s\S]{0,100}?addEventListener\s*\(\s*['"]submit['"]/gi);
    
    for (const match of eventListenerMatches) {
      console.log(`  🎯 Form handler: ${relativePath} handles #${match[1]}`);
      audit.handlers.push({
        file: relativePath,
        formId: match[1],
        type: 'addEventListener'
      });
    }
    
    // Find Supabase calls
    const supabaseCalls = content.matchAll(/supabase\s*\.\s*(from|rpc)\s*\(\s*['"]([^'"]+)['"]\s*\)/gi);
    
    for (const match of supabaseCalls) {
      const method = match[1];
      const target = match[2];
      console.log(`  💾 Supabase ${method}: ${relativePath} → ${target}`);
      audit.databaseTables.push({
        file: relativePath,
        method,
        target
      });
    }
    
    // Find repository instantiations
    const repoMatches = content.matchAll(/new\s+(\w+Repository)\s*\(/gi);
    
    for (const match of repoMatches) {
      console.log(`  📦 Repository: ${relativePath} uses ${match[1]}`);
      audit.repositories.push({
        file: relativePath,
        class: match[1]
      });
    }
    
  } catch (error) {
    console.warn(`⚠ Could not parse ${jsFile}: ${error.message}`);
  }
}

console.log('');

// ============================================================
// PHASE 3: SCAN REPOSITORY FILES
// ============================================================
console.log('📋 PHASE 3: Scanning repository implementations...\n');

const repoDir = path.join(PUBLIC_SITE_ROOT, 'assets/js/repositories');

if (fs.existsSync(repoDir)) {
  const repoFiles = fs.readdirSync(repoDir).filter(f => f.endsWith('.js'));
  
  for (const repoFile of repoFiles) {
    try {
      const content = fs.readFileSync(path.join(repoDir, repoFile), 'utf-8');
      
      console.log(`  📦 ${repoFile}:`);
      
      // Find Supabase operations
      const operations = content.matchAll(/supabase\s*\.\s*from\s*\(\s*['"]([^'"]+)['"]\s*\)[\s\S]{0,50}?\.(select|insert|update|delete)/gi);
      
      for (const match of operations) {
        console.log(`     → ${match[2].toUpperCase()} on table: ${match[1]}`);
      }
      
      // Find RPC calls
      const rpcCalls = content.matchAll(/supabase\s*\.\s*rpc\s*\(\s*['"]([^'"]+)['"]/gi);
      
      for (const match of rpcCalls) {
        console.log(`     → RPC call: ${match[1]}`);
      }
      
      console.log('');
    } catch (error) {
      console.warn(`⚠ Could not parse ${repoFile}: ${error.message}`);
    }
  }
}

// ============================================================
// PHASE 4: CHECK BOOKING.CONFIG.JS
// ============================================================
console.log('📋 PHASE 4: Analyzing booking configuration...\n');

const bookingConfigPath = path.join(PUBLIC_SITE_ROOT, 'assets/js/booking.config.js');

if (fs.existsSync(bookingConfigPath)) {
  try {
    const content = fs.readFileSync(bookingConfigPath, 'utf-8');
    console.log('✓ booking.config.js found\n');
    
    // Extract key configuration
    const tableMatch = content.match(/table\s*:\s*['"]([^'"]+)['"]/);
    const rpcMatch = content.match(/rpc\s*:\s*['"]([^'"]+)['"]/);
    
    if (tableMatch) {
      console.log(`  Target table: ${tableMatch[1]}`);
      audit.issues.push({
        severity: 'INFO',
        component: 'booking.config.js',
        message: `Booking configured to use table: ${tableMatch[1]}`
      });
    }
    
    if (rpcMatch) {
      console.log(`  Target RPC: ${rpcMatch[1]}`);
      audit.issues.push({
        severity: 'INFO',
        component: 'booking.config.js',
        message: `Booking configured to use RPC: ${rpcMatch[1]}`
      });
    }
    
    console.log('');
  } catch (error) {
    console.warn(`⚠ Could not parse booking.config.js: ${error.message}`);
  }
} else {
  console.log('⚠ booking.config.js not found\n');
  audit.issues.push({
    severity: 'WARNING',
    component: 'booking.config.js',
    message: 'Booking configuration file not found'
  });
}

// ============================================================
// PHASE 5: MAP TO ADMIN ENDPOINTS
// ============================================================
console.log('📋 PHASE 5: Mapping to admin dashboard...\n');

const adminRoot = path.join(PUBLIC_SITE_ROOT, 'zt-lounge-admin');
const adminPagesDir = path.join(adminRoot, 'src/app/dashboard');

if (fs.existsSync(adminPagesDir)) {
  const adminPages = fs.readdirSync(adminPagesDir);
  
  for (const page of adminPages) {
    if (fs.statSync(path.join(adminPagesDir, page)).isDirectory()) {
      console.log(`  📊 Admin page: /dashboard/${page}`);
      audit.adminEndpoints.push(`/dashboard/${page}`);
    }
  }
  
  console.log('');
}

// ============================================================
// PHASE 6: GENERATE DATA FLOW ANALYSIS
// ============================================================
console.log('📋 PHASE 6: Analyzing data flows...\n');

// Match forms to handlers
for (const form of audit.forms) {
  if (form.id) {
    const handler = audit.handlers.find(h => h.formId === form.id);
    if (handler) {
      form.handler = handler.file;
      console.log(`✓ ${form.file} (#${form.id}) → handler: ${handler.file}`);
    } else {
      console.log(`⚠ ${form.file} (#${form.id}) → no handler found`);
      audit.issues.push({
        severity: 'WARNING',
        component: `Form #${form.id}`,
        file: form.file,
        message: 'No JavaScript handler found'
      });
    }
  }
}

console.log('');

// ============================================================
// PHASE 7: IDENTIFY CRITICAL ISSUES
// ============================================================
console.log('📋 PHASE 7: Identifying critical issues...\n');

// Check for forms without handlers
const formsWithoutHandlers = audit.forms.filter(f => f.id && !f.handler);
if (formsWithoutHandlers.length > 0) {
  console.log(`🔴 ${formsWithoutHandlers.length} forms have no JavaScript handler`);
  formsWithoutHandlers.forEach(f => {
    console.log(`   - ${f.file} (#${f.id})`);
  });
  console.log('');
}

// Check for handlers without Supabase calls
const jsFilesWithHandlers = [...new Set(audit.handlers.map(h => h.file))];
const jsFilesWithDatabase = [...new Set(audit.databaseTables.map(d => d.file))];
const handlersWithoutDB = jsFilesWithHandlers.filter(f => !jsFilesWithDatabase.includes(f));

if (handlersWithoutDB.length > 0) {
  console.log(`🟡 ${handlersWithoutDB.length} handlers may not persist to database`);
  handlersWithoutDB.forEach(f => {
    console.log(`   - ${f}`);
    audit.issues.push({
      severity: 'WARNING',
      component: f,
      message: 'Form handler found but no database operation detected'
    });
  });
  console.log('');
}

// ============================================================
// FINAL REPORT
// ============================================================
console.log('═'.repeat(60));
console.log('AUDIT SUMMARY');
console.log('═'.repeat(60));
console.log(`Forms discovered: ${audit.forms.length}`);
console.log(`JavaScript handlers: ${audit.handlers.length}`);
console.log(`Repositories: ${[...new Set(audit.repositories.map(r => r.class))].length}`);
console.log(`Database operations: ${audit.databaseTables.length}`);
console.log(`Admin endpoints: ${audit.adminEndpoints.length}`);
console.log(`Issues found: ${audit.issues.length}`);
console.log('═'.repeat(60));
console.log('');

// Classify forms
const connected = audit.forms.filter(f => f.id && f.handler);
const disconnected = audit.forms.filter(f => f.id && !f.handler);
const unidentifiable = audit.forms.filter(f => !f.id);

console.log('FORM STATUS:');
console.log(`  🟢 ${connected.length} forms have handlers`);
console.log(`  🔴 ${disconnected.length} forms missing handlers`);
console.log(`  ⚪ ${unidentifiable.length} forms without ID (cannot trace)`);
console.log('');

// Save detailed report
const reportPath = path.join(__dirname, '../ZT_PUBLIC_FORM_INTEGRATION_AUDIT.json');
fs.writeFileSync(reportPath, JSON.stringify(audit, null, 2));
console.log(`📄 Detailed report: ${path.relative(process.cwd(), reportPath)}`);
console.log('');

// Generate markdown report
const markdownReport = generateMarkdownReport(audit);
const mdPath = path.join(__dirname, '../ZT_PUBLIC_FORM_INTEGRATION_AUDIT.md');
fs.writeFileSync(mdPath, markdownReport);
console.log(`📄 Markdown report: ${path.relative(process.cwd(), mdPath)}`);
console.log('');

function generateMarkdownReport(audit) {
  let md = `# ZT LOUNGE PUBLIC FORM INTEGRATION AUDIT\n\n`;
  md += `**Generated:** ${audit.timestamp}\n\n`;
  md += `---\n\n`;
  
  md += `## EXECUTIVE SUMMARY\n\n`;
  md += `- **Forms discovered:** ${audit.forms.length}\n`;
  md += `- **JavaScript handlers:** ${audit.handlers.length}\n`;
  md += `- **Database operations:** ${audit.databaseTables.length}\n`;
  md += `- **Admin endpoints:** ${audit.adminEndpoints.length}\n`;
  md += `- **Issues:** ${audit.issues.length}\n\n`;
  
  md += `## 1. FORM INVENTORY\n\n`;
  md += `| File | Form ID | Inputs | Handler | Status |\n`;
  md += `|------|---------|--------|---------|--------|\n`;
  
  for (const form of audit.forms) {
    md += `| ${form.file} | ${form.id || 'none'} | ${form.inputs.length} | ${form.handler || 'MISSING'} | ${form.handler ? '🟢' : '🔴'} |\n`;
  }
  
  md += `\n## 2. JAVASCRIPT HANDLERS\n\n`;
  
  for (const handler of audit.handlers) {
    md += `### ${handler.file}\n`;
    md += `- Handles form: #${handler.formId}\n\n`;
  }
  
  md += `## 3. DATABASE OPERATIONS\n\n`;
  md += `| File | Method | Target |\n`;
  md += `|------|--------|--------|\n`;
  
  for (const db of audit.databaseTables) {
    md += `| ${db.file} | ${db.method} | ${db.target} |\n`;
  }
  
  md += `\n## 4. ISSUES\n\n`;
  
  const critical = audit.issues.filter(i => i.severity === 'CRITICAL');
  const warnings = audit.issues.filter(i => i.severity === 'WARNING');
  const info = audit.issues.filter(i => i.severity === 'INFO');
  
  if (critical.length > 0) {
    md += `### 🔴 Critical (${critical.length})\n\n`;
    for (const issue of critical) {
      md += `- **${issue.component}**: ${issue.message}\n`;
    }
    md += `\n`;
  }
  
  if (warnings.length > 0) {
    md += `### 🟡 Warnings (${warnings.length})\n\n`;
    for (const issue of warnings) {
      md += `- **${issue.component}**: ${issue.message}\n`;
    }
    md += `\n`;
  }
  
  if (info.length > 0) {
    md += `### ℹ️ Info (${info.length})\n\n`;
    for (const issue of info) {
      md += `- **${issue.component}**: ${issue.message}\n`;
    }
    md += `\n`;
  }
  
  md += `## 5. NEXT STEPS\n\n`;
  md += `1. **Review disconnected forms** - ${disconnected.length} forms need handlers\n`;
  md += `2. **Verify database persistence** - Test each form submission reaches database\n`;
  md += `3. **Map to admin** - Ensure submitted data appears in correct admin dashboard\n`;
  md += `4. **RLS audit** - Verify public forms can insert without authentication\n`;
  md += `5. **Runtime testing** - Execute E2E tests for each form\n\n`;
  
  return md;
}

console.log('✅ AUDIT COMPLETE\n');
