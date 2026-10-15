-- 0057_bank_txn_reconciliation_attempted.sql
-- Distinguish "W18 declined this" from "W18 never saw this".
--
-- THE COST LEAK
--
-- migrations/../packages/jobs/src/plaid-sync.ts (the resumability fix just
-- before this one) finds W18 targets with
-- `matched_journal_entry_id IS NULL`. That is ambiguous: W18's Step B/D can
-- deliberately leave a transaction unmatched, queued for human review, and
-- that row is indistinguishable from one orphaned by a mid-run kill that
-- never reached W18 at all. Both read NULL. So every 4-hour tick
-- re-submits the ENTIRE human-review backlog to W18, including a fresh
-- paid Step D LLM call per row, forever -- not a correctness bug (W18 is
-- idempotent) but an unbounded, growing cost.
--
-- THE FIX
--
-- One column recording that an attempt was made, set regardless of
-- outcome. "Never attempted" (NULL) is retried; "attempted" is not, until
-- someone clears it. See plaid-sync.ts for why the stamp happens AFTER
-- W18 returns (success or declined) and not before (which would silently
-- drop a transaction whose step throws, reintroducing the exact bug the
-- prior migration fixed).
--
-- NO BACKFILL, ON PURPOSE
--
-- Every existing unmatched row reads as "never attempted" (NULL), which is
-- conservative in the direction that matters: the one-time cost of
-- re-running W18 once more against today's backlog, rather than risking a
-- declined row never being looked at again because it was wrongly marked
-- attempted. The leak this fixes is about EVERY TICK, not the first one
-- after deploy.
--
-- Nullable, no DEFAULT: `ADD COLUMN` without a volatile default on a
-- nullable column is a metadata-only change on Postgres 11+ (the fixed
-- default-fill optimization) -- no table rewrite, no long-held lock,
-- regardless of table size.
--
-- Idempotent. Safe to re-run. Runs as ONE statement -- see 0048's header
-- for why anything multi-statement is unreliable in the Supabase editor.

DO $mig$
BEGIN
  ALTER TABLE public.bank_transactions
    ADD COLUMN IF NOT EXISTS reconciliation_attempted_at timestamptz;

  COMMENT ON COLUMN public.bank_transactions.reconciliation_attempted_at IS
    'When W18 (bank reconciliation) last ran against this row, whether or not it produced a match. matched_journal_entry_id IS NULL is ambiguous on its own -- it means either "W18 ran and deliberately left this for human review" or "W18 has never seen this row" (e.g. a sync tick was killed before reaching it), and those need different handling: the first should not be re-submitted every tick, the second must be. NULL here means never attempted (always retried); non-NULL means attempted (not re-submitted). Clear it to force a retry of a declined transaction -- no other state blocks that.';

  RAISE NOTICE '0057 ok: reconciliation_attempted_at is present on bank_transactions.';
END
$mig$;
