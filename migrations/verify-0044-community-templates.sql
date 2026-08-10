-- verify-0044-community-templates.sql
-- Run after 0044_community_templates.sql. Every row must report PASS.
-- (Renumbered from the plan's 0031 — see the header note in
-- 0044_community_templates.sql for why.)

SELECT 'organization_id nullable' AS check_name,
       CASE WHEN is_nullable = 'YES' THEN 'PASS' ELSE 'FAIL' END AS result
FROM information_schema.columns
WHERE table_name = 'communication_templates' AND column_name = 'organization_id';

SELECT 'community category on templates' AS check_name,
       CASE WHEN pg_get_constraintdef(oid) LIKE '%community%' THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_constraint WHERE conname = 'communication_templates_category_check';

SELECT 'community category on communications' AS check_name,
       CASE WHEN pg_get_constraintdef(oid) LIKE '%community%' THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_constraint WHERE conname = 'communications_category_check';

SELECT 'six new columns present' AS check_name,
       CASE WHEN count(*) = 6 THEN 'PASS' ELSE 'FAIL — got ' || count(*) END AS result
FROM information_schema.columns
WHERE table_name = 'communication_templates'
  AND column_name IN ('topic_slug','shape','questions','visual_block','accent_color','source_template_id');

SELECT 'four separate policies' AS check_name,
       CASE WHEN count(*) = 4 THEN 'PASS' ELSE 'FAIL — got ' || count(*) END AS result
FROM pg_policies
WHERE tablename = 'communication_templates'
  AND policyname IN ('templates_select','templates_insert','templates_update','templates_delete');

SELECT 'no FOR ALL policy remains' AS check_name,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_policies WHERE tablename = 'communication_templates' AND cmd = 'ALL';

SELECT 'insert policy forbids null org' AS check_name,
       CASE WHEN with_check LIKE '%IS NOT NULL%' THEN 'PASS' ELSE 'FAIL' END AS result
FROM pg_policies WHERE tablename = 'communication_templates' AND policyname = 'templates_insert';
