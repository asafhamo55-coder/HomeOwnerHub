-- Phase C: inbox_drafts generalizes from "an AI-suggested reply" into an
-- outbound message of any kind. Recipients move from send-time derivation
-- (mailbox-send.ts looked up the last inbound message's from_email) onto
-- the row itself, so what an approver saw is what actually ships — a new
-- inbound message arriving during the 30-second undo window could
-- previously redirect the reply to a different address.
--
-- No bcc_emails column, deliberately. Bcc is invisible in the delivered
-- message and is the exact header buildMimeMessage's injection guard exists
-- to prevent being smuggled in. Every recipient of HOA mail carrying
-- balances or violation history stays on the record.
ALTER TABLE public.inbox_drafts
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'reply'
    CHECK (kind IN ('reply', 'forward', 'new')),
  ADD COLUMN IF NOT EXISTS to_emails text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS cc_emails text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS mailbox_account_id uuid
    REFERENCES public.mailbox_accounts(id) ON DELETE CASCADE;

-- A brand-new conversation has no thread yet: it is sent with no Gmail
-- threadId and the ordinary 2-minute sync ingests it into a real thread,
-- the same reasoning already recorded in mailbox-send.ts for sent replies.
-- So thread_id must be nullable, but ONLY for kind='new', and such a row
-- must instead name the mailbox it sends from.
ALTER TABLE public.inbox_drafts
  ALTER COLUMN thread_id DROP NOT NULL;

ALTER TABLE public.inbox_drafts
  DROP CONSTRAINT IF EXISTS inbox_drafts_thread_or_account;

ALTER TABLE public.inbox_drafts
  ADD CONSTRAINT inbox_drafts_thread_or_account CHECK (
    (kind =  'new' AND thread_id IS     NULL AND mailbox_account_id IS NOT NULL) OR
    (kind <> 'new' AND thread_id IS NOT NULL)
  );

-- The compose screen lists a mailbox's own drafts, which have no thread to
-- index by.
CREATE INDEX IF NOT EXISTS inbox_drafts_account_idx
  ON public.inbox_drafts(mailbox_account_id, created_at DESC)
  WHERE thread_id IS NULL;
