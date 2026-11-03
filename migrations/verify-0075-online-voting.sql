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

-- The append-only exception must require the organization row to be gone, so deleting an
-- association (or any nested delete) cannot cascade away cast votes.
SELECT 'append-only cascade exception is org-scoped' AS check,
       CASE WHEN pg_get_functiondef('public.ballot_append_only()'::regprocedure) LIKE '%public.orgs%'
             AND pg_get_functiondef('public.ballots_guard()'::regprocedure) LIKE '%public.orgs%'
            THEN 'PASS' ELSE 'FAIL' END AS result;

-- Residents read only their own association's ballots and options; a home needs a unit
-- record in the ballot's association to vote.
SELECT 'ballot read policies are association-scoped' AS check,
       CASE WHEN (SELECT count(*) FROM pg_policies
                   WHERE tablename IN ('ballots', 'ballot_options')
                     AND policyname IN ('ballots_select', 'ballot_options_select')
                     AND qual LIKE '%poll_resident_association_ids%') = 2
            THEN 'PASS' ELSE 'FAIL' END AS result;

SELECT 'cast_ballot requires a unit record in the ballot association' AS check,
       CASE WHEN pg_get_functiondef('public.cast_ballot(uuid,uuid,uuid[])'::regprocedure) LIKE '%IF NOT EXISTS (SELECT 1 FROM public.units u WHERE u.legacy_hoa_property_id = p_property%'
            THEN 'PASS' ELSE 'FAIL' END AS result;
