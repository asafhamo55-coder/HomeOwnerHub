-- verify-0079-mailed-letters.sql
--
-- Run AFTER 0079_mailed_letters.sql. Every row returns PASS or FAIL.
-- Read-only: safe to run any number of times.

SELECT 'table exists with RLS on' AS check,
       CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'mailed_letters' AND c.relrowsecurity;

-- A letter has two possible sources. Both are nullable; exactly one is set.
SELECT 'both source columns exist and are nullable' AS check,
       CASE WHEN count(*) = 2 THEN 'PASS' ELSE 'FAIL: expected 2, got ' || count(*) END AS result
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'mailed_letters'
  AND column_name IN ('approval_request_id', 'violation_id')
  AND is_nullable = 'YES';

SELECT 'exactly-one-source check constraint' AS check,
       CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_constraint
WHERE conrelid = 'public.mailed_letters'::regclass
  AND conname = 'mailed_letters_one_source'
  AND contype = 'c';

-- One send per source: a unique constraint on each column alone.
SELECT 'one send per approval request and per violation' AS check,
       CASE WHEN count(*) = 2 THEN 'PASS' ELSE 'FAIL: expected 2, got ' || count(*) END AS result
FROM pg_constraint c
WHERE c.conrelid = 'public.mailed_letters'::regclass
  AND c.contype = 'u'
  AND array_length(c.conkey, 1) = 1
  AND (SELECT a.attname FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attnum = c.conkey[1])
      IN ('approval_request_id', 'violation_id');

SELECT 'violation_id references hoa_violations' AS check,
       CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_constraint
WHERE conrelid = 'public.mailed_letters'::regclass
  AND contype = 'f'
  AND confrelid = 'public.hoa_violations'::regclass;

SELECT 'same-org triggers on all four parents' AS check,
       CASE WHEN count(*) = 4 THEN 'PASS' ELSE 'FAIL: expected 4, got ' || count(*) END AS result
FROM pg_trigger
WHERE NOT tgisinternal
  AND tgrelid = 'public.mailed_letters'::regclass
  AND tgname LIKE 'zz_org_fk_mailed_letters_%';

SELECT 'violation same-org trigger is present' AS check,
       CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_trigger
WHERE NOT tgisinternal
  AND tgrelid = 'public.mailed_letters'::regclass
  AND tgname = 'zz_org_fk_mailed_letters_violation_id';

SELECT 'select policy only' AS check,
       CASE WHEN count(*) FILTER (WHERE cmd <> 'SELECT') = 0 AND count(*) = 1
            THEN 'PASS' ELSE 'FAIL: expected exactly one SELECT policy' END AS result
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'mailed_letters';

SELECT 'web roles have no write grant' AS check,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL: ' || count(*) || ' write grants' END AS result
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'mailed_letters'
  AND grantee IN ('authenticated', 'anon', 'PUBLIC')
  AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');

SELECT 'anon has no grant at all' AS check,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL: ' || count(*) END AS result
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'mailed_letters'
  AND grantee IN ('anon', 'PUBLIC');

-- Row counts only (no content).
SELECT 'row counts' AS check,
       (SELECT count(*) FROM public.mailed_letters)::text || ' letters, '
    || (SELECT count(*) FROM public.mailed_letters WHERE violation_id IS NOT NULL)::text || ' from violations' AS result;
