-- 0023_fix_section_sign_encoding.sql
-- Replace the § (section sign) character with the word "Section" in
-- state_statutes citations and body text. The § character renders
-- incorrectly in some browsers/fonts.
--
-- Idempotent. Safe to re-run.

-- ─── 1. Update code_citation ────────────────────────────────────────
UPDATE public.state_statutes
SET code_citation = REPLACE(code_citation, '§', 'Section')
WHERE code_citation LIKE '%§%';

-- ─── 2. Update body text ────────────────────────────────────────────
UPDATE public.state_statutes
SET body = REPLACE(body, '§', 'Section')
WHERE body LIKE '%§%';

-- ─── 3. Rebuild chunks for all affected states ─────────────────────
-- Chunks concatenate citation + body, so they must be rebuilt.
DELETE FROM public.state_statute_chunks
WHERE statute_id IN (
  SELECT id FROM public.state_statutes WHERE superseded_at IS NULL
);

INSERT INTO public.state_statute_chunks
  (statute_id, state, chunk_index, content, metadata)
SELECT
  s.id,
  s.state,
  0,
  s.code_citation || ' — ' || s.title || E'\n\n' || s.body,
  jsonb_build_object('category', s.category, 'source_url', s.source_url)
FROM public.state_statutes s
WHERE s.superseded_at IS NULL;

-- ─── 4. Confirm ────────────────────────────────────────────────────
SELECT
  COUNT(*) FILTER (WHERE code_citation LIKE '%§%') AS remaining_section_signs,
  COUNT(*) AS total_statutes
FROM public.state_statutes
WHERE superseded_at IS NULL;
