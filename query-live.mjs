import { Pool } from 'pg';

const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres@aws-0-eu-west-1.pooler.supabase.com:5432/postgres'
});

async function main() {
  try {
    // List tables
    const tables = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`);
    console.log('=== TABLES ===');
    console.log(tables.rows);

    // Inspect bookings
    const bookingsSchema = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name='bookings' AND table_schema='public'
      ORDER BY ordinal_position
    `);
    console.log('=== BOOKINGS COLUMNS ===');
    console.log(bookingsSchema.rows);

    // Inspect customers
    const customersSchema = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name='customers' AND table_schema='public'
      ORDER BY ordinal_position
    `);
    console.log('=== CUSTOMERS COLUMNS ===');
    console.log(customersSchema.rows);

    // Count rows
    const bookingsCount = await pool.query('SELECT COUNT(*) FROM public.bookings');
    console.log('=== BOOKINGS COUNT ===', bookingsCount.rows);

    const customersCount = await pool.query('SELECT COUNT(*) FROM public.customers');
    console.log('=== CUSTOMERS COUNT ===', customersCount.rows);

    // Check create_booking function
    const func = await pool.query(`SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='create_booking'`);
    console.log('=== CREATE_BOOKING FUNCTION ===');
    console.log(func.rows[0].pg_get_functiondef);

    // Check RLS policies
    const policies = await pool.query(`SELECT policyname, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname='public' AND tablename IN ('bookings','customers')`);
    console.log('=== RLS POLICIES ===');
    console.log(policies.rows);

    // Check FK constraints
    const fk = await pool.query(`
      SELECT conname, confupdtype, confdeltype
      FROM pg_constraint
      WHERE table_name='bookings' AND contype='f'
    `);
    console.log('=== FK CONSTRAINTS ===');
    console.log(fk.rows);

    // Check booking status distribution
    const statusDist = await pool.query(`SELECT status, COUNT(*) FROM public.bookings GROUP BY status`);
    console.log('=== BOOKING STATUS DISTRIBUTION ===');
    console.log(statusDist.rows);

    // Check customer booking counts
    const customerBookings = await pool.query(`
      SELECT c.id, c.full_name, c.email, c.source,
             COUNT(b.id) as total_bookings,
             COUNT(b.id) FILTER (WHERE b.status IN ('confirmed','completed')) as successful_bookings
      FROM public.customers c
      LEFT JOIN public.bookings b ON b.customer_id = c.id
      GROUP BY c.id, c.full_name, c.email, c.source
      ORDER BY c.id
    `);
    console.log('=== CUSTOMER BOOKING SUMMARY ===');
    console.log(customerBookings.rows);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

main();