-- 0029_inbox.sql
-- HOA Shared Inbox — Phase A schema.
--
-- Seven tables:
--   1. mailbox_accounts        — one connected Gmail per org
--   2. mailbox_account_secrets — OAuth tokens, service-role ONLY
--   3. inbox_threads           — one row per Gmail thread
--   4. inbox_messages          — one row per Gmail message
--   5. inbox_attachments       — files, mirroring submission_attachments (0027)
--   6. inbox_sender_aliases    — learned email → property mappings
--   7. inbox_thread_links      — thread ↔ ticket/ARC/violation
--
-- Phase B adds inbox_draft_suggestions + inbox_reply_exemplars.
--
-- RLS + audit pattern follows 0018_communications.sql.
-- Idempotent. Safe to re-run.

-- ─── mailbox_accounts ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mailbox_accounts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  provider          text NOT NULL DEFAULT 'gmail' CHECK (provider IN ('gmail')),
  email_address     text NOT NULL,
  google_sub        text,                          -- stable Google account id
  display_name      text,

  -- Which mail we are allowed to see. Enforced in packages/mailbox BEFORE
  -- anything is persisted — never written-then-filtered.
  scope_mode        text NOT NULL DEFAULT 'address'
    CHECK (scope_mode IN ('address', 'label', 'all')),
  scope_value       text,                          -- the address, or the Gmail labelId

  sync_cursor       text,                          -- Gmail historyId
  last_synced_at    timestamptz,
  sync_status       text NOT NULL DEFAULT 'ok'
    CHECK (sync_status IN ('ok', 'stalled', 'auth_failed')),
  sync_error        text,

  backfill_status   text NOT NULL DEFAULT 'pending'
    CHECK (backfill_status IN ('pending', 'running', 'done', 'failed')),
  backfill_progress jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {done:1240, total:3800}

  connected_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  connected_at      timestamptz NOT NULL DEFAULT now(),
  disconnected_at   timestamptz
);

-- One live connection per address per org. Disconnected rows are kept for
-- audit, so the uniqueness is partial.
CREATE UNIQUE INDEX IF NOT EXISTS mailbox_accounts_live_uniq
  ON public.mailbox_accounts(organization_id, email_address)
  WHERE disconnected_at IS NULL;

CREATE INDEX IF NOT EXISTS mailbox_accounts_sync_idx
  ON public.mailbox_accounts(sync_status, last_synced_at)
  WHERE disconnected_at IS NULL;

