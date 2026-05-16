-- 0009_vendor_onboarding_invitations.sql
-- v1.1 Module 7 — Tokenized vendor self-service onboarding.
--
-- Pattern (hybrid): the invitation exists BEFORE the vendor row. A board
-- member creates an invitation by entering the vendor's email; we email
-- them a tokenized link; they fill out the public form (including doc
-- uploads); on submit we create the vendors row, link it back, and mark
-- the invitation 'submitted'.
--
-- This is distinct from rfp_invitations (which is for sealed-bid RFP
-- submission, not vendor profile capture). Tokens are 32-byte
-- base64url-encoded → ~43 chars, unguessable.
--
-- Idempotent. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.vendor_onboarding_invitations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  token           text NOT NULL UNIQUE,
  invitee_email   text NOT NULL,
  invitee_name    text,                                  -- optional pre-fill of legal name
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'submitted', 'expired', 'revoked')),
  vendor_id       uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  expires_at      timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  submitted_at    timestamptz
);

CREATE INDEX IF NOT EXISTS vendor_onboarding_invitations_org_idx
  ON public.vendor_onboarding_invitations(organization_id);
CREATE INDEX IF NOT EXISTS vendor_onboarding_invitations_token_idx
  ON public.vendor_onboarding_invitations(token);
CREATE INDEX IF NOT EXISTS vendor_onboarding_invitations_pending_idx
  ON public.vendor_onboarding_invitations(organization_id, status)
  WHERE status = 'pending';

-- ─── RLS ─────────────────────────────────────────────────────────────
-- Org members see their own org's invitations. The PUBLIC submission
-- endpoint does NOT use a Supabase auth session — it uses the
-- service-role key and validates the token in app code. That's how the
-- table is reachable by an anonymous vendor without exposing it via RLS.

ALTER TABLE public.vendor_onboarding_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_access ON public.vendor_onboarding_invitations;
CREATE POLICY org_access ON public.vendor_onboarding_invitations
  USING (organization_id = ANY (public.auth_org_ids()));
