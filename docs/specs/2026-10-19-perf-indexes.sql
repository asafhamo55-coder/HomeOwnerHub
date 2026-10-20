-- ════════════════════════════════════════════════════════════════════
-- BL-099 data load speed: PROPOSED indexes (not a migration)
-- 2026-10-19
--
-- This file is a proposal for review. It is NOT in migrations/ and nothing
-- runs it automatically. Each index below serves a hot read on a board or
-- resident page that no existing index in migrations/ covers. The check
-- compared each query's filter and order columns with the leading columns
-- of every CREATE INDEX, PRIMARY KEY and UNIQUE in migrations/. Postgres
-- does not index foreign-key columns automatically.
--
-- How to apply: run each statement on its own, OUTSIDE a transaction.
-- CREATE INDEX CONCURRENTLY cannot run inside BEGIN/COMMIT, and the
-- Supabase SQL editor wraps a multi-statement run in one transaction.
-- So paste and run one statement at a time, or use psql with autocommit.
-- CONCURRENTLY builds without locking out writes. If a build fails it
-- leaves an INVALID index behind. Drop that with
-- DROP INDEX CONCURRENTLY <name> and run the statement again.
--
-- Afterwards: ANALYZE the table, then confirm the planner uses the index
-- with EXPLAIN on the query named in its comment.
-- ════════════════════════════════════════════════════════════════════


-- 1. property_residents by organisation (active residents)
-- Serves:
--   apps/hoa/src/lib/properties/list.ts:151 (properties list, residents column)
--   apps/hoa/src/lib/dashboard/queries.ts:513 (dashboard occupancy)
--   lib/resident.ts:160 (resident fallback lookup, when orgId is known)
-- Filter: organization_id = ? AND deleted_at IS NULL AND moved_out_at IS NULL
-- Order:  id (readAll keyset pages)
-- Every existing property_residents index leads on property_id, so these
-- org-wide reads scan the whole table.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_property_residents_org_active
  ON public.property_residents (organization_id, id)
  WHERE deleted_at IS NULL AND moved_out_at IS NULL;


-- 2. assessments by unit, all statuses (latest charges / ledger)
-- Serves:
--   apps/hoa/src/lib/properties/property-360.ts:244 (property 360 Money, latest charges)
--   apps/hoa/src/lib/resident-ledger.ts:246 (resident dues ledger)
-- Filter: unit_id IN (...) AND deleted_at IS NULL
-- Order:  due_date DESC LIMIT n
-- assessments_unit_open_idx covers only status IN ('open','partial'). No
-- index leads on unit_id for paid, waived or written-off history.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_assessments_unit_due
  ON public.assessments (unit_id, due_date DESC)
  WHERE deleted_at IS NULL;


-- 3. assessments by organisation, unpaid (dashboard KPIs)
-- Serves:
--   apps/hoa/src/lib/dashboard/charts.ts:309 getDashboardKpis (dues outstanding)
-- Filter: organization_id = ? AND deleted_at IS NULL
--         AND status <> 'paid' AND status <> 'waived' AND status <> 'written_off'
-- Order:  id (readAll pages)
-- Every assessments index leads on association_id or unit_id, and the
-- query filters on organization_id. The status filter is three <> tests.
-- The planner cannot prove those imply status IN ('open','partial'), so
-- this index is not partial on status.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_assessments_org_status
  ON public.assessments (organization_id, status)
  WHERE deleted_at IS NULL;


-- 4. payments by unit (recent payments / ledger)
-- Serves:
--   apps/hoa/src/lib/properties/property-360.ts:258 (property 360 Money, recent payments)
--   apps/hoa/src/lib/resident-ledger.ts:261 (resident ledger: unit_id.in.(...) OR assessment_id.in.(...))
-- Filter: unit_id IN (...)
-- Order:  paid_at DESC LIMIT n
-- payments has indexes on assessment_id, invoice_id and
-- (organization_id, paid_at), but none on unit_id. With this index the
-- ledger's OR becomes a BitmapOr of two index scans.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_unit_paid_at
  ON public.payments (unit_id, paid_at DESC)
  WHERE unit_id IS NOT NULL;


