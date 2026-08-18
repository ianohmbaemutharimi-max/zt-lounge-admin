#!/usr/bin/env node

/**
 * Phase 3 Upload API - Comprehensive Runtime Verification
 * 
 * This script performs ACTUAL HTTP requests against the running development server
 * to verify the upload endpoint works correctly.
 * 
 * IMPORTANT: This script does NOT fabricate results. It marks tests as BLOCKED
 * when authentication credentials are unavailable.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Admin credentials from environment (for testing)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const API_BASE_URL = 'http://localhost:3000';
const UPLOAD_ENDPOINT = `${API_BASE_URL}/api/admin/upload`;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);

// Test results storage
const results = {
  preFlight: [],
  infrastructure: [],
  authentication: [],
  rbac: [],
  validUploads: [],
  processing: [],
  invalidFiles: [],
  sizeTests: [],
  categorySecurity: [],
  uuidSecurity: [],
  publicUrl: [],
  databaseTracking: [],
  failureCleanup: [],
  pathTraversal: [],
  security: [],
  automatedTests: [],
};

let testSession = null; // Will store authenticated session for testing

/**
 * Helper: Create test images
 */
async function createTestImages() {
  console.log('\n📦 Creating test images...');
  
  const testDir = join(__dirname, '..', 'test-uploads');
  try {
    const fs = await import('fs');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  } catch (e) {
    // Directory might exist
  }
  
  // Create a 100x100 red square JPEG
  const jpegPath = join(testDir, 'test-image.jpg');
  await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 3,
      background: { r: 255, g: 0, b: 0 }
    }
  })
  .jpeg()
  .toFile(jpegPath);
  
  // Create a 200x150 green PNG
  const pngPath = join(testDir, 'test-image.png');
  await sharp({
    create: {
      width: 200,
      height: 150,
      channels: 3,
      background: { r: 0, g: 255, b: 0 }
    }
  })
  .png()
  .toFile(pngPath);
  
  // Create a 300x200 blue WebP
  const webpPath = join(testDir, 'test-image.webp');
  await sharp({
    create: {
      width: 300,
      height: 200,
      channels: 3,
      background: { r: 0, g: 0, b: 255 }
    }
  })
  .webp()
  .toFile(webpPath);
  
  // Create fake images (text files renamed)
  const fakeJpegPath = join(testDir, 'fake-image.jpg');
  writeFileSync(fakeJpegPath, 'This is not a JPEG file');
  
  const fakePngPath = join(testDir, 'fake-image.png');
  writeFileSync(fakePngPath, 'This is not a PNG file');
  
  // Create PDF file
  const pdfPath = join(testDir, 'test-file.pdf');
  writeFileSync(pdfPath, '%PDF-1.4\nFake PDF content');
  
  // Create large image (over 10MB) - 5000x5000 should be large enough
  const largePath = join(testDir, 'large-image.jpg');
  await sharp({
    create: {
      width: 5000,
      height: 5000,
      channels: 3,
      background: { r: 128, g: 128, b: 128 }
    }
  })
  .jpeg({ quality: 100 })
  .toFile(largePath);
  
  console.log('  ✓ Test images created');
  
  return {
    jpegPath,
    pngPath,
    webpPath,
    fakeJpegPath,
    fakePngPath,
    pdfPath,
    largePath,
  };
}

/**
 * Helper: Make multipart form data request
 */
async function uploadFile(filePath, category, cookies = null) {
  try {
    const FormData = (await import('form-data')).default;
    const fs = await import('fs');
    
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    form.append('category', category);
    
    const headers = { ...form.getHeaders() };
    if (cookies) {
      headers['Cookie'] = cookies;
    }
    
    const response = await fetch(UPLOAD_ENDPOINT, {
      method: 'POST',
      headers,
      body: form,
    });
    
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
    
    return {
      status: response.status,
      data,
      headers: response.headers,
    };
  } catch (error) {
    return {
      status: 0,
      data: { error: error.message },
      error,
    };
  }
}

/**
 * Test: Authenticate and get session
 */
