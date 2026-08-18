#!/usr/bin/env node

import fetch from 'node-fetch';
import { readFileSync } from 'fs';
import { join } from 'path';

const envPath = join(process.cwd(), '.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const envLines = envContent.split('\n');

let supabaseUrl = '';
let supabaseAnonKey = '';
let adminToken = '';

for (const line of envLines) {
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) {
    supabaseUrl = line.split('=')[1].trim();
  }
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) {
    supabaseAnonKey = line.split('=')[1].trim();
  }
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) {
    adminToken = line.split('=')[1].trim();
  }
}

console.log('Testing endpoints...\n');

const baseUrl = 'http://localhost:3000';

async function testEndpoint(method, url, token = null) {
  console.log(`${method} ${url}`);
  try {
    const headers = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${baseUrl}${url}`, {
      method,
      headers,
    });

    console.log(`Status: ${response.status}`);
    const body = await response.text();
    if (body) {
      try {
        const json = JSON.parse(body);
        console.log('Response:', JSON.stringify(json, null, 2).substring(0, 500));
      } catch {
        console.log('Response:', body.substring(0, 500));
      }
    }
    console.log('---\n');
    return response.status;
  } catch (error) {
    console.log(`Error: ${error.message}\n`);
    return null;
  }
}

async function run() {
  // Get session first to have a token
  console.log('Getting session...\n');
  const sessionResp = await fetch(`${baseUrl}/api/auth/session`, {
    headers: {
      'Content-Type': 'application/json',
    },
  });
  const sessionData = await sessionResp.json();
  const token = sessionData?.access_token;
  
  if (token) {
    console.log('Got token, testing protected endpoints...\n');
    await testEndpoint('GET', '/api/admin/menu-items', token);
    await testEndpoint('GET', '/api/admin/menu-categories', token);
    await testEndpoint('GET', '/api/admin/hero-slides', token);
    await testEndpoint('GET', '/api/admin/website-pages', token);
  } else {
    console.log('No token available, testing without auth...\n');
    await testEndpoint('GET', '/api/admin/menu-items');
    await testEndpoint('GET', '/api/admin/menu-categories');
    await testEndpoint('GET', '/api/admin/hero-slides');
    await testEndpoint('GET', '/api/admin/website-pages');
  }
}

run().catch(console.error);
