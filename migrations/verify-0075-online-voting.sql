-- verify-0075-online-voting.sql. Run AFTER 0075. Read-only; every row says PASS or FAIL.
SELECT 'tables exist' AS check,
       CASE WHEN count(*) = 4 THEN 'PASS' ELSE 'FAIL: ' || count(*) END AS result
FROM pg_tables WHERE schemaname = 'public'
  AND tablename IN ('ballots', 'ballot_options', 'ballot_voters', 'ballot_box');

SELECT 'RLS on all four' AS check,
       CASE WHEN count(*) = 4 THEN 'PASS' ELSE 'FAIL: ' || count(*) END AS result
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relrowsecurity
  AND c.relname IN ('ballots', 'ballot_options', 'ballot_voters', 'ballot_box');

-- ballot_box must have NO policy and no grant to the web roles.
SELECT 'ballot_box unreadable by web roles' AS check,
       CASE WHEN (SELECT count(*) FROM pg_policies WHERE tablename = 'ballot_box') = 0
             AND NOT has_table_privilege('authenticated', 'public.ballot_box', 'SELECT')
             AND NOT has_table_privilege('anon', 'public.ballot_box', 'SELECT')
            THEN 'PASS' ELSE 'FAIL' END AS result;

-- No write policy on any of the voting tables.
SELECT 'no write policies' AS check,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL: ' || count(*) END AS result
FROM pg_policies WHERE tablename IN ('ballots', 'ballot_options', 'ballot_voters', 'ballot_box') AND cmd <> 'SELECT';

SELECT 'immutability triggers' AS check,
       CASE WHEN count(*) = 5 THEN 'PASS' ELSE 'FAIL: ' || count(*) END AS result
FROM pg_trigger WHERE NOT tgisinternal
  AND tgname IN ('ballot_voters_append_only', 'ballot_box_append_only', 'ballot_box_validate',
                 'ballot_options_frozen', 'ballots_guard');

SELECT 'functions not callable by anon' AS check,
       CASE WHEN NOT has_function_privilege('anon', 'public.cast_ballot(uuid,uuid,uuid[])', 'EXECUTE')
             AND NOT has_function_privilege('anon', 'public.ballot_results(uuid)', 'EXECUTE')
             AND NOT has_function_privilege('anon', 'public.open_ballot(uuid,text,text)', 'EXECUTE')
            THEN 'PASS' ELSE 'FAIL' END AS result;

-- Counts only, no personal data.
SELECT 'ballots by status' AS check, status AS result, count(*) FROM public.ballots GROUP BY status;
