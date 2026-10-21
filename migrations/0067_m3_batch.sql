-- 0067_m3_batch.sql — migration batch M3 (round 3: BL-136, BL-134, BL-131)
--
-- Apply: docs/specs/2026-10-20-sql-runbook.md, Section J. Needs
-- auth_is_board_or_admin(uuid) (0012, asserted below) and the inbox
-- tables (0029). Independent of 0064–0066; RLS shape follows 0063.
--
-- Five parts, each idempotent (safe to run any number of times):
--
--   1. BL-136  assessments.source text NULL, CHECK (source IN
--              ('opening_balance')). The opening-balance executor
--              (apps/hoa/src/lib/accounting/opening-balances/executor.ts)
--              marks the carried-over charges it adds, and the nightly
--              late-fee job (packages/jobs/src/hoa-late-fees.ts) skips them,
--              so a 5% late fee is never charged on day one on a balance
--              that was already late at the previous manager. NULL for
--              every other charge (no backfill: older opening charges were
--              given a due day 30 days out instead, BL-126).
--   2. BL-134  inbox_threads reply clock and snooze:
--              first_inbound_at, first_response_at (maintained by a trigger
--              on inbox_messages, backfilled once here) and snoozed_until
--              (set by the board's Snooze control). A new inbound message
--              (sent within the last day, so a history import never does)
--              clears a snooze, so a resident's reply resurfaces the thread.
--              Partial index for the "snoozed" list filter.
--   3. BL-134  inbox_thread_links validation (closes the "any UUID" hole,
--              inbox plan B3): a BEFORE INSERT OR UPDATE trigger refuses a
--              link whose thread is not in the link's org, or whose
--              resource_id is not a row of the table its resource_type
--              names in that same org (23503). Existing rows are not
--              touched; runbook J1 counts any that would fail.
--   4. BL-134  hoa_documents.source_inbox_attachment_id → inbox_attachments
--              (ON DELETE SET NULL): which email attachment a library
--              document was filed from (inbox plan B5). A trigger refuses
--              an attachment from another org (23503).
--   5. BL-131  compliance_deadlines_done: one row per (association,
--              deadline code) the board marked done. Replaces the
--              HMAC-signed acknowledgments in
--              associations.compliance_settings.compliance_deadline_acks;
--              the app copies verified acknowledgments into rows lazily.
--              RLS: board/admin of the org only, the 0063 board-only shape
--              (select / insert / update / delete), and the association
--              must belong to the row's org. done_by is the caller for a
--              signed-in user (trigger, security review #2 SEC-N6): a
--              board member cannot attribute a row to someone else. The
--              service role (and SECURITY DEFINER functions) are not
--              overridden.
--
-- RLS for the new COLUMNS (parts 1, 2, 4): each table's existing policies
-- already cover them: assessments (0061: board writes, residents read
-- their own units), inbox_threads (0029: board/admin only),
-- hoa_documents (0063/0064: board writes). Nothing new is resident-
-- writable.
--
-- App code reads and writes none of this until M3_APPLIED
-- (packages/db/src/m3.ts) is flipped. Every app path works with the
-- columns present and the flag false (CI replays this file).
--
-- No table rewrite: every new column is nullable with no default
-- (metadata-only). Part 2's backfill updates inbox_threads rows once
-- (only rows whose first_inbound_at is still NULL, so a re-run is a
-- no-op). All-or-nothing.

BEGIN;

DO $pre$
BEGIN
  IF to_regprocedure('public.auth_is_board_or_admin(uuid)') IS NULL THEN
    RAISE EXCEPTION '0067: auth_is_board_or_admin(uuid) is missing (0012)';
  END IF;
END $pre$;

-- ── 1. BL-136: assessments.source ─────────────────────────────────────
ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS source text;

ALTER TABLE public.assessments DROP CONSTRAINT IF EXISTS assessments_source_check;
ALTER TABLE public.assessments ADD CONSTRAINT assessments_source_check
  CHECK (source IN ('opening_balance'));

COMMENT ON COLUMN public.assessments.source IS
  'BL-136: where a charge came from when it was not billed in the app. opening_balance = carried over by the opening-balances approval; the late-fee job skips these. NULL otherwise.';

-- ── 2. BL-134: reply clock + snooze on inbox_threads ──────────────────
ALTER TABLE public.inbox_threads
  ADD COLUMN IF NOT EXISTS first_inbound_at  timestamptz,
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS snoozed_until     timestamptz;

COMMENT ON COLUMN public.inbox_threads.first_inbound_at IS
  'BL-134: time of the first inbound message (sent_at, else ingested_at). Maintained by inbox_messages_reply_clock.';
COMMENT ON COLUMN public.inbox_threads.first_response_at IS
  'BL-134: time of the first outbound message at or after first_inbound_at. NULL = never answered. Maintained by inbox_messages_reply_clock.';
COMMENT ON COLUMN public.inbox_threads.snoozed_until IS
  'BL-134: hidden from the inbox queues until this time. A new inbound message clears it.';

CREATE INDEX IF NOT EXISTS inbox_threads_snoozed_idx
  ON public.inbox_threads (organization_id, snoozed_until)
  WHERE snoozed_until IS NOT NULL;

-- Recomputes both clock columns for one thread from its messages, so the
-- result does not depend on the order messages are ingested in (a history
-- import inserts old mail after new mail). Writes only on a change.
CREATE OR REPLACE FUNCTION public.inbox_thread_reply_clock_recompute(p_thread_id uuid)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
  WITH fi AS (
    SELECT min(coalesce(m.sent_at, m.ingested_at)) AS at
      FROM public.inbox_messages m
     WHERE m.thread_id = p_thread_id AND m.direction = 'inbound'
  ), fr AS (
    SELECT min(coalesce(m.sent_at, m.ingested_at)) AS at
      FROM public.inbox_messages m, fi
     WHERE m.thread_id = p_thread_id AND m.direction = 'outbound'
       AND fi.at IS NOT NULL
       AND coalesce(m.sent_at, m.ingested_at) >= fi.at
  )
  UPDATE public.inbox_threads t
     SET first_inbound_at = fi.at,
         first_response_at = fr.at
    FROM fi, fr
   WHERE t.id = p_thread_id
     AND (t.first_inbound_at IS DISTINCT FROM fi.at OR t.first_response_at IS DISTINCT FROM fr.at);
$fn$;

CREATE OR REPLACE FUNCTION public.inbox_messages_reply_clock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  PERFORM public.inbox_thread_reply_clock_recompute(new.thread_id);
  IF tg_op = 'UPDATE' AND old.thread_id IS DISTINCT FROM new.thread_id THEN
    PERFORM public.inbox_thread_reply_clock_recompute(old.thread_id);
  END IF;
  -- New mail from the resident wakes a snoozed thread. "New" = sent in the
  -- last day, so a history import of old mail never does.
  IF tg_op = 'INSERT' AND new.direction = 'inbound'
     AND coalesce(new.sent_at, new.ingested_at) > now() - interval '1 day' THEN
    UPDATE public.inbox_threads
       SET snoozed_until = NULL
     WHERE id = new.thread_id AND snoozed_until IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS inbox_messages_reply_clock ON public.inbox_messages;
CREATE TRIGGER inbox_messages_reply_clock
  AFTER INSERT OR UPDATE OF direction, sent_at, thread_id ON public.inbox_messages
  FOR EACH ROW EXECUTE FUNCTION public.inbox_messages_reply_clock();

-- One-time backfill. Only threads not yet clocked, so a re-run is a no-op.
WITH ts AS (
  SELECT m.thread_id, m.direction, coalesce(m.sent_at, m.ingested_at) AS at
    FROM public.inbox_messages m
), fi AS (
  SELECT thread_id, min(at) AS at FROM ts WHERE direction = 'inbound' GROUP BY thread_id
), fr AS (
  SELECT fi.thread_id, min(ts.at) AS at
    FROM fi JOIN ts ON ts.thread_id = fi.thread_id AND ts.direction = 'outbound' AND ts.at >= fi.at
   GROUP BY fi.thread_id
)
UPDATE public.inbox_threads t
   SET first_inbound_at = fi.at,
       first_response_at = fr.at
  FROM fi LEFT JOIN fr ON fr.thread_id = fi.thread_id
 WHERE t.id = fi.thread_id
   AND t.first_inbound_at IS NULL;

-- ── 3. BL-134: inbox_thread_links validation ──────────────────────────
-- SECURITY DEFINER so the existence check sees the row whatever the
-- caller's RLS (it returns nothing but pass / refuse). The org column
-- differs per table: hoa_violations uses org_id.
CREATE OR REPLACE FUNCTION public.inbox_thread_links_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_table  text;
  v_orgcol text;
  v_ok     boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.inbox_threads t
                  WHERE t.id = new.thread_id AND t.organization_id = new.organization_id) THEN
    RAISE EXCEPTION 'inbox_thread_links: thread is not in this organization'
      USING errcode = '23503';
  END IF;

  CASE new.resource_type
    WHEN 'ticket'               THEN v_table := 'tickets';               v_orgcol := 'organization_id';
    WHEN 'arc_request'          THEN v_table := 'arc_requests';          v_orgcol := 'organization_id';
    WHEN 'violation'            THEN v_table := 'hoa_violations';        v_orgcol := 'org_id';
    WHEN 'communication_thread' THEN v_table := 'communication_threads'; v_orgcol := 'organization_id';
    ELSE
      RAISE EXCEPTION 'inbox_thread_links: unknown resource_type'
        USING errcode = '23514';
  END CASE;

  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1 AND %I = $2)', v_table, v_orgcol)
    INTO v_ok
    USING new.resource_id, new.organization_id;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'inbox_thread_links: linked record not found in this organization'
      USING errcode = '23503';
  END IF;
  RETURN new;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.inbox_thread_links_validate() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS inbox_thread_links_validate ON public.inbox_thread_links;
