-- verify-0081-tenant-isolation-2.sql
--
-- Run AFTER 0081_tenant_isolation_2.sql. Every row returns PASS or FAIL.
-- Read-only: safe to run any number of times. Counts only, no row content.

SELECT 'associations has one read policy using the association helper' AS check,
       CASE WHEN count(*) = 1 AND bool_and(qual LIKE '%community_board_association_ids%')
            THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'associations' AND cmd IN ('SELECT', 'ALL');

SELECT 'governing documents and chunks are association scoped' AS check,
       CASE WHEN count(*) = 2 THEN 'PASS' ELSE 'FAIL: expected 2, got ' || count(*) END AS result
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname IN ('governing_documents_select', 'governing_document_chunks_select')
  AND qual LIKE '%community_board_association_ids%';

SELECT 'sa_resident_insert binds the exact parent prefix' AS check,
       CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'submission_attachments'
  AND policyname = 'sa_resident_insert'
  AND with_check LIKE '%thread_type%parent_id%';

SELECT 'pm and eviction tables are board or admin only' AS check,
       CASE WHEN count(*) = 3
             AND NOT EXISTS (SELECT 1 FROM pg_policies
                              WHERE schemaname = 'public'
                                AND tablename IN ('eviction_cases', 'pm_properties', 'pm_rent_ledger')
                                AND coalesce(qual, '') NOT LIKE '%auth_is_board_or_admin%')
            THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('eviction_cases', 'pm_properties', 'pm_rent_ledger');

-- Existing attachment rows whose path does not match their own parent. A count above
-- zero is not a failure of the migration; it lists rows to review.
SELECT 'attachment rows with a mismatched path' AS check,
       count(*)::text AS result
FROM public.submission_attachments
WHERE NOT starts_with(storage_path,
        organization_id::text || '/submissions/' || thread_type || '/' || parent_id::text || '/');
