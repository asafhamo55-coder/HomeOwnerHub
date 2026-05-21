-- 0018_recurring_events.sql
-- Simple recurring events module — annual reminders for the board.
--
-- Spec ask:
--   • Boards routinely miss recurring deadlines (Annual Board Meeting,
--     Fiscal Year End, Insurance Renewal) because nothing nags them.
--   • This table holds those events. A daily cron walks rows where
--     event_date - alert_days_before <= today, emails the board, and
--     (for recurrence='annual') rolls event_date forward one year so
--     the same row keeps firing on its anniversary.
--
-- recurrence is intentionally just 'annual' | 'none' for v1 — most HOA
-- deadlines are once a year, and the cron logic stays trivial. Anything
-- more complex (monthly, quarterly, cron expressions) belongs in a
-- later migration once we see real demand.
--
-- NOTE on numbering: there's an existing 0018_communications.sql in
-- this repo at HEAD. The two share the 0018 slot because they were
-- developed in parallel branches; we keep this filename to match the
-- spec and let the merge resolve numbering. Both are idempotent.
--
-- Idempotent. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.hoa_recurring_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  -- Nullable: org-wide events (e.g. "Fiscal Year End") that aren't
  -- pinned to a specific association are allowed.
  association_id       uuid REFERENCES public.associations(id) ON DELETE CASCADE,
  title                text NOT NULL
    CHECK (char_length(title) <= 200),
  description          text
    CHECK (description IS NULL OR char_length(description) <= 2000),
  -- The next/upcoming occurrence. Cron rolls this forward by 1 year
  -- after firing when recurrence='annual'.
  event_date           date NOT NULL,
  recurrence           text NOT NULL DEFAULT 'annual'
    CHECK (recurrence IN ('annual', 'none')),
  alert_days_before    int NOT NULL DEFAULT 7
    CHECK (alert_days_before >= 0 AND alert_days_before <= 90),
  -- last_alert_sent_at: when we last sent any alert for this event.
  -- last_alert_sent_for: the event_date that alert covered. We compare
  -- this to the current event_date to decide whether the cron should
  -- fire — keeps us idempotent if the cron runs twice in a day.
  last_alert_sent_at   timestamptz,
  last_alert_sent_for  date,
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Cron scans by (org, active, date) — this index covers it cleanly.
CREATE INDEX IF NOT EXISTS hoa_recurring_events_cron_idx
  ON public.hoa_recurring_events(organization_id, is_active, event_date);

-- ─── RLS ─────────────────────────────────────────────────────────────
-- Standard org_access pattern (see 0007/0017). Service role bypasses
-- RLS implicitly so the cron can read across orgs.

ALTER TABLE public.hoa_recurring_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_access ON public.hoa_recurring_events;

CREATE POLICY org_access ON public.hoa_recurring_events
  USING (organization_id = ANY (public.auth_org_ids()))
  WITH CHECK (organization_id = ANY (public.auth_org_ids()));
