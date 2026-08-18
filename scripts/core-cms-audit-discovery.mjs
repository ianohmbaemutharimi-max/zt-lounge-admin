#!/usr/bin/env node

/**
 * CORE CMS AUDIT DISCOVERY
 * 
 * Maps all Core CMS components:
 * - Menu
 * - Gallery  
 * - Media Library
 * - Services
 * - Website CMS
 * 
 * Output: Feature map with file locations
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();

const FEATURES = {
  MENU: {
    dashboard: 'src/app/dashboard/menu/page.tsx',
    api: ['src/app/api/admin/menu_items', 'src/app/api/admin/[resource]'],
    features: ['src/features/menu'],
    db_tables: ['menu_items', 'menu_categories'],
  },
  GALLERY: {
    dashboard: 'src/app/dashboard/gallery/page.tsx',
    api: ['src/app/api/admin/gallery', 'src/app/api/admin/[resource]'],
    features: ['src/features/gallery'],
    db_tables: ['gallery', 'gallery_items'],
  },
  MEDIA: {
    dashboard: 'src/app/dashboard/media/page.tsx',
    api: ['src/app/api/admin/media_assets', 'src/app/api/admin/[resource]', 'src/app/api/media'],
    features: ['src/features/media'],
    db_tables: ['media_assets'],
  },
  SERVICES: {
    dashboard: 'src/app/dashboard/services/page.tsx',
    api: ['src/app/api/admin/services', 'src/app/api/admin/[resource]'],
    features: ['src/features/services'],
    db_tables: ['services'],
  },
  WEBSITE_CMS: {
    dashboard: 'src/app/dashboard/website/page.tsx',
    api: ['src/app/api/admin/website', 'src/app/api/admin/[resource]'],
    features: ['src/features/website'],
    db_tables: ['website_content', 'website_sections'],
  },
};

const SHARED = {
  repository: 'src/lib/repository.ts',
  auth: 'src/lib/auth/server.ts',
  validation: 'src/lib/validation/admin.ts',
  resource_config: 'src/lib/resource-config.ts',
  api_routes: [
    'src/app/api/admin/[resource]/route.ts',
    'src/app/api/admin/[resource]/[id]/route.ts',
  ],
  middleware: 'middleware.ts',
  db_schema: 'src/db/schema.ts',
};

function fileExists(filePath) {
  return fs.existsSync(path.join(ROOT, filePath));
}

function getFileSize(filePath) {
  try {
    const stats = fs.statSync(path.join(ROOT, filePath));
    return stats.size;
  } catch (e) {
    return null;
  }
}

function searchForPattern(dir, pattern) {
  try {
    const cmd = `find "${dir}" -type f -name "*${pattern}*" 2>/dev/null | head -20`;
    const result = execSync(cmd, { encoding: 'utf-8' });
    return result.trim().split('\n').filter(x => x);
  } catch (e) {
    return [];
  }
}

console.log('\n=== CORE CMS AUDIT DISCOVERY ===\n');

console.log('SHARED INFRASTRUCTURE:');
for (const [key, paths] of Object.entries(SHARED)) {
  if (Array.isArray(paths)) {
    console.log(`\n${key}:`);
    paths.forEach(p => {
      const exists = fileExists(p);
      const size = exists ? getFileSize(p) : null;
      console.log(`  ${exists ? '✓' : '✗'} ${p}${size ? ` (${size} bytes)` : ''}`);
    });
  } else {
    const exists = fileExists(paths);
    const size = exists ? getFileSize(paths) : null;
    console.log(`${key}: ${exists ? '✓' : '✗'} ${paths}${size ? ` (${size} bytes)` : ''}`);
  }
}

console.log('\n\nCORE CMS FEATURES:\n');

for (const [featureName, featurePaths] of Object.entries(FEATURES)) {
  console.log(`\n${featureName}:`);
  
  console.log(`  Dashboard: ${fileExists(featurePaths.dashboard) ? '✓' : '✗'} ${featurePaths.dashboard}`);
  
  console.log(`  API Routes:`);
  featurePaths.api.forEach(p => {
    const exists = fileExists(p);
    console.log(`    ${exists ? '✓' : '✗'} ${p}`);
  });
  
  console.log(`  Features/Components:`);
  featurePaths.features.forEach(p => {
    const exists = fileExists(p);
    if (exists) {
      try {
        const files = execSync(`find "${path.join(ROOT, p)}" -type f -name "*.tsx" -o -name "*.ts" 2>/dev/null | head -10`, { encoding: 'utf-8' });
        const fileList = files.trim().split('\n').filter(x => x);
        fileList.forEach(f => {
          const relative = path.relative(ROOT, f);
          console.log(`    ✓ ${relative}`);
        });
      } catch (e) {
        console.log(`    ✓ ${p} (directory exists)`);
      }
    } else {
      console.log(`    ✗ ${p}`);
    }
  });
  
  console.log(`  Database Tables:`);
  featurePaths.db_tables.forEach(t => {
    console.log(`    - ${t}`);
  });
}

console.log('\n\nTEST FILES:');
try {
  const testFiles = execSync('find tests -type f -name "*.spec.ts" -o -name "*.test.ts" 2>/dev/null', { encoding: 'utf-8' });
  testFiles.trim().split('\n').filter(x => x).forEach(f => {
    console.log(`  ✓ ${f}`);
  });
} catch (e) {
  console.log('  (none found)');
}

console.log('\n\nMIGRATIONS:');
try {
  const migrations = execSync('find supabase/migrations -type f -name "*.sql" 2>/dev/null | sort', { encoding: 'utf-8' });
  migrations.trim().split('\n').filter(x => x).slice(-10).forEach(f => {
    console.log(`  ✓ ${f}`);
  });
} catch (e) {
  console.log('  (none found)');
}

console.log('\n=== END DISCOVERY ===\n');
