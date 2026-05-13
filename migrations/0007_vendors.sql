-- 0007_vendors.sql
-- v1.1 Module 7 — Vendor Management. Spec §14.
--
-- Scope: per-organization vendor master, COI/W-9/license compliance, sealed
-- RFP/bid mechanics, internal-only ratings.
--
-- Antitrust posture (spec §14.6 — read this if you're tempted to denormalize):
--   • vendor_internal_ratings is STRICTLY per-organization. Never aggregated
--     across organizations.
--   • bid_comparisons and bids.total_amount are NEVER exposed outside the
--     originating organization.
--   • vendor_external_data exists in this migration but is unused in v1; it
--     reserves the shape for v1.5 public-data enrichment (Google Places /
--     Foursquare / state license APIs).
--
-- Idempotent. Safe to re-run.

-- ─── vendors (per-organization master) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.vendors (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  legal_name        text NOT NULL,
  dba               text,
  ein               text,                                -- masked except last 4 in UI; stored as-entered
  primary_email     text,
  primary_phone     text,
  address           jsonb,                               -- { line1, line2, city, state, postal_code }
  service_area_zips text[],
  trades            text[],                              -- 'landscaping', 'plumbing', etc.
  status            text NOT NULL DEFAULT 'prospect'
    CHECK (status IN ('prospect', 'active', 'inactive', 'blacklisted')),
  notes             text,
  ai_generated      boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS vendors_org_idx
  ON public.vendors(organization_id);
CREATE INDEX IF NOT EXISTS vendors_status_idx
  ON public.vendors(organization_id, status);

-- ─── vendor_compliance (W21 outputs land here) ──────────────────────
-- One row per (vendor, association). A vendor may be compliant for one
-- association's standards and not another (different insurance minima).
CREATE TABLE IF NOT EXISTS public.vendor_compliance (
  id                                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id                             uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  vendor_id                                   uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  association_id                              uuid REFERENCES public.associations(id) ON DELETE SET NULL,
  coi_status                                  text
    CHECK (coi_status IN ('green', 'yellow', 'red', 'missing')),
  coi_carrier                                 text,
  coi_policy_number                           text,
  coi_effective_date                          date,
  coi_expiration_date                         date,
  coi_general_liability_per_occurrence        numeric(14,2),
  coi_general_liability_aggregate             numeric(14,2),
  coi_workers_comp                            boolean,
  coi_auto_liability                          numeric(14,2),
  coi_umbrella                                numeric(14,2),
  coi_additional_insured_present              boolean,
  w9_on_file                                  boolean NOT NULL DEFAULT false,
  w9_signed_date                              date,
  license_number                              text,
  license_state                               text,
  license_trade                               text,
  license_expiration                          date,
  license_status                              text,
  deficiencies                                jsonb,     -- W21-shaped: [{ code, severity, detail }]
  last_reviewed_at                            timestamptz,
  last_reviewed_by                            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ai_workflow_id                              text,      -- ai_runs.id for the W21 run that wrote this
  UNIQUE (vendor_id, association_id)
);

CREATE INDEX IF NOT EXISTS vendor_compliance_status_idx
  ON public.vendor_compliance(association_id, coi_status);
CREATE INDEX IF NOT EXISTS vendor_compliance_expiring_idx
  ON public.vendor_compliance(coi_expiration_date)
  WHERE coi_expiration_date IS NOT NULL;

-- ─── vendor_documents (the raw uploads) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.vendor_documents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  vendor_id        uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  doc_type         text NOT NULL
    CHECK (doc_type IN ('coi', 'w9', 'license', 'contract', 'other')),
  storage_path     text NOT NULL,
  uploaded_at      timestamptz NOT NULL DEFAULT now(),
  uploaded_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  expires_at       date
);

CREATE INDEX IF NOT EXISTS vendor_documents_vendor_idx
  ON public.vendor_documents(vendor_id);

-- ─── rfps (board describes need; W22 drafts; board approves) ────────
CREATE TABLE IF NOT EXISTS public.rfps (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id           uuid NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  rfp_number               text NOT NULL,
  title                    text NOT NULL,
  scope                    text NOT NULL,
  budget_min               numeric(14,2),
  budget_max               numeric(14,2),
  evaluation_criteria      jsonb,
  insurance_requirements   jsonb,                       -- pulled from association compliance settings
  submission_deadline      timestamptz NOT NULL,
  status                   text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'open', 'evaluation', 'awarded', 'cancelled')),
  awarded_to_vendor_id     uuid REFERENCES public.vendors(id),
  awarded_at               timestamptz,
  ai_generated             boolean NOT NULL DEFAULT false,
  ai_workflow_id           text,                        -- W22 ai_runs.id
  created_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (association_id, rfp_number)
);

