-- 0019_meeting_action_items.sql
-- Promote meeting action items from a jsonb blob to a first-class
-- table so we can: (a) show "your open items" on the dashboard,
-- (b) sort/filter by due date and status, (c) reassign without
-- rewriting the parent minutes JSON, and (d) audit who closed what
-- and when.
--
-- We keep the legacy `hoa_meeting_minutes.action_items` jsonb column
-- in place for backward compatibility — newly created action items
-- live in this table; old jsonb rows can be migrated lazily.
--
-- Idempotent. Safe to re-run.

-- ─── enum: action_item_status ────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.action_item_status AS ENUM (
    'open',          -- not started
    'in_progress',   -- assignee is working on it
    'done',          -- completed
    'cancelled'      -- decided not to do
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── enum: action_item_priority ──────────────────────────────────────
-- Three bands — most HOA action items don't need more granularity.
DO $$ BEGIN
  CREATE TYPE public.action_item_priority AS ENUM (
    'low',
    'normal',
    'high'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── meeting_action_items ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meeting_action_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  meeting_id        uuid NOT NULL REFERENCES public.hoa_meeting_minutes(id) ON DELETE CASCADE,

  -- Content
  title             text NOT NULL,
  description       text,

  -- Who's responsible — both a free-text name (covers non-portal
  -- members, vendors, "the entire board") AND an optional FK to
  -- profiles when we know the in-system user. UI shows the name; the
  -- FK powers "your open items" on a profile's dashboard.
  assignee_name     text,
  assignee_user_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- When + how urgent
  due_date          date,
  priority          public.action_item_priority NOT NULL DEFAULT 'normal',

  -- Lifecycle
  status            public.action_item_status NOT NULL DEFAULT 'open',
  completed_at      timestamptz,
  completed_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Provenance
  ai_generated      boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),

  -- Enforce that completed_at + completed_by are set iff status is done/cancelled
  CHECK (
    (status IN ('done', 'cancelled') AND completed_at IS NOT NULL)
    OR (status NOT IN ('done', 'cancelled') AND completed_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS meeting_action_items_meeting_idx
  ON public.meeting_action_items(meeting_id);
CREATE INDEX IF NOT EXISTS meeting_action_items_assignee_idx
  ON public.meeting_action_items(assignee_user_id)
  WHERE assignee_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS meeting_action_items_org_open_idx
  ON public.meeting_action_items(org_id, due_date)
  WHERE status IN ('open', 'in_progress');

-- ─── trigger: keep updated_at fresh ──────────────────────────────────
DROP TRIGGER IF EXISTS trg_meeting_action_items_updated
  ON public.meeting_action_items;
CREATE TRIGGER trg_meeting_action_items_updated
  BEFORE UPDATE ON public.meeting_action_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────
ALTER TABLE public.meeting_action_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_access ON public.meeting_action_items;
CREATE POLICY org_access ON public.meeting_action_items
  USING (org_id = ANY (public.auth_org_ids()));
