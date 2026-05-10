-- 0004_v1_schema_phase2a.sql
-- v1 schema, phase 2a: ADDITIVE migration — new tables alongside Phase 1.
--
-- This migration introduces the v1 hierarchy (Organization → Association →
-- Unit → Ownership/Tenancy) and the workflow audit table (ai_runs), but
-- does NOT yet rename `orgs` to `organizations` and does NOT yet move data
-- out of `hoa_properties` / `hoa_violations` / `eviction_cases` /
-- `pm_properties`. Those moves happen in 0005 once the v1 code paths are
-- ready to read from the new tables.
--
-- Why split: keeps Phase 1 deployed apps working unchanged while we build
-- v1 in parallel on the same database. The only Phase 1 code that breaks
-- on this migration is anything that relied on `hoa_properties.id` being a
-- standalone unit identifier — nothing does today.
--
-- Idempotent. Safe to re-run.

-- ─── Extensions ──────────────────────────────────────────────────────

-- Required for W1 (Governing Docs Brain) — semantic search over chunks.
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Phase 2 enums (use TEXT + CHECK to match Phase 1 style) ─────────

-- ─── Organizations now have a top-level type ─────────────────────────
-- Add the type column so a single Organization row can host multiple
-- Associations (CAM use case). Existing orgs default to 'self_managed_hoa'
-- — they map 1:1 to a single Association in 0005.
ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS organization_type text
    NOT NULL DEFAULT 'self_managed_hoa'
    CHECK (organization_type IN ('self_managed_hoa', 'management_company', 'landlord'));

-- ─── associations ────────────────────────────────────────────────────
-- One row per HOA / Condo / Co-op. A management company organization may
-- have many associations; a self-managed organization has exactly one.
CREATE TABLE IF NOT EXISTS public.associations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  state text NOT NULL,                                -- 'GA', 'FL', 'CA', 'TX' for v1
  type text NOT NULL DEFAULT 'hoa'
    CHECK (type IN ('hoa', 'condo', 'coop')),
  total_units integer DEFAULT 0,
  fiscal_year_start date,
  governing_law_state text,                            -- usually = state, sometimes different
  ai_generated boolean DEFAULT false,
  ai_workflow_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS associations_org_idx ON public.associations(organization_id);

-- ─── units (the durable record) ──────────────────────────────────────
-- A unit/lot. Persists when ownership changes. All open service
-- requests, violations, and ARC history attach to the unit, not the
-- owner — fixes the Vantaca complaint (spec §4.1).
CREATE TABLE IF NOT EXISTS public.units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id uuid REFERENCES public.associations(id) ON DELETE CASCADE,
  address_line1 text NOT NULL,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  unit_number text,
  lot_number text,
  square_feet integer,
  bedrooms integer,
  bathrooms numeric(3,1),
  notes text,
  ai_generated boolean DEFAULT false,
  ai_workflow_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS units_org_idx          ON public.units(organization_id);
CREATE INDEX IF NOT EXISTS units_association_idx  ON public.units(association_id);

-- ─── ownerships (historical) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ownerships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  owner_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  owner_name text,                       -- captured even before owner has portal account
  owner_email text,
  owner_phone text,
  ownership_pct numeric(5,2) DEFAULT 100,
  valid_from date NOT NULL,
  valid_to date,                          -- NULL = current owner
  source text,                            -- 'csv_import', 'resale_disclosure', 'manual', 'public_record'
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT ownerships_valid_range CHECK (valid_to IS NULL OR valid_to >= valid_from)
);

CREATE INDEX IF NOT EXISTS ownerships_unit_current_idx
  ON public.ownerships(unit_id) WHERE valid_to IS NULL;
CREATE INDEX IF NOT EXISTS ownerships_owner_idx
  ON public.ownerships(owner_user_id);

-- ─── tenancies (historical) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenancies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  tenant_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  tenant_name text,
  tenant_email text,
  tenant_phone text,
  monthly_rent numeric(10,2),
  deposit numeric(10,2),
  lease_start date NOT NULL,
  lease_end date,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'ended', 'evicted', 'breached')),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT tenancies_valid_range CHECK (lease_end IS NULL OR lease_end >= lease_start)
);

CREATE INDEX IF NOT EXISTS tenancies_unit_current_idx
  ON public.tenancies(unit_id) WHERE status = 'active';

-- ─── governing_documents (W1 RAG source) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.governing_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id uuid REFERENCES public.associations(id) ON DELETE CASCADE,
  type text NOT NULL
    CHECK (type IN ('declaration', 'bylaws', 'rules', 'amendment', 'policy', 'minutes', 'state_statute')),
  title text NOT NULL,
  effective_date date,
  superseded_at date,                    -- when an amendment replaces it
  storage_path text,                      -- Supabase Storage key
  file_size integer,
  parsed_text text,                       -- full extracted text
  parsed_at timestamptz,
  parser_version text,
  ai_generated boolean DEFAULT false,
  ai_workflow_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS governing_documents_org_idx
  ON public.governing_documents(organization_id);
CREATE INDEX IF NOT EXISTS governing_documents_active_idx
  ON public.governing_documents(association_id, type)
  WHERE superseded_at IS NULL;

-- ─── governing_document_chunks (pgvector embeddings for W1) ──────────
-- BGE-M3 produces 1024-dim embeddings; pin the dimension to match.
CREATE TABLE IF NOT EXISTS public.governing_document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.governing_documents(id) ON DELETE CASCADE,
  section text,                            -- e.g. 'Article IV, Section 2'
  page_number integer,
  ordinal integer NOT NULL,                -- 0-based sequence within the document
  text text NOT NULL,
  embedding vector(1024),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- IVFFlat index for cosine similarity search. Created with 100 lists; tune
