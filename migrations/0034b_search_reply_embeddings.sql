-- Vector search over the HOA's past replies. A SQL function rather than a
-- PostgREST filter because pgvector's <=> operator is not expressible
-- through PostgREST's query grammar.
--
-- SECURITY INVOKER (the default) so the caller's RLS still applies: a board
-- member of org A must never retrieve org B's replies as a "similar" example.
-- p_org_id is additionally passed and filtered, because the jobs layer calls
-- with the service-role client where RLS does not apply.
CREATE OR REPLACE FUNCTION public.search_reply_embeddings(
  p_org_id            uuid,
  p_query_embedding   vector(768),
  p_exclude_thread_id uuid,
  p_limit             int DEFAULT 5
)
RETURNS TABLE (
  message_id uuid,
  thread_id  uuid,
  body       text,
  subject    text,
  sent_at    timestamptz,
  similarity double precision
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.id,
    m.thread_id,
    COALESCE(m.stripped_text, m.body_text),
    t.subject,
    m.sent_at,
    1 - (e.embedding <=> p_query_embedding) AS similarity
  FROM public.inbox_reply_embeddings e
  JOIN public.inbox_messages m ON m.id = e.message_id
  JOIN public.inbox_threads  t ON t.id = m.thread_id
  WHERE e.organization_id = p_org_id
    -- Marker rows (NULL embedding) record "considered, deliberately not
    -- embedded" for replies too short to teach anything about voice. They
    -- exist so a skipped message stops re-qualifying as a candidate every
    -- run; see 0034c. They must never be returned as a similar reply, and
    -- `<=>` against NULL would sort them unpredictably rather than exclude
    -- them, so the filter is explicit.
    AND e.embedding IS NOT NULL
    AND m.thread_id IS DISTINCT FROM p_exclude_thread_id
  ORDER BY e.embedding <=> p_query_embedding
  LIMIT LEAST(GREATEST(p_limit, 1), 20);
$$;
