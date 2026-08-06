-- ===========================================================================
-- Inbox outbound composer — migrations 0038 + 0039 + 0040
-- Apply as ONE transaction. Safe to re-run (all statements are idempotent).
--
-- Source of truth, with full rationale comments:
--   migrations/0038_inbox_outbound_recipients.sql
--   migrations/0039_inbox_draft_attachments.sql
--   migrations/0040_inbox_draft_attachment_path_scope.sql
--
-- Order matters: 0039 creates the table 0040 constrains.
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0038 — recipients live on the draft row
-- No bcc_emails column, deliberately.
-- ---------------------------------------------------------------------------
ALTER TABLE public.inbox_drafts
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'reply'
    CHECK (kind IN ('reply', 'forward', 'new')),
  ADD COLUMN IF NOT EXISTS to_emails text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS cc_emails text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS mailbox_account_id uuid
    REFERENCES public.mailbox_accounts(id) ON DELETE CASCADE;

-- kind='new' has no thread yet; it names the mailbox it sends from instead.
ALTER TABLE public.inbox_drafts
  ALTER COLUMN thread_id DROP NOT NULL;

ALTER TABLE public.inbox_drafts
  DROP CONSTRAINT IF EXISTS inbox_drafts_thread_or_account;

ALTER TABLE public.inbox_drafts
  ADD CONSTRAINT inbox_drafts_thread_or_account CHECK (
    (kind =  'new' AND thread_id IS     NULL AND mailbox_account_id IS NOT NULL) OR
    (kind <> 'new' AND thread_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS inbox_drafts_account_idx
  ON public.inbox_drafts(mailbox_account_id, created_at DESC)
  WHERE thread_id IS NULL;

-- ---------------------------------------------------------------------------
-- 0039 — files on an outgoing message (paths referenced, bytes never copied)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inbox_draft_attachments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  draft_id        uuid NOT NULL
    REFERENCES public.inbox_drafts(id) ON DELETE CASCADE,
  source          text NOT NULL CHECK (source IN ('upload', 'inbox', 'document')),
  storage_path    text NOT NULL,
  file_name       text NOT NULL,
  content_type    text,
  size_bytes      bigint NOT NULL CHECK (size_bytes >= 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inbox_draft_attachments_draft_idx
  ON public.inbox_draft_attachments(draft_id);

ALTER TABLE public.inbox_draft_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_access ON public.inbox_draft_attachments;
CREATE POLICY board_access ON public.inbox_draft_attachments
  FOR ALL
  USING       (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id))
  WITH CHECK  (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id));

-- ---------------------------------------------------------------------------
-- 0040 — tenant boundary on the storage path (defence in depth)
--
-- The 0039 policy constrains organization_id and nothing else, so a board
-- member's own anon-key client can insert a row naming ANOTHER org's object.
-- The send job downloads with the service role, which bypasses storage
-- policies. This constraint holds for every writer, not just today's caller.
-- ---------------------------------------------------------------------------
ALTER TABLE public.inbox_draft_attachments
  DROP CONSTRAINT IF EXISTS inbox_draft_attachments_path_in_org;

ALTER TABLE public.inbox_draft_attachments
  ADD CONSTRAINT inbox_draft_attachments_path_in_org CHECK (
    -- no '.'/'..' segment, no empty segment
    storage_path !~ '(^|/)\.\.?(/|$)'
    AND storage_path NOT LIKE '%//%'
    AND storage_path NOT LIKE '/%'
    AND storage_path NOT LIKE '%/'

    -- URL-normalization class. A bare '%' is deliberately allowed: real
    -- stored keys contain '%', spaces and parentheses.
    AND storage_path !~ '[[:cntrl:]]'
    AND storage_path !~* '%2[ef]'
    AND storage_path !~ '\\'

    AND (
      starts_with(storage_path, organization_id::text || '/')
      OR starts_with(storage_path, 'inbox-drafts/' || organization_id::text || '/')
    )
  );

COMMIT;