-- after we have ≥ 10k chunks across all customers. Until then sequential
-- scan is fast enough.
CREATE INDEX IF NOT EXISTS governing_document_chunks_embedding_idx
  ON public.governing_document_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS governing_document_chunks_doc_idx
  ON public.governing_document_chunks(document_id, ordinal);

-- ─── ai_runs (the workflow audit log — competitive moat) ─────────────
-- Every workflow execution writes one row. Powers customer-facing audit,
-- public transparency report, eval replay, debugging.
CREATE TABLE IF NOT EXISTS public.ai_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  workflow_id text NOT NULL,                -- 'W1', 'W3', etc.
  workflow_version text NOT NULL,
  prompt_version text NOT NULL,
  model text NOT NULL,                      -- 'llama-3.3-70b-versatile@groq', 'llama-3.3-70b@runpod'
  input_hash text NOT NULL,                 -- SHA-256 of canonicalized input — dedupe + replay
  input jsonb NOT NULL,
  output jsonb NOT NULL,
  citations jsonb,                          -- which document_chunk ids were used
  reasoning_trace text,                     -- optional, only when captureReasoning=true
  tokens_in integer,
  tokens_out integer,
  latency_ms integer,
  confidence numeric(3,2),                  -- 0..1 if applicable
  error_code text,                          -- non-null when status='failed'
  status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('completed', 'failed', 'pending_human_approval')),
  human_approved boolean,
  human_approver uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  human_feedback text,
  human_edited_output jsonb,                -- what the human actually sent (if they edited)
  approved_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_runs_org_workflow_idx
  ON public.ai_runs(organization_id, workflow_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_runs_pending_approval_idx
  ON public.ai_runs(organization_id, created_at DESC)
  WHERE status = 'pending_human_approval';
CREATE INDEX IF NOT EXISTS ai_runs_input_hash_idx
  ON public.ai_runs(input_hash);

-- ─── ai_feedback (human approve/reject/edit signals) ─────────────────
-- Separate table because feedback may arrive long after the run, and we
-- want a clean audit trail of WHO said WHAT and WHEN.
CREATE TABLE IF NOT EXISTS public.ai_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  ai_run_id uuid NOT NULL REFERENCES public.ai_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  signal text NOT NULL
    CHECK (signal IN ('approve', 'reject', 'edit', 'comment')),
  comment text,
  edited_output jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_feedback_run_idx
  ON public.ai_feedback(ai_run_id, created_at DESC);

-- ─── RLS on all new tables ───────────────────────────────────────────

ALTER TABLE public.associations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ownerships                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenancies                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.governing_documents       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.governing_document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_runs                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_feedback               ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_access ON public.associations;
DROP POLICY IF EXISTS org_access ON public.units;
DROP POLICY IF EXISTS org_access ON public.ownerships;
DROP POLICY IF EXISTS org_access ON public.tenancies;
DROP POLICY IF EXISTS org_access ON public.governing_documents;
DROP POLICY IF EXISTS org_access ON public.governing_document_chunks;
DROP POLICY IF EXISTS org_access ON public.ai_runs;
DROP POLICY IF EXISTS org_access ON public.ai_feedback;

CREATE POLICY org_access ON public.associations              USING (organization_id = ANY (public.auth_org_ids()));
CREATE POLICY org_access ON public.units                     USING (organization_id = ANY (public.auth_org_ids()));
CREATE POLICY org_access ON public.ownerships                USING (organization_id = ANY (public.auth_org_ids()));
CREATE POLICY org_access ON public.tenancies                 USING (organization_id = ANY (public.auth_org_ids()));
CREATE POLICY org_access ON public.governing_documents       USING (organization_id = ANY (public.auth_org_ids()));
CREATE POLICY org_access ON public.governing_document_chunks USING (organization_id = ANY (public.auth_org_ids()));
CREATE POLICY org_access ON public.ai_runs                   USING (organization_id = ANY (public.auth_org_ids()));
CREATE POLICY org_access ON public.ai_feedback               USING (organization_id = ANY (public.auth_org_ids()));

-- ─── set_updated_at triggers on tables that have updated_at ──────────

DROP TRIGGER IF EXISTS trg_associations_updated         ON public.associations;
DROP TRIGGER IF EXISTS trg_units_updated                ON public.units;
DROP TRIGGER IF EXISTS trg_governing_documents_updated  ON public.governing_documents;

CREATE TRIGGER trg_associations_updated
  BEFORE UPDATE ON public.associations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_units_updated
  BEFORE UPDATE ON public.units
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_governing_documents_updated
  BEFORE UPDATE ON public.governing_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Backfill: one association per existing HOA org ──────────────────
-- Run once. Idempotent guard: only inserts if there are zero associations
-- for the org yet.
INSERT INTO public.associations (organization_id, name, state, type)
SELECT
  o.id,
  o.name,
  'GA',                                    -- placeholder; manager edits per association
  CASE
    WHEN o.hub_type = 'hoa' THEN 'hoa'
    ELSE 'hoa'                             -- pm/eviction orgs still get a stub association
  END
FROM public.orgs o
WHERE NOT EXISTS (
  SELECT 1 FROM public.associations a WHERE a.organization_id = o.id
);

-- 0005 will: backfill units from hoa_properties + pm_properties, backfill
-- ownerships from current owner columns, rename `orgs` to `organizations`,
-- update FKs, drop the legacy hub_type columns. Out of scope for 0004.
