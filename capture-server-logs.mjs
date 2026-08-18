#!/usr/bin/env node

/**
 * Capture actual server errors from dev server logs
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Monitor the dev server output for errors
console.log("🔍 Monitoring dev server logs for 500 errors...\n");
console.log("Making API request in 2 seconds...\n");

setTimeout(async () => {
  // Call the menu-items API
  try {
    const response = await fetch("http://localhost:3000/api/admin/menu-items", {
      headers: {
        Cookie: "sb-access-token=test; sb-refresh-token=test",
      },
    });

    console.log(`\n📊 Response Status: ${response.status}`);
    const text = await response.text();
    console.log(`Response Body:\n${text}\n`);
  } catch (err) {
    console.error("Request failed:", err.message);
  }

  process.exit(0);
}, 2000);
