-- 0011_state_law_updates.sql
-- v1.2 Module 8 — curated "recent legal updates" feed.
--
-- Distinct from state_statutes (which holds the current law). This
-- table holds editorially-curated notes about RECENT changes that
-- HOAs in the affected state should know about — e.g. "FL SB 4-D:
-- structural reports required by Dec 2024 for 3+ story buildings".
--
-- Source is humans (initially HomeownerHub staff; later attorneys or
-- a content partner). The platform does NOT auto-generate these to
-- avoid hallucinated legal claims.
--
-- Idempotent. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.state_law_updates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state           text NOT NULL CHECK (state IN ('GA', 'FL', 'CA', 'TX')),
  headline        text NOT NULL,
  summary         text NOT NULL,                      -- 1–3 paragraphs of plain English
  action_items    text[],                             -- e.g. ['Get a structural inspection by Dec 31, 2024']
  category        text,                               -- same taxonomy as state_statutes.category
  effective_date  date,                               -- when the change takes effect
  source_url      text,                               -- statute, press release, or blog post explaining the change
  related_statute_id uuid REFERENCES public.state_statutes(id) ON DELETE SET NULL,
  posted_at       timestamptz NOT NULL DEFAULT now(),
  posted_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  archived_at     timestamptz                         -- soft-delete; hidden from the feed when set
);

CREATE INDEX IF NOT EXISTS state_law_updates_state_idx
  ON public.state_law_updates(state, posted_at DESC)
  WHERE archived_at IS NULL;

-- ─── RLS: public read, service-role writes ─────────────────────────
ALTER TABLE public.state_law_updates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_read ON public.state_law_updates;
CREATE POLICY public_read ON public.state_law_updates
  FOR SELECT
  TO authenticated, anon
  USING (archived_at IS NULL);
