-- Files on an outgoing message. Bytes are NEVER copied: all three sources
-- (a fresh upload, a file that arrived on this thread, a document from the
-- library) already live in the private `hoa-documents` bucket, so this row
-- stores the path. No duplicated storage and no cleanup job for abandoned
-- drafts. The cost is that a source object deleted between attach and send
-- makes the send fail — loudly, before anything is transmitted, which is the
-- right failure for "the file you meant to send is gone".
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
