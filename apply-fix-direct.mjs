import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function applyFix() {
  console.log("🔧 Creating is_admin_or_above() function and RLS policies...\n");

  try {
    // Step 1: Create the function
    console.log("Step 1: Creating is_admin_or_above() function...");
    const { error: funcError } = await supabase.rpc("exec_sql", {
      sql: `
CREATE OR REPLACE FUNCTION is_admin_or_above()
RETURNS boolean AS $$
BEGIN
  RETURN (
    SELECT role IN ('admin', 'super_admin')
    FROM profiles
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
      `,
    });

    if (funcError) {
      console.error("❌ Function creation failed:", funcError);
      process.exit(1);
    }
    console.log("✅ Function created");

    // Step 2: Create media_assets RLS policies
    console.log("\nStep 2: Creating media_assets RLS policies...");
    const policies = [
      `CREATE POLICY media_assets_admin_select ON media_assets FOR SELECT TO authenticated USING (is_admin_or_above());`,
      `CREATE POLICY media_assets_admin_insert ON media_assets FOR INSERT TO authenticated WITH CHECK (is_admin_or_above());`,
      `CREATE POLICY media_assets_admin_update ON media_assets FOR UPDATE TO authenticated USING (is_admin_or_above()) WITH CHECK (is_admin_or_above());`,
      `CREATE POLICY media_assets_admin_delete ON media_assets FOR DELETE TO authenticated USING (is_admin_or_above());`,
    ];

    for (const policy of policies) {
      const { error: policyError } = await supabase.rpc("exec_sql", { sql: policy });
      if (policyError && !policyError.message.includes("already exists")) {
        console.error("❌ Policy creation failed:", policyError);
      }
    }
    console.log("✅ media_assets policies created");

    // Step 3: Create media_usage RLS policies
    console.log("\nStep 3: Creating media_usage RLS policies...");
    const usagePolicies = [
      `CREATE POLICY media_usage_admin_select ON media_usage FOR SELECT TO authenticated USING (is_admin_or_above());`,
      `CREATE POLICY media_usage_admin_insert ON media_usage FOR INSERT TO authenticated WITH CHECK (is_admin_or_above());`,
      `CREATE POLICY media_usage_admin_update ON media_usage FOR UPDATE TO authenticated USING (is_admin_or_above()) WITH CHECK (is_admin_or_above());`,
      `CREATE POLICY media_usage_admin_delete ON media_usage FOR DELETE TO authenticated USING (is_admin_or_above());`,
    ];

    for (const policy of usagePolicies) {
      const { error: policyError } = await supabase.rpc("exec_sql", { sql: policy });
      if (policyError && !policyError.message.includes("already exists")) {
        console.error("❌ Policy creation failed:", policyError);
      }
    }
    console.log("✅ media_usage policies created");

    console.log(
      "\n✅ All fixes applied! The 500 errors on /api/admin/menu-items and /api/admin/hero-slides should now be resolved."
    );
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

applyFix();
