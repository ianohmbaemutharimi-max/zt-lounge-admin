import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const { Pool } = pg;

const connectionString = `postgres://postgres.jczwilrysvnhcjzjztbi:[${process.env.SUPABASE_DB_PASSWORD}]@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function applyFix() {
  console.log("🔧 Applying RLS fix to production database...\n");

  const client = await pool.connect();

  try {
    // Step 1: Create the is_admin_or_above() function
    console.log("Step 1: Creating is_admin_or_above() function...");
    await client.query(`
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
    `);
    console.log("✅ Function created");

    // Step 2: Create media_assets RLS policies
    console.log("\nStep 2: Creating media_assets RLS policies...");
    const mediaPolicies = [
      `CREATE POLICY IF NOT EXISTS media_assets_admin_select
        ON media_assets FOR SELECT TO authenticated USING (is_admin_or_above());`,
      `CREATE POLICY IF NOT EXISTS media_assets_admin_insert
        ON media_assets FOR INSERT TO authenticated WITH CHECK (is_admin_or_above());`,
      `CREATE POLICY IF NOT EXISTS media_assets_admin_update
        ON media_assets FOR UPDATE TO authenticated USING (is_admin_or_above()) WITH CHECK (is_admin_or_above());`,
      `CREATE POLICY IF NOT EXISTS media_assets_admin_delete
        ON media_assets FOR DELETE TO authenticated USING (is_admin_or_above());`,
    ];

    for (const policy of mediaPolicies) {
      try {
        await client.query(policy);
      } catch (err) {
        if (!err.message.includes("already exists")) {
          console.error("Policy error:", err.message);
        }
      }
    }
    console.log("✅ media_assets policies created");

    // Step 3: Create media_usage RLS policies
    console.log("\nStep 3: Creating media_usage RLS policies...");
    const usagePolicies = [
      `CREATE POLICY IF NOT EXISTS media_usage_admin_select
        ON media_usage FOR SELECT TO authenticated USING (is_admin_or_above());`,
      `CREATE POLICY IF NOT EXISTS media_usage_admin_insert
        ON media_usage FOR INSERT TO authenticated WITH CHECK (is_admin_or_above());`,
      `CREATE POLICY IF NOT EXISTS media_usage_admin_update
        ON media_usage FOR UPDATE TO authenticated USING (is_admin_or_above()) WITH CHECK (is_admin_or_above());`,
      `CREATE POLICY IF NOT EXISTS media_usage_admin_delete
        ON media_usage FOR DELETE TO authenticated USING (is_admin_or_above());`,
    ];

    for (const policy of usagePolicies) {
      try {
        await client.query(policy);
      } catch (err) {
        if (!err.message.includes("already exists")) {
          console.error("Policy error:", err.message);
        }
      }
    }
    console.log("✅ media_usage policies created");

    console.log(
      "\n✅ All fixes applied! The 500 errors should now be resolved."
    );
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

applyFix();
