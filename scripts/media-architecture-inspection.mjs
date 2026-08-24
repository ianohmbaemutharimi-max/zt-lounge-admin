#!/usr/bin/env node

/**
 * ZT LOUNGE MEDIA ARCHITECTURE INSPECTION
 * 
 * READ-ONLY comprehensive inspection of the actual media implementation
 * 
 * This script:
 * 1. Inspects database schema
 * 2. Inspects media-related files
 * 3. Inspects storage configuration
 * 4. Searches for image references
 * 5. Documents current state
 * 
 * DOES NOT MODIFY ANYTHING
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

// Colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
  console.log('\n' + '='.repeat(80));
  log(title, 'bright');
  console.log('='.repeat(80) + '\n');
}

// Load environment
function loadEnv() {
  const envPath = join(ROOT, '.env.local');
  if (!existsSync(envPath)) {
    log('⚠️  .env.local not found', 'yellow');
    return null;
  }
  
  const envContent = readFileSync(envPath, 'utf-8');
  const env = {};
  
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  });
  
  return env;
}

// Recursive file search
function findFiles(dir, pattern, results = []) {
  if (!existsSync(dir)) return results;
  
  const items = readdirSync(dir);
  
  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      if (!item.startsWith('.') && item !== 'node_modules' && item !== 'dist' && item !== 'build') {
        findFiles(fullPath, pattern, results);
      }
    } else if (pattern.test(item)) {
      results.push(fullPath);
    }
  }
  
  return results;
}

// Search file content
function searchInFile(filePath, patterns) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const results = [];
    
    for (const pattern of patterns) {
      const regex = new RegExp(pattern, 'gi');
      let match;
      
      while ((match = regex.exec(content)) !== null) {
        const lines = content.substring(0, match.index).split('\n');
        const lineNum = lines.length;
        const line = content.split('\n')[lineNum - 1];
        
        results.push({
          pattern: pattern,
          line: lineNum,
          content: line.trim(),
          match: match[0]
        });
      }
    }
    
    return results.length > 0 ? { file: relative(ROOT, filePath), matches: results } : null;
  } catch (err) {
    return null;
  }
}

async function inspectDatabase(supabase) {
  section('DATABASE SCHEMA INSPECTION');
  
  try {
    // Inspect media_assets table
    log('📋 Inspecting media_assets table...', 'cyan');
    const { data: mediaAssets, error: mediaError } = await supabase
      .from('media_assets')
      .select('*')
      .limit(5);
    
    if (mediaError) {
      log(`❌ Error querying media_assets: ${mediaError.message}`, 'red');
    } else {
      log(`✅ media_assets table exists (${mediaAssets?.length || 0} sample records)`, 'green');
      if (mediaAssets && mediaAssets.length > 0) {
        log('   Columns:', 'blue');
        Object.keys(mediaAssets[0]).forEach(col => {
          log(`   - ${col}`, 'blue');
        });
      }
    }
    
    // Inspect menu_items
    log('\n📋 Inspecting menu_items table...', 'cyan');
    const { data: menuItems, error: menuError } = await supabase
      .from('menu_items')
      .select('id, name, image_url, media_id')
      .limit(5);
    
    if (menuError) {
      log(`❌ Error: ${menuError.message}`, 'red');
    } else {
      log(`✅ menu_items table exists (${menuItems?.length || 0} sample records)`, 'green');
      if (menuItems && menuItems.length > 0) {
        const withMediaId = menuItems.filter(m => m.media_id).length;
        const withImageUrl = menuItems.filter(m => m.image_url).length;
        log(`   - ${withMediaId}/${menuItems.length} have media_id`, 'blue');
        log(`   - ${withImageUrl}/${menuItems.length} have image_url`, 'blue');
      }
    }
    
    // Inspect services
    log('\n📋 Inspecting services table...', 'cyan');
    const { data: services, error: servicesError } = await supabase
      .from('services')
      .select('id, name, image_url, media_id')
      .limit(5);
    
    if (servicesError) {
      log(`❌ Error: ${servicesError.message}`, 'red');
    } else {
      log(`✅ services table exists (${services?.length || 0} sample records)`, 'green');
      if (services && services.length > 0) {
        const withMediaId = services.filter(s => s.media_id).length;
        const withImageUrl = services.filter(s => s.image_url).length;
        log(`   - ${withMediaId}/${services.length} have media_id`, 'blue');
        log(`   - ${withImageUrl}/${services.length} have image_url`, 'blue');
      }
    }
    
    // Inspect gallery
    log('\n📋 Inspecting gallery table...', 'cyan');
    const { data: gallery, error: galleryError } = await supabase
      .from('gallery')
      .select('id, title, imageUrl, media_id')
      .limit(5);
    
    if (galleryError) {
      log(`❌ Error: ${galleryError.message}`, 'red');
    } else {
      log(`✅ gallery table exists (${gallery?.length || 0} sample records)`, 'green');
      if (gallery && gallery.length > 0) {
        const withMediaId = gallery.filter(g => g.media_id).length;
        const withImageUrl = gallery.filter(g => g.imageUrl).length;
        log(`   - ${withMediaId}/${gallery.length} have media_id`, 'blue');
        log(`   - ${withImageUrl}/${gallery.length} have imageUrl`, 'blue');
      }
    }
    
    // Inspect hero_slides
    log('\n📋 Inspecting hero_slides table...', 'cyan');
    const { data: heroSlides, error: heroError } = await supabase
      .from('hero_slides')
      .select('id, title, image_url, media_id')
      .limit(5);
    
    if (heroError) {
      log(`❌ Error: ${heroError.message}`, 'red');
    } else {
      log(`✅ hero_slides table exists (${heroSlides?.length || 0} sample records)`, 'green');
      if (heroSlides && heroSlides.length > 0) {
        const withMediaId = heroSlides.filter(h => h.media_id).length;
        const withImageUrl = heroSlides.filter(h => h.image_url).length;
        log(`   - ${withMediaId}/${heroSlides.length} have media_id`, 'blue');
        log(`   - ${withImageUrl}/${heroSlides.length} have image_url`, 'blue');
      }
    }
    
    // Inspect business_settings
    log('\n📋 Inspecting business_settings table...', 'cyan');
    const { data: settings, error: settingsError } = await supabase
      .from('business_settings')
      .select('id, business_name, logo_url, favicon_url')
      .single();
    
    if (settingsError) {
      log(`❌ Error: ${settingsError.message}`, 'red');
    } else {
      log(`✅ business_settings table exists`, 'green');
      if (settings) {
        log(`   - business_name: ${settings.business_name}`, 'blue');
        log(`   - logo_url: ${settings.logo_url || '(null)'}`, 'blue');
        log(`   - favicon_url: ${settings.favicon_url || '(null)'}`, 'blue');
      }
    }
    
  } catch (err) {
    log(`❌ Database inspection error: ${err.message}`, 'red');
  }
}

async function inspectStorage(supabase) {
  section('STORAGE INSPECTION');
  
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    
    if (error) {
      log(`❌ Error listing buckets: ${error.message}`, 'red');
      return;
    }
    
    log(`Found ${buckets.length} storage buckets:`, 'cyan');
    
    for (const bucket of buckets) {
      log(`\n📦 ${bucket.name}`, 'bright');
      log(`   - ID: ${bucket.id}`, 'blue');
      log(`   - Public: ${bucket.public}`, 'blue');
      log(`   - Created: ${bucket.created_at}`, 'blue');
      
      // Try to list files in bucket
      const { data: files, error: filesError } = await supabase.storage
        .from(bucket.name)
        .list('', { limit: 10 });
      
      if (filesError) {
        log(`   ⚠️  Cannot list files: ${filesError.message}`, 'yellow');
      } else {
        log(`   - Files: ${files.length} (showing up to 10)`, 'blue');
        files.slice(0, 5).forEach(file => {
          log(`     • ${file.name}`, 'blue');
        });
      }
    }
    
  } catch (err) {
    log(`❌ Storage inspection error: ${err.message}`, 'red');
  }
}

function inspectFileSystem() {
  section('FILE SYSTEM INSPECTION');
  
  // Check for media directories
  const dirsToCheck = [
    'src/lib/media',
    'src/features/media',
    'src/app/dashboard/media',
    'src/app/api/admin/upload',
    'src/app/api/media',
    'public/images',
    'public/images/logo'
  ];
  
  log('📁 Checking media directories:', 'cyan');
  for (const dir of dirsToCheck) {
    const fullPath = join(ROOT, dir);
    const exists = existsSync(fullPath);
    if (exists) {
      const files = readdirSync(fullPath);
      log(`✅ ${dir} (${files.length} items)`, 'green');
    } else {
      log(`❌ ${dir} (not found)`, 'red');
    }
  }
  
  // Find media-related files
  log('\n📄 Finding media-related TypeScript/JavaScript files:', 'cyan');
  const tsFiles = findFiles(join(ROOT, 'src'), /\.(ts|tsx|js|jsx)$/);
  const mediaFiles = tsFiles.filter(file => {
    const name = file.toLowerCase();
    return name.includes('media') || name.includes('image') || name.includes('upload');
  });
  
  log(`Found ${mediaFiles.length} media-related files:`, 'blue');
  mediaFiles.slice(0, 20).forEach(file => {
    log(`  • ${relative(ROOT, file)}`, 'blue');
  });
  if (mediaFiles.length > 20) {
    log(`  ... and ${mediaFiles.length - 20} more`, 'blue');
  }
}

function searchForImageReferences() {
  section('IMAGE REFERENCE SEARCH');
  
  const patterns = [
    'image_url',
    'imageUrl',
    'media_id',
    'mediaId',
    'media_assets',
    'ImageChangeDialog',
    'MediaPickerModal',
    '/images/logo',
    'public_url',
    '\\.jpg',
    '\\.png',
    '\\.webp'
  ];
  
  log('🔍 Searching for image references in source files...', 'cyan');
  
  const srcFiles = findFiles(join(ROOT, 'src'), /\.(ts|tsx|js|jsx)$/);
  const results = [];
  
  for (const file of srcFiles) {
    const matches = searchInFile(file, patterns);
    if (matches) {
      results.push(matches);
    }
  }
  
  log(`\nFound references in ${results.length} files:\n`, 'bright');
  
  // Group by pattern
  const byPattern = {};
  for (const result of results) {
    for (const match of result.matches) {
      if (!byPattern[match.pattern]) {
        byPattern[match.pattern] = [];
      }
      byPattern[match.pattern].push({
        file: result.file,
        line: match.line
      });
    }
  }
  
  for (const [pattern, matches] of Object.entries(byPattern)) {
    log(`${pattern}: ${matches.length} occurrences`, 'yellow');
  }
}

async function main() {
  log('\n╔══════════════════════════════════════════════════════════════╗', 'bright');
  log('║      ZT LOUNGE MEDIA ARCHITECTURE - READ-ONLY INSPECTION    ║', 'bright');
  log('╚══════════════════════════════════════════════════════════════╝\n', 'bright');
  
  log('⚠️  This is a READ-ONLY inspection. No changes will be made.\n', 'yellow');
  
  // Load environment
  const env = loadEnv();
  
  if (!env || !env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    log('❌ Cannot connect to Supabase (missing credentials)', 'red');
    log('   Continuing with file system inspection only...\n', 'yellow');
  }
  
  // Create Supabase client if credentials available
  let supabase = null;
  if (env && env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    supabase = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    log('✅ Connected to Supabase\n', 'green');
  }
  
  // Run inspections
  if (supabase) {
    await inspectDatabase(supabase);
    await inspectStorage(supabase);
  }
  
  inspectFileSystem();
  searchForImageReferences();
  
  section('INSPECTION COMPLETE');
  log('✅ Inspection finished. Review the output above.', 'green');
  log('\nNext steps:', 'bright');
  log('1. Review findings', 'blue');
  log('2. Identify specific issues', 'blue');
  log('3. Plan fixes', 'blue');
  log('4. Execute fixes incrementally', 'blue');
  log('5. Verify each fix\n', 'blue');
}

main().catch(err => {
  log(`\n❌ Fatal error: ${err.message}`, 'red');
  console.error(err);
  process.exit(1);
});
