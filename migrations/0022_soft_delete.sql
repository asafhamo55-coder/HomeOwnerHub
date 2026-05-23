-- 0022_soft_delete.sql
-- Add deleted_at column to all entity tables for soft-delete support.
-- Rows with deleted_at IS NOT NULL are retained in the database but
-- hidden from all application queries.

-- ─── hoa_violations ─────────────────────────────────────────────────
ALTER TABLE hoa_violations
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_hoa_violations_active
  ON hoa_violations (org_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- ─── hoa_meeting_minutes ────────────────────────────────────────────
ALTER TABLE hoa_meeting_minutes
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_hoa_meeting_minutes_active
  ON hoa_meeting_minutes (org_id, meeting_date DESC)
  WHERE deleted_at IS NULL;

-- ─── vendors ────────────────────────────────────────────────────────
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_vendors_active
  ON vendors (organization_id, legal_name)
  WHERE deleted_at IS NULL;

-- ─── invoices ───────────────────────────────────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_invoices_active
  ON invoices (association_id, invoice_date DESC)
  WHERE deleted_at IS NULL;

-- ─── communications ─────────────────────────────────────────────────
ALTER TABLE communications
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_communications_active
  ON communications (association_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- ─── hoa_properties ─────────────────────────────────────────────────
ALTER TABLE hoa_properties
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_hoa_properties_active
  ON hoa_properties (org_id, address)
  WHERE deleted_at IS NULL;

-- ─── property_residents ─────────────────────────────────────────────
ALTER TABLE property_residents
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_property_residents_active
  ON property_residents (property_id)
  WHERE deleted_at IS NULL;

-- ─── budgets ────────────────────────────────────────────────────────
ALTER TABLE budgets
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_budgets_active
  ON budgets (association_id)
  WHERE deleted_at IS NULL;

-- ─── arc_requests ───────────────────────────────────────────────────
ALTER TABLE arc_requests
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_arc_requests_active
  ON arc_requests (submitted_at DESC)
  WHERE deleted_at IS NULL;

-- ─── assessments ────────────────────────────────────────────────────
ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_assessments_active
  ON assessments (association_id, due_date DESC)
  WHERE deleted_at IS NULL;

-- ─── state_law_updates (already has archived_at; add deleted_at) ────
ALTER TABLE state_law_updates
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_state_law_updates_active
  ON state_law_updates (state, posted_at DESC)
  WHERE deleted_at IS NULL;
