-- ===========================================================================
-- Verification, part 2 of 2 — CONSTRAINT BEHAVIOUR.
-- Run AFTER part 1 (verify-inbox-outbound-composer.sql).
--
-- >>> THIS SCRIPT ENDS IN A RED "ERROR". THAT IS THE REPORT, AND IT IS  <<<
-- >>> EXPECTED. Read the four lines in the message; all should say PASS. <<<
--
-- Why an error rather than a table: the raise is what discards every probe
-- below, so nothing is ever written — and an error message is the one output
-- every client shows. NOTICEs are hidden by the Supabase SQL editor, and a
-- TEMP table does not survive its per-statement connection pooling.
--
-- One statement. No shared state. Safe to re-run.
-- ===========================================================================

DO $$
DECLARE
  v_org    uuid;
  v_draft  uuid;
  r        text := '';
BEGIN
  -- Reuse a REAL draft so the FK on draft_id cannot fire before the CHECK
  -- being tested.
  SELECT id, organization_id INTO v_draft, v_org
  FROM public.inbox_drafts ORDER BY created_at DESC LIMIT 1;

  -- 5a. kind='new' with no mailbox_account_id must be refused.
  SELECT id INTO v_org FROM public.orgs LIMIT 1;
  IF v_org IS NULL THEN
    r := r || E'\n  a kind=new needs a mailbox      SKIPPED (no orgs row)';
  ELSE
    BEGIN
      INSERT INTO public.inbox_drafts (organization_id, kind, subject, body_text)
      VALUES (v_org, 'new', 'x', 'y');
      r := r || E'\n  a kind=new needs a mailbox      FAIL - it was ACCEPTED';
    EXCEPTION WHEN check_violation THEN
      r := r || E'\n  a kind=new needs a mailbox      PASS';
    END;
  END IF;

  IF v_draft IS NULL THEN
    r := r || E'\n  b cross-org path refused        SKIPPED (no inbox_drafts row)'
           || E'\n  c encoded-separator refused     SKIPPED (no inbox_drafts row)'
           || E'\n  d legitimate path accepted      SKIPPED (no inbox_drafts row)';
  ELSE
    SELECT organization_id INTO v_org FROM public.inbox_drafts WHERE id = v_draft;

    -- 5b. A cross-org storage_path must be refused.
    BEGIN
      INSERT INTO public.inbox_draft_attachments
        (organization_id, draft_id, source, storage_path, file_name, size_bytes)
      VALUES (v_org, v_draft, 'document',
              '00000000-0000-0000-0000-000000000000/CCRs.pdf', 'x.pdf', 1);
      r := r || E'\n  b cross-org path refused        FAIL - it was ACCEPTED';
    EXCEPTION WHEN check_violation THEN
      r := r || E'\n  b cross-org path refused        PASS';
    END;

    -- 5c. The encoded-separator escape must be refused.
    BEGIN
      INSERT INTO public.inbox_draft_attachments
        (organization_id, draft_id, source, storage_path, file_name, size_bytes)
      VALUES (v_org, v_draft, 'document',
              v_org::text || '/..%2f00000000-0000-0000-0000-000000000000/x.pdf',
              'x.pdf', 1);
      r := r || E'\n  c encoded-separator refused     FAIL - it was ACCEPTED';
    EXCEPTION WHEN check_violation THEN
      r := r || E'\n  c encoded-separator refused     PASS';
    END;

    -- 5d. A legitimate in-org key carrying '%', spaces and parentheses must
    --     still be ACCEPTED. This is the check people skip, and the one that
    --     catches an over-tight constraint: sanitizeStorageName leaves the
    --     extension tail untouched, so these are real stored keys. A FAIL
    --     here means existing documents would become unattachable.
    BEGIN
      INSERT INTO public.inbox_draft_attachments
        (organization_id, draft_id, source, storage_path, file_name, size_bytes)
      VALUES (v_org, v_draft, 'document',
              v_org::text || '/1770000000-budget.pdf (final) 50% off', 'b.pdf', 1);
      r := r || E'\n  d legitimate path accepted      PASS';
    EXCEPTION WHEN check_violation THEN
      r := r || E'\n  d legitimate path accepted      FAIL - legitimate key REFUSED';
    END;
  END IF;

  -- This raise IS the report, and it is also what discards every probe above.
  RAISE EXCEPTION E'=== VERIFICATION REPORT (expected - nothing was written) ===%\n\nAll four lines should read PASS.', r;
END $$;
