-- 0034_inbox_reply_embeddings.sql
-- Phase B: embeddings over the HOA's own past replies, so drafts can be
-- grounded in how this association actually writes rather than in a generic
-- voice. One row per outbound message with a usable body.
--
-- vector(768) matches EXPECTED_DIM in packages/ai/src/embeddings.ts. The
-- schema also contains vector(1024) columns from an earlier model swap —
-- those are dead and must not be copied.
CREATE TABLE IF NOT EXISTS public.inbox_reply_embeddings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  message_id      uuid NOT NULL REFERENCES public.inbox_messages(id) ON DELETE CASCADE,
  embedding       vector(768) NOT NULL,
  -- Guards against re-paying for an embedding when a re-sync returns text
  -- that has not changed. Embedding calls cost money per token.
  text_sha256     text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- One embedding per message. Plain column, not an expression: PostgREST's
-- on_conflict accepts only a literal column list and throws 42P10 on an
-- expression index (learned twice in Phase A).
CREATE UNIQUE INDEX IF NOT EXISTS inbox_reply_embeddings_message_uniq
  ON public.inbox_reply_embeddings(message_id);

CREATE INDEX IF NOT EXISTS inbox_reply_embeddings_org_idx
  ON public.inbox_reply_embeddings(organization_id);

-- Vector index. ivfflat needs a populated table to build good lists, so it
-- is created here with a conservative list count and can be rebuilt later.
CREATE INDEX IF NOT EXISTS inbox_reply_embeddings_vec_idx
  ON public.inbox_reply_embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

ALTER TABLE public.inbox_reply_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_access ON public.inbox_reply_embeddings;
CREATE POLICY board_access ON public.inbox_reply_embeddings
  FOR ALL
  USING       (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id))
  WITH CHECK  (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id));
