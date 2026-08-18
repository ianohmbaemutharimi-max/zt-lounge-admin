#!/usr/bin/env node
/**
 * Test Menu & Hero Slides APIs with Proper Authentication
 * 
 * Uses browser automation to get a real session, then tests APIs
 */

import puppeteer from 'puppeteer';

const BASE_URL = 'http://localhost:3000';
const LOGIN_EMAIL = 'super_admin@example.local';
const LOGIN_PASSWORD = 'test123456';

async function testAPIs() {
  console.log('═'.repeat(80));
  console.log('Testing Menu & Hero Slides APIs with Authentication');
  console.log('═'.repeat(80));
  console.log();

  let browser;
  try {
    // Launch browser
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    // Navigate to login page
    console.log('1️⃣ Navigating to login page...');
    await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'networkidle2' });

    // Login
    console.log('2️⃣ Attempting login...');
    await page.type('input[name="email"]', LOGIN_EMAIL);
    await page.type('input[name="password"]', LOGIN_PASSWORD);
    await page.click('button[type="submit"]');
    
    // Wait for navigation to dashboard
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
    console.log('✓ Login successful');
    console.log();

    // Get cookies/auth state
    const cookies = await page.cookies();
    console.log(`✓ Session established (${cookies.length} cookies)`);

    // Get the auth token from localStorage
    const authToken = await page.evaluate(() => {
      return localStorage.getItem('sb-jczwilrysvnhcjzjztbi-auth-token') ||
             sessionStorage.getItem('sb-jczwilrysvnhcjzjztbi-auth-token') ||
             'NO_TOKEN_FOUND';
    });

    console.log(`✓ Auth token available: ${authToken.substring(0, 20)}...`);
    console.log();

    // Now test the APIs
    console.log('3️⃣ Testing APIs...');
    console.log();

    const apis = [
      { name: 'Menu Items', path: '/api/admin/menu-items' },
      { name: 'Menu Categories', path: '/api/admin/menu-categories' },
      { name: 'Hero Slides', path: '/api/admin/hero-slides' },
      { name: 'Website Pages', path: '/api/admin/website-pages' },
      { name: 'Business Settings', path: '/api/admin/business-settings' },
    ];

    for (const api of apis) {
      console.log(`Testing: ${api.name}`);
      console.log(`URL: ${BASE_URL}${api.path}`);

      try {
        const response = await fetch(`${BASE_URL}${api.path}`, {
          method: 'GET',
          headers: {
            'Cookie': cookies.map(c => `${c.name}=${c.value}`).join('; '),
            'Authorization': `Bearer ${authToken}`,
          },
        });

        console.log(`Status: ${response.status}`);

        if (response.status === 200) {
          const data = await response.json();
          console.log(`✓ Success - ${Array.isArray(data) ? data.length : 'object'} items`);
        } else {
          const text = await response.text();
          console.log(`⚠️ Status ${response.status}`);
          console.log(`Response: ${text.substring(0, 200)}`);
        }
      } catch (e) {
        console.log(`❌ Error: ${e.message}`);
      }

      console.log();
    }

    await browser.close();

    console.log('═'.repeat(80));
    console.log('Test Complete');
    console.log('═'.repeat(80));
  } catch (error) {
    console.error('Fatal error:', error);
    if (browser) await browser.close();
    process.exit(1);
  }
}

testAPIs();