CREATE TRIGGER inbox_thread_links_validate
  BEFORE INSERT OR UPDATE OF organization_id, thread_id, resource_type, resource_id
  ON public.inbox_thread_links
  FOR EACH ROW EXECUTE FUNCTION public.inbox_thread_links_validate();

-- ── 4. BL-134: hoa_documents.source_inbox_attachment_id ───────────────
ALTER TABLE public.hoa_documents
  ADD COLUMN IF NOT EXISTS source_inbox_attachment_id uuid
    REFERENCES public.inbox_attachments(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.hoa_documents.source_inbox_attachment_id IS
  'BL-134 (inbox plan B5): the inbox attachment this document was filed from. NULL for uploads.';

CREATE INDEX IF NOT EXISTS hoa_documents_source_inbox_attachment_idx
  ON public.hoa_documents (source_inbox_attachment_id)
  WHERE source_inbox_attachment_id IS NOT NULL;

-- The FK proves the attachment exists; this proves it is the same org's.
CREATE OR REPLACE FUNCTION public.hoa_documents_source_attachment_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF new.source_inbox_attachment_id IS NULL THEN
    RETURN new;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.inbox_attachments a
                  WHERE a.id = new.source_inbox_attachment_id
                    AND a.organization_id = new.org_id) THEN
    RAISE EXCEPTION 'hoa_documents: source attachment is not in this organization'
      USING errcode = '23503';
  END IF;
  RETURN new;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.hoa_documents_source_attachment_org() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS hoa_documents_source_attachment_org ON public.hoa_documents;
