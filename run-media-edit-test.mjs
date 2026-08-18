#!/usr/bin/env node

import { spawn } from "child_process";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

// Start dev server
console.log("🚀 Starting development server...");
const devServer = spawn("npm", ["run", "dev"], {
  cwd: process.cwd(),
  stdio: "pipe",
});

devServer.stdout.on("data", (data) => {
  const output = data.toString();
  if (output.includes("Local:") || output.includes("ready")) {
    console.log("✅ Dev server ready!");
  }
});

devServer.stderr.on("data", (data) => {
  console.error("Dev server error:", data.toString());
});

// Wait for server to start
await new Promise((resolve) => setTimeout(resolve, 5000));

try {
  console.log("\n📝 Running Playwright tests...\n");

  // Run Playwright tests
  const { stdout, stderr } = await execAsync(
    "npx playwright test tests/media-library-edit.spec.ts --headed",
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PLAYWRIGHT_TEST_BASE_URL: "http://localhost:3000",
      },
    }
  );

  console.log(stdout);
  if (stderr) console.error("Stderr:", stderr);

  console.log("\n✅ Tests completed!");
} catch (error) {
  console.error("\n❌ Test failed:", error.message);
  console.error("Stdout:", error.stdout);
  console.error("Stderr:", error.stderr);
} finally {
  console.log("\n🛑 Shutting down server...");
  devServer.kill();
  process.exit(0);
}