CREATE INDEX IF NOT EXISTS rfps_association_status_idx
  ON public.rfps(association_id, status);
CREATE INDEX IF NOT EXISTS rfps_open_idx
  ON public.rfps(association_id, submission_deadline)
  WHERE status IN ('open', 'evaluation');

CREATE TABLE IF NOT EXISTS public.rfp_line_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rfp_id       uuid NOT NULL REFERENCES public.rfps(id) ON DELETE CASCADE,
  description  text NOT NULL,
  quantity     numeric,
  unit         text,
  notes        text
);

CREATE INDEX IF NOT EXISTS rfp_line_items_rfp_idx
  ON public.rfp_line_items(rfp_id);

-- ─── rfp_invitations (tokenized submission link per vendor) ─────────
-- Vendors do not need accounts in v1. They submit via a one-time tokenized
-- link. (Spec §18 open question #4: persistent vendor accounts may land in
-- v1.5.)
CREATE TABLE IF NOT EXISTS public.rfp_invitations (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  rfp_id                   uuid NOT NULL REFERENCES public.rfps(id) ON DELETE CASCADE,
  vendor_id                uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  invited_at               timestamptz NOT NULL DEFAULT now(),
  acknowledged_at          timestamptz,
  unique_submission_token  text UNIQUE,
  UNIQUE (rfp_id, vendor_id)
);

CREATE INDEX IF NOT EXISTS rfp_invitations_token_idx
  ON public.rfp_invitations(unique_submission_token)
  WHERE unique_submission_token IS NOT NULL;

-- ─── bids (sealed until award) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bids (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  rfp_id                   uuid NOT NULL REFERENCES public.rfps(id) ON DELETE CASCADE,
  vendor_id                uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  total_amount             numeric(14,2) NOT NULL CHECK (total_amount > 0),
  payment_terms            text,
  warranty                 text,
  start_date               date,
  completion_date          date,
  raw_document_path        text,
  parsed_at                timestamptz,
  parsed_by_workflow_id    text,                        -- W23 extraction run id
  status                   text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'withdrawn', 'declined', 'awarded')),
  submitted_at             timestamptz,
  UNIQUE (rfp_id, vendor_id)
);

CREATE INDEX IF NOT EXISTS bids_rfp_idx
  ON public.bids(rfp_id);

CREATE TABLE IF NOT EXISTS public.bid_line_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_id             uuid NOT NULL REFERENCES public.bids(id) ON DELETE CASCADE,
  rfp_line_item_id   uuid REFERENCES public.rfp_line_items(id) ON DELETE SET NULL,
  description        text NOT NULL,
  quantity           numeric,
  unit_price         numeric(14,2),
  line_total         numeric(14,2),
  is_excluded        boolean NOT NULL DEFAULT false,
  is_addition        boolean NOT NULL DEFAULT false,
  notes              text
);

CREATE INDEX IF NOT EXISTS bid_line_items_bid_idx
  ON public.bid_line_items(bid_id);

-- ─── bid_comparisons (W23 outputs land here) ────────────────────────
CREATE TABLE IF NOT EXISTS public.bid_comparisons (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  rfp_id                uuid NOT NULL REFERENCES public.rfps(id) ON DELETE CASCADE,
  comparison_table      jsonb NOT NULL,                 -- normalized line items × bids matrix
  flagged_exclusions    jsonb,                          -- [{ bid_id, line, detail }]
  flagged_additions     jsonb,
  payment_term_diffs    jsonb,
  warranty_diffs        jsonb,
  recommendation_memo   text,                           -- LLM-written; board reviews
  ai_workflow_id        text,                           -- W23 comparison run id
  generated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rfp_id, ai_workflow_id)
);

-- ─── vendor_internal_ratings (per-org, never shared) ────────────────
-- Antitrust: this table is strictly per-organization. There is no public
-- view, no cross-tenant aggregation, no "average rating" query. v1.5
-- vendor intelligence will pull from EXTERNAL public sources only.
-- The work_order_id reference is nullable + no FK in v1 because the
-- work_orders table itself ships in a later migration (spec §4.3 group C).
CREATE TABLE IF NOT EXISTS public.vendor_internal_ratings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  vendor_id       uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  association_id  uuid NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  work_order_id   uuid,                                  -- FK added when work_orders table ships
  rating          smallint CHECK (rating BETWEEN 1 AND 5),
  on_time         boolean,
  on_budget       boolean,
  quality         smallint CHECK (quality BETWEEN 1 AND 5),
  notes           text,
  rated_at        timestamptz NOT NULL DEFAULT now(),
  rated_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS vendor_internal_ratings_vendor_idx
  ON public.vendor_internal_ratings(organization_id, vendor_id);

