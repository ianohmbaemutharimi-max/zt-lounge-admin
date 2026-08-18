import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import { readFileSync } from "fs";
import { join } from "path";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function applyMigration() {
  console.log("🔧 Applying migration: 20260818_create_admin_check_function\n");

  const migrationPath = join(
    process.cwd(),
    "supabase/migrations/20260818_create_admin_check_function.sql"
  );

  try {
    const sql = readFileSync(migrationPath, "utf-8");

    // Execute the migration
    const { error } = await supabase.rpc("exec_sql", { sql });

    if (error) {
      console.error("❌ Migration failed:", error);
      process.exit(1);
    }

    console.log("✅ Migration applied successfully!\n");

    // Verify the function exists
    const { data: funcCheck } = await supabase
      .from("information_schema.routines")
      .select("routine_name")
      .eq("routine_name", "is_admin_or_above");

    if (funcCheck && funcCheck.length > 0) {
      console.log("✅ Function is_admin_or_above() created successfully");
    }

    // Verify RLS policies exist
    const { data: policies } = await supabase
      .from("pg_policies")
      .select("policyname, tablename")
      .in("tablename", ["media_assets", "media_usage"]);

    if (policies) {
      console.log(`✅ ${policies.length} RLS policies created`);
      policies.forEach((p) => {
        console.log(`   - ${p.policyname} on ${p.tablename}`);
      });
    }

    console.log(
      "\n✅ All components verified. The 500 error should now be fixed!"
    );
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

applyMigration();
