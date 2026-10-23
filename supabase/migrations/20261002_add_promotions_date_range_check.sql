-- Migration: Range constraint for promotions start_date/end_date (audit F3).
--
-- Finding F3: the promotions table had no database-level guard ensuring
-- end_date >= start_date, allowing nonsensical rows such as
-- (start_date = 2027-01-01, end_date = 2026-01-01).
--
-- Invariant enforced:
--   end_date IS NULL OR start_date IS NULL OR end_date >= start_date
-- NULL dates are tolerated (nullable dates are the declared migration contract
-- in 20260818_create_promotions_table.sql, and schema.ts / status() handle
-- NULL gracefully). The check is inclusive (same-day start==end is valid).
--
-- NOT auto-applied: live DB was unreachable during this audit
-- (SUPABASE_DB_URL -> DNS ENOTFOUND). Existing-row compatibility is UNVERIFIED:
-- rows violating the invariant cannot be inspected before applying, so apply
-- manually (or repair offenders first) once the DB is reachable.
-- Idempotent: only adds the constraint if it does not already exist.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'promotions_valid_date_range'
      and conrelid = 'public.promotions'::regclass
  ) then
    alter table public.promotions
      add constraint promotions_valid_date_range
      check (end_date is null or start_date is null or end_date >= start_date);
  end if;
end
$$;
