-- Phase B: one row per suggested reply, carrying its whole life from
-- generation through approval to send. The send queue lives in this table
-- (status + send_after) rather than a separate one, so a single row answers
-- "what were we told, and who approved it" when a resident asks later.
CREATE TABLE IF NOT EXISTS public.inbox_drafts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  thread_id       uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,

  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','queued','sending','sent','cancelled','failed')),

  subject         text NOT NULL,
  body_text       text NOT NULL,
  citations       jsonb NOT NULL DEFAULT '[]'::jsonb,
  blanks          jsonb NOT NULL DEFAULT '[]'::jsonb,
  grounded        boolean NOT NULL DEFAULT false,
  grounding_note  text,

  ai_run_id       uuid,
  model           text,
  prompt_version  text,

  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  approved_by     uuid,
  approved_at     timestamptz,
  send_after      timestamptz,
  sent_at         timestamptz,
  gmail_message_id text,
  error           text
);

CREATE INDEX IF NOT EXISTS inbox_drafts_thread_idx
  ON public.inbox_drafts(thread_id, created_at DESC);

-- The send job's claim query: queued rows whose undo window has elapsed.
CREATE INDEX IF NOT EXISTS inbox_drafts_queued_idx
  ON public.inbox_drafts(status, send_after)
  WHERE status = 'queued';

ALTER TABLE public.inbox_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_access ON public.inbox_drafts;
CREATE POLICY board_access ON public.inbox_drafts
  FOR ALL
  USING       (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id))
  WITH CHECK  (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id));
