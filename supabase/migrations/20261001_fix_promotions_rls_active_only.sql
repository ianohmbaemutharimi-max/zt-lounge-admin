-- Migration: Tighten the public read policy on promotions (audit F1).
--
-- Finding F1: the policy "public_can_read_active_promotions" (created by
-- 20260818_create_promotions_table.sql, now retired) was
--   FOR SELECT USING (true)
-- which let anonymous clients enumerate ALL promotion rows, including inactive,
-- future and expired offers (information exposure of marketing timing).
--
-- This recreates that policy to mirror the canonical public eligibility rule
-- (PromotionRepository.isEligible / status, promoSchema.getPromoStatus):
--   is_active = true
--   AND start_date <= Nairobi business date
--   AND end_date   >= Nairobi business date
-- Promotions have no time-of-day columns (start_time/end_time are dead fields
-- removed in F2), so eligibility is date-only, evaluated in the Africa/Nairobi
-- business timezone to match the public renderer (en-CA date).
--
-- SAFE BY DESIGN: the public site already filters client-side (isEligible);
-- this only narrows what anonymous SQL can read. Authenticated admin access
-- is governed by admins_can_manage_promotions (role = 'admin') and is unaffected.
--
-- Idempotent: DROP IF EXISTS then CREATE. Do NOT mutate the retired 20260818
-- migration. NOT auto-applied: Supabase db push required; live DB was
-- unreachable during this audit (SUPABASE_DB_URL -> DNS ENOTFOUND).
-- Assumption: pg_timezone_names contains 'Africa/Nairobi' (standard tzdata).

drop policy if exists "public_can_read_active_promotions" on public.promotions;

create policy "public_can_read_active_promotions"
  on public.promotions
  for select
  using (
    is_active is true
    and start_date <= (now() at time zone 'Africa/Nairobi')::date
    and end_date   >= (now() at time zone 'Africa/Nairobi')::date
  );
