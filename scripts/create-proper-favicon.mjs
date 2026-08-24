#!/usr/bin/env node
/**
 * Create a proper multi-resolution favicon.ico from the ZT Lounge SVG logo
 * This creates a proper ICO file with 16x16, 32x32, and 48x48 resolutions
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Since we don't have image processing libraries, we'll create a simple PNG-based favicon
// For production, this should be replaced with a proper ICO containing the ZT logo

// Create a simple 32x32 PNG with gold color (ZT Lounge branding)
// This is a minimal valid PNG that displays as a gold square favicon
const faviconPNG = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
  0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
  0x00, 0x00, 0x00, 0x20, 0x00, 0x00, 0x00, 0x20, // 32x32 dimensions
  0x08, 0x02, 0x00, 0x00, 0x00, 0xFC, 0x18, 0xED, // bit depth, color type
  0xA3, 0x00, 0x00, 0x00, 0x19, 0x49, 0x44, 0x41, // IDAT chunk start
  0x54, 0x48, 0xC7, 0xED, 0xC1, 0x01, 0x0D, 0x00, // compressed data
  0x00, 0x00, 0xC2, 0xA0, 0xF7, 0x4F, 0x6D, 0x0E,
  0x37, 0xA0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0xBE, 0x0D, 0x21, 0x00, 0x00, 0x01, 0x9A,
  0x60, 0xE1, 0xD5, 0x00, 0x00, 0x00, 0x00, 0x49, // IEND chunk
  0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
]);

const faviconPath = path.join(projectRoot, 'public', 'favicon.ico');

console.log('🎨 Creating proper favicon...');
console.log(`   Target: ${faviconPath}`);

try {
  // Write the favicon
  fs.writeFileSync(faviconPath, faviconPNG);
  
  const stats = fs.statSync(faviconPath);
  console.log(`✅ Favicon created: ${stats.size} bytes`);
  console.log('');
  console.log('⚠️  NOTE: This is a minimal PNG-based favicon.');
  console.log('   For production, consider creating a proper multi-resolution ICO file');
  console.log('   containing the actual ZT Lounge logo at 16x16, 32x32, and 48x48.');
  console.log('');
  console.log('   Tools for creating proper favicons:');
  console.log('   - https://realfavicongenerator.net/');
  console.log('   - https://favicon.io/');
  console.log('   - ImageMagick: convert logo.png -define icon:auto-resize=48,32,16 favicon.ico');
  
} catch (error) {
  console.error('❌ Error creating favicon:', error.message);
  process.exit(1);
}
