#!/usr/bin/env node

const BASE_URL = 'http://localhost:3000';

async function inspect() {
  console.log('='.repeat(70));
  console.log('PHASE 1: RUNTIME INSPECTION');
  console.log('='.repeat(70));
  console.log(`\nTime: ${new Date().toISOString()}`);
  console.log(`Base URL: ${BASE_URL}\n`);

  // Test 1: Server connectivity
  console.log('[1] Testing server connectivity...');
  try {
    const res = await fetch(`${BASE_URL}/`, { timeout: 5000 });
    console.log(`    ✓ Server responding on port 3000`);
    console.log(`    Status: ${res.status}`);
  } catch (e) {
    console.log(`    ✗ Server not responding: ${e.message}`);
    process.exit(1);
  }

  // Test 2: Gallery page
  console.log('\n[2] Loading /dashboard/gallery...');
  try {
    const res = await fetch(`${BASE_URL}/dashboard/gallery`, { 
      timeout: 10000,
      redirect: 'follow'
    });
    console.log(`    Status: ${res.status}`);
    const html = await res.text();
    
    // Check for key elements
    const hasImageChangeDialog = html.includes('ImageChangeDialog') || html.includes('image-change-dialog');
    const hasEditButton = html.includes('Edit image') || html.includes('edit-image');
    const hasGalleryComponent = html.includes('gallery');
    const hasReactApp = html.includes('<div id="__next"') || html.includes('React');
    
    console.log(`    HTML Length: ${html.length} bytes`);
    console.log(`    Contains React root: ${hasReactApp ? '✓' : '✗'}`);
    console.log(`    Contains gallery mentions: ${hasGalleryComponent ? '✓' : '✗'}`);
    console.log(`    Contains "Edit image": ${hasEditButton ? '✓' : '✗'}`);
    console.log(`    Contains ImageChangeDialog: ${hasImageChangeDialog ? '✓' : '✗'}`);
    
    // Save HTML for inspection
    const fs = await import('fs');
    fs.writeFileSync('gallery-page-dump.html', html);
    console.log(`    ✓ Saved HTML to gallery-page-dump.html`);
    
  } catch (e) {
    console.log(`    ✗ Error loading gallery: ${e.message}`);
  }

  // Test 3: Services page
  console.log('\n[3] Loading /dashboard/services...');
  try {
    const res = await fetch(`${BASE_URL}/dashboard/services`, { 
      timeout: 10000,
      redirect: 'follow'
    });
    console.log(`    Status: ${res.status}`);
    const html = await res.text();
    console.log(`    HTML Length: ${html.length} bytes`);
    console.log(`    Contains "Edit image": ${html.includes('Edit image') ? '✓' : '✗'}`);
  } catch (e) {
    console.log(`    ✗ Error: ${e.message}`);
  }

  // Test 4: CMS page
  console.log('\n[4] Loading /dashboard/website...');
  try {
    const res = await fetch(`${BASE_URL}/dashboard/website`, { 
      timeout: 10000,
      redirect: 'follow'
    });
    console.log(`    Status: ${res.status}`);
    const html = await res.text();
    console.log(`    HTML Length: ${html.length} bytes`);
    console.log(`    Contains "Edit image": ${html.includes('Edit image') ? '✓' : '✗'}`);
  } catch (e) {
    console.log(`    ✗ Error: ${e.message}`);
  }

  // Test 5: Check API endpoint
  console.log('\n[5] Testing /api/admin/upload endpoint...');
  try {
    const res = await fetch(`${BASE_URL}/api/admin/upload`, { 
      method: 'OPTIONS',
      timeout: 5000
    });
    console.log(`    Status: ${res.status}`);
    console.log(`    Headers: ${JSON.stringify(Object.fromEntries(res.headers))}`);
  } catch (e) {
    console.log(`    Note: ${e.message} (expected for OPTIONS)`);
  }

  console.log('\n' + '='.repeat(70));
  console.log('INSPECTION COMPLETE');
  console.log('='.repeat(70));
}

inspect().catch(console.error);
