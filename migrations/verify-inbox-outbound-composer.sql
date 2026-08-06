-- ===========================================================================
-- Verification — run AFTER applying. Every check should return the "expect"
-- value described above it. Nothing here writes anything permanent.
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

-- ---------------------------------------------------------------------------
-- 5. Prove the constraints actually bite, and that they do NOT over-reach.
--    Returns a result table (not NOTICEs, which some clients hide).
--    Wrapped in a transaction and rolled back — nothing is written.
--    Expect all four rows to read PASS.
-- ---------------------------------------------------------------------------
BEGIN;

CREATE TEMP TABLE _verify_results (seq int, check_name text, result text);

DO $$
DECLARE
  v_org   uuid;
  v_draft uuid;
BEGIN
  -- Reuse a REAL draft so the FK on draft_id cannot fire before the CHECK
  -- being tested.
  SELECT id, organization_id INTO v_draft, v_org
  FROM public.inbox_drafts ORDER BY created_at DESC LIMIT 1;

  IF v_draft IS NULL THEN
    INSERT INTO _verify_results VALUES
      (2, '5b cross-org path refused',        'SKIPPED - no inbox_drafts row'),
      (3, '5c encoded-separator refused',     'SKIPPED - no inbox_drafts row'),
      (4, '5d legitimate path accepted',      'SKIPPED - no inbox_drafts row');
  ELSE
    -- 5b. A cross-org storage_path must be refused.
    BEGIN
      INSERT INTO public.inbox_draft_attachments
        (organization_id, draft_id, source, storage_path, file_name, size_bytes)
      VALUES (v_org, v_draft, 'document',
              '00000000-0000-0000-0000-000000000000/CCRs.pdf', 'x.pdf', 1);
      INSERT INTO _verify_results VALUES (2, '5b cross-org path refused', 'FAIL - it was ACCEPTED');
    EXCEPTION WHEN check_violation THEN
      INSERT INTO _verify_results VALUES (2, '5b cross-org path refused', 'PASS');
    END;

    -- 5c. The encoded-separator escape must be refused.
    BEGIN
      INSERT INTO public.inbox_draft_attachments
        (organization_id, draft_id, source, storage_path, file_name, size_bytes)
      VALUES (v_org, v_draft, 'document',
              v_org::text || '/..%2f00000000-0000-0000-0000-000000000000/x.pdf',
              'x.pdf', 1);
      INSERT INTO _verify_results VALUES (3, '5c encoded-separator refused', 'FAIL - it was ACCEPTED');
    EXCEPTION WHEN check_violation THEN
      INSERT INTO _verify_results VALUES (3, '5c encoded-separator refused', 'PASS');
    END;

    -- 5d. A legitimate in-org key with %, spaces and parentheses must be
    --     ACCEPTED. This guards against the constraint being too strict —
    --     sanitizeStorageName leaves the extension tail untouched, so these
    --     are real stored keys.
    BEGIN
      INSERT INTO public.inbox_draft_attachments
        (organization_id, draft_id, source, storage_path, file_name, size_bytes)
      VALUES (v_org, v_draft, 'document',
              v_org::text || '/1770000000-budget.pdf (final) 50% off', 'b.pdf', 1);
      INSERT INTO _verify_results VALUES (4, '5d legitimate path accepted', 'PASS');
    EXCEPTION WHEN check_violation THEN
      INSERT INTO _verify_results VALUES (4, '5d legitimate path accepted', 'FAIL - legitimate key REFUSED');
    END;
  END IF;

  -- 5a. kind='new' with no mailbox_account_id must be refused.
  SELECT id INTO v_org FROM public.orgs LIMIT 1;
  IF v_org IS NULL THEN
    INSERT INTO _verify_results VALUES (1, '5a kind=new needs a mailbox', 'SKIPPED - no orgs row');
  ELSE
    BEGIN
      INSERT INTO public.inbox_drafts (organization_id, kind, subject, body_text)
      VALUES (v_org, 'new', 'x', 'y');
      INSERT INTO _verify_results VALUES (1, '5a kind=new needs a mailbox', 'FAIL - it was ACCEPTED');
    EXCEPTION WHEN check_violation THEN
      INSERT INTO _verify_results VALUES (1, '5a kind=new needs a mailbox', 'PASS');
    END;
  END IF;
END $$;

SELECT check_name, result FROM _verify_results ORDER BY seq;

ROLLBACK;