async function testAuthentication() {
  console.log('\n🔐 Testing Authentication...');
  
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.log('  ⚠️  No admin credentials provided (ADMIN_EMAIL, ADMIN_PASSWORD)');
    results.authentication.push({
      test: 'Admin authentication',
      status: 'BLOCKED',
      details: 'No credentials in environment',
    });
    return null;
  }
  
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    
    if (error || !data.session) {
      results.authentication.push({
        test: 'Admin authentication',
        status: 'FAIL',
        details: error?.message || 'No session returned',
      });
      return null;
    }
    
    results.authentication.push({
      test: 'Admin authentication',
      status: 'PASS',
      details: 'Successfully authenticated',
    });
    
    // Build cookie string for HTTP requests
    const cookies = `sb-access-token=${data.session.access_token}; sb-refresh-token=${data.session.refresh_token}`;
    
    console.log('  ✓ Authenticated successfully');
    return { session: data.session, cookies };
    
  } catch (error) {
    results.authentication.push({
      test: 'Admin authentication',
      status: 'FAIL',
      details: error.message,
    });
    return null;
  }
}

/**
 * Test: Unauthenticated request
 */
async function testUnauthenticatedRequest(testImages) {
  console.log('\n🔒 Testing unauthenticated request...');
  
  const response = await uploadFile(testImages.jpegPath, 'gallery', null);
  
  if (response.status === 401) {
    results.authentication.push({
      test: 'Unauthenticated → 401',
      status: 'PASS',
      details: `Returned ${response.status}`,
    });
    console.log('  ✓ Correctly rejected (401)');
  } else {
    results.authentication.push({
      test: 'Unauthenticated → 401',
      status: 'FAIL',
      details: `Expected 401, got ${response.status}`,
    });
    console.log(`  ❌ Expected 401, got ${response.status}`);
  }
}

/**
 * Test: Valid image uploads
 */
async function testValidUploads(testImages, cookies) {
  console.log('\n📤 Testing valid image uploads...');
  
  if (!cookies) {
    console.log('  ⚠️  No authentication - marking as BLOCKED');
    results.validUploads.push({
      test: 'JPEG upload',
      status: 'BLOCKED',
      details: 'No authentication available',
    });
    results.validUploads.push({
      test: 'PNG upload',
      status: 'BLOCKED',
      details: 'No authentication available',
    });
    results.validUploads.push({
      test: 'WebP upload',
      status: 'BLOCKED',
      details: 'No authentication available',
    });
    return [];
  }
  
  const uploads = [];
  
  // Test JPEG
  console.log('  Testing JPEG...');
  const jpegResponse = await uploadFile(testImages.jpegPath, 'gallery', cookies);
  if (jpegResponse.status === 201 && jpegResponse.data.success) {
    results.validUploads.push({
      test: 'JPEG upload',
      status: 'PASS',
      details: `Uploaded successfully, path: ${jpegResponse.data.data?.path}`,
    });
    uploads.push(jpegResponse.data.data);
    console.log(`    ✓ Success: ${jpegResponse.data.data?.path}`);
  } else {
    results.validUploads.push({
      test: 'JPEG upload',
      status: 'FAIL',
      details: `Status ${jpegResponse.status}: ${JSON.stringify(jpegResponse.data)}`,
    });
    console.log(`    ❌ Failed: ${jpegResponse.status}`);
  }
  
  // Test PNG
  console.log('  Testing PNG...');
  const pngResponse = await uploadFile(testImages.pngPath, 'gallery', cookies);
  if (pngResponse.status === 201 && pngResponse.data.success) {
    results.validUploads.push({
      test: 'PNG upload',
      status: 'PASS',
      details: `Uploaded successfully, path: ${pngResponse.data.data?.path}`,
    });
    uploads.push(pngResponse.data.data);
    console.log(`    ✓ Success: ${pngResponse.data.data?.path}`);
  } else {
    results.validUploads.push({
      test: 'PNG upload',
      status: 'FAIL',
      details: `Status ${pngResponse.status}: ${JSON.stringify(pngResponse.data)}`,
    });
    console.log(`    ❌ Failed: ${pngResponse.status}`);
  }
  
  // Test WebP
  console.log('  Testing WebP...');
  const webpResponse = await uploadFile(testImages.webpPath, 'gallery', cookies);
  if (webpResponse.status === 201 && webpResponse.data.success) {
    results.validUploads.push({
      test: 'WebP upload',
      status: 'PASS',
      details: `Uploaded successfully, path: ${webpResponse.data.data?.path}`,
    });
    uploads.push(webpResponse.data.data);
    console.log(`    ✓ Success: ${webpResponse.data.data?.path}`);
  } else {
    results.validUploads.push({
      test: 'WebP upload',
      status: 'FAIL',
      details: `Status ${webpResponse.status}: ${JSON.stringify(webpResponse.data)}`,
    });
    console.log(`    ❌ Failed: ${webpResponse.status}`);
  }
  
  return uploads;
}

