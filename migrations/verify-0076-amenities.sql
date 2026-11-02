-- Read-only checks for 0076_amenity_reservations.sql. Run after the owner applies it.
-- Expect: both tables with RLS on; 3 select policies; no write policies; the
-- overlap trigger and 4 same-org triggers present.
select c.relname, c.relrowsecurity as rls_on
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname in ('amenities', 'amenity_reservations');

select tablename, policyname, cmd
  from pg_policies
 where schemaname = 'public' and tablename in ('amenities', 'amenity_reservations')
 order by 1, 2;   -- every cmd must be SELECT

select tgrelid::regclass as tbl, tgname
  from pg_trigger
 where not tgisinternal
   and tgrelid in ('public.amenities'::regclass, 'public.amenity_reservations'::regclass)
 order by 1, 2;   -- amenity_reservations_no_overlap + zz_org_fk_* x4 + *_touch x2

select count(*) as amenities, (select count(*) from public.amenity_reservations) as reservations
  from public.amenities;   -- 0 and 0 on a fresh apply
