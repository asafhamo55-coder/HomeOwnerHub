-- ===========================================================================
-- Verification, part 1 of 2 — STRUCTURE.
-- Run AFTER applying. Every query returns a table; each is described above it.
-- Reads only; writes nothing.
--
-- Then run part 2, verify-inbox-outbound-composer-constraints.sql, which
-- proves the constraints actually behave. It lives in a separate file because
-- it reports by RAISING (see its header), and a client that stops at an error
-- would hide the tables below.
-- ===========================================================================

-- 1. The four new columns exist, and thread_id is now nullable.
--    Expect 5 rows; thread_id.is_nullable = YES.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'inbox_drafts'
  AND column_name IN ('kind','to_emails','cc_emails','mailbox_account_id','thread_id')
ORDER BY column_name;

-- 2. Existing rows were backfilled correctly.
--    Expect: every pre-existing draft is kind='reply' with a thread_id.
SELECT kind, count(*) AS rows, count(thread_id) AS with_thread
FROM public.inbox_drafts
GROUP BY kind
ORDER BY kind;

-- 3. The attachments table and its RLS policy exist.
--    Expect one row, and rowsecurity = true.
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'inbox_draft_attachments';

SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'inbox_draft_attachments';

-- 4. Both CHECK constraints are present.
--    Expect: inbox_drafts_thread_or_account and
--            inbox_draft_attachments_path_in_org.
SELECT conrelid::regclass AS table_name, conname
FROM pg_constraint
WHERE conname IN ('inbox_drafts_thread_or_account',
                  'inbox_draft_attachments_path_in_org');