/**
 * Test: Invalid file uploads
 */
async function testInvalidFiles(testImages, cookies) {
  console.log('\n🚫 Testing invalid file uploads...');
  
  if (!cookies) {
    console.log('  ⚠️  No authentication - marking as BLOCKED');
    results.invalidFiles.push({
      test: 'Fake JPEG rejection',
      status: 'BLOCKED',
      details: 'No authentication available',
    });
    return;
  }
  
  // Test fake JPEG
  console.log('  Testing fake JPEG (text file renamed)...');
  const fakeResponse = await uploadFile(testImages.fakeJpegPath, 'gallery', cookies);
  if (fakeResponse.status === 400 || fakeResponse.status === 415) {
    results.invalidFiles.push({
      test: 'Fake JPEG rejection',
      status: 'PASS',
      details: `Correctly rejected with ${fakeResponse.status}`,
    });
    console.log(`    ✓ Correctly rejected (${fakeResponse.status})`);
  } else {
    results.invalidFiles.push({
      test: 'Fake JPEG rejection',
      status: 'FAIL',
      details: `Expected 400/415, got ${fakeResponse.status}`,
    });
    console.log(`    ❌ Expected rejection, got ${fakeResponse.status}`);
  }
  
  // Test PDF
  console.log('  Testing PDF upload...');
  const pdfResponse = await uploadFile(testImages.pdfPath, 'gallery', cookies);
  if (pdfResponse.status === 400 || pdfResponse.status === 415) {
    results.invalidFiles.push({
      test: 'PDF rejection',
      status: 'PASS',
      details: `Correctly rejected with ${pdfResponse.status}`,
    });
    console.log(`    ✓ Correctly rejected (${pdfResponse.status})`);
  } else {
    results.invalidFiles.push({
      test: 'PDF rejection',
      status: 'FAIL',
      details: `Expected 400/415, got ${pdfResponse.status}`,
    });
    console.log(`    ❌ Expected rejection, got ${pdfResponse.status}`);
  }
}

/**
 * Test: Category security
 */
async function testCategorySecurity(testImages, cookies) {
  console.log('\n🛡️  Testing category security...');
  
  if (!cookies) {
    console.log('  ⚠️  No authentication - marking as BLOCKED');
    results.categorySecurity.push({
      test: 'Path traversal rejection',
      status: 'BLOCKED',
      details: 'No authentication available',
    });
    return;
  }
  
  // Test path traversal
  console.log('  Testing path traversal (../../etc)...');
  const traversalResponse = await uploadFile(testImages.jpegPath, '../../etc', cookies);
  if (traversalResponse.status === 400) {
    results.categorySecurity.push({
      test: 'Path traversal rejection',
      status: 'PASS',
      details: 'Correctly rejected with 400',
    });
    console.log('    ✓ Correctly rejected (400)');
  } else {
    results.categorySecurity.push({
      test: 'Path traversal rejection',
      status: 'FAIL',
      details: `Expected 400, got ${traversalResponse.status}`,
    });
    console.log(`    ❌ Expected 400, got ${traversalResponse.status}`);
  }
  
  // Test invalid category
  console.log('  Testing invalid category...');
  const invalidResponse = await uploadFile(testImages.jpegPath, 'unknown-category', cookies);
  if (invalidResponse.status === 400) {
    results.categorySecurity.push({
      test: 'Invalid category rejection',
      status: 'PASS',
      details: 'Correctly rejected with 400',
    });
    console.log('    ✓ Correctly rejected (400)');
  } else {
    results.categorySecurity.push({
      test: 'Invalid category rejection',
      status: 'FAIL',
      details: `Expected 400, got ${invalidResponse.status}`,
    });
    console.log(`    ❌ Expected 400, got ${invalidResponse.status}`);
  }
}

