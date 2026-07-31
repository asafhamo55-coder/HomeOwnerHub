-- 0032_mailbox_backfill_watchdog.sql
-- Gives mailboxWatchdogJob (packages/jobs/src/mailbox-sync.ts) a signal to
-- detect a backfill chain that died out-of-band — a platform step timeout,
-- an OOM, a process kill, anything that bypasses mailbox-backfill.ts's own
-- try/catch and never reaches its `backfill_status: 'failed'` write. Such a
-- chain previously left the row at `backfill_status: 'running'` forever,
-- with no code path able to correct it (see the watchdog fix that added
-- this column's consumer).
--
-- There is no existing timestamp scoped to backfill progress —
-- last_synced_at belongs to mailboxSyncJob's cursor walk and is untouched
-- by the backfill chain. This adds one, and a trigger to maintain it
-- WITHOUT modifying mailbox-backfill.ts: that job already writes
-- backfill_status and backfill_progress on every page (see its `.update()`
-- calls), so a BEFORE UPDATE trigger that stamps backfill_updated_at
-- whenever either of those columns changes stays current automatically.
--
-- Idempotent. Safe to re-run.

ALTER TABLE public.mailbox_accounts
  ADD COLUMN IF NOT EXISTS backfill_updated_at timestamptz;

CREATE OR REPLACE FUNCTION public.mailbox_accounts_touch_backfill()
RETURNS trigger AS $$
BEGIN
  IF NEW.backfill_status IS DISTINCT FROM OLD.backfill_status
     OR NEW.backfill_progress IS DISTINCT FROM OLD.backfill_progress THEN
    NEW.backfill_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mailbox_accounts_touch_backfill ON public.mailbox_accounts;
CREATE TRIGGER mailbox_accounts_touch_backfill
  BEFORE UPDATE ON public.mailbox_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.mailbox_accounts_touch_backfill();

-- Mirrors mailbox_accounts_sync_idx (0029) for the same query shape:
-- "accounts with a given status, ordered/filtered by staleness, excluding
-- disconnected ones."
CREATE INDEX IF NOT EXISTS mailbox_accounts_backfill_idx
  ON public.mailbox_accounts(backfill_status, backfill_updated_at)
  WHERE disconnected_at IS NULL;
