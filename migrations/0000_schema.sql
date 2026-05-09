-- 0000_schema.sql
-- Base schema for the HomeownerHub Supabase project (xwdjsxfskvreguyvryhc).
-- Captured from the live database via pg_dump on 2026-05-09 so the source
-- of truth lives in git alongside subsequent migrations.
--
-- Run order on a fresh Supabase project:
--   1. 0000_schema.sql  ← this file
--   2. 0001_auth_fixes.sql
--   3. 0002_wizard_drafts.sql
--   4. 0003_storage_policies.sql
--
-- Notes:
--  - Every data table has org_id NOT NULL and an `org_access` policy that
--    gates SELECT/UPDATE/DELETE on `org_id = ANY (auth_org_ids())`.
--  - profiles is per-user, gated by `id = auth.uid()`.
--  - orgs / org_members enforce membership via auth_org_ids().
--  - The handle_new_user() trigger is recreated in 0001 with a pinned
--    search_path; this file's definition is the captured-from-prod copy.

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

CREATE SCHEMA IF NOT EXISTS public;

-- ─── Functions ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.auth_org_ids() RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT COALESCE(
    ARRAY(SELECT org_id FROM org_members WHERE user_id = auth.uid()),
    '{}'::UUID[]
  )
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;


SET default_tablespace = '';
SET default_table_access_method = heap;

-- ─── Tables ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid,
    user_id uuid,
    action text NOT NULL,
    entity_type text,
    entity_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.eviction_cases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    user_id uuid NOT NULL,
    property_address text NOT NULL,
    county text NOT NULL,
    state text NOT NULL,
    tenant_name text,
    tenant_email text,
    monthly_rent numeric(10,2),
    days_unpaid integer,
    balance_owed numeric(10,2),
    notice_type text,
    notice_draft text,
    notice_approved boolean DEFAULT false,
    notice_approved_by uuid,
    notice_approved_at timestamp with time zone,
    notice_sent_at timestamp with time zone,
    notice_served_method text,
    filing_eligible_date date,
    status text DEFAULT 'intake'::text,
    compliance_flags jsonb DEFAULT '{}'::jsonb,
    court_case_number text,
    hearing_date date,
    outcome text,
    stripe_payment_id text,
    case_notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT eviction_cases_county_check CHECK ((county = ANY (ARRAY['harris_tx'::text, 'san_bernardino_ca'::text, 'king_wa'::text]))),
    CONSTRAINT eviction_cases_notice_served_method_check CHECK ((notice_served_method = ANY (ARRAY['personal'::text, 'posting'::text, 'certified_mail'::text]))),
    CONSTRAINT eviction_cases_notice_type_check CHECK ((notice_type = ANY (ARRAY['3day_pay_or_quit'::text, '30day_vacate'::text, 'just_cause'::text]))),
    CONSTRAINT eviction_cases_status_check CHECK ((status = ANY (ARRAY['intake'::text, 'notice_drafted'::text, 'notice_sent'::text, 'filing_ready'::text, 'filed'::text, 'resolved'::text, 'dismissed'::text])))
);

CREATE TABLE IF NOT EXISTS public.hoa_digests (
    org_id uuid NOT NULL,
    content text NOT NULL,
    generated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hoa_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    storage_path text NOT NULL,
    file_size integer,
    parsed_text text,
    parsed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT hoa_documents_type_check CHECK ((type = ANY (ARRAY['ccr'::text, 'bylaws'::text, 'rules'::text, 'minutes'::text, 'other'::text])))
);

CREATE TABLE IF NOT EXISTS public.hoa_dues (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    property_id uuid,
    period text NOT NULL,
    amount_due numeric(10,2) NOT NULL,
    amount_paid numeric(10,2) DEFAULT 0,
    due_date date NOT NULL,
    paid_date date,
    status text DEFAULT 'pending'::text,
    late_fee numeric(10,2) DEFAULT 0,
    stripe_payment_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT hoa_dues_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'partial'::text, 'late'::text, 'waived'::text])))
);

