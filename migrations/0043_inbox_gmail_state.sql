-- Mirror Gmail's own filing back into HomeownerHub.
--
-- The mailbox integration was append-only: sync captured a message once
-- and nothing ever reconciled it afterwards. listHistory asks Gmail for
-- 'messageAdded' only, parseGmailMessage produced labelIds that nothing
-- persisted, and buildScopeQuery never constrained to in:inbox — so
-- archiving a thread, filing it into a folder, or trashing it was
-- invisible here, and backfill re-fetched mail filed away months earlier.
-- A board that kept its Gmail tidy watched its HomeownerHub inbox only
-- grow. These columns are where the observed Gmail state lands.

-- ── per message ────────────────────────────────────────────────────────

-- Raw labels as Gmail last returned them. NULL is the load-bearing value:
-- it means NEVER OBSERVED, which is not the same as "no labels" ('{}',
-- a real observation meaning archived). Every row that predates this
-- migration starts NULL, and every read path treats NULL as visible —
-- hiding mail whose state we have never looked at would invent a cleanup
-- the board never performed. scripts/backfill-inbox-gmail-state.ts turns
-- NULL into a real observation.
ALTER TABLE public.inbox_messages
  ADD COLUMN IF NOT EXISTS gmail_labels text[],
  ADD COLUMN IF NOT EXISTS gmail_state text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS gmail_state_at timestamptz;

-- 'deleted' is kept distinct from 'trashed' on purpose. Trashed mail is
-- recoverable by the board itself; deleted means Gmail reported the
-- message permanently gone (a 404 on re-fetch), so there are no labels
-- left to read. Both hide the thread, but collapsing them into one state
-- would make the difference permanently undiagnosable.
ALTER TABLE public.inbox_messages
  DROP CONSTRAINT IF EXISTS inbox_messages_gmail_state_check;

ALTER TABLE public.inbox_messages
  ADD CONSTRAINT inbox_messages_gmail_state_check
    CHECK (gmail_state IN ('unknown', 'inbox', 'archived', 'trashed', 'deleted'));

-- Drives the reconcile job's per-thread rollup, which reads every message
-- of the threads it touched.
CREATE INDEX IF NOT EXISTS inbox_messages_gmail_state_idx
  ON public.inbox_messages(mailbox_account_id, gmail_state);

-- ── per thread ─────────────────────────────────────────────────────────

-- The denormalized rollup the inbox list actually filters on, recomputed
-- from the thread's messages by packages/mailbox/src/labels.ts's
-- threadStateFromMessages. Denormalized for the same reason subject /
-- participants / last_message_at / last_direction already are on this
-- table: the list query filters and paginates over it, and a correlated
-- subquery across inbox_messages on every page load is not viable.
--
-- 'active' rather than 'inbox': a thread is live when ANY of its inbound
-- mail is still in the Gmail inbox, which is a property of the
-- conversation, not of one message.
ALTER TABLE public.inbox_threads
  ADD COLUMN IF NOT EXISTS gmail_state text NOT NULL DEFAULT 'unknown';

ALTER TABLE public.inbox_threads
  DROP CONSTRAINT IF EXISTS inbox_threads_gmail_state_check;

ALTER TABLE public.inbox_threads
  ADD CONSTRAINT inbox_threads_gmail_state_check
    CHECK (gmail_state IN ('unknown', 'active', 'archived', 'trashed'));

-- Partial, covering only the states the working inbox actually shows.
-- The hidden states are the minority of rows in a healthy mailbox but the
-- MAJORITY in exactly the mailboxes this feature is for (a board that
-- files everything), so indexing the visible side keeps the common list
-- query off a growing archived heap. last_message_at is included because
-- every list query orders by it.
CREATE INDEX IF NOT EXISTS inbox_threads_visible_idx
  ON public.inbox_threads(organization_id, status, last_message_at DESC)
  WHERE gmail_state NOT IN ('archived', 'trashed');

-- And its complement, for the "Filed in Gmail" chip.
CREATE INDEX IF NOT EXISTS inbox_threads_gmail_filed_idx
  ON public.inbox_threads(organization_id, last_message_at DESC)
  WHERE gmail_state IN ('archived', 'trashed');

-- No RLS changes: both tables already carry org-scoped policies gated on
-- auth_is_board_or_admin (migration 0012 + the inbox migrations), and
-- these are additional columns on existing rows, not new tables.
