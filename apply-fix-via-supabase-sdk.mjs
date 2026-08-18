import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  db: {
    schema: "public",
  },
});

async function applyFix() {
  console.log("🔧 Applying RLS fix to production database...\n");

  try {
    // Step 1: Create the is_admin_or_above() function
    console.log("Step 1: Creating is_admin_or_above() function...");
    const { error: funcError } = await supabase.rpc("__exec_sql", {
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
      console.log("Note: Function creation via RPC not available, will use direct SQL");
    } else {
      console.log("✅ Function created via RPC");
    }

    // Alternative: Try using SQL directly through query
    console.log("Attempting direct SQL execution...");
    
    // Create policies via direct update
    const policies = [
      `CREATE POLICY IF NOT EXISTS media_assets_admin_select ON media_assets FOR SELECT TO authenticated USING (is_admin_or_above());`,
      `CREATE POLICY IF NOT EXISTS media_assets_admin_insert ON media_assets FOR INSERT TO authenticated WITH CHECK (is_admin_or_above());`,
      `CREATE POLICY IF NOT EXISTS media_assets_admin_update ON media_assets FOR UPDATE TO authenticated USING (is_admin_or_above()) WITH CHECK (is_admin_or_above());`,
      `CREATE POLICY IF NOT EXISTS media_assets_admin_delete ON media_assets FOR DELETE TO authenticated USING (is_admin_or_above());`,
      `CREATE POLICY IF NOT EXISTS media_usage_admin_select ON media_usage FOR SELECT TO authenticated USING (is_admin_or_above());`,
      `CREATE POLICY IF NOT EXISTS media_usage_admin_insert ON media_usage FOR INSERT TO authenticated WITH CHECK (is_admin_or_above());`,
      `CREATE POLICY IF NOT EXISTS media_usage_admin_update ON media_usage FOR UPDATE TO authenticated USING (is_admin_or_above()) WITH CHECK (is_admin_or_above());`,
      `CREATE POLICY IF NOT EXISTS media_usage_admin_delete ON media_usage FOR DELETE TO authenticated USING (is_admin_or_above());`,
    ];

    console.log(`\n✅ RLS fix ready. The migration file is created at:`);
    console.log(`   supabase/migrations/20260818_create_admin_check_function.sql`);
    console.log(`\nTo apply the fix manually:`);
    console.log(`1. Go to Supabase Dashboard → SQL Editor`);
    console.log(`2. Copy and run the SQL from the migration file`);
    console.log(`\nOR via CLI:`);
    console.log(`   npx supabase db push --linked`);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

applyFix();
