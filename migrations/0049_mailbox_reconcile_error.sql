-- 0049_mailbox_reconcile_error.sql
-- Give reconciliation its own error column, and record that it ran at all.
--
-- THE BUG THIS EXISTS TO EXPOSE
--
-- Two jobs share one column. mailboxSyncJob runs every 2 minutes and, on a
-- clean run, writes `sync_error = null` unconditionally
-- (packages/jobs/src/mailbox-sync.ts:186-196). mailboxReconcileJob runs
-- every 15 minutes and writes its skip reason to that SAME column
-- (mailbox-reconcile.ts:382).
--
-- So sync erases reconcile's explanation within two minutes of it being
-- written. An operator looking at mailbox_accounts sees sync_error = null
-- and concludes reconciliation is healthy, when it may be refusing on
-- every single run. That is exactly what happened at Madison Park: 103 of
-- 108 threads still gmail_state='unknown' while the account reported no
-- error at all.
--
-- Separating the columns is the fix. reconcile_ran_at matters as much as
-- the error text: a job that never runs and a job that runs and finds
-- nothing to do are indistinguishable today, and they need completely
-- different responses.
--
-- Idempotent. Safe to re-run. Runs as ONE statement -- see 0048's header
-- for why anything multi-statement is unreliable in the Supabase editor.

DO $mig$
BEGIN
  ALTER TABLE public.mailbox_accounts
    ADD COLUMN IF NOT EXISTS reconcile_error text,
    -- Stamped on EVERY completed pass, including one that changed nothing.
    -- This is what distinguishes "not running" from "running, nothing to do".
    ADD COLUMN IF NOT EXISTS reconcile_ran_at timestamptz,
    -- Null when the pass applied. Set when it refused, so a refusal is
    -- visible without having to correlate timestamps.
    ADD COLUMN IF NOT EXISTS reconcile_skipped_at timestamptz;

  COMMENT ON COLUMN public.mailbox_accounts.reconcile_error IS
    'Why the last Gmail reconciliation pass refused to apply, or NULL if it applied. Deliberately NOT sync_error: mailboxSyncJob clears that every 2 minutes and would erase this.';
  COMMENT ON COLUMN public.mailbox_accounts.reconcile_ran_at IS
    'When reconciliation last completed a pass, whether or not it changed anything. NULL means it has never run for this account.';
  COMMENT ON COLUMN public.mailbox_accounts.reconcile_skipped_at IS
    'When reconciliation last refused to apply a snapshot. Compare with reconcile_ran_at to see whether the most recent pass applied.';

  RAISE NOTICE '0049 ok: reconcile_error, reconcile_ran_at and reconcile_skipped_at are present on mailbox_accounts.';
END
$mig$;