-- ─── vendor_external_data (UNUSED IN v1; reserved for v1.5) ─────────
-- See ADR-004 substitutions: Google Places enrichment is paid and deferred.
-- This table reserves the shape so v1.5 can land enrichment without a
-- schema migration on production tables that already hold customer data.
CREATE TABLE IF NOT EXISTS public.vendor_external_data (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id      uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  source         text NOT NULL
    CHECK (source IN ('google_places', 'foursquare', 'state_license', 'manual')),
  source_ref     text,
  rating         numeric(3,2),
  review_count   integer,
  raw_payload    jsonb,
  fetched_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendor_external_data_vendor_idx
  ON public.vendor_external_data(vendor_id);

-- ─── Wire invoices.vendor_id (deferred from 0006) ───────────────────
ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_vendor_id_fkey;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_vendor_id_fkey
  FOREIGN KEY (vendor_id) REFERENCES public.vendors(id) ON DELETE SET NULL;

-- ─── RLS on every vendor table ──────────────────────────────────────

ALTER TABLE public.vendors                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_compliance        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_documents         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfps                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfp_line_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfp_invitations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bids                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bid_line_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bid_comparisons          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_internal_ratings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_external_data     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_access ON public.vendors;
DROP POLICY IF EXISTS org_access ON public.vendor_compliance;
DROP POLICY IF EXISTS org_access ON public.vendor_documents;
DROP POLICY IF EXISTS org_access ON public.rfps;
DROP POLICY IF EXISTS org_access ON public.rfp_line_items;
DROP POLICY IF EXISTS org_access ON public.rfp_invitations;
DROP POLICY IF EXISTS org_access ON public.bids;
DROP POLICY IF EXISTS org_access ON public.bid_line_items;
DROP POLICY IF EXISTS org_access ON public.bid_comparisons;
DROP POLICY IF EXISTS org_access ON public.vendor_internal_ratings;
DROP POLICY IF EXISTS org_access ON public.vendor_external_data;

CREATE POLICY org_access ON public.vendors             USING (organization_id = ANY (public.auth_org_ids()));
CREATE POLICY org_access ON public.vendor_compliance   USING (organization_id = ANY (public.auth_org_ids()));
CREATE POLICY org_access ON public.vendor_documents    USING (organization_id = ANY (public.auth_org_ids()));
CREATE POLICY org_access ON public.rfps                USING (organization_id = ANY (public.auth_org_ids()));
-- rfp_line_items inherits via rfp.
CREATE POLICY org_access ON public.rfp_line_items
  USING (EXISTS (
    SELECT 1 FROM public.rfps r
     WHERE r.id = rfp_line_items.rfp_id
       AND r.organization_id = ANY (public.auth_org_ids())
  ));
CREATE POLICY org_access ON public.rfp_invitations     USING (organization_id = ANY (public.auth_org_ids()));
-- Sealed-bid mechanics: bids are visible inside the originating org, BUT
-- vendors submitting via a tokenized link don't authenticate as members of
-- the org. Token-scoped access is enforced at the API layer; RLS keeps
-- in-org row visibility honest.
CREATE POLICY org_access ON public.bids                USING (organization_id = ANY (public.auth_org_ids()));
CREATE POLICY org_access ON public.bid_line_items
  USING (EXISTS (
    SELECT 1 FROM public.bids b
     WHERE b.id = bid_line_items.bid_id
       AND b.organization_id = ANY (public.auth_org_ids())
  ));
CREATE POLICY org_access ON public.bid_comparisons         USING (organization_id = ANY (public.auth_org_ids()));
CREATE POLICY org_access ON public.vendor_internal_ratings USING (organization_id = ANY (public.auth_org_ids()));
-- vendor_external_data inherits via vendor (no organization_id column —
-- enrichment is per-vendor, vendor is per-org).
CREATE POLICY org_access ON public.vendor_external_data
  USING (EXISTS (
    SELECT 1 FROM public.vendors v
     WHERE v.id = vendor_external_data.vendor_id
       AND v.organization_id = ANY (public.auth_org_ids())
  ));
