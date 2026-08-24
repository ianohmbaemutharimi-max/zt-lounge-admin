import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_SITE = path.resolve(__dirname, '..', '..', 'zt-lounge');

console.log('============================================================');
console.log('BOOKING PIPELINE LAYER 1 — FIX MISSING forms.js');
console.log('============================================================\n');

const pagesToFix = [
  { path: 'pages/experiences/lounge.html', name: 'Lounge' },
  { path: 'pages/experiences/vip.html', name: 'VIP' },
  { path: 'pages/business/events.html', name: 'Events' },
  { path: 'pages/business/conference.html', name: 'Conference' },
  { path: 'pages/business/autospa.html', name: 'Auto Spa' }
];

const FORMS_JS_TAG = '    <script src="../../assets/js/forms.js" defer></script>';

pagesToFix.forEach(page => {
  const fullPath = path.join(PUBLIC_SITE, page.path);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`❌ ${page.name}: FILE NOT FOUND`);
    return;
  }
  
  let content = fs.readFileSync(fullPath, 'utf8');
  
  // Check if forms.js already exists (shouldn't, but verify)
  if (/<script[^>]*src=['"].*forms\.js['"]/.test(content)) {
    console.log(`⚠️  ${page.name}: forms.js already exists, skipping`);
    return;
  }
  
  // Find content-loader.js line and insert forms.js BEFORE it
  const contentLoaderPattern = /(\s*<script src="\.\.\/\.\.\/assets\/js\/content-loader\.js" defer><\/script>)/;
  
  if (!contentLoaderPattern.test(content)) {
    console.log(`❌ ${page.name}: Could not find content-loader.js anchor`);
    return;
  }
  
  // Insert forms.js BEFORE content-loader.js
  content = content.replace(contentLoaderPattern, `${FORMS_JS_TAG}\n$1`);
  
  // Write back
  fs.writeFileSync(fullPath, content, 'utf8');
  
  console.log(`✅ ${page.name}: Added forms.js before content-loader.js`);
});

console.log('\n============================================================');
console.log('FIX COMPLETE');
console.log('============================================================');
console.log('\nVerification: Re-run booking-pipeline-layer1-investigation.mjs');
