-- Read-only checks for 0076_amenity_reservations.sql. Run after the owner applies it.
-- Expect: all four tables with RLS on; 5 select policies; no write policies; the
-- overlap trigger and 6 same-org triggers present.
select c.relname, c.relrowsecurity as rls_on
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public'
   and c.relname in ('amenities', 'amenity_reservations', 'amenity_hours', 'amenity_blackouts')
 order by 1;   -- 4 rows, rls_on true on each

select tablename, policyname, cmd
  from pg_policies
 where schemaname = 'public'
   and tablename in ('amenities', 'amenity_reservations', 'amenity_hours', 'amenity_blackouts')
 order by 1, 2;   -- 5 rows; every cmd must be SELECT

select tgrelid::regclass as tbl, tgname
  from pg_trigger
 where not tgisinternal
   and tgrelid in ('public.amenities'::regclass, 'public.amenity_reservations'::regclass,
                   'public.amenity_hours'::regclass, 'public.amenity_blackouts'::regclass)
 order by 1, 2;   -- amenity_reservations_no_overlap + zz_org_fk_* x6 + *_touch x2

-- The new columns (expect 5 on amenities, 6 on amenity_reservations incl. kind).
select table_name, column_name
  from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'amenities' and column_name in
           ('capacity', 'concurrent_limit', 'min_notice_hours', 'cancel_cutoff_hours', 'retired_at'))
     or (table_name = 'amenity_reservations' and column_name in
           ('kind', 'cancel_reason', 'party_size', 'rules_snapshot')))
 order by 1, 2;   -- 9 rows

-- unit_id must now allow NULL (board holds); expect is_nullable = YES.
select is_nullable from information_schema.columns
 where table_schema = 'public' and table_name = 'amenity_reservations' and column_name = 'unit_id';

select (select count(*) from public.amenities) as amenities,
       (select count(*) from public.amenity_reservations) as reservations,
       (select count(*) from public.amenity_hours) as hours,
       (select count(*) from public.amenity_blackouts) as blackouts;   -- all 0 on a fresh apply
