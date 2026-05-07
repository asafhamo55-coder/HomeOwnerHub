-- 0002_wizard_drafts.sql
-- Persistent storage for in-progress wizard runs across HOA / Eviction / PM.
--
-- A draft row is created on the first step of any multi-step flow and
-- updated every time the user advances. Drafts are private to (user_id,
-- org_id); the dashboard shows each user only their own unfinished work.
-- The Inngest 'wizard-draft-reminders' cron looks at these rows daily to
-- nudge users to resume.
--
-- payload jsonb is intentionally schemaless — different wizard kinds
-- carry different shapes. The TypeScript layer types each kind separately.
--
-- Idempotent. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.wizard_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- One of: 'violation' (HOA), 'meeting' (HOA), 'eviction_case' (Eviction).
  -- Free-text so future hubs can add their own kinds without a migration.
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_step text NOT NULL DEFAULT 'capture',
  step_index int NOT NULL DEFAULT 0,
  total_steps int NOT NULL DEFAULT 1,
  completed boolean NOT NULL DEFAULT false,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wizard_drafts_user_org_idx
  ON public.wizard_drafts(user_id, org_id);

-- Hot path: dashboard query "unfinished drafts for this user/org".
CREATE INDEX IF NOT EXISTS wizard_drafts_open_idx
  ON public.wizard_drafts(user_id, org_id, completed)
  WHERE completed = false;

-- Cron path: "drafts older than X days that haven't been pinged in Y."
CREATE INDEX IF NOT EXISTS wizard_drafts_followup_idx
  ON public.wizard_drafts(updated_at)
  WHERE completed = false;

ALTER TABLE public.wizard_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wizard_drafts_select_own"  ON public.wizard_drafts;
DROP POLICY IF EXISTS "wizard_drafts_insert_own"  ON public.wizard_drafts;
DROP POLICY IF EXISTS "wizard_drafts_update_own"  ON public.wizard_drafts;
DROP POLICY IF EXISTS "wizard_drafts_delete_own"  ON public.wizard_drafts;

CREATE POLICY "wizard_drafts_select_own"
ON public.wizard_drafts
FOR SELECT
USING (user_id = auth.uid() AND org_id = ANY(public.auth_org_ids()));

CREATE POLICY "wizard_drafts_insert_own"
ON public.wizard_drafts
FOR INSERT
WITH CHECK (user_id = auth.uid() AND org_id = ANY(public.auth_org_ids()));

CREATE POLICY "wizard_drafts_update_own"
ON public.wizard_drafts
FOR UPDATE
USING (user_id = auth.uid() AND org_id = ANY(public.auth_org_ids()))
WITH CHECK (user_id = auth.uid() AND org_id = ANY(public.auth_org_ids()));

CREATE POLICY "wizard_drafts_delete_own"
ON public.wizard_drafts
FOR DELETE
USING (user_id = auth.uid() AND org_id = ANY(public.auth_org_ids()));