-- 5. ownerships history by unit
-- Serves:
--   apps/hoa/src/lib/properties/property-360.ts:384 (property 360 People, ownership history)
-- Filter: unit_id IN (...)
-- Order:  valid_from DESC LIMIT n
-- ownerships_unit_current_idx covers only valid_to IS NULL.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ownerships_unit_valid_from
  ON public.ownerships (unit_id, valid_from DESC);


-- 6. tenancies history by unit
-- Serves:
--   apps/hoa/src/lib/properties/property-360.ts:370 (property 360 Leases)
-- Filter: unit_id IN (...)
-- Order:  lease_start DESC LIMIT n
-- tenancies_unit_current_idx covers only status = 'active'.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tenancies_unit_lease_start
  ON public.tenancies (unit_id, lease_start DESC);


-- 7. payment_plans by unit
-- Serves:
--   apps/hoa/src/lib/properties/property-360.ts:272 (property 360 Money, payment plans)
--   apps/hoa/src/lib/accounting/queries.ts:1180 (plan standings for a set of units)
-- Filter: unit_id IN (...)
-- Order:  created_at DESC LIMIT n
-- payment_plans has no index at all apart from its primary key.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payment_plans_unit_created
  ON public.payment_plans (unit_id, created_at DESC);


-- 8. arc_requests by unit
-- Serves:
--   apps/hoa/src/lib/properties/property-360.ts:315 (property 360 Compliance, ARC requests)
-- Filter: unit_id IN (...) AND deleted_at IS NULL
-- Existing arc_requests indexes lead on organization_id, submitted_by or
-- submitted_at.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_arc_requests_unit_active
  ON public.arc_requests (unit_id)
  WHERE deleted_at IS NULL;


-- 9. audit_log by organisation and action
-- Serves:
--   apps/hoa/src/lib/properties/property-360.ts:196 (property 360 "Updated by owner on ...")
--   apps/hoa/src/lib/collections/letters/load.ts:72 (letter printed stamps)
--   apps/hoa/src/lib/arc-review/precheck-binding.ts:47 (ARC precheck usage row)
-- Filter: org_id = ? AND action = ? [AND metadata->>'propertyId' = ? | entity_id IN (...)]
-- Order:  created_at DESC LIMIT 50
-- idx_audit_log_org (org_id, created_at DESC) has to walk every audit row
-- in the org, and audit_log is the fastest-growing table. With action as
-- the second column the scan reaches only the rows for one action.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_log_org_action_created
  ON public.audit_log (org_id, action, created_at DESC);


-- 10. invoices by organisation and status (dashboard "bills to approve")
-- Serves:
--   apps/hoa/src/lib/dashboard/queries.ts:211 (coded invoices, newest 10)
--   apps/hoa/src/lib/dashboard/queries.ts:644 (count of coded invoices older than cutoff)
-- Filter: organization_id = ? AND status = 'coded' [AND created_at < ?]
-- Order:  created_at DESC LIMIT 10
-- Every invoices index leads on association_id or vendor_id, and these
-- queries filter on organization_id.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_org_status_created
  ON public.invoices (organization_id, status, created_at DESC);


-- 11. journal_entries newest-first per association
-- Serves:
--   apps/hoa/src/lib/accounting/queries.ts:1401 listJournalEntries
--   (accounting overview "recent journal entries", limit 8, and /accounting/ledger)
-- Filter: association_id = ? AND entry_number NOT LIKE 'TEMPLATE%'
--         [AND fiscal_period_id / source / status]
-- Order:  entry_date DESC, entry_number DESC LIMIT n
-- je_status_idx and je_association_period_idx narrow by association but
-- do not give that order, so every overview load sorts all of an
-- association's entries.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_journal_entries_assoc_date
  ON public.journal_entries (association_id, entry_date DESC, entry_number DESC);


-- 12. communications by organisation (monthly report status)
-- Serves:
--   apps/hoa/src/lib/monthly-report/status.ts:43 loadMonthlyReportStatus (/accounting/reports)
-- Filter: organization_id = ? AND related_resource->>'type' = ? AND deleted_at IS NULL
-- Order:  created_at DESC LIMIT 1
-- Both communications indexes lead on association_id, and this query
-- filters on organization_id.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_communications_org_created
  ON public.communications (organization_id, created_at DESC)
  WHERE deleted_at IS NULL;