-- ─── mailbox_account_secrets ─────────────────────────────────────────
-- Split from mailbox_accounts on purpose. A refresh token grants standing
-- access to an HOA's entire mailbox, so it lives in a table that NO user
-- session can read — RLS is enabled with no permissive policy, which
-- denies everything except the service role (which bypasses RLS).
CREATE TABLE IF NOT EXISTS public.mailbox_account_secrets (
  mailbox_account_id uuid PRIMARY KEY
    REFERENCES public.mailbox_accounts(id) ON DELETE CASCADE,
  refresh_token_enc  text NOT NULL,
  access_token_enc   text,
  token_expires_at   timestamptz,
  key_version        integer NOT NULL DEFAULT 1,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ─── inbox_threads ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inbox_threads (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  mailbox_account_id uuid NOT NULL
    REFERENCES public.mailbox_accounts(id) ON DELETE CASCADE,
  gmail_thread_id    text NOT NULL,
  subject            text,
  participants       jsonb NOT NULL DEFAULT '[]'::jsonb,

  unit_id            uuid REFERENCES public.units(id) ON DELETE SET NULL,
  resident_id        uuid REFERENCES public.property_residents(id) ON DELETE SET NULL,
  match_confidence   text NOT NULL DEFAULT 'none'
    CHECK (match_confidence IN ('high', 'medium', 'low', 'none')),
  match_reason       jsonb,     -- {rule:'resident_email', matched_on:'j@x.com'}
  match_source       text NOT NULL DEFAULT 'auto'
    CHECK (match_source IN ('auto', 'manual')),

  status             text NOT NULL DEFAULT 'needs_review'
    CHECK (status IN ('needs_review', 'open', 'waiting', 'closed')),
  assigned_to        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  last_message_at    timestamptz,
  last_direction     text CHECK (last_direction IN ('inbound', 'outbound')),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS inbox_threads_gmail_uniq
  ON public.inbox_threads(mailbox_account_id, gmail_thread_id);

CREATE INDEX IF NOT EXISTS inbox_threads_queue_idx
  ON public.inbox_threads(organization_id, status, last_message_at DESC);

CREATE INDEX IF NOT EXISTS inbox_threads_unit_idx
  ON public.inbox_threads(unit_id, last_message_at DESC)
  WHERE unit_id IS NOT NULL;

-- ─── inbox_messages ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inbox_messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  thread_id         uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  gmail_message_id  text NOT NULL,      -- THE dedupe key

  rfc822_message_id text,
  in_reply_to       text,
  references_ids    text[],             -- "references" is reserved in SQL

  direction         text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_email        text,
  from_name         text,
  to_emails         text[] NOT NULL DEFAULT ARRAY[]::text[],
  cc_emails         text[] NOT NULL DEFAULT ARRAY[]::text[],

  subject           text,
  body_text         text,
  body_html         text,
  stripped_text     text,               -- quotes removed; what Phase B reads

  sent_at           timestamptz,
  ingested_at       timestamptz NOT NULL DEFAULT now(),
  communication_id  uuid REFERENCES public.communications(id) ON DELETE SET NULL
);

-- Idempotent ingest depends on this. A full re-sync after a historyId
-- expiry MUST be a no-op for anything already stored.
CREATE UNIQUE INDEX IF NOT EXISTS inbox_messages_gmail_uniq
  ON public.inbox_messages(gmail_message_id);

CREATE INDEX IF NOT EXISTS inbox_messages_thread_idx
  ON public.inbox_messages(thread_id, sent_at);

CREATE INDEX IF NOT EXISTS inbox_messages_rfc822_idx
  ON public.inbox_messages(rfc822_message_id)
  WHERE rfc822_message_id IS NOT NULL;

-- ─── inbox_attachments ───────────────────────────────────────────────
-- Mirrors submission_attachments (0027): bytes in the private
-- `hoa-documents` bucket, this table is the metadata index, access is via
-- server-generated signed URLs.
CREATE TABLE IF NOT EXISTS public.inbox_attachments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  thread_id           uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  message_id          uuid NOT NULL REFERENCES public.inbox_messages(id) ON DELETE CASCADE,
  storage_path        text,             -- null until fetch_status='stored'
  file_name           text NOT NULL,
  content_type        text,
  size_bytes          bigint,
  sha256              text,
  gmail_attachment_id text,             -- lets a failed download retry
  is_inline           boolean NOT NULL DEFAULT false,
  fetch_status        text NOT NULL DEFAULT 'pending'
    CHECK (fetch_status IN ('pending', 'stored', 'failed', 'skipped')),
  fetch_error         text,
  fetch_attempts      integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inbox_attachments_message_idx
  ON public.inbox_attachments(message_id);

CREATE INDEX IF NOT EXISTS inbox_attachments_pending_idx
  ON public.inbox_attachments(fetch_status, created_at)
  WHERE fetch_status = 'pending';

-- ─── inbox_sender_aliases ────────────────────────────────────────────
-- The matcher's learning loop. Every manual triage assignment writes a
-- row, so the next email from that address matches at high confidence.
CREATE TABLE IF NOT EXISTS public.inbox_sender_aliases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  email_address   text NOT NULL,
  unit_id         uuid REFERENCES public.units(id) ON DELETE CASCADE,
  resident_id     uuid REFERENCES public.property_residents(id) ON DELETE SET NULL,
  source          text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'auto_confirmed')),
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS inbox_sender_aliases_uniq
  ON public.inbox_sender_aliases(organization_id, lower(email_address));

-- ─── inbox_thread_links ──────────────────────────────────────────────
-- Links a thread to an existing record without either owning the other.
CREATE TABLE IF NOT EXISTS public.inbox_thread_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  thread_id       uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  resource_type   text NOT NULL
    CHECK (resource_type IN ('ticket', 'arc_request', 'violation', 'communication_thread')),
  resource_id     uuid NOT NULL,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS inbox_thread_links_uniq
  ON public.inbox_thread_links(thread_id, resource_type, resource_id);

-- ─── RLS ─────────────────────────────────────────────────────────────
ALTER TABLE public.mailbox_accounts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mailbox_account_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_threads           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_attachments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_sender_aliases    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_thread_links      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_access ON public.mailbox_accounts;
DROP POLICY IF EXISTS board_access ON public.inbox_threads;
DROP POLICY IF EXISTS board_access ON public.inbox_messages;
DROP POLICY IF EXISTS board_access ON public.inbox_attachments;
DROP POLICY IF EXISTS board_access ON public.inbox_sender_aliases;
DROP POLICY IF EXISTS board_access ON public.inbox_thread_links;

-- The HOA inbox is board/admin only. Residents have no business reading
-- the mailbox — unlike submissions (0027), there is no resident policy.
CREATE POLICY board_access ON public.mailbox_accounts
  FOR ALL
  USING       (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id))
  WITH CHECK  (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id));

CREATE POLICY board_access ON public.inbox_threads
  FOR ALL
  USING       (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id))
  WITH CHECK  (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id));

CREATE POLICY board_access ON public.inbox_messages
  FOR ALL
  USING       (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id))
  WITH CHECK  (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id));

CREATE POLICY board_access ON public.inbox_attachments
  FOR ALL
  USING       (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id))
  WITH CHECK  (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id));

CREATE POLICY board_access ON public.inbox_sender_aliases
  FOR ALL
  USING       (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id))
  WITH CHECK  (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id));

CREATE POLICY board_access ON public.inbox_thread_links
  FOR ALL
  USING       (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id))
  WITH CHECK  (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id));

-- mailbox_account_secrets gets NO policy at all. RLS enabled with zero
-- permissive policies denies every non-service-role read and write. This
-- is intentional and must not be "fixed" by adding an org_access policy.
