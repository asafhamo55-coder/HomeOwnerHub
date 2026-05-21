-- 0021_search_rpc_loosen.sql
-- Make W1 governing-docs retrieval find chunks even when the question
-- doesn't share every keyword with the chunk text.
--
-- Diagnosis (2026-05-21): all 583 production chunks have NULL embeddings,
-- so retrieval falls back entirely to Postgres FTS. The previous RPC
-- (0005a) used `plainto_tsquery`, which AND-joins every content word.
-- Questions like "Is my dog allowed?" build the tsquery `dog & allowed`
-- and miss every chunk that doesn't contain BOTH words — even when the
-- answer lives in a chunk that only says "pets are permitted with
-- written approval". Result: the model answers "the documents don't
-- include data that is relevant" on questions it could answer.
--
-- This migration replaces the RPC with a three-tier scorer:
--   1. Vector match (cosine sim) — same as before, fires when embeddings
--      eventually get backfilled.
--   2. Strict FTS — plainto_tsquery, same as before. Boosted by +0.5 so
--      strict matches always outrank loose ones at the same rank.
--   3. Loose FTS — OR-of-lexemes, built from to_tsvector so the lexemes
--      are already stemmed and stopword-filtered. Catches the common
--      paraphrase case.
--
-- A chunk is returned if ANY of the three conditions matches.
--
-- Idempotent (CREATE OR REPLACE).

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
  WITH q AS (
    SELECT
      p_query_embedding                                    AS emb,
      CASE WHEN p_query IS NULL THEN NULL
           ELSE plainto_tsquery('english', p_query)
      END                                                  AS strict_q,
      -- Loose query: OR every lexeme to_tsvector produced. Lexemes are
      -- already stemmed and stopword-filtered, so they're safe to feed
      -- back into to_tsquery without escaping. Empty array_to_string
      -- produces '', and to_tsquery('') is the empty tsquery that never
      -- matches — fine.
      CASE WHEN p_query IS NULL THEN NULL
           ELSE to_tsquery(
             'english',
             array_to_string(
               tsvector_to_array(to_tsvector('english', p_query)),
               ' | '
             )
           )
      END                                                  AS loose_q
  )
  SELECT
    c.id,
    c.document_id,
    c.section,
    c.page_number,
    c.text,
    c.metadata,
    d.type           AS doc_type,
    d.effective_date,
    CASE
      -- Tier 1: semantic match via embeddings (when present)
      WHEN q.emb IS NOT NULL AND c.embedding IS NOT NULL THEN
        (1 - (c.embedding <=> q.emb))::real
      -- Tier 2: strict FTS (all content words present) — boost so strict
      -- matches always rank above loose ones at otherwise-equal rank.
      WHEN q.strict_q IS NOT NULL
        AND to_tsvector('english', c.text) @@ q.strict_q THEN
        (ts_rank(to_tsvector('english', c.text), q.strict_q) + 0.5)::real
      -- Tier 3: loose FTS (any content word present)
      WHEN q.loose_q IS NOT NULL
        AND to_tsvector('english', c.text) @@ q.loose_q THEN
        ts_rank(to_tsvector('english', c.text), q.loose_q)::real
      ELSE 0::real
    END                AS rank
  FROM public.governing_document_chunks c
  JOIN public.governing_documents     d ON d.id = c.document_id
  CROSS JOIN q
  WHERE c.organization_id = p_organization_id
    AND (p_association_id IS NULL OR d.association_id = p_association_id)
    AND d.superseded_at IS NULL
    AND (
      (q.emb IS NOT NULL AND c.embedding IS NOT NULL)
      OR (q.strict_q IS NOT NULL AND to_tsvector('english', c.text) @@ q.strict_q)
      OR (q.loose_q  IS NOT NULL AND to_tsvector('english', c.text) @@ q.loose_q)
    )
  ORDER BY rank DESC
  LIMIT p_limit;
$$;

-- Re-grant to be explicit even though CREATE OR REPLACE keeps existing
-- ACLs — defensive against an admin having recreated the function.
GRANT EXECUTE ON FUNCTION public.search_governing_chunks(uuid, uuid, text, vector, int)
  TO authenticated, service_role;
