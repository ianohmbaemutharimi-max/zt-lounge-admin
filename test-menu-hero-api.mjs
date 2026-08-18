import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

// Test with a valid admin JWT
async function test() {
  console.log("🧪 Testing /api/admin/menu-items and /api/admin/hero-slides...\n");

  // First, create an admin user
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Get or create test admin
  const { data: profiles } = await adminClient
    .from("profiles")
    .select("id, email")
    .eq("role", "admin")
    .limit(1);

  let adminId, adminEmail;

  if (profiles && profiles.length > 0) {
    adminId = profiles[0].id;
    adminEmail = profiles[0].email;
    console.log(`✅ Using existing admin: ${adminEmail} (${adminId})\n`);
  } else {
    console.log("❌ No admin user found. Cannot test.");
    process.exit(1);
  }

  // Get session for this admin
  const { data: sessions } = await adminClient.auth.admin.listUserSessions(adminId);
  let token;

  if (sessions && sessions.length > 0) {
    token = sessions[0].access_token;
    console.log(`✅ Using admin session token\n`);
  } else {
    console.log("❌ No sessions found for admin. Cannot test.");
    process.exit(1);
  }

  // Now test the API endpoint
  const baseUrl = "http://localhost:3000";

  console.log(`📡 Testing menu-items API...\n`);
  const menuRes = await fetch(`${baseUrl}/api/admin/menu-items`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  console.log(`Status: ${menuRes.status}`);
  const menuData = await menuRes.json();
  if (menuRes.status !== 200) {
    console.error("❌ Error:", JSON.stringify(menuData, null, 2));
  } else {
    console.log("✅ Success:", menuData.length || 0, "items");
  }

  console.log(`\n📡 Testing hero-slides API...\n`);
  const heroRes = await fetch(`${baseUrl}/api/admin/hero-slides`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  console.log(`Status: ${heroRes.status}`);
  const heroData = await heroRes.json();
  if (heroRes.status !== 200) {
    console.error("❌ Error:", JSON.stringify(heroData, null, 2));
  } else {
    console.log("✅ Success:", heroData.length || 0, "slides");
  }
}

test().catch(console.error);
