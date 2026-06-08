-- 0021_event_notify_config.sql
-- Configurable notifications for recurring events.
--
-- Until now hoa_recurring_events fired a single hardcoded alert: an
-- email to the org's board. Boards asked to control BOTH the method
-- (email / SMS / in-app portal) and the audience (the whole community,
-- the board, or specific residents) — the same targeting the
-- communications module already supports.
--
-- Two new columns carry that config. The alert sender (lib/events-alerts.ts)
-- and the daily cron read them; defaults reproduce the old behavior
-- exactly so existing rows keep emailing the board with no change.
--
--   notify_channels  — which delivery channels fire. Subset of
--                      {email, sms, portal}. Default {email}.
--   notify_audience  — an AudienceDefinition jsonb (same shape the
--                      communications module stores). Default the board.
--                      Examples:
--                        {"kind":"board"}
--                        {"kind":"board","boardUserIds":["…"]}
--                        {"kind":"everyone"}
--                        {"kind":"specific_residents","residentIds":["…"]}
--
-- Idempotent. Safe to re-run.

ALTER TABLE public.hoa_recurring_events
  ADD COLUMN IF NOT EXISTS notify_channels text[] NOT NULL
    DEFAULT ARRAY['email']::text[];

ALTER TABLE public.hoa_recurring_events
  ADD COLUMN IF NOT EXISTS notify_audience jsonb NOT NULL
    DEFAULT '{"kind":"board"}'::jsonb;

-- Guard rails: channels must be a non-empty subset of the supported set,
-- and the audience must at least name a kind. Dropped first so re-runs
-- don't error on the duplicate constraint.
ALTER TABLE public.hoa_recurring_events
  DROP CONSTRAINT IF EXISTS hoa_recurring_events_notify_channels_chk;
ALTER TABLE public.hoa_recurring_events
  ADD CONSTRAINT hoa_recurring_events_notify_channels_chk
  CHECK (
    array_length(notify_channels, 1) >= 1
    AND notify_channels <@ ARRAY['email', 'sms', 'portal']::text[]
  );

ALTER TABLE public.hoa_recurring_events
  DROP CONSTRAINT IF EXISTS hoa_recurring_events_notify_audience_chk;
ALTER TABLE public.hoa_recurring_events
  ADD CONSTRAINT hoa_recurring_events_notify_audience_chk
  CHECK (notify_audience ? 'kind');
