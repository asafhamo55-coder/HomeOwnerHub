-- 0017_leases_and_property_360.sql
-- Lease management + property/resident/history tracking.
--
-- Spec ask:
--   • Boards need a cap on the % of units that may be leased at once
--     (most Declarations include one — Madison Park's §4.7 caps at 20%).
--   • When the cap is hit, owners who still want to lease join a FIFO
--     waiting list; admins approve/deny/withdraw.
--   • Every property needs a "360" view: tenure (owner-occupied vs leased
--     vs unknown), current residents (owners, tenants, family members),
--     and an immutable history of ownership/tenure/resident changes.
--
-- AI surface: lease_cap_ai_suggested_pct + lease_cap_ai_source capture
-- what W1 (Governing Docs Brain) thinks the cap is, separately from the
-- human-set authoritative cap (lease_cap_pct). The board reviews and
-- promotes the suggestion explicitly — we never let the AI write the
-- authoritative value.
--
-- NOTE on numbering: spec asked for 0010 but that number is taken by
-- 0010_state_statutes.sql in this repo. Using next-available 0017.
--
-- Idempotent. Safe to re-run.

-- ─── 1. Lease cap fields on associations ─────────────────────────────
ALTER TABLE public.associations
  ADD COLUMN IF NOT EXISTS lease_cap_pct numeric(5,2)
    CHECK (lease_cap_pct IS NULL OR (lease_cap_pct >= 0 AND lease_cap_pct <= 100)),
  ADD COLUMN IF NOT EXISTS lease_cap_ai_suggested_pct numeric(5,2)
    CHECK (lease_cap_ai_suggested_pct IS NULL OR (lease_cap_ai_suggested_pct >= 0 AND lease_cap_ai_suggested_pct <= 100)),
  ADD COLUMN IF NOT EXISTS lease_cap_ai_source text,
  ADD COLUMN IF NOT EXISTS lease_cap_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS lease_cap_set_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- ─── 2. Tenure on hoa_properties ─────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.property_tenure AS ENUM ('owner_occupied', 'leased', 'unknown');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.hoa_properties
  ADD COLUMN IF NOT EXISTS tenure public.property_tenure NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS tenure_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS tenure_updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS hoa_properties_tenure_idx
  ON public.hoa_properties(org_id, tenure);

-- ─── 3. lease_waiting_list ───────────────────────────────────────────
-- FIFO queue of owners who want to lease but can't yet (cap reached or
-- pending board approval). At most one OPEN ('waiting') entry per
-- property; the unique constraint is partial so historical
-- approved/withdrawn/denied rows can coexist.
CREATE TABLE IF NOT EXISTS public.lease_waiting_list (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id     uuid NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  property_id        uuid NOT NULL REFERENCES public.hoa_properties(id) ON DELETE CASCADE,
  requested_at       timestamptz NOT NULL DEFAULT now(),
  status             text NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'approved', 'withdrawn', 'denied')),
  status_updated_at  timestamptz,
  status_updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes              text,
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- At most one open ('waiting') entry per property — historical entries
-- stay around for the audit trail. A partial unique index expresses
-- this cleanly.
CREATE UNIQUE INDEX IF NOT EXISTS lease_waiting_list_one_open_per_property_idx
  ON public.lease_waiting_list(property_id)
  WHERE status = 'waiting';

CREATE INDEX IF NOT EXISTS lease_waiting_list_assoc_status_idx
  ON public.lease_waiting_list(association_id, status, requested_at);

-- ─── 4. property_residents ───────────────────────────────────────────
-- Owners, tenants, family members. is_primary flags the "main" contact
-- for outbound communication. moved_out_at NULL = currently in residence.
DO $$ BEGIN
  CREATE TYPE public.property_resident_role AS ENUM ('owner', 'tenant', 'family_member', 'other');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.property_residents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  property_id      uuid NOT NULL REFERENCES public.hoa_properties(id) ON DELETE CASCADE,
  full_name        text NOT NULL,
  email            text,
  phone            text,
  role             public.property_resident_role NOT NULL,
  is_primary       boolean NOT NULL DEFAULT false,
  moved_in_at      date,
  moved_out_at     date,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS property_residents_property_idx
  ON public.property_residents(property_id);
CREATE INDEX IF NOT EXISTS property_residents_active_idx
  ON public.property_residents(property_id)
  WHERE moved_out_at IS NULL;

-- ─── 5. property_events ──────────────────────────────────────────────
-- Immutable history. Every meaningful change to a property — tenure
-- flip, ownership change, resident added/removed, lease start/end,
-- waiting list activity — drops a row here. payload is free-shape JSON
-- per kind; the app layer is the schema enforcer.
DO $$ BEGIN
  CREATE TYPE public.property_event_kind AS ENUM (
    'tenure_changed',
    'ownership_changed',
    'resident_added',
    'resident_removed',
    'lease_started',
    'lease_ended',
    'waiting_list_added',
    'waiting_list_resolved',
    'note'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.property_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  property_id      uuid NOT NULL REFERENCES public.hoa_properties(id) ON DELETE CASCADE,
  occurred_at      timestamptz NOT NULL DEFAULT now(),
  kind             public.property_event_kind NOT NULL,
  payload          jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes            text,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS property_events_property_occurred_idx
  ON public.property_events(property_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS property_events_org_kind_idx
  ON public.property_events(organization_id, kind, occurred_at DESC);

-- ─── RLS ─────────────────────────────────────────────────────────────
-- Standard pattern: org members can read/write rows for their org. The
-- service role bypasses RLS implicitly. associations already has an RLS
-- policy from migration 0004; the ALTER above doesn't change that.

ALTER TABLE public.lease_waiting_list  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_residents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_events     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_access ON public.lease_waiting_list;
DROP POLICY IF EXISTS org_access ON public.property_residents;
DROP POLICY IF EXISTS org_access ON public.property_events;

CREATE POLICY org_access ON public.lease_waiting_list
  USING (organization_id = ANY (public.auth_org_ids()));
CREATE POLICY org_access ON public.property_residents
  USING (organization_id = ANY (public.auth_org_ids()));
CREATE POLICY org_access ON public.property_events
  USING (organization_id = ANY (public.auth_org_ids()));
