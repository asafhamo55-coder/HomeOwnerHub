-- 0005a_search_rpc.sql
-- W1 retrieval RPC. Routes a single query to either pgvector cosine
-- similarity (when an embedding is provided) or Postgres FTS over the
-- chunk text (when only a text query is given). One round-trip from app
-- code, ranking pushed into Postgres so the planner can use indexes.
--
-- ADR-003 captures the bridge story: BGE-M3 embeddings via HuggingFace
-- in Phase 2.0, swap to self-hosted in Phase 2.1 — same query path.
--
-- Idempotent. Safe to re-run.

CREATE OR REPLACE FUNCTION public.search_governing_chunks(
  p_organization_id uuid,
  p_association_id uuid DEFAULT NULL,
  p_query text DEFAULT NULL,
  p_query_embedding vector DEFAULT NULL,
  p_limit int DEFAULT 8
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  section text,
  page_number int,
  text text,
  metadata jsonb,
  doc_type text,
  effective_date date,
  rank real
)
LANGUAGE sql STABLE
AS $$
  SELECT
    c.id,
    c.document_id,
    c.section,
    c.page_number,
    c.text,
    c.metadata,
    d.type AS doc_type,
    d.effective_date,
    CASE
      WHEN p_query_embedding IS NOT NULL AND c.embedding IS NOT NULL THEN
        (1 - (c.embedding <=> p_query_embedding))::real
      WHEN p_query IS NOT NULL THEN
        ts_rank(
          to_tsvector('english', c.text),
          plainto_tsquery('english', p_query)
        )
      ELSE 0::real
    END AS rank
  FROM public.governing_document_chunks c
  JOIN public.governing_documents d ON d.id = c.document_id
  WHERE c.organization_id = p_organization_id
    AND (p_association_id IS NULL OR d.association_id = p_association_id)
    AND d.superseded_at IS NULL
    AND (
      (p_query_embedding IS NOT NULL AND c.embedding IS NOT NULL)
      OR (
        p_query IS NOT NULL
        AND to_tsvector('english', c.text) @@ plainto_tsquery('english', p_query)
      )
    )
  ORDER BY rank DESC
  LIMIT p_limit;
$$;

-- Allow authenticated users + service role to call. RLS still applies to
-- the underlying tables on read (function is SECURITY INVOKER by default).
GRANT EXECUTE ON FUNCTION public.search_governing_chunks(uuid, uuid, text, vector, int)
  TO authenticated, service_role;
