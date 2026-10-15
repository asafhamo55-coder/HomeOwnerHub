-- 0062_state_law_ingestion.sql
--
-- Sub-project F, phase 0: the State Law Brain ingestion design approved
-- 2026-08-18 (docs/superpowers/specs/2026-08-18-state-law-ingestion-design.md
-- §2, where it was numbered 0051 — that number went to
-- property_list_waiting_list). Spec: docs/specs/2026-10-15-sub-project-F-law-to-bylaw.md.
--
-- state_statutes gains
--   content_hash     SHA-256 (hex) of the normalised verbatim body. NULL on
--                    rows written before this migration; the first refresh
--                    run fills it (the normalisation lives in TypeScript,
--                    and re-implementing it in SQL would risk two hashes for
--                    one text). Format-checked.
--   source_name      which official source/edition produced the row, e.g.
--                    'flsenate.gov Fla. Stat. Ch. 720 (2026)'. NULL = curated
--                    or starter data, never official verbatim text.
--   last_checked_at  when the refresh job last compared the row to its
--                    source. fetched_at now means "when the text last
--                    changed"; staleness keys off last_checked_at, which
--                    fixes "verified yesterday, reported stale forever".
--
-- state_statute_changes (new) is the change log and event outbox. One row
-- per detected added / changed / reinstated / removed section, carrying
-- citation and old/new hash (never the body). event_sent_at is NULL until
-- the refresh job has emitted the matching Inngest event
-- (law/statute.changed or law/statute.removed), so a run that dies after
-- writing the law but before emitting still emits on the next run.
-- Replaces the design's `state_law.statute_updated` platform_admin_audit
-- row: that table's actor_user_id is NOT NULL (0019), so a system job
-- cannot write it — which is also why the old refresh job's audit inserts
-- never landed.
--
-- SECURITY SHAPE
--   * Statutes are public reference data. state_statutes and
--     state_statute_chunks keep 0010's public_read SELECT policy unchanged.
--     state_statute_changes is readable by authenticated users only.
--   * Writes are service-role only: no INSERT/UPDATE/DELETE policy exists on
--     any of the three tables, so RLS denies every non-service-role write.
--     Table grants are left at the Supabase defaults on purpose: RLS is this
--     schema's protection layer (scripts/local-db-reset.ts re-grants ALL to
--     anon/authenticated for parity with production, and the RLS tests are
--     only meaningful if grants match production).
--
-- No data is modified. Idempotent. Runs as ONE statement (a single DO
-- block) -- see 0048's header for why multi-statement scripts are
-- unreliable in the Supabase SQL editor.

DO $mig$
BEGIN
  -- ─── state_statutes: provenance + change-detection columns ─────────
  ALTER TABLE public.state_statutes ADD COLUMN IF NOT EXISTS content_hash    text;
  ALTER TABLE public.state_statutes ADD COLUMN IF NOT EXISTS source_name     text;
  ALTER TABLE public.state_statutes ADD COLUMN IF NOT EXISTS last_checked_at timestamptz;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'state_statutes_content_hash_format'
       AND conrelid = 'public.state_statutes'::regclass
  ) THEN
    ALTER TABLE public.state_statutes
      ADD CONSTRAINT state_statutes_content_hash_format
      CHECK (content_hash IS NULL OR content_hash ~ '^[0-9a-f]{64}$');
  END IF;

  COMMENT ON COLUMN public.state_statutes.content_hash IS
    'SHA-256 hex of the normalised body (packages/workflows/src/W30-state-law-brain/sources/normalize.ts). NULL until the first refresh run after 0062.';
  COMMENT ON COLUMN public.state_statutes.source_name IS
    'Official source + edition that produced this row. NULL = curated/starter text, not official verbatim.';
  COMMENT ON COLUMN public.state_statutes.last_checked_at IS
    'When the refresh job last compared this row to its source. fetched_at = when the text last changed.';

  -- ─── state_statute_changes: change log + event outbox ──────────────
  CREATE TABLE IF NOT EXISTS public.state_statute_changes (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    statute_id     uuid NOT NULL REFERENCES public.state_statutes(id) ON DELETE CASCADE,
    state          text NOT NULL CHECK (state IN ('GA', 'FL', 'CA', 'TX')),
    code_citation  text NOT NULL,
    change_kind    text NOT NULL
      CHECK (change_kind IN ('added', 'changed', 'reinstated', 'removed')),
    old_hash       text CHECK (old_hash IS NULL OR old_hash ~ '^[0-9a-f]{64}$'),
    new_hash       text CHECK (new_hash IS NULL OR new_hash ~ '^[0-9a-f]{64}$'),
    source_name    text,
    detected_at    timestamptz NOT NULL DEFAULT now(),
    event_sent_at  timestamptz,
    -- removed carries no new text; everything else must.
    CONSTRAINT state_statute_changes_hash_shape CHECK (
      (change_kind = 'removed' AND new_hash IS NULL AND old_hash IS NOT NULL)
      OR (change_kind = 'changed' AND old_hash IS NOT NULL AND new_hash IS NOT NULL)
      OR (change_kind IN ('added', 'reinstated') AND new_hash IS NOT NULL)
    )
  );

  CREATE INDEX IF NOT EXISTS state_statute_changes_statute_idx
    ON public.state_statute_changes (statute_id, detected_at DESC);
  CREATE INDEX IF NOT EXISTS state_statute_changes_state_idx
    ON public.state_statute_changes (state, detected_at DESC);
  CREATE INDEX IF NOT EXISTS state_statute_changes_unsent_idx
    ON public.state_statute_changes (detected_at)
    WHERE event_sent_at IS NULL;

  ALTER TABLE public.state_statute_changes ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS state_statute_changes_read ON public.state_statute_changes;
  CREATE POLICY state_statute_changes_read ON public.state_statute_changes
    FOR SELECT TO authenticated
    USING (true);

  COMMENT ON TABLE public.state_statute_changes IS
    'Change log + event outbox for official statute text (sub-project F phase 0). Written by the state-law-refresh job under service role; event_sent_at marks emission of law/statute.changed / law/statute.removed.';

  RAISE NOTICE '0062 ok: state_statutes provenance columns + state_statute_changes present.';
END
$mig$;
