#!/usr/bin/env node
/**
 * ZT LOUNGE — LIVE SUPABASE BOOKING/CUSTOMER FORENSIC VERIFICATION
 * READ-ONLY DATABASE FORENSICS ONLY
 * 
 * Uses direct table SELECT queries (service role key bypasses RLS for reads).
 * Does NOT call create_booking() or any mutation RPC.
 * Does NOT modify code, migrations, or data.
 */

import { createClient } from '@supabase/supabase-js';
import { writeFile } from 'fs/promises';

const SUPABASE_URL = 'https://jczwilrysvnhcjzjztbi.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjendpbHJ5c3ZuaGNqemp6dGJpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Mzk0MTI1MCwiZXhwIjoyMDk5NTE3MjUwfQ.nj7YBr_EixrTdv5hqIzJVu3L7kFWVD15RJka4u7UgwM';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false }
});

const report = {
  timestamp: new Date().toISOString(),
  project: 'jczwilrysvnhcjzjztbi',
  type: 'READ-ONLY FORENSIC VERIFICATION',
  phases: {}
};

async function runPhase(name, fn) {
  console.log(`\n=== PHASE: ${name} ===`);
  try {
    const result = await fn();
    report.phases[name] = result;
    console.log(JSON.stringify(result, null, 2).substring(0, 5000));
    return result;
  } catch (e) {
    report.phases[name] = { error: e.message };
    console.log(`ERROR: ${e.message}`);
    return null;
  }
}

// ============================================================
// PHASE 1 — LIVE SCHEMA (from actual data columns)
// ============================================================
await runPhase('1_schema', async () => {
  const out = {};
  
  // bookings sample (limit 1) to get columns
  const { data: bSample, error: bErr } = await supabase
    .from('bookings').select('*').limit(1);
  out.bookings_columns = bErr ? { error: bErr.message } : (bSample?.[0] ? Object.keys(bSample[0]) : []);
  out.bookings_sample = bErr ? null : bSample?.[0] || null;
  
  // customers sample
  const { data: cSample, error: cErr } = await supabase
    .from('customers').select('*').limit(1);
  out.customers_columns = cErr ? { error: cErr.message } : (cSample?.[0] ? Object.keys(cSample[0]) : []);
  out.customers_sample = cErr ? null : cSample?.[0] || null;
  
  return out;
});

// ============================================================
// PHASE 6 — LIVE DATA FORENSICS
// ============================================================
await runPhase('6_data', async () => {
  const out = {};
  
  // Counts
  const { count: bCount, error: bErr } = await supabase
    .from('bookings').select('*', { count: 'exact', head: true });
  const { count: cCount, error: cErr } = await supabase
    .from('customers').select('*', { count: 'exact', head: true });
  out.counts = {
    bookings: bErr ? { error: bErr.message } : bCount,
    customers: cErr ? { error: cErr.message } : cCount
  };
  
  // All bookings (status + customer_id)
  const { data: bookings, error: bkErr } = await supabase
    .from('bookings').select('id, booking_number, customer_id, status, booking_date, full_name, email, phone, guest_full_name, guest_email, guest_phone, created_at, updated_at');
  out.bookings = bkErr ? { error: bkErr.message } : bookings;
  
  // All customers
  const { data: customers, error: cuErr } = await supabase
    .from('customers').select('id, full_name, email, phone, source, user_id, created_at, updated_at');
  out.customers = cuErr ? { error: cuErr.message } : customers;
  
  return out;
});

// ============================================================
// PHASE 7 — CUSTOMER/BOOKING RELATIONSHIP (computed client-side)
// ============================================================
await runPhase('7_relationship', async () => {
  const out = {};
  
  const { data: bookings, error: bkErr } = await supabase
    .from('bookings').select('id, customer_id, status');
  const { data: customers, error: cuErr } = await supabase
    .from('customers').select('id, full_name, email, phone, created_at');
  
  if (bkErr || cuErr) return { error: bkErr?.message || cuErr?.message };
  
  const statusCounts = {};
  const customerMap = {};
  
  // Booking status classification
  for (const b of bookings) {
    const s = b.status || 'unknown';
    if (!statusCounts[s]) statusCounts[s] = { total: 0, with_customer_id: 0, without_customer_id: 0 };
    statusCounts[s].total++;
    if (b.customer_id) statusCounts[s].with_customer_id++;
    else statusCounts[s].without_customer_id++;
  }
  out.booking_statuses = statusCounts;
  
  // Customer classification
  for (const c of customers) {
    customerMap[c.id] = {
      customer_id: c.id,
      full_name: c.full_name,
      email: c.email,
      phone: c.phone,
      created_at: c.created_at,
      total_bookings: 0,
      pending: 0, confirmed: 0, completed: 0, cancelled: 0, no_show: 0, other: 0
    };
  }
  
  for (const b of bookings) {
    const cm = customerMap[b.customer_id];
    if (!cm) continue;
    cm.total_bookings++;
    const s = b.status;
    if (cm[s] !== undefined) cm[s]++;
    else cm.other++;
  }
  
  out.customers = Object.values(customerMap);
  
  // Classification summary
  const summary = {
    zero_bookings: 0,
    only_pending: 0,
    with_confirmed: 0,
    with_completed: 0,
    with_cancelled: 0,
    with_no_show: 0
  };
  for (const c of out.customers) {
    if (c.total_bookings === 0) summary.zero_bookings++;
    if (c.total_bookings > 0 && c.pending === c.total_bookings) summary.only_pending++;
    if (c.confirmed > 0) summary.with_confirmed++;
    if (c.completed > 0) summary.with_completed++;
    if (c.cancelled > 0) summary.with_cancelled++;
    if (c.no_show > 0) summary.with_no_show++;
  }
  out.customer_classification = summary;
  
  return out;
});

// ============================================================
// PHASE 11 — DUPLICATE CUSTOMER ANALYSIS (client-side)
// ============================================================
await runPhase('11_duplicates', async () => {
  const out = {};
  
  const { data: customers, error: cuErr } = await supabase
    .from('customers').select('id, email, phone, full_name');
  if (cuErr) return { error: cuErr.message };
  
  const emailMap = {};
  const phoneMap = {};
  const nameMap = {};
  
  for (const c of customers) {
    if (c.email) {
      const key = c.email.toLowerCase().trim();
      if (!emailMap[key]) emailMap[key] = [];
      emailMap[key].push(c.id);
    }
    if (c.phone) {
      const key = c.phone.replace(/[^0-9+]/g, '');
      if (!phoneMap[key]) phoneMap[key] = [];
      phoneMap[key].push(c.id);
    }
    if (c.full_name) {
      const key = c.full_name.toLowerCase().trim();
      if (!nameMap[key]) nameMap[key] = [];
      nameMap[key].push(c.id);
    }
  }
  
  out.duplicate_emails = Object.entries(emailMap).filter(([,v]) => v.length > 1).map(([k,v]) => ({ email: k, ids: v }));
  out.duplicate_phones = Object.entries(phoneMap).filter(([,v]) => v.length > 1).map(([k,v]) => ({ phone: k, ids: v }));
  out.duplicate_names = Object.entries(nameMap).filter(([,v]) => v.length > 1).map(([k,v]) => ({ name: k, ids: v }));
  
  return out;
});

// ============================================================
// Save report
// ============================================================
const filename = `ZT_BOOKING_CUSTOMER_FORENSIC_${Date.now()}.json`;
await writeFile(filename, JSON.stringify(report, null, 2));
console.log(`\n💾 Report saved: ${filename}`);
console.log('✅ READ-ONLY FORENSIC AUDIT COMPLETE');