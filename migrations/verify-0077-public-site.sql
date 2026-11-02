-- Read-only checks for 0077_public_site.sql. Run after the owner applies it.
-- Expect: both tables present with RLS on; 2 board_select policies; anon and
-- authenticated hold no write privileges; 4 same-org triggers.
SELECT c.relname, c.relrowsecurity AS rls_on
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relname IN ('public_sites', 'public_site_items');

SELECT tablename, policyname, cmd FROM pg_policies
 WHERE schemaname = 'public' AND tablename IN ('public_sites', 'public_site_items');

SELECT table_name, grantee, privilege_type FROM information_schema.role_table_grants
 WHERE table_schema = 'public' AND table_name IN ('public_sites', 'public_site_items')
   AND grantee IN ('anon', 'authenticated')
 ORDER BY 1, 2, 3;

SELECT tgrelid::regclass AS tbl, tgname FROM pg_trigger
 WHERE NOT tgisinternal AND tgname LIKE 'zz_org_fk_public_site%' ORDER BY 1, 2;

-- Nothing is public until a board member publishes: expect 0.
SELECT count(*) AS published_sites FROM public.public_sites WHERE published;
