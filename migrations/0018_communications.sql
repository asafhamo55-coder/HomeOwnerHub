-- 0018_communications.sql
-- v1.2 Module — Communications.
--
-- Six tables drive the comms module:
--   1. communication_templates       — reusable subject/body templates per category
--   2. communications                — one row per send (the message at topic level)
--   3. communication_recipients      — one row per delivery (per unit × channel)
--   4. communication_threads         — groups related comms over time (escalation series)
--   5. communication_replies         — inbound resident replies
--   6. resident_communication_preferences — per-resident opt-in/quiet hours
--
-- Audit + RLS pattern matches the accounting tables in 0006/0007/0010.
-- Idempotent. Safe to re-run.

-- ─── communication_templates ─────────────────────────────────────────
-- One row per reusable template. association_id is nullable so templates
-- can be org-wide (shared across associations) or association-specific.
CREATE TABLE IF NOT EXISTS public.communication_templates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id    uuid REFERENCES public.associations(id) ON DELETE CASCADE,
  category          text NOT NULL
    CHECK (category IN (
      'welcome', 'dues', 'meeting', 'violation', 'arc',
      'financial', 'emergency', 'announcement', 'custom'
    )),
  name              text NOT NULL,                       -- "Welcome Letter — Owner"
  description       text,
  subject           text NOT NULL,
  body_html         text NOT NULL,                       -- with merge fields like {{owner_name}}
  body_text         text,                                -- plain-text fallback
  body_sms          text,                                -- short form for SMS (Phase 4)
  channels          text[] NOT NULL DEFAULT ARRAY['email']::text[],
  variables         jsonb NOT NULL DEFAULT '[]'::jsonb,  -- declared merge fields
  language          text NOT NULL DEFAULT 'en',          -- ISO code; UI usage in Phase 6
  is_active         boolean NOT NULL DEFAULT true,
  ai_generated      boolean NOT NULL DEFAULT false,
  ai_workflow_id    text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS comm_templates_org_category_idx
  ON public.communication_templates(organization_id, category)
  WHERE is_active;