CREATE TABLE IF NOT EXISTS public.hoa_meeting_minutes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    created_by uuid,
    meeting_date date NOT NULL,
    meeting_type text DEFAULT 'regular'::text,
    attendees text[] DEFAULT '{}'::text[],
    raw_transcript text,
    ai_summary text,
    action_items jsonb DEFAULT '[]'::jsonb,
    motions jsonb DEFAULT '[]'::jsonb,
    status text DEFAULT 'draft'::text,
    approved_by uuid,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT hoa_meeting_minutes_meeting_type_check CHECK ((meeting_type = ANY (ARRAY['regular'::text, 'special'::text, 'annual'::text, 'emergency'::text]))),
    CONSTRAINT hoa_meeting_minutes_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'approved'::text])))
);

CREATE TABLE IF NOT EXISTS public.hoa_properties (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    address text NOT NULL,
    unit_number text,
    owner_name text,
    owner_email text,
    owner_phone text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hoa_violations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    property_id uuid,
    created_by uuid,
    violation_type text NOT NULL,
    description text NOT NULL,
    ccr_section text,
    severity text,
    status text DEFAULT 'open'::text NOT NULL,
    ai_draft_letter text,
    approved_letter text,
    approved_by uuid,
    approved_at timestamp with time zone,
    notice_sent_at timestamp with time zone,
    photo_urls text[] DEFAULT '{}'::text[],
    cure_period_days integer DEFAULT 14,
    fine_amount numeric(10,2) DEFAULT 25.00,
    fine_start_date date,
    resolved_at timestamp with time zone,
    resolution_note text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT hoa_violations_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))),
    CONSTRAINT hoa_violations_status_check CHECK ((status = ANY (ARRAY['open'::text, 'notice_drafted'::text, 'notice_sent'::text, 'resolved'::text, 'waived'::text])))
);

CREATE TABLE IF NOT EXISTS public.org_members (
    org_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text NOT NULL,
    invited_at timestamp with time zone DEFAULT now(),
    joined_at timestamp with time zone,
    CONSTRAINT org_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text, 'viewer'::text])))
);

CREATE TABLE IF NOT EXISTS public.orgs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    hub_type text NOT NULL,
    plan text DEFAULT 'free'::text NOT NULL,
    stripe_customer_id text,
    stripe_sub_id text,
    doors_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT orgs_hub_type_check CHECK ((hub_type = ANY (ARRAY['hoa'::text, 'pm'::text, 'eviction'::text]))),
    CONSTRAINT orgs_plan_check CHECK ((plan = ANY (ARRAY['free'::text, 'starter'::text, 'standard'::text, 'pro'::text, 'enterprise'::text, 'per_case'::text, 'unlimited'::text])))
);

CREATE TABLE IF NOT EXISTS public.pm_properties (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    org_id uuid NOT NULL,
    address text NOT NULL,
    unit_type text DEFAULT 'residential'::text,
    bedrooms integer,
    bathrooms numeric(3,1),
    sq_ft integer,
    monthly_rent numeric(10,2),
    deposit numeric(10,2),
    tenant_name text,
    tenant_email text,
    tenant_phone text,
    lease_start date,
    lease_end date,
    status text DEFAULT 'occupied'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT pm_properties_status_check CHECK ((status = ANY (ARRAY['vacant'::text, 'occupied'::text, 'maintenance'::text]))),
    CONSTRAINT pm_properties_unit_type_check CHECK ((unit_type = ANY (ARRAY['residential'::text, 'commercial'::text])))
);

CREATE TABLE IF NOT EXISTS public.pm_rent_ledger (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    property_id uuid NOT NULL,
    org_id uuid NOT NULL,
    period text NOT NULL,
    amount_due numeric(10,2) NOT NULL,
    amount_paid numeric(10,2) DEFAULT 0,
    due_date date NOT NULL,
    paid_date date,
    status text DEFAULT 'pending'::text,
    late_fee numeric(10,2) DEFAULT 0,
    late_fee_rate numeric(5,4) DEFAULT 0.05,
    stripe_payment_id text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT pm_rent_ledger_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'partial'::text, 'late'::text])))
);

CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid NOT NULL,
    full_name text,
    email text,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now()
);

-- ─── Primary keys ────────────────────────────────────────────────────

