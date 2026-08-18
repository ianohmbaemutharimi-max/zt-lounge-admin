#!/usr/bin/env node
/**
 * Verify Menu Items & Hero Slides APIs with Real Authentication
 * Uses Playwright to login and get a real session
 */

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const BASE_URL = 'http://localhost:3000';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function testWithAuth() {
  console.log('═'.repeat(80));
  console.log('API VERIFICATION WITH REAL AUTHENTICATION');
  console.log('═'.repeat(80));
  console.log();

  let browser;
  try {
    // Test direct database query first
    console.log('📊 DIRECT DATABASE TEST:');
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    // Query menu items directly from DB
    const { data: menuItems, error: menuError } = await supabase
      .from('menu_items')
      .select('*')
      .limit(5);
    
    if (menuError) {
      console.log(`❌ Menu Items DB Query Failed: ${menuError.message}`);
    } else {
      console.log(`✅ Menu Items in DB: ${menuItems.length} items found`);
    }

    // Query hero slides directly from DB
    const { data: heroSlides, error: heroError } = await supabase
      .from('hero_slides')
      .select('*')
      .limit(5);
    
    if (heroError) {
      console.log(`❌ Hero Slides DB Query Failed: ${heroError.message}`);
    } else {
      console.log(`✅ Hero Slides in DB: ${heroSlides.length} items found`);
    }

    console.log();
    console.log('🌐 API RUNTIME TEST:');
    console.log();

    // Launch browser for real login
    browser = await chromium.launch({ headless: true });
    const context = await browser.createBrowserContext();
    const page = await context.newPage();

    // Go to dashboard (which requires auth)
    console.log('1️⃣ Testing dashboard access (requires auth)...');
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle2', timeout: 15000 });
    
    const url = page.url();
    console.log(`   Current URL: ${url}`);
    
    // If we're redirected to login, we need to login
    if (url.includes('/auth/login')) {
      console.log('2️⃣ Not authenticated, attempting login...');
      
      // Fill login form
      await page.fill('input[name="email"]', 'super_admin@example.local');
      await page.fill('input[name="password"]', 'test123456');
      await page.click('button[type="submit"]');
      
      // Wait for redirect to dashboard
      await page.waitForNavigation({ timeout: 10000 });
      console.log('✅ Login successful');
    } else {
      console.log('✅ Already authenticated');
    }

    console.log();

    // Now test the APIs from the browser context
    const endpoints = [
      { name: 'Menu Items', path: '/api/admin/menu-items' },
      { name: 'Hero Slides', path: '/api/admin/hero-slides' },
      { name: 'Menu Categories', path: '/api/admin/menu-categories' },
    ];

    for (const endpoint of endpoints) {
      console.log(`Testing: ${endpoint.name}`);
      console.log(`  URL: ${BASE_URL}${endpoint.path}`);
      
      try {
        // Make request from browser with established session
        const response = await page.goto(`${BASE_URL}${endpoint.path}`);
        const status = response.status();
        const text = await response.text();
        
        console.log(`  Status: ${status}`);
        
        if (status === 200) {
          try {
            const data = JSON.parse(text);
            const count = Array.isArray(data) ? data.length : 'object';
            console.log(`  ✅ Success - ${count} items`);
          } catch (e) {
            console.log(`  ✅ Success - response received`);
          }
        } else if (status === 401) {
          console.log(`  ⚠️  Unauthorized (session might have expired)`);
        } else if (status === 500) {
          console.log(`  ❌ ERROR 500: ${text.substring(0, 100)}`);
        } else {
          console.log(`  Response: ${text.substring(0, 100)}`);
        }
      } catch (e) {
        console.log(`  ❌ Error: ${e.message}`);
      }
      console.log();
    }

    await context.close();
    await browser.close();

    console.log('═'.repeat(80));
    console.log('Test Complete');
    console.log('═'.repeat(80));
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    if (browser) await browser.close();
    process.exit(1);
  }
}

testWithAuth();
