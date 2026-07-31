-- 0030_inbox_message_uniq_scope.sql
-- Fix: scope the Gmail message dedupe key per mailbox, not globally.
--
-- The bug (consequence, not just mechanics):
-- 0029_inbox.sql created `inbox_messages_gmail_uniq` as a GLOBAL unique
-- index on gmail_message_id. Gmail only guarantees message-id uniqueness
-- WITHIN a single mailbox — Google documents no cross-account guarantee.
-- The ingest path (packages built after 0029) does
-- `INSERT ... ON CONFLICT (gmail_message_id) DO NOTHING` so a re-sync of
-- mail already stored is a no-op. With a global unique index, if two
-- different HOA tenants connect two different Gmail mailboxes that ever
-- produce the same message id, the SECOND tenant's genuinely-new email
-- is silently discarded as a "duplicate" of the first tenant's message.
-- No error, no log line — the email simply never appears in that HOA's
-- inbox. That is cross-tenant data loss, and it is invisible until a
-- resident asks "where's my email" and nobody can explain it.
--
-- The fix: scope the uniqueness to (mailbox_account_id, gmail_message_id),
-- matching exactly what Gmail actually guarantees.
--
-- Idempotent. Safe to re-run.

-- ─── mailbox_account_id on inbox_messages ─────────────────────────────
-- inbox_threads already carries mailbox_account_id; inbox_messages did
-- not, which is what allowed the global-uniqueness bug through review —
-- there was no column on the message row itself to scope by.
ALTER TABLE public.inbox_messages
  ADD COLUMN IF NOT EXISTS mailbox_account_id uuid
    REFERENCES public.mailbox_accounts(id) ON DELETE CASCADE;

-- Backfill from the parent thread. The table is empty in production
-- today (Phase A ingest has not shipped yet), so this is a no-op now —
-- but it must be correct if this migration is ever re-run after rows
-- exist (e.g. re-applied in a fresh environment that seeds threads and
-- messages before running migrations in order).
UPDATE public.inbox_messages m
   SET mailbox_account_id = t.mailbox_account_id
  FROM public.inbox_threads t
 WHERE t.id = m.thread_id
   AND m.mailbox_account_id IS NULL;

-- NOT NULL after backfill, guarded so a re-run never fails even if a
-- future backfill pass is still catching up on a partially-migrated row.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'inbox_messages'
       AND column_name = 'mailbox_account_id'
       AND is_nullable = 'YES'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.inbox_messages WHERE mailbox_account_id IS NULL
  ) THEN
    ALTER TABLE public.inbox_messages
      ALTER COLUMN mailbox_account_id SET NOT NULL;
  END IF;
END$$;

-- ─── Rescope the dedupe index ──────────────────────────────────────────
-- Drop the old global-uniqueness index from 0029 and replace it with the
-- per-mailbox one. `ingestMessages` must be updated (see the plan, Task
-- 13) to conflict-target on (mailbox_account_id, gmail_message_id).
DROP INDEX IF EXISTS public.inbox_messages_gmail_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS inbox_messages_gmail_uniq
  ON public.inbox_messages(mailbox_account_id, gmail_message_id);

-- Lookups by mailbox alone (e.g. "all messages for this mailbox account",
-- counting/backfill progress, admin diagnostics) would otherwise have to
-- scan the whole table or ride the composite index's leading column with
-- no other predicate — a plain index on the column makes that direct
-- rather than incidental.
CREATE INDEX IF NOT EXISTS inbox_messages_mailbox_idx
  ON public.inbox_messages(mailbox_account_id);

-- ─── Minor: reverse lookup for thread links ────────────────────────────
-- inbox_thread_links_uniq (0029) is (thread_id, resource_type, resource_id),
-- which only serves "does this thread already have a link". It does not
-- serve the reverse and equally common question — "does this ticket / ARC
-- request / violation already have a linked thread" — which would
-- otherwise force a sequential scan of inbox_thread_links.
CREATE INDEX IF NOT EXISTS inbox_thread_links_resource_idx
  ON public.inbox_thread_links(resource_type, resource_id);

-- ─── Minor: document the inline-attachment skip rule ───────────────────
-- Neither 0029 nor the design brief writes down WHY inbox_attachments has
-- an is_inline column and a 'skipped' fetch_status. Recording it here so
-- it isn't re-litigated later:
--
-- Inline images at or below a small size threshold (the ingest code uses
-- 100 KB) are overwhelmingly signature logos and tracking pixels, not
-- content a board or resident would ever want to open. Storing them:
--   (a) buries the real attachment (the invoice, the photo) in a list of
--       one-per-email logo GIFs in the UI, and
--   (b) multiplies storage for years of vendor mail with zero value.
-- `is_inline` records what Gmail told us about placement; `fetch_status
-- = 'skipped'` records the deliberate decision not to fetch/store bytes
-- for a small inline image, distinct from 'failed' (we tried and
-- couldn't) or 'pending' (queued to try). Inline images ABOVE the
-- threshold are still fetched — that's usually a photo pasted into the
-- body, which is evidence.
COMMENT ON COLUMN public.inbox_attachments.is_inline IS
  'Gmail Content-Disposition: inline. Combined with size_bytes to decide '
  'the skip threshold — see fetch_status.';
COMMENT ON COLUMN public.inbox_attachments.fetch_status IS
  'pending=queued, stored=bytes in hoa-documents, failed=tried and '
  'could not, skipped=deliberately not fetched (small inline image — '
  'signature logo / tracking pixel, not content worth storing).';
