-- Production apply for migration 0062_state_law_ingestion (sub-project F,
-- phase 0: State Law Brain ingestion).
-- Spec: docs/specs/2026-10-15-sub-project-F-law-to-bylaw.md (§3, §8, §10)
-- Design: docs/superpowers/specs/2026-08-18-state-law-ingestion-design.md
--
-- Run the three parts separately in the Supabase SQL editor, IN ORDER.
-- Deploy the dependent code (branch claude/law-ingestion) only AFTER part 3
-- returns all-true: the new refresh job selects content_hash /
-- source_name / last_checked_at and writes state_statute_changes, so before
-- 0062 every run fails at its plan step (loudly, through the failure
-- middleware; it modifies nothing first).
--
-- 0062 changes no data. It adds three nullable columns, one table, one
-- policy and tightens grants. Existing statute rows keep content_hash NULL
-- until the first refresh run fills it.

-- ─── PART 1: pre-check (read-only) ────────────────────────────────────
-- Expect on first apply: statutes_table = true, chunks_table = true,
-- has_content_hash = false, changes_table = false. Note fl_rows / ga_rows:
-- fl_rows is the starter data (expected 4) the first run will replace with
-- verbatim text; ga_rows (expected 27) is never touched by this job.
-- If has_content_hash is already true, 0062 is idempotent: part 2 is still
-- safe to run.
SELECT
  to_regclass('public.state_statutes')        IS NOT NULL AS statutes_table,
  to_regclass('public.state_statute_chunks')  IS NOT NULL AS chunks_table,
  to_regclass('public.state_statute_changes') IS NOT NULL AS changes_table,
  EXISTS (SELECT 1 FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = 'state_statutes'
             AND column_name = 'content_hash')               AS has_content_hash,
  (SELECT count(*) FROM public.state_statutes WHERE state = 'FL') AS fl_rows,
  (SELECT count(*) FROM public.state_statutes WHERE state = 'GA') AS ga_rows,
  (SELECT count(*) FROM public.state_statutes
     WHERE state = 'FL' AND code_citation !~ '^Fla\. Stat\. § 720\.\d+$') AS fl_rows_outside_ch720;

-- ─── PART 2: apply ────────────────────────────────────────────────────
-- Paste the ENTIRE contents of migrations/0062_state_law_ingestion.sql (a
-- single DO block, no BEGIN/COMMIT). Expected output:
--   NOTICE: 0062 ok: state_statutes provenance columns + state_statute_changes present.

-- ─── PART 3: verify (read-only) ───────────────────────────────────────
-- Every column must be true.
SELECT
  (SELECT count(*) = 3 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'state_statutes'
       AND column_name IN ('content_hash', 'source_name', 'last_checked_at')) AS statute_columns,
  EXISTS (SELECT 1 FROM pg_constraint
           WHERE conname = 'state_statutes_content_hash_format')               AS hash_format_check,
  to_regclass('public.state_statute_changes') IS NOT NULL                       AS changes_table,
  (SELECT relrowsecurity FROM pg_class
     WHERE oid = 'public.state_statute_changes'::regclass)                      AS changes_rls_enabled,
  -- Exactly one policy on the change log, SELECT-only, for authenticated.
  (SELECT count(*) = 1 AND bool_and(cmd = 'SELECT') AND bool_and(roles = '{authenticated}')
     FROM pg_policies WHERE schemaname = 'public' AND tablename = 'state_statute_changes') AS changes_select_only,
  -- 0010's read policies are untouched, and still the only policies.
  (SELECT count(*) = 1 AND bool_and(cmd = 'SELECT')
     FROM pg_policies WHERE schemaname = 'public' AND tablename = 'state_statutes')        AS statutes_select_only,
  (SELECT count(*) = 1 AND bool_and(cmd = 'SELECT')
     FROM pg_policies WHERE schemaname = 'public' AND tablename = 'state_statute_chunks')  AS chunks_select_only,
  -- Writes: service role only. RLS is the lock (grants stay at the
  -- Supabase defaults): no policy on any of the three tables may allow a
  -- write command.
  NOT EXISTS (SELECT 1 FROM pg_policies
               WHERE schemaname = 'public'
                 AND tablename IN ('state_statutes', 'state_statute_chunks', 'state_statute_changes')
                 AND cmd <> 'SELECT')                                                 AS no_write_policies,
  (SELECT bool_and(relrowsecurity) FROM pg_class
     WHERE oid IN ('public.state_statutes'::regclass, 'public.state_statute_chunks'::regclass,
                   'public.state_statute_changes'::regclass))                         AS rls_on_all_three,
  -- Forward only: nothing rewritten by the migration itself.
  (SELECT count(*) = 0 FROM public.state_statutes WHERE content_hash IS NOT NULL)    AS no_hashes_yet,
  (SELECT count(*) = 0 FROM public.state_statute_changes)                            AS change_log_empty;

-- ─── AFTER the first refresh run (read-only, optional) ───────────────
-- Expect fl_ch720_rows = 36, unhashed = 0 (every FL row is in Ch. 720),
-- source_name = 'flsenate.gov Fla. Stat. Ch. 720 (2026)'. The change log
-- holds 36 rows, all with event_sent_at set: one 'changed' per starter row
-- the verbatim text replaced (4 if PART 1 showed fl_rows = 4) and 'added'
-- for the rest (32).
-- SELECT
--   count(*) FILTER (WHERE code_citation ~ '^Fla\. Stat\. § 720\.\d+$' AND superseded_at IS NULL) AS fl_ch720_rows,
--   count(*) FILTER (WHERE content_hash IS NULL)                         AS unhashed,
--   min(source_name), max(source_name), max(last_checked_at)
-- FROM public.state_statutes WHERE state = 'FL';
-- SELECT change_kind, count(*), count(event_sent_at) AS sent
--   FROM public.state_statute_changes GROUP BY change_kind;
