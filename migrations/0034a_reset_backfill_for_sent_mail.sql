-- Phase B D1: sync scope widened to include the HOA's own sent mail, so
-- every previously-completed backfill is now incomplete — it fetched only
-- received mail. Reset live accounts to 'pending' so the next connect or a
-- manual re-emit re-imports with the wider query.
--
-- Ingest is idempotent (unique on (mailbox_account_id, gmail_message_id)),
-- so re-running over already-synced inbound mail inserts nothing new.
--
-- Scoped to live accounts only: a disconnected account has no credentials
-- (Phase A hard-deletes the secrets row on disconnect) and could never run.
UPDATE public.mailbox_accounts
SET backfill_status = 'pending',
    backfill_progress = '{}'::jsonb
WHERE disconnected_at IS NULL
  AND backfill_status = 'done';
