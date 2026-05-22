-- seed-state-law-ga-chunks.sql
--
-- Regenerates public.state_statute_chunks for GA from the rows in
-- public.state_statutes. Run this AFTER seed-state-law-ga.sql.
--
-- Strategy:
--   - One chunk per statute. The paraphrased summaries are 100-200
--     words; splitting hurts FTS retrieval and creates noise.
--   - No embeddings. search_state_statute_chunks() has an FTS fallback
--     (to_tsvector / plainto_tsquery) when embedding IS NULL, so W30
--     retrieval keeps working. If we later run the ingester with
--     HUGGINGFACE_API_TOKEN set, it'll wipe + re-insert with embeddings.
--   - Content prefixed with citation + title so FTS picks them up.
--
-- Idempotent: deletes all GA chunks first, then re-inserts. Safe to
-- re-run.

BEGIN;

DELETE FROM public.state_statute_chunks WHERE state = 'GA';

INSERT INTO public.state_statute_chunks
  (statute_id, state, chunk_index, content, embedding, metadata)
SELECT
  s.id,
  'GA',
  0,
  s.code_citation || ' — ' || s.title || E'\n\n' || s.body,
  NULL,
  jsonb_build_object(
    'section',     s.code_citation,
    'category',    s.category,
    'source_url',  s.source_url,
    'fts_only',    true
  )
FROM public.state_statutes s
WHERE s.state = 'GA'
  AND s.superseded_at IS NULL;

COMMIT;

-- Verification queries (run separately, won't roll back the seed):
--   SELECT COUNT(*) AS chunk_count FROM public.state_statute_chunks WHERE state = 'GA';
--   -- Expect: 27
--
--   SELECT code_citation, title, length(content) AS chars
--     FROM public.state_statute_chunks c
--     JOIN public.state_statutes s ON s.id = c.statute_id
--    WHERE c.state = 'GA'
--    ORDER BY code_citation;
