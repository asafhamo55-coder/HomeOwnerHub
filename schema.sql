-- ============================================================
-- HomeownerHub — Full Database Schema
-- Run this in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/xwdjsxfskvreguyvryhc/sql
-- ============================================================

-- ─────────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────
-- CORE: Organizations and users
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orgs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  hub_type            TEXT NOT NULL CHECK (hub_type IN ('hoa','pm','eviction')),
  plan                TEXT NOT NULL DEFAULT 'free'
                        CHECK (plan IN ('free','starter','standard','pro','enterprise','per_case','unlimited')),
  stripe_customer_id  TEXT,
  stripe_sub_id       TEXT,
  doors_count         INTEGER DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  email       TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- One user can belong to many orgs with different roles
CREATE TABLE IF NOT EXISTS org_members (
  org_id      UUID REFERENCES orgs(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('owner','admin','member','viewer')),
  invited_at  TIMESTAMPTZ DEFAULT now(),
  joined_at   TIMESTAMPTZ,
  PRIMARY KEY (org_id, user_id)
);

-- ─────────────────────────────────────────────
-- HOA HUB
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hoa_properties (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  address       TEXT NOT NULL,
  unit_number   TEXT,
  owner_name    TEXT,
  owner_email   TEXT,
  owner_phone   TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hoa_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('ccr','bylaws','rules','minutes','other')),
  storage_path  TEXT NOT NULL,
  file_size     INTEGER,
  parsed_text   TEXT,
  parsed_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hoa_violations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  property_id     UUID REFERENCES hoa_properties(id) ON DELETE SET NULL,
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  violation_type  TEXT NOT NULL,
  description     TEXT NOT NULL,
  ccr_section     TEXT,
  severity        TEXT CHECK (severity IN ('low','medium','high')),
  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','notice_drafted','notice_sent','resolved','waived')),
  ai_draft_letter TEXT,
  approved_letter TEXT,
  approved_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at     TIMESTAMPTZ,
  notice_sent_at  TIMESTAMPTZ,
  photo_urls      TEXT[] DEFAULT '{}',
  cure_period_days INTEGER DEFAULT 14,
  fine_amount     NUMERIC(10,2) DEFAULT 25.00,
  fine_start_date DATE,
  resolved_at     TIMESTAMPTZ,
  resolution_note TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hoa_meeting_minutes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  meeting_date  DATE NOT NULL,
  meeting_type  TEXT DEFAULT 'regular' CHECK (meeting_type IN ('regular','special','annual','emergency')),
  attendees     TEXT[] DEFAULT '{}',
  raw_transcript TEXT,
  ai_summary    TEXT,
  action_items  JSONB DEFAULT '[]',
  motions       JSONB DEFAULT '[]',
  status        TEXT DEFAULT 'draft' CHECK (status IN ('draft','approved')),
  approved_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hoa_dues (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  property_id   UUID REFERENCES hoa_properties(id) ON DELETE CASCADE,
  period        TEXT NOT NULL,  -- e.g. '2026-05' for monthly
  amount_due    NUMERIC(10,2) NOT NULL,
  amount_paid   NUMERIC(10,2) DEFAULT 0,
  due_date      DATE NOT NULL,
  paid_date     DATE,
  status        TEXT DEFAULT 'pending'
                  CHECK (status IN ('pending','paid','partial','late','waived')),
  late_fee      NUMERIC(10,2) DEFAULT 0,
  stripe_payment_id TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- AI-generated daily digest cache (refreshed by Inngest at 7am)
CREATE TABLE IF NOT EXISTS hoa_digests (
  org_id      UUID PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────
-- EVICTION HUB
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS eviction_cases (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  property_address      TEXT NOT NULL,
  county                TEXT NOT NULL CHECK (county IN ('harris_tx','san_bernardino_ca','king_wa')),
  state                 TEXT NOT NULL,
  tenant_name           TEXT,
  tenant_email          TEXT,
  monthly_rent          NUMERIC(10,2),
  days_unpaid           INTEGER,
  balance_owed          NUMERIC(10,2),
  notice_type           TEXT CHECK (notice_type IN ('3day_pay_or_quit','30day_vacate','just_cause')),
  notice_draft          TEXT,
  notice_approved       BOOLEAN DEFAULT FALSE,
  notice_approved_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notice_approved_at    TIMESTAMPTZ,
  notice_sent_at        TIMESTAMPTZ,
  notice_served_method  TEXT CHECK (notice_served_method IN ('personal','posting','certified_mail')),
  filing_eligible_date  DATE,
  status                TEXT DEFAULT 'intake'
                          CHECK (status IN ('intake','notice_drafted','notice_sent','filing_ready','filed','resolved','dismissed')),
  compliance_flags      JSONB DEFAULT '{}',
  court_case_number     TEXT,
  hearing_date          DATE,
  outcome               TEXT,
  stripe_payment_id     TEXT,
  case_notes            TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────
-- PM HUB (Phase 1 Alpha — minimal)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pm_properties (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  address       TEXT NOT NULL,
  unit_type     TEXT DEFAULT 'residential' CHECK (unit_type IN ('residential','commercial')),
  bedrooms      INTEGER,
  bathrooms     NUMERIC(3,1),
  sq_ft         INTEGER,
  monthly_rent  NUMERIC(10,2),
  deposit       NUMERIC(10,2),
  tenant_name   TEXT,
  tenant_email  TEXT,
  tenant_phone  TEXT,
  lease_start   DATE,
  lease_end     DATE,
  status        TEXT DEFAULT 'occupied' CHECK (status IN ('vacant','occupied','maintenance')),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pm_rent_ledger (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     UUID NOT NULL REFERENCES pm_properties(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  period          TEXT NOT NULL,  -- e.g. '2026-05'
  amount_due      NUMERIC(10,2) NOT NULL,
  amount_paid     NUMERIC(10,2) DEFAULT 0,
  due_date        DATE NOT NULL,
  paid_date       DATE,
  status          TEXT DEFAULT 'pending'
                    CHECK (status IN ('pending','paid','partial','late')),
  late_fee        NUMERIC(10,2) DEFAULT 0,
  late_fee_rate   NUMERIC(5,4) DEFAULT 0.05,  -- 5% default
  stripe_payment_id TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────
-- AUDIT LOG (all three hubs)
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID REFERENCES orgs(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,     -- e.g. 'violation.letter.approved', 'eviction.notice.sent'
  entity_type TEXT,              -- 'violation', 'eviction_case', 'dues', etc.
  entity_id   UUID,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ─────────────────────────────────────────────
-- HELPER FUNCTION (used by RLS policies)
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION auth_org_ids()
RETURNS UUID[] LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    ARRAY(SELECT org_id FROM org_members WHERE user_id = auth.uid()),
    '{}'::UUID[]
  )
$$;

-- ─────────────────────────────────────────────
-- ROW-LEVEL SECURITY
-- ─────────────────────────────────────────────

ALTER TABLE orgs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE hoa_properties     ENABLE ROW LEVEL SECURITY;
ALTER TABLE hoa_documents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE hoa_violations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE hoa_meeting_minutes ENABLE ROW LEVEL SECURITY;
ALTER TABLE hoa_dues           ENABLE ROW LEVEL SECURITY;
ALTER TABLE hoa_digests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE eviction_cases     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_properties      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_rent_ledger     ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log          ENABLE ROW LEVEL SECURITY;

-- Profiles: users see/update only their own profile
CREATE POLICY "own_profile" ON profiles
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Orgs: members can view their orgs
CREATE POLICY "org_member_view" ON orgs
  USING (id = ANY(auth_org_ids()));

-- Org members: see members of your orgs
CREATE POLICY "org_member_access" ON org_members
  USING (org_id = ANY(auth_org_ids()));

-- HOA tables
CREATE POLICY "org_access" ON hoa_properties     USING (org_id = ANY(auth_org_ids()));
CREATE POLICY "org_access" ON hoa_documents      USING (org_id = ANY(auth_org_ids()));
CREATE POLICY "org_access" ON hoa_violations     USING (org_id = ANY(auth_org_ids()));
CREATE POLICY "org_access" ON hoa_meeting_minutes USING (org_id = ANY(auth_org_ids()));
CREATE POLICY "org_access" ON hoa_dues           USING (org_id = ANY(auth_org_ids()));
CREATE POLICY "org_access" ON hoa_digests        USING (org_id = ANY(auth_org_ids()));

-- Eviction
CREATE POLICY "org_access" ON eviction_cases     USING (org_id = ANY(auth_org_ids()));

-- PM
CREATE POLICY "org_access" ON pm_properties      USING (org_id = ANY(auth_org_ids()));
CREATE POLICY "org_access" ON pm_rent_ledger     USING (org_id = ANY(auth_org_ids()));

-- Audit log
CREATE POLICY "org_access" ON audit_log          USING (org_id = ANY(auth_org_ids()));

-- ─────────────────────────────────────────────
-- INDEXES (for common query patterns)
-- ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_hoa_violations_org_status ON hoa_violations(org_id, status);
CREATE INDEX IF NOT EXISTS idx_hoa_violations_property ON hoa_violations(property_id);
CREATE INDEX IF NOT EXISTS idx_hoa_dues_org_status ON hoa_dues(org_id, status);
CREATE INDEX IF NOT EXISTS idx_hoa_dues_property ON hoa_dues(property_id);
CREATE INDEX IF NOT EXISTS idx_eviction_cases_org_status ON eviction_cases(org_id, status);
CREATE INDEX IF NOT EXISTS idx_eviction_cases_user ON eviction_cases(user_id);
CREATE INDEX IF NOT EXISTS idx_pm_ledger_property ON pm_rent_ledger(property_id);
CREATE INDEX IF NOT EXISTS idx_pm_ledger_org_status ON pm_rent_ledger(org_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_log_org ON audit_log(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON org_members(user_id);

-- ─────────────────────────────────────────────
-- UPDATED_AT TRIGGER (keeps updated_at fresh)
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_orgs_updated               BEFORE UPDATE ON orgs               FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_hoa_properties_updated     BEFORE UPDATE ON hoa_properties     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_hoa_violations_updated     BEFORE UPDATE ON hoa_violations     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_hoa_minutes_updated        BEFORE UPDATE ON hoa_meeting_minutes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_hoa_dues_updated           BEFORE UPDATE ON hoa_dues           FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_eviction_updated           BEFORE UPDATE ON eviction_cases     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_pm_properties_updated      BEFORE UPDATE ON pm_properties      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────
-- SEED: Madison Park (design partner)
-- Run AFTER first user signs up and gets a user ID
-- Replace 'YOUR-USER-UUID' with the actual UUID from auth.users
-- ─────────────────────────────────────────────

-- UNCOMMENT AND EDIT after first signup:
/*
DO $$
DECLARE
  v_user_id UUID := 'YOUR-USER-UUID';  -- Replace with actual user UUID
  v_org_id  UUID;
BEGIN
  INSERT INTO orgs (name, hub_type, plan, doors_count)
  VALUES ('Madison Park HOA', 'hoa', 'starter', 49)
  RETURNING id INTO v_org_id;

  INSERT INTO org_members (org_id, user_id, role, joined_at)
  VALUES (v_org_id, v_user_id, 'owner', now());

  RAISE NOTICE 'Madison Park created: org_id = %', v_org_id;
END;
$$;
*/

-- ─────────────────────────────────────────────
-- VERIFY (run to confirm everything created)
-- ─────────────────────────────────────────────
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