ALTER TABLE ONLY public.audit_log               ADD CONSTRAINT audit_log_pkey               PRIMARY KEY (id);
ALTER TABLE ONLY public.eviction_cases          ADD CONSTRAINT eviction_cases_pkey          PRIMARY KEY (id);
ALTER TABLE ONLY public.hoa_digests             ADD CONSTRAINT hoa_digests_pkey             PRIMARY KEY (org_id);
ALTER TABLE ONLY public.hoa_documents           ADD CONSTRAINT hoa_documents_pkey           PRIMARY KEY (id);
ALTER TABLE ONLY public.hoa_dues                ADD CONSTRAINT hoa_dues_pkey                PRIMARY KEY (id);
ALTER TABLE ONLY public.hoa_meeting_minutes     ADD CONSTRAINT hoa_meeting_minutes_pkey     PRIMARY KEY (id);
ALTER TABLE ONLY public.hoa_properties          ADD CONSTRAINT hoa_properties_pkey          PRIMARY KEY (id);
ALTER TABLE ONLY public.hoa_violations          ADD CONSTRAINT hoa_violations_pkey          PRIMARY KEY (id);
ALTER TABLE ONLY public.org_members             ADD CONSTRAINT org_members_pkey             PRIMARY KEY (org_id, user_id);
ALTER TABLE ONLY public.orgs                    ADD CONSTRAINT orgs_pkey                    PRIMARY KEY (id);
ALTER TABLE ONLY public.pm_properties           ADD CONSTRAINT pm_properties_pkey           PRIMARY KEY (id);
ALTER TABLE ONLY public.pm_rent_ledger          ADD CONSTRAINT pm_rent_ledger_pkey          PRIMARY KEY (id);
ALTER TABLE ONLY public.profiles                ADD CONSTRAINT profiles_pkey                PRIMARY KEY (id);

