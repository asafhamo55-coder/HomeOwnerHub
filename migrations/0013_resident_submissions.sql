-- 0013_resident_submissions.sql
-- v1.2 Module 9 Phase 16e — resident-side submission tables.
--
-- arc_requests: a resident submits a request for architectural change
--   to their unit (paint color, fence, deck, etc.). Board reviews and
--   approves / denies via the existing manager UI (board-side review
--   in a follow-up).
--
-- resident_violation_reports: a resident reports a possible violation
--   (a neighbor's overgrown lawn, an off-leash dog, etc.). Reporter
--   identity is preserved on the row but the reporter expects
--   confidentiality (Policy doc §12.03); the board-facing UI should
--   not display the reporter's name to other residents.
--
-- RLS:
--   - Residents can INSERT for units they own (arc_requests) or any
--     in their org (violation reports).
--   - Residents can SELECT their own submissions (matched on
--     reported_by / submitted_by).
--   - Board / admin can SELECT and UPDATE everything in their org.
--
-- Idempotent. Safe to re-run.

-- ─── arc_requests ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.arc_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id     uuid REFERENCES public.associations(id) ON DELETE SET NULL,
  unit_id            uuid REFERENCES public.units(id) ON DELETE SET NULL,
  submitted_by       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  category           text NOT NULL CHECK (category IN (
    'paint', 'fence', 'deck_patio', 'roof', 'landscaping',
    'addition', 'pool', 'solar', 'other'
  )),
  summary            text NOT NULL,
  scope_description  text NOT NULL,
  proposed_start     date,
  proposed_completion date,
  contractor_name    text,
  contractor_license text,
  status             text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'in_review', 'approved', 'denied', 'withdrawn')),
  board_response     text,                     -- written decision or conditions
  board_response_at  timestamptz,
  board_response_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  submitted_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS arc_requests_org_idx
  ON public.arc_requests(organization_id, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS arc_requests_submitted_by_idx
  ON public.arc_requests(submitted_by, submitted_at DESC);

-- ─── resident_violation_reports ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.resident_violation_reports (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id      uuid REFERENCES public.associations(id) ON DELETE SET NULL,
  reported_by         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  about_unit_id       uuid REFERENCES public.units(id) ON DELETE SET NULL,
  about_address       text,                    -- when reporter only knows address, not unit
  category            text NOT NULL CHECK (category IN (
    'parking', 'pet', 'noise', 'lawn_landscape', 'trash',
    'architectural', 'rental', 'nuisance', 'other'
  )),
  description         text NOT NULL,
  occurred_at         timestamptz,
  evidence_photo_path text,                    -- supabase storage path; optional
  status              text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'under_review', 'opened_as_violation', 'closed_no_action', 'dismissed')),
  board_note          text,                    -- private board-only note
  reviewed_at         timestamptz,
  reviewed_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  hoa_violation_id    uuid,                    -- if board opens a formal violation, link it
  submitted_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS resident_violation_reports_org_idx
  ON public.resident_violation_reports(organization_id, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS resident_violation_reports_reported_by_idx
  ON public.resident_violation_reports(reported_by, submitted_at DESC);

-- ─── RLS ─────────────────────────────────────────────────────────
ALTER TABLE public.arc_requests                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resident_violation_reports   ENABLE ROW LEVEL SECURITY;

-- arc_requests: residents read/write their own; board+admin read/write all in org.
DROP POLICY IF EXISTS resident_own_arc          ON public.arc_requests;
DROP POLICY IF EXISTS board_or_admin_arc        ON public.arc_requests;

CREATE POLICY resident_own_arc ON public.arc_requests
  USING (
    submitted_by = auth.uid()
    AND organization_id = ANY (public.auth_org_ids())
  )
  WITH CHECK (
    submitted_by = auth.uid()
    AND organization_id = ANY (public.auth_org_ids())
  );

CREATE POLICY board_or_admin_arc ON public.arc_requests
  USING (
    organization_id = ANY (public.auth_org_ids())
    AND public.auth_is_board_or_admin(organization_id)
  )
  WITH CHECK (
    organization_id = ANY (public.auth_org_ids())
    AND public.auth_is_board_or_admin(organization_id)
  );

-- resident_violation_reports: same two-policy shape.
DROP POLICY IF EXISTS resident_own_violation    ON public.resident_violation_reports;
DROP POLICY IF EXISTS board_or_admin_violation  ON public.resident_violation_reports;

CREATE POLICY resident_own_violation ON public.resident_violation_reports
  USING (
    reported_by = auth.uid()
    AND organization_id = ANY (public.auth_org_ids())
  )
  WITH CHECK (
    reported_by = auth.uid()
    AND organization_id = ANY (public.auth_org_ids())
  );

CREATE POLICY board_or_admin_violation ON public.resident_violation_reports
  USING (
    organization_id = ANY (public.auth_org_ids())
    AND public.auth_is_board_or_admin(organization_id)
  )
  WITH CHECK (
    organization_id = ANY (public.auth_org_ids())
    AND public.auth_is_board_or_admin(organization_id)
  );
