-- verify-0078-community-board.sql
--
-- Run AFTER 0078_community_board.sql. Every row returns PASS or FAIL.
-- Read-only: safe to run any number of times.

SELECT 'tables exist' AS check,
       CASE WHEN count(*) = 3 THEN 'PASS' ELSE 'FAIL: expected 3, got ' || count(*) END AS result
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('board_threads', 'board_posts', 'board_post_reports');

SELECT 'RLS enabled' AS check,
       CASE WHEN count(*) = 3 THEN 'PASS' ELSE 'FAIL: expected 3, got ' || count(*) END AS result
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('board_threads', 'board_posts', 'board_post_reports')
  AND c.relrowsecurity;

-- The web roles may only read: a write policy here means a resident could edit the board.
SELECT 'select policies only' AS check,
       CASE WHEN count(*) FILTER (WHERE cmd <> 'SELECT') = 0 AND count(*) = 6
            THEN 'PASS' ELSE 'FAIL: expected 6 SELECT policies and no others' END AS result
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('board_threads', 'board_posts', 'board_post_reports');

SELECT 'authenticated has no write grant' AS check,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL: ' || count(*) || ' write grants' END AS result
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('board_threads', 'board_posts', 'board_post_reports')
  AND grantee IN ('authenticated', 'anon', 'PUBLIC')
  AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');

SELECT 'anon has no grant at all' AS check,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL: ' || count(*) END AS result
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('board_threads', 'board_posts', 'board_post_reports')
  AND grantee IN ('anon', 'PUBLIC');

SELECT 'same-org triggers' AS check,
       CASE WHEN count(*) = 3 THEN 'PASS' ELSE 'FAIL: expected 3, got ' || count(*) END AS result
FROM pg_trigger
WHERE NOT tgisinternal
  AND tgname LIKE 'zz_org_fk_board_%';

SELECT 'association helper is definer with pinned search_path' AS check,
       CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'community_board_association_ids'
  AND p.prosecdef AND p.proconfig IS NOT NULL;

-- Row counts only (no content).
SELECT 'row counts' AS check,
       (SELECT count(*) FROM public.board_threads)::text || ' threads, '
    || (SELECT count(*) FROM public.board_posts)::text || ' posts, '
    || (SELECT count(*) FROM public.board_post_reports)::text || ' reports' AS result;