CREATE TRIGGER hoa_documents_source_attachment_org
  BEFORE INSERT OR UPDATE OF source_inbox_attachment_id, org_id ON public.hoa_documents
  FOR EACH ROW EXECUTE FUNCTION public.hoa_documents_source_attachment_org();

-- ── 5. BL-131: compliance_deadlines_done ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.compliance_deadlines_done (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id  uuid        NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  -- apps/hoa/src/lib/compliance/deadlines.ts COMPLIANCE_DEADLINES[].code
  code            text        NOT NULL CHECK (code ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  done_at         timestamptz NOT NULL DEFAULT now(),
  done_by         uuid        REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS compliance_deadlines_done_uniq
  ON public.compliance_deadlines_done (association_id, code);
CREATE INDEX IF NOT EXISTS compliance_deadlines_done_org_idx
  ON public.compliance_deadlines_done (organization_id);

COMMENT ON TABLE public.compliance_deadlines_done IS
  'BL-131: statutory deadlines the board marked done, one row per (association, code). Replaces associations.compliance_settings.compliance_deadline_acks. Board/admin only. Ids and times only.';

ALTER TABLE public.compliance_deadlines_done ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compliance_deadlines_done_select ON public.compliance_deadlines_done;
DROP POLICY IF EXISTS compliance_deadlines_done_insert ON public.compliance_deadlines_done;
DROP POLICY IF EXISTS compliance_deadlines_done_update ON public.compliance_deadlines_done;
DROP POLICY IF EXISTS compliance_deadlines_done_delete ON public.compliance_deadlines_done;

CREATE POLICY compliance_deadlines_done_select ON public.compliance_deadlines_done
  FOR SELECT TO authenticated
  USING (public.auth_is_board_or_admin(organization_id));

CREATE POLICY compliance_deadlines_done_insert ON public.compliance_deadlines_done
  FOR INSERT TO authenticated
  WITH CHECK (public.auth_is_board_or_admin(organization_id)
              AND EXISTS (SELECT 1 FROM public.associations a
                           WHERE a.id = association_id
                             AND a.organization_id = compliance_deadlines_done.organization_id));

CREATE POLICY compliance_deadlines_done_update ON public.compliance_deadlines_done
  FOR UPDATE TO authenticated
  USING (public.auth_is_board_or_admin(organization_id))
  WITH CHECK (public.auth_is_board_or_admin(organization_id)
              AND EXISTS (SELECT 1 FROM public.associations a
                           WHERE a.id = association_id
                             AND a.organization_id = compliance_deadlines_done.organization_id));

CREATE POLICY compliance_deadlines_done_delete ON public.compliance_deadlines_done
  FOR DELETE TO authenticated
  USING (public.auth_is_board_or_admin(organization_id));

-- Attribution (security review #2, SEC-N6): through PostgREST a signed-in
-- caller runs as role `authenticated`; for that role done_by is always the
-- caller on INSERT and never changes on UPDATE, whatever the request says.
-- SECURITY INVOKER on purpose: current_user must be the caller's role (a
-- SECURITY DEFINER trigger would see its owner). The service role is left
-- alone. Note: the app's lazy copy of signed acknowledgments runs as the
-- board member whose dashboard copies them, so a copied row's done_by is
-- that board member (done_at keeps the original time; done_by is not shown
-- anywhere).
CREATE OR REPLACE FUNCTION public.compliance_deadlines_done_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF current_user = 'authenticated' THEN
    IF tg_op = 'INSERT' THEN
      new.done_by := auth.uid();
    ELSE
      new.done_by := old.done_by;
    END IF;
  END IF;
  RETURN new;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.compliance_deadlines_done_attribution() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS compliance_deadlines_done_attribution ON public.compliance_deadlines_done;
CREATE TRIGGER compliance_deadlines_done_attribution
  BEFORE INSERT OR UPDATE ON public.compliance_deadlines_done
  FOR EACH ROW EXECUTE FUNCTION public.compliance_deadlines_done_attribution();

COMMIT;