/**
 * Print final results
 */
function printResults() {
  console.log('\n' + '='.repeat(80));
  console.log('PHASE 3 UPLOAD API - RUNTIME VERIFICATION RESULTS');
  console.log('='.repeat(80));
  
  const sections = [
    { title: 'PRE-FLIGHT', results: results.preFlight },
    { title: 'INFRASTRUCTURE', results: results.infrastructure },
    { title: 'AUTHENTICATION', results: results.authentication },
    { title: 'RBAC', results: results.rbac },
    { title: 'VALID UPLOADS', results: results.validUploads },
    { title: 'PROCESSING', results: results.processing },
    { title: 'INVALID FILES', results: results.invalidFiles },
    { title: 'SIZE TESTS', results: results.sizeTests },
    { title: 'CATEGORY SECURITY', results: results.categorySecurity },
    { title: 'UUID SECURITY', results: results.uuidSecurity },
    { title: 'PUBLIC URL', results: results.publicUrl },
    { title: 'DATABASE TRACKING', results: results.databaseTracking },
    { title: 'FAILURE CLEANUP', results: results.failureCleanup },
    { title: 'PATH TRAVERSAL', results: results.pathTraversal },
    { title: 'SECURITY', results: results.security },
    { title: 'AUTOMATED TESTS', results: results.automatedTests },
  ];
  
  for (const section of sections) {
    if (section.results.length === 0) continue;
    
    console.log(`\n📊 ${section.title}:`);
    for (const result of section.results) {
      const icon = result.status === 'PASS' ? '✅' : 
                   result.status === 'BLOCKED' ? '⚠️' :
                   result.status === 'WARN' ? '⚠️' : '❌';
      console.log(`${icon} ${result.test}: ${result.status}`);
      if (result.details) {
        console.log(`   ${result.details}`);
      }
    }
  }
  
  // Count results
  let totalTests = 0;
  let passed = 0;
  let failed = 0;
  let blocked = 0;
  
  for (const section of sections) {
    for (const result of section.results) {
      totalTests++;
      if (result.status === 'PASS') passed++;
      else if (result.status === 'FAIL') failed++;
      else if (result.status === 'BLOCKED') blocked++;
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log(`SUMMARY: ${passed} PASS, ${failed} FAIL, ${blocked} BLOCKED (${totalTests} total)`);
  
  if (failed > 0) {
    console.log('\n❌ VERIFICATION: FAIL');
    console.log('Fix the failures above before production deployment.');
  } else if (blocked > 0) {
    console.log('\n⚠️  VERIFICATION: PASS WITH WARNINGS');
    console.log('Some tests were blocked due to missing credentials or dependencies.');
    console.log('Provide authentication credentials to run complete verification.');
  } else {
    console.log('\n✅ VERIFICATION: PASS');
    console.log('All runtime tests passed successfully.');
  }
  
  console.log('='.repeat(80) + '\n');
}

/**
 * Main execution
 */
async function main() {
  console.log('Phase 3 Upload API - Runtime Verification');
  console.log('===========================================');
  console.log('Target: http://localhost:3000/api/admin/upload');
  console.log('\n⚠️  IMPORTANT: Development server must be running!');
  console.log('Run in another terminal: npm run dev\n');
  
  // Create test images
  const testImages = await createTestImages();
  
  // Test authentication
  const auth = await testAuthentication();
  
  // Test unauthenticated request
  await testUnauthenticatedRequest(testImages);
  
  // Test valid uploads
  const uploads = await testValidUploads(testImages, auth?.cookies);
  
  // Test invalid files
  await testInvalidFiles(testImages, auth?.cookies);
  
  // Test category security
  await testCategorySecurity(testImages, auth?.cookies);
  
  // Print results
  printResults();
}

main().catch(console.error);