-- ─── communications ──────────────────────────────────────────────────
-- One row per logical send. The recipient explosion lives in
-- communication_recipients so re-running an audience query is auditable
-- (audience_definition captures the filter used at send time).
-- Note: thread_id FK to communication_threads is added at the bottom
-- via ALTER TABLE because threads is created after this table (its
-- root_communication_id column needs to FK back here). Without the
-- deferred ALTER, CREATE TABLE would fail on the forward reference.
CREATE TABLE IF NOT EXISTS public.communications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id      uuid NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  thread_id           uuid,
  template_id         uuid REFERENCES public.communication_templates(id) ON DELETE SET NULL,
  category            text NOT NULL
    CHECK (category IN (
      'welcome', 'dues', 'meeting', 'violation', 'arc',
      'financial', 'emergency', 'announcement', 'custom'
    )),
  subject             text NOT NULL,
  body_html           text NOT NULL,                     -- already merged for the audience-level message
  body_text           text,
  channels            text[] NOT NULL DEFAULT ARRAY['email']::text[],
  audience_definition jsonb NOT NULL,                    -- filter rules used to resolve recipients
  audience_summary    text,                              -- "All owners in Madison Park (82)"
  status              text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  source              text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'workflow', 'cron', 'api')),
  related_resource    jsonb,                             -- {type:'violation', id:...} for traceability
  scheduled_for       timestamptz,
  sent_at             timestamptz,
  ai_generated        boolean NOT NULL DEFAULT false,
  ai_workflow_id      text,                              -- ai_runs.id for W31 / W32 audit linkage
  created_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sent_by             uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS communications_assoc_status_idx
  ON public.communications(association_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS communications_scheduled_idx
  ON public.communications(scheduled_for)
  WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS communications_thread_idx
  ON public.communications(thread_id);

-- ─── communication_threads ───────────────────────────────────────────
-- Groups related comms over time. Violation escalation: first notice →
-- reminder → hearing → fine — same thread keyed on (unit, category).
-- ARC review: application received → RFI → decision — one thread per
-- request.
CREATE TABLE IF NOT EXISTS public.communication_threads (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id          uuid NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  unit_id                 uuid REFERENCES public.units(id) ON DELETE SET NULL,
  topic_category          text NOT NULL,
  topic_label             text,                          -- "Violation 2026-05 #1247"
  related_resource        jsonb,                         -- {type:'violation', id:...}
  root_communication_id   uuid REFERENCES public.communications(id) ON DELETE SET NULL,
  status                  text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closed', 'resolved')),
  created_at              timestamptz NOT NULL DEFAULT now(),
  closed_at               timestamptz,
  closed_by               uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS comm_threads_unit_topic_idx
  ON public.communication_threads(unit_id, topic_category, status);
CREATE INDEX IF NOT EXISTS comm_threads_assoc_open_idx
  ON public.communication_threads(association_id, created_at DESC)
  WHERE status = 'open';

-- ─── communication_recipients ────────────────────────────────────────
-- One row per (communication, unit, channel) — i.e. a unit getting the
-- same comm by both email and portal nets two rows. Delivery state lives
-- here; the Resend / Twilio webhooks update opened_at / clicked_at / etc.
CREATE TABLE IF NOT EXISTS public.communication_recipients (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  communication_id    uuid NOT NULL REFERENCES public.communications(id) ON DELETE CASCADE,
  unit_id             uuid REFERENCES public.units(id) ON DELETE SET NULL,
  user_id             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  recipient_name      text,                              -- denormalized at send time
  email               text,
  phone               text,
  channel             text NOT NULL
    CHECK (channel IN ('email', 'sms', 'portal', 'mail')),
  delivery_status     text NOT NULL DEFAULT 'queued'
    CHECK (delivery_status IN (
      'queued', 'sent', 'delivered', 'opened', 'clicked',
      'bounced', 'replied', 'failed', 'suppressed'
    )),
  external_id         text,                              -- Resend message id, Twilio sid
  error_message       text,
  queued_at           timestamptz NOT NULL DEFAULT now(),
  sent_at             timestamptz,
  delivered_at        timestamptz,
  opened_at           timestamptz,
  clicked_at          timestamptz,
  replied_at          timestamptz,
  failed_at           timestamptz
);

CREATE INDEX IF NOT EXISTS comm_recipients_comm_idx
  ON public.communication_recipients(communication_id);
CREATE INDEX IF NOT EXISTS comm_recipients_unit_idx
  ON public.communication_recipients(unit_id);
CREATE INDEX IF NOT EXISTS comm_recipients_status_idx
  ON public.communication_recipients(delivery_status)
  WHERE delivery_status IN ('queued', 'failed', 'bounced');
CREATE INDEX IF NOT EXISTS comm_recipients_external_id_idx
  ON public.communication_recipients(external_id)
  WHERE external_id IS NOT NULL;

-- ─── communication_replies ───────────────────────────────────────────
-- Inbound replies from residents (email reply, SMS reply, portal
-- message). Threaded via parent communication_id; the W32 Reply Triage
-- workflow (Phase 2) tags + summarizes new rows.
CREATE TABLE IF NOT EXISTS public.communication_replies (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  communication_id      uuid NOT NULL REFERENCES public.communications(id) ON DELETE CASCADE,
  recipient_id          uuid REFERENCES public.communication_recipients(id) ON DELETE SET NULL,
  channel               text NOT NULL
    CHECK (channel IN ('email', 'sms', 'portal')),
  from_email            text,
  from_phone            text,
  subject               text,
  body                  text NOT NULL,
  ai_summary            text,                            -- one-line, populated by W32
  ai_category           text,                            -- compliance/question/complaint/hostile
  external_id           text,                            -- inbound message id from Resend/Twilio
  received_at           timestamptz NOT NULL DEFAULT now(),
  read_at               timestamptz,
  read_by               uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS comm_replies_comm_idx
  ON public.communication_replies(communication_id, received_at DESC);
CREATE INDEX IF NOT EXISTS comm_replies_unread_idx
  ON public.communication_replies(organization_id, received_at DESC)
  WHERE read_at IS NULL;

-- ─── resident_communication_preferences ──────────────────────────────
-- Per-resident opt-in matrix + language + quiet hours. UI lives on the
-- resident portal; manager UI surfaces in the recipient detail later.
CREATE TABLE IF NOT EXISTS public.resident_communication_preferences (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id             uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  unit_id             uuid REFERENCES public.units(id) ON DELETE CASCADE,
  email_opt_in        boolean NOT NULL DEFAULT true,
  sms_opt_in          boolean NOT NULL DEFAULT false,
  portal_opt_in       boolean NOT NULL DEFAULT true,
  mail_opt_in         boolean NOT NULL DEFAULT true,
  language            text NOT NULL DEFAULT 'en',
  quiet_hours         jsonb,                             -- {start:'21:00', end:'08:00', timezone:'America/New_York'}
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR unit_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS resident_comm_prefs_user_uniq
  ON public.resident_communication_preferences(user_id)
  WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS resident_comm_prefs_unit_uniq
  ON public.resident_communication_preferences(unit_id)
  WHERE unit_id IS NOT NULL AND user_id IS NULL;

-- ─── RLS ──────────────────────────────────────────────────────────────
ALTER TABLE public.communication_templates             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communications                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_threads               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_recipients            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communication_replies               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resident_communication_preferences  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_access ON public.communication_templates;
DROP POLICY IF EXISTS org_access ON public.communications;
DROP POLICY IF EXISTS org_access ON public.communication_threads;
DROP POLICY IF EXISTS org_access ON public.communication_recipients;
DROP POLICY IF EXISTS org_access ON public.communication_replies;
DROP POLICY IF EXISTS org_access ON public.resident_communication_preferences;

CREATE POLICY org_access ON public.communication_templates
  USING (organization_id = ANY (public.auth_org_ids()));
CREATE POLICY org_access ON public.communications
  USING (organization_id = ANY (public.auth_org_ids()));
CREATE POLICY org_access ON public.communication_threads
  USING (organization_id = ANY (public.auth_org_ids()));
CREATE POLICY org_access ON public.communication_recipients
  USING (organization_id = ANY (public.auth_org_ids()));
CREATE POLICY org_access ON public.communication_replies
  USING (organization_id = ANY (public.auth_org_ids()));
CREATE POLICY org_access ON public.resident_communication_preferences
  USING (organization_id = ANY (public.auth_org_ids()));

-- ─── Deferred FK: communications.thread_id → communication_threads ───
-- Added here because both tables reference each other. Idempotent —
-- DO block checks for the constraint name before adding.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'communications_thread_id_fkey'
  ) THEN
    ALTER TABLE public.communications
      ADD CONSTRAINT communications_thread_id_fkey
      FOREIGN KEY (thread_id)
      REFERENCES public.communication_threads(id)
      ON DELETE SET NULL;
  END IF;
END$$;
