-- W34 drafts a vendor work order from a resident thread. Structurally it is
-- a kind='new' message (its own Gmail thread, so a reply-all can never
-- reach the resident), but it is NOT a blank human-composed email: the send
-- job, the thread badge, and the audit trail all need to tell an
-- AI-drafted vendor request apart from someone clicking "New email".
ALTER TABLE public.inbox_drafts
  DROP CONSTRAINT IF EXISTS inbox_drafts_kind_check;

ALTER TABLE public.inbox_drafts
  ADD CONSTRAINT inbox_drafts_kind_check
    CHECK (kind IN ('reply', 'forward', 'new', 'vendor_request'));

ALTER TABLE public.inbox_drafts
  DROP CONSTRAINT IF EXISTS inbox_drafts_thread_or_account;

ALTER TABLE public.inbox_drafts
  ADD CONSTRAINT inbox_drafts_thread_or_account CHECK (
    (kind IN ('new','vendor_request')
       AND thread_id IS NULL AND mailbox_account_id IS NOT NULL) OR
    (kind NOT IN ('new','vendor_request') AND thread_id IS NOT NULL)
  );

-- The resident thread this request came from. Both link directions resolve
-- from this one column: forward via gmail_message_id into inbox_messages to
-- find the vendor thread the sent message synced into, reverse for the
-- other direction. Deliberately NOT inbox_thread_links — that table's
-- resource_id has no FK and carries a documented dangling-UUID hazard
-- (lib/inbox/actions.ts:379).
ALTER TABLE public.inbox_drafts
  ADD COLUMN IF NOT EXISTS source_thread_id uuid
    REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS request_intent text
    CHECK (request_intent IS NULL OR request_intent IN
      ('inspect_quote','emergency','schedule','warranty','bid','other')),
  ADD COLUMN IF NOT EXISTS vendor_id uuid
    REFERENCES public.vendors(id) ON DELETE SET NULL;

-- ON DELETE SET NULL, not CASCADE: deleting a resident thread must never
-- silently delete the record of what was sent to a vendor about it. The
-- draft survives with a broken link, which is the honest outcome.

CREATE INDEX IF NOT EXISTS inbox_drafts_source_thread_idx
  ON public.inbox_drafts(source_thread_id)
  WHERE source_thread_id IS NOT NULL;
