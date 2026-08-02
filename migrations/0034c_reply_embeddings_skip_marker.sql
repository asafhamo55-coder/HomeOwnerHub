-- 0034c_reply_embeddings_skip_marker.sql
-- Phase B review fix (Task 5, Fix 2): short outbound replies (below
-- MIN_BODY_CHARS in packages/jobs/src/mailbox-reply-embeddings.ts) never
-- got a row written. The job's candidate filter is "no row yet in
-- inbox_reply_embeddings for this message_id" (NOT EXISTS, expressed as a
-- left-join filter — PostgREST has no NOT EXISTS). With no row ever
-- written for a skipped message, it permanently re-satisfied that filter
-- and reappeared in every run's LIMIT. There is no ordering/cursor on the
-- candidate query, so a mailbox with enough short outbound replies (e.g.
-- 40+ one-line "Thanks!" messages) would fill every batch forever and the
-- substantive replies behind them would never be embedded — the corpus
-- staying silently empty indefinitely.
--
-- Fix: make "considered" durable, not just "embedded" durable. The job
-- now writes a marker row for a skipped message — same table, embedding
-- NULL, skip_reason explaining why — so the message stops being a
-- candidate. That requires `embedding` to become nullable.
--
-- ⚠️  CONSEQUENCE FOR A LATER TASK: a later task adds a vector-search
-- function over inbox_reply_embeddings for draft grounding. Now that
-- embedding can be NULL, that search function MUST filter
-- `WHERE embedding IS NOT NULL` (or join in a way that has the same
-- effect). Marker rows are real rows in this table — omitting that
-- filter lets NULL-embedding rows pollute similarity search results
-- (undefined/incorrect distance comparisons against NULL) or crash the
-- query, depending on how the vector operator handles NULL operands.
--
-- Idempotent. Safe to re-run.

ALTER TABLE public.inbox_reply_embeddings
  ALTER COLUMN embedding DROP NOT NULL;

-- Why a skipped message is a candidate no longer, spelled out: records
-- the reason a marker row exists with no vector, distinct from a row
-- that failed to embed and should be retried (there is no such state
-- today — an embedding failure throws and fails the whole run, per
-- mailbox-reply-embeddings.ts's Fix 1 restructure, so every marker row
-- here is a deliberate skip, never a retry-pending failure).
ALTER TABLE public.inbox_reply_embeddings
  ADD COLUMN IF NOT EXISTS skip_reason text;

COMMENT ON COLUMN public.inbox_reply_embeddings.embedding IS
  'NULL for a skip-marker row (see skip_reason) — a message the job '
  'considered and deliberately did not embed. Any reader of this table, '
  'in particular a future vector-search function, MUST filter '
  'embedding IS NOT NULL or marker rows will pollute results.';
COMMENT ON COLUMN public.inbox_reply_embeddings.skip_reason IS
  'Set only on a marker row (embedding IS NULL). Why the message was '
  'never embedded, e.g. body_too_short. NULL for a real, embedded row.';

-- Partial index so a future "how many/what did we skip and why" query
-- (support, backfill auditing) does not have to scan embedded rows too.
CREATE INDEX IF NOT EXISTS inbox_reply_embeddings_skip_idx
  ON public.inbox_reply_embeddings(organization_id, skip_reason)
  WHERE embedding IS NULL;

-- The existing ivfflat vector index (0034) is built WITH (embedding
-- vector_cosine_ops) and, like other Postgres index access methods,
-- simply omits rows whose indexed column is NULL — a marker row does
-- not enter the vector index at all. No index change needed here; this
-- comment exists so that isn't re-derived (or doubted) later.
