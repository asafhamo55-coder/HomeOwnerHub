-- 0010_state_statutes.sql
-- v1.2 Module 8 — State Law & Compliance.
--
-- Per-state HOA statutes (e.g., GA Code Title 44 Ch 3, FL Statute 720,
-- CA Davis-Stirling, TX Property Code 209). Public domain — these are
-- the actual laws, not anyone's private content — so the tables are NOT
-- row-level-secured.
--
-- The W30 workflow runs RAG over the chunks, filtered by state. The same
-- chunked + embedded pattern as W1 (Governing Docs Brain), with state
-- replacing organization as the partition key.
--
-- Idempotent. Safe to re-run.

-- ─── state_statutes (one row per code section) ──────────────────────
CREATE TABLE IF NOT EXISTS public.state_statutes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state           text NOT NULL CHECK (state IN ('GA', 'FL', 'CA', 'TX')),
  code_citation   text NOT NULL,                  -- 'O.C.G.A. Section 44-3-108'
  title           text NOT NULL,                  -- 'Annual meetings of association'
  category        text,                           -- 'meetings', 'assessments', 'fines', ...
  body            text NOT NULL,
  source_url      text,                           -- where this came from (legislative site)
  effective_date  date,
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  superseded_at   timestamptz,                    -- set when a newer version of the same citation is ingested
  UNIQUE (state, code_citation)
);

CREATE INDEX IF NOT EXISTS state_statutes_state_idx
  ON public.state_statutes(state)
  WHERE superseded_at IS NULL;
CREATE INDEX IF NOT EXISTS state_statutes_category_idx
  ON public.state_statutes(state, category)
  WHERE superseded_at IS NULL;

-- ─── state_statute_chunks (RAG-ready) ───────────────────────────────
-- Same embedding dimensions as governing_document_chunks (768 per
-- BAAI/bge-base-en-v1.5; ADR-003 + migration 0005b).
CREATE TABLE IF NOT EXISTS public.state_statute_chunks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statute_id    uuid NOT NULL REFERENCES public.state_statutes(id) ON DELETE CASCADE,
  state         text NOT NULL CHECK (state IN ('GA', 'FL', 'CA', 'TX')),
  chunk_index   int NOT NULL,
  content       text NOT NULL,
  embedding     vector(768),
  metadata      jsonb,
  UNIQUE (statute_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS state_statute_chunks_state_idx
  ON public.state_statute_chunks(state);

-- ivfflat for cosine similarity. Same pattern + lists count as
-- governing_document_chunks_embedding_idx in 0005b.
CREATE INDEX IF NOT EXISTS state_statute_chunks_embedding_idx
  ON public.state_statute_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- ─── Public read (no RLS) ──────────────────────────────────────────
-- State statutes are public domain. Anyone authenticated (or anon, via
-- the public legal Q&A on the marketing site if that ever ships) can
-- read. INSERT/UPDATE/DELETE flow through the service role (admin
-- client) from the ingestion script.

ALTER TABLE public.state_statutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.state_statute_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_read ON public.state_statutes;
DROP POLICY IF EXISTS public_read ON public.state_statute_chunks;

CREATE POLICY public_read ON public.state_statutes
  FOR SELECT
  TO authenticated, anon
  USING (true);
CREATE POLICY public_read ON public.state_statute_chunks
  FOR SELECT
  TO authenticated, anon
  USING (true);

-- ─── search_state_statute_chunks RPC ────────────────────────────────
-- Mirror of search_governing_chunks (0005a) but partitioned on state
-- instead of organization. Hybrid: vector cosine when embedding is
-- present, FTS over content otherwise.

CREATE OR REPLACE FUNCTION public.search_state_statute_chunks(
  p_state             text,
  p_query             text DEFAULT NULL,
  p_query_embedding   vector DEFAULT NULL,
  p_limit             int DEFAULT 8
)
RETURNS TABLE (
  id              uuid,
  statute_id      uuid,
  code_citation   text,
  title           text,
  category        text,
  effective_date  date,
  content         text,
  metadata        jsonb,
  rank            real
)
LANGUAGE sql STABLE
AS $$
  SELECT
    c.id,
    c.statute_id,
    s.code_citation,
    s.title,
    s.category,
    s.effective_date,
    c.content,
    c.metadata,
    CASE
      WHEN p_query_embedding IS NOT NULL AND c.embedding IS NOT NULL THEN
        (1 - (c.embedding <=> p_query_embedding))::real
      WHEN p_query IS NOT NULL THEN
        ts_rank(
          to_tsvector('english', c.content),
          plainto_tsquery('english', p_query)
        )
      ELSE 0::real
    END AS rank
  FROM public.state_statute_chunks c
  JOIN public.state_statutes s ON s.id = c.statute_id
  WHERE c.state = p_state
    AND s.superseded_at IS NULL
    AND (
      (p_query_embedding IS NOT NULL AND c.embedding IS NOT NULL)
      OR (
        p_query IS NOT NULL
        AND to_tsvector('english', c.content) @@ plainto_tsquery('english', p_query)
      )
    )
  ORDER BY rank DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.search_state_statute_chunks(text, text, vector, int)
  TO authenticated, service_role, anon;
