-- 0010b_search_state_statute_chunks_v2.sql
--
-- Replaces search_state_statute_chunks with a more forgiving FTS path.
--
-- v1 used `plainto_tsquery` which ANDs every lexeme. For natural-
-- language questions like "how much notice is required for an annual
-- meeting", that produced an AND of (notice & required & annual &
-- meet), which excluded § 44-3-227 because its body says "per year"
-- rather than "annual". User-facing legal Q&A needs higher recall —
-- the LLM downstream can filter noise; missing chunks it can't see is
-- the worse failure mode.
--
-- Fix: parse the query with plainto_tsquery (so stopwords and stemming
-- still apply) but rewrite '&' → '|' so all lexemes become alternatives.
-- Ranking via ts_rank still surfaces the densest matches first.
--
-- Vector path (when an embedding is supplied) is unchanged.

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
  WITH q AS (
    SELECT
      CASE
        WHEN p_query IS NOT NULL AND length(trim(p_query)) > 0 THEN
          -- AND-all-lexemes → OR-all-lexemes for higher recall.
          -- If plainto_tsquery returns empty (all stopwords), the cast
          -- yields an empty tsquery which matches nothing — harmless.
          NULLIF(replace(plainto_tsquery('english', p_query)::text, '&', '|'), '')::tsquery
        ELSE NULL
      END AS tsq
  )
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
      WHEN p_query IS NOT NULL AND (SELECT tsq FROM q) IS NOT NULL THEN
        ts_rank(
          to_tsvector('english', c.content),
          (SELECT tsq FROM q)
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
        AND (SELECT tsq FROM q) IS NOT NULL
        AND to_tsvector('english', c.content) @@ (SELECT tsq FROM q)
      )
    )
  ORDER BY rank DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.search_state_statute_chunks(text, text, vector, int)
  TO authenticated, service_role, anon;