-- ─── Indexes ─────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_audit_log_org              ON public.audit_log USING btree (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eviction_cases_org_status  ON public.eviction_cases USING btree (org_id, status);
CREATE INDEX IF NOT EXISTS idx_eviction_cases_user        ON public.eviction_cases USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_hoa_dues_org_status        ON public.hoa_dues USING btree (org_id, status);
CREATE INDEX IF NOT EXISTS idx_hoa_dues_property          ON public.hoa_dues USING btree (property_id);
CREATE INDEX IF NOT EXISTS idx_hoa_violations_org_status  ON public.hoa_violations USING btree (org_id, status);
CREATE INDEX IF NOT EXISTS idx_hoa_violations_property    ON public.hoa_violations USING btree (property_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user           ON public.org_members USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_pm_ledger_org_status       ON public.pm_rent_ledger USING btree (org_id, status);
CREATE INDEX IF NOT EXISTS idx_pm_ledger_property         ON public.pm_rent_ledger USING btree (property_id);

-- ─── Triggers ────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_eviction_updated         ON public.eviction_cases;
DROP TRIGGER IF EXISTS trg_hoa_dues_updated         ON public.hoa_dues;
DROP TRIGGER IF EXISTS trg_hoa_minutes_updated      ON public.hoa_meeting_minutes;
DROP TRIGGER IF EXISTS trg_hoa_properties_updated   ON public.hoa_properties;
DROP TRIGGER IF EXISTS trg_hoa_violations_updated   ON public.hoa_violations;
DROP TRIGGER IF EXISTS trg_orgs_updated             ON public.orgs;
DROP TRIGGER IF EXISTS trg_pm_properties_updated    ON public.pm_properties;

CREATE TRIGGER trg_eviction_updated         BEFORE UPDATE ON public.eviction_cases       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_hoa_dues_updated         BEFORE UPDATE ON public.hoa_dues             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_hoa_minutes_updated      BEFORE UPDATE ON public.hoa_meeting_minutes  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_hoa_properties_updated   BEFORE UPDATE ON public.hoa_properties       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_hoa_violations_updated   BEFORE UPDATE ON public.hoa_violations       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_orgs_updated             BEFORE UPDATE ON public.orgs                 FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_pm_properties_updated    BEFORE UPDATE ON public.pm_properties        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Foreign keys ────────────────────────────────────────────────────

ALTER TABLE ONLY public.audit_log               ADD CONSTRAINT audit_log_org_id_fkey                       FOREIGN KEY (org_id)             REFERENCES public.orgs(id)            ON DELETE CASCADE;
ALTER TABLE ONLY public.audit_log               ADD CONSTRAINT audit_log_user_id_fkey                      FOREIGN KEY (user_id)            REFERENCES public.profiles(id)        ON DELETE SET NULL;
ALTER TABLE ONLY public.eviction_cases          ADD CONSTRAINT eviction_cases_notice_approved_by_fkey      FOREIGN KEY (notice_approved_by) REFERENCES public.profiles(id)        ON DELETE SET NULL;
ALTER TABLE ONLY public.eviction_cases          ADD CONSTRAINT eviction_cases_org_id_fkey                  FOREIGN KEY (org_id)             REFERENCES public.orgs(id)            ON DELETE CASCADE;
ALTER TABLE ONLY public.eviction_cases          ADD CONSTRAINT eviction_cases_user_id_fkey                 FOREIGN KEY (user_id)            REFERENCES public.profiles(id)        ON DELETE CASCADE;
ALTER TABLE ONLY public.hoa_digests             ADD CONSTRAINT hoa_digests_org_id_fkey                     FOREIGN KEY (org_id)             REFERENCES public.orgs(id)            ON DELETE CASCADE;
ALTER TABLE ONLY public.hoa_documents           ADD CONSTRAINT hoa_documents_org_id_fkey                   FOREIGN KEY (org_id)             REFERENCES public.orgs(id)            ON DELETE CASCADE;
ALTER TABLE ONLY public.hoa_dues                ADD CONSTRAINT hoa_dues_org_id_fkey                        FOREIGN KEY (org_id)             REFERENCES public.orgs(id)            ON DELETE CASCADE;
ALTER TABLE ONLY public.hoa_dues                ADD CONSTRAINT hoa_dues_property_id_fkey                   FOREIGN KEY (property_id)        REFERENCES public.hoa_properties(id)  ON DELETE CASCADE;
ALTER TABLE ONLY public.hoa_meeting_minutes     ADD CONSTRAINT hoa_meeting_minutes_approved_by_fkey        FOREIGN KEY (approved_by)        REFERENCES public.profiles(id)        ON DELETE SET NULL;
ALTER TABLE ONLY public.hoa_meeting_minutes     ADD CONSTRAINT hoa_meeting_minutes_created_by_fkey         FOREIGN KEY (created_by)         REFERENCES public.profiles(id)        ON DELETE SET NULL;
ALTER TABLE ONLY public.hoa_meeting_minutes     ADD CONSTRAINT hoa_meeting_minutes_org_id_fkey             FOREIGN KEY (org_id)             REFERENCES public.orgs(id)            ON DELETE CASCADE;
ALTER TABLE ONLY public.hoa_properties          ADD CONSTRAINT hoa_properties_org_id_fkey                  FOREIGN KEY (org_id)             REFERENCES public.orgs(id)            ON DELETE CASCADE;
ALTER TABLE ONLY public.hoa_violations          ADD CONSTRAINT hoa_violations_approved_by_fkey             FOREIGN KEY (approved_by)        REFERENCES public.profiles(id)        ON DELETE SET NULL;
ALTER TABLE ONLY public.hoa_violations          ADD CONSTRAINT hoa_violations_created_by_fkey              FOREIGN KEY (created_by)         REFERENCES public.profiles(id)        ON DELETE SET NULL;
ALTER TABLE ONLY public.hoa_violations          ADD CONSTRAINT hoa_violations_org_id_fkey                  FOREIGN KEY (org_id)             REFERENCES public.orgs(id)            ON DELETE CASCADE;
ALTER TABLE ONLY public.hoa_violations          ADD CONSTRAINT hoa_violations_property_id_fkey             FOREIGN KEY (property_id)        REFERENCES public.hoa_properties(id)  ON DELETE SET NULL;
ALTER TABLE ONLY public.org_members             ADD CONSTRAINT org_members_org_id_fkey                     FOREIGN KEY (org_id)             REFERENCES public.orgs(id)            ON DELETE CASCADE;
ALTER TABLE ONLY public.org_members             ADD CONSTRAINT org_members_user_id_fkey                    FOREIGN KEY (user_id)            REFERENCES public.profiles(id)        ON DELETE CASCADE;
ALTER TABLE ONLY public.pm_properties           ADD CONSTRAINT pm_properties_org_id_fkey                   FOREIGN KEY (org_id)             REFERENCES public.orgs(id)            ON DELETE CASCADE;
ALTER TABLE ONLY public.pm_rent_ledger          ADD CONSTRAINT pm_rent_ledger_org_id_fkey                  FOREIGN KEY (org_id)             REFERENCES public.orgs(id)            ON DELETE CASCADE;
ALTER TABLE ONLY public.pm_rent_ledger          ADD CONSTRAINT pm_rent_ledger_property_id_fkey             FOREIGN KEY (property_id)        REFERENCES public.pm_properties(id)   ON DELETE CASCADE;
ALTER TABLE ONLY public.profiles                ADD CONSTRAINT profiles_id_fkey                            FOREIGN KEY (id)                 REFERENCES auth.users(id)             ON DELETE CASCADE;

-- ─── Row-level security ──────────────────────────────────────────────
-- Every data table is RLS-on. Reads/writes are gated by org membership
-- via auth_org_ids(); profiles is gated to the user's own row.

ALTER TABLE public.audit_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eviction_cases       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hoa_digests          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hoa_documents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hoa_dues             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hoa_meeting_minutes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hoa_properties       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hoa_violations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_members          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orgs                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_properties        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_rent_ledger       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles             ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_access         ON public.audit_log;
DROP POLICY IF EXISTS org_access         ON public.eviction_cases;
DROP POLICY IF EXISTS org_access         ON public.hoa_digests;
DROP POLICY IF EXISTS org_access         ON public.hoa_documents;
DROP POLICY IF EXISTS org_access         ON public.hoa_dues;
DROP POLICY IF EXISTS org_access         ON public.hoa_meeting_minutes;
DROP POLICY IF EXISTS org_access         ON public.hoa_properties;
DROP POLICY IF EXISTS org_access         ON public.hoa_violations;
DROP POLICY IF EXISTS org_access         ON public.pm_properties;
DROP POLICY IF EXISTS org_access         ON public.pm_rent_ledger;
DROP POLICY IF EXISTS org_member_access  ON public.org_members;
DROP POLICY IF EXISTS org_member_view    ON public.orgs;
DROP POLICY IF EXISTS own_profile        ON public.profiles;

CREATE POLICY org_access        ON public.audit_log           USING ((org_id = ANY (public.auth_org_ids())));
CREATE POLICY org_access        ON public.eviction_cases      USING ((org_id = ANY (public.auth_org_ids())));
CREATE POLICY org_access        ON public.hoa_digests         USING ((org_id = ANY (public.auth_org_ids())));
CREATE POLICY org_access        ON public.hoa_documents       USING ((org_id = ANY (public.auth_org_ids())));
CREATE POLICY org_access        ON public.hoa_dues            USING ((org_id = ANY (public.auth_org_ids())));
CREATE POLICY org_access        ON public.hoa_meeting_minutes USING ((org_id = ANY (public.auth_org_ids())));
CREATE POLICY org_access        ON public.hoa_properties      USING ((org_id = ANY (public.auth_org_ids())));
CREATE POLICY org_access        ON public.hoa_violations      USING ((org_id = ANY (public.auth_org_ids())));
CREATE POLICY org_access        ON public.pm_properties       USING ((org_id = ANY (public.auth_org_ids())));
CREATE POLICY org_access        ON public.pm_rent_ledger      USING ((org_id = ANY (public.auth_org_ids())));
CREATE POLICY org_member_access ON public.org_members         USING ((org_id = ANY (public.auth_org_ids())));
CREATE POLICY org_member_view   ON public.orgs                USING ((id = ANY (public.auth_org_ids())));
CREATE POLICY own_profile       ON public.profiles            USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));
