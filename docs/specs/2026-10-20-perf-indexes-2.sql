-- ════════════════════════════════════════════════════════════════════
-- BL-099 static pass: PROPOSED indexes, second batch (not a migration)
-- 2026-10-20 — see docs/research/2026-10-20-perf-static-pass.md
--
-- A proposal for review. NOT in migrations/, nothing runs it. None of
-- these duplicates docs/specs/2026-10-19-perf-indexes.sql (still pending)
-- or an index already in migrations/: each query's filter and order were
-- compared with the leading columns of every CREATE INDEX there.
--
-- How to apply: one statement at a time, OUTSIDE a transaction
-- (CREATE INDEX CONCURRENTLY cannot run inside BEGIN/COMMIT, and the
-- Supabase SQL editor wraps a multi-statement run in one). If a build
-- fails it leaves an INVALID index: DROP INDEX CONCURRENTLY <name> and
-- run it again. Afterwards ANALYZE the table and confirm with EXPLAIN on
-- the query named in the comment.
-- ════════════════════════════════════════════════════════════════════


-- 1. hoa_documents by organisation, by name
-- Serves:
--   apps/hoa/src/lib/inbox/queries.ts listAttachableDocuments
--   (/inbox/[id] document picker, every thread open)
--   and the /documents list, which reads the same org's rows.
-- Filter: org_id = ?
-- Order:  name
-- hoa_documents has no index on org_id at all (only storage_path), so
-- every thread page scans the whole table.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hoa_documents_org_name
  ON public.hoa_documents (org_id, name);


-- 2. property_events by organisation, recent first
-- Serves:
--   apps/hoa/src/lib/properties/list-signals.ts readListSignals
--   (/properties, every load: last 365 days of history per home)
-- Filter: organization_id = ? AND occurred_at >= now() - 365 days
-- Order:  id (readAll pages)
-- property_events_org_kind_idx is (organization_id, kind, occurred_at):
-- with no kind in the filter, the occurred_at range cannot use it, so
-- the read walks every event the org ever had.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_property_events_org_occurred
  ON public.property_events (organization_id, occurred_at DESC);


-- 3. inbox_threads filed under a home, by organisation and recency
-- Serves:
--   apps/hoa/src/lib/properties/list-signals.ts readListSignals
--   (/properties, every load: mail per home in the last 365 days)
-- Filter: organization_id = ? AND unit_id IS NOT NULL
--         AND last_message_at >= now() - 365 days
-- Order:  id (readAll pages)
-- The inbox_threads indexes that lead on organization_id put status
-- (queue_idx, visible_idx) or a gmail_state predicate (gmail_filed_idx)
-- second; none serves "every filed thread, any status, since a date".
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inbox_threads_org_filed_recent
  ON public.inbox_threads (organization_id, last_message_at DESC)
  WHERE unit_id IS NOT NULL;
