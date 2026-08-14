-- verify-0047-collections.sql
--
-- Run AFTER 0047_collections.sql. Every row returns PASS or FAIL.
-- Read-only: safe to run any number of times.
--
-- The check that matters most is APPEND-ONLY: if collection_events ever
-- acquires an UPDATE or DELETE policy, the evidence trail becomes editable
-- and nothing else in the system would notice.

-- 1. Tables exist
SELECT 'tables exist' AS check,
       CASE WHEN count(*) = 2 THEN 'PASS' ELSE 'FAIL — expected 2, got ' || count(*) END AS result
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('collection_cases', 'collection_events');

-- 2. RLS enabled on both
SELECT 'RLS enabled' AS check,
       CASE WHEN count(*) = 2 THEN 'PASS' ELSE 'FAIL — expected 2, got ' || count(*) END AS result
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('collection_cases', 'collection_events')
  AND c.relrowsecurity;

-- 3. collection_events is APPEND-ONLY: SELECT + INSERT policies only.
--    A row here other than PASS means history can be rewritten.
SELECT 'collection_events append-only' AS check,
       CASE
         WHEN count(*) FILTER (WHERE cmd IN ('UPDATE', 'DELETE', 'ALL')) > 0
           THEN 'FAIL — found a ' || string_agg(DISTINCT cmd, '/') FILTER (WHERE cmd IN ('UPDATE','DELETE','ALL')) || ' policy; the trail is mutable'
         WHEN count(*) FILTER (WHERE cmd = 'SELECT') = 1
          AND count(*) FILTER (WHERE cmd = 'INSERT') = 1
           THEN 'PASS'
         ELSE 'FAIL — expected exactly one SELECT and one INSERT policy, got ' || count(*)
       END AS result
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'collection_events';

-- 4. collection_cases board policy carries BOTH using and with_check
SELECT 'collection_cases policy has USING and WITH CHECK' AS check,
       CASE WHEN qual IS NOT NULL AND with_check IS NOT NULL THEN 'PASS'
            ELSE 'FAIL — a FOR ALL policy without WITH CHECK silently reuses USING' END AS result
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'collection_cases' AND policyname = 'board_access';

-- 5. assessment_type accepts the four new collection categories
SELECT 'assessment_type widened' AS check,
       CASE WHEN bool_and(pg_get_constraintdef(oid) LIKE '%' || t || '%') THEN 'PASS'
            ELSE 'FAIL — missing ' || t END AS result
FROM pg_constraint,
     unnest(ARRAY['lien_filing','collection_legal','collection_letter','collection_processing']) AS t
WHERE conname = 'assessments_assessment_type_check'
GROUP BY t;

-- 6. One-open-case-per-unit partial unique index
SELECT 'one open case per unit' AS check,
       CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL — index missing' END AS result
FROM pg_indexes
WHERE schemaname = 'public' AND indexname = 'collection_cases_one_open_per_unit_idx';

-- 7. updated_at trigger on collection_cases (and NOT on collection_events)
SELECT 'updated_at trigger placement' AS check,
       CASE WHEN count(*) FILTER (WHERE c.relname = 'collection_cases') = 1
             AND count(*) FILTER (WHERE c.relname = 'collection_events') = 0
            THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
WHERE c.relname IN ('collection_cases', 'collection_events') AND NOT t.tgisinternal;

-- 8. collection_events has no deleted_at / updated_at columns
SELECT 'collection_events has no mutable-row columns' AS check,
       CASE WHEN count(*) = 0 THEN 'PASS'
            ELSE 'FAIL — found ' || string_agg(column_name, ', ') END AS result
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'collection_events'
  AND column_name IN ('updated_at', 'deleted_at');

-- 9. collection_cases points at units, not legacy hoa_properties
SELECT 'case references units(id)' AS check,
       CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL — unit_id FK missing' END AS result
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'collection_cases' AND tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name = 'unit_id' AND ccu.table_name = 'units';

-- 10. Madison Park AR is still exactly $9,475.88 after reclassification
SELECT 'Madison Park AR unchanged' AS check,
       CASE WHEN COALESCE(SUM(amount), 0) = 9475.88 THEN 'PASS'
            ELSE 'FAIL — AR is ' || to_char(COALESCE(SUM(amount), 0), 'FM$9,999,990.00') END AS result
FROM public.assessments
WHERE organization_id = 'a4906f16-baf3-4232-a2bd-a78ea432ad86'
  AND status = 'open' AND deleted_at IS NULL;

-- 11. The eight collection costs moved out of 'special', and the Gate
--     Opener charge did NOT (it is a real special assessment).
SELECT 'collection costs reclassified' AS check,
       CASE WHEN count(*) FILTER (WHERE assessment_type <> 'special') = 8
             AND count(*) FILTER (WHERE assessment_type = 'special' AND amount = 49.50) = 1
            THEN 'PASS'
            ELSE 'FAIL — ' || count(*) FILTER (WHERE assessment_type <> 'special')
                 || ' reclassified (expected 8), '
                 || count(*) FILTER (WHERE assessment_type = 'special')
                 || ' left as special (expected 1, the Gate Opener)' END AS result
FROM public.assessments
WHERE organization_id = 'a4906f16-baf3-4232-a2bd-a78ea432ad86'
  AND status = 'open' AND deleted_at IS NULL
  AND amount IN (175.00, 55.00, 185.11, 193.47, 155.00, 40.00, 45.00, 185.00, 49.50)
  AND assessment_type IN ('special','lien_filing','collection_legal','collection_letter','collection_processing');

-- 12. Breakdown for eyeballing — not a PASS/FAIL row.
SELECT 'BREAKDOWN: ' || assessment_type AS check,
       to_char(SUM(amount), 'FM$9,999,990.00') || ' across ' || count(*) || ' row(s)' AS result
FROM public.assessments
WHERE organization_id = 'a4906f16-baf3-4232-a2bd-a78ea432ad86'
  AND status = 'open' AND deleted_at IS NULL
GROUP BY assessment_type
ORDER BY 1;
