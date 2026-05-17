-- 0009_plaid_items.sql
-- Phase 2 v1.1+ — Plaid Sandbox storage for access tokens.
--
-- bank_accounts.plaid_item_id + plaid_account_id are already in 0006,
-- but the access_token (long-lived secret returned by /item/public_token/exchange)
-- has nowhere to live. This table is that home. One row per linked
-- Plaid Item (which can contain N bank_accounts), keyed by item_id.
--
-- RLS scopes by organization_id like every other accounting table.
--
-- Idempotent. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.plaid_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id      uuid NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  plaid_item_id       text NOT NULL UNIQUE,
  access_token        text NOT NULL,         -- Plaid-issued, long-lived
  institution_id      text,
  institution_name    text,
  /** /transactions/sync cursor — null until first sync. */
  sync_cursor         text,
  last_synced_at      timestamptz,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS plaid_items_association_idx
  ON public.plaid_items(association_id);

ALTER TABLE public.plaid_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_access ON public.plaid_items;
CREATE POLICY org_access ON public.plaid_items
  USING (organization_id = ANY (public.auth_org_ids()));
