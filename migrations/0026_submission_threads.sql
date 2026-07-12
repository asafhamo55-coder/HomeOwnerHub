-- 0026_submission_threads.sql
-- Two-way message threads for the two resident-submitted queues, so
-- residents can track and discuss their submissions the same way they
-- do support tickets (0024_tickets.sql):
--   - arc_request_messages                → threads on arc_requests
--   - resident_violation_report_messages  → threads on resident_violation_reports
--
-- Mirrors ticket_messages exactly: author_role, an `internal` board-only
-- flag, and the two-policy RLS pattern (resident sees/writes non-internal
-- on their own submission; board/admin see everything in their org).
--
-- Idempotent. Safe to re-run.

-- ─── arc_request_messages ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.arc_request_messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  arc_request_id    uuid NOT NULL REFERENCES public.arc_requests(id) ON DELETE CASCADE,
  author_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_role       text NOT NULL CHECK (author_role IN ('resident', 'board', 'admin')),
  body              text NOT NULL,
  internal          boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS arc_request_messages_request_idx
  ON public.arc_request_messages(arc_request_id, created_at ASC);

-- ─── resident_violation_report_messages ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.resident_violation_report_messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id         uuid NOT NULL REFERENCES public.resident_violation_reports(id) ON DELETE CASCADE,
  author_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_role       text NOT NULL CHECK (author_role IN ('resident', 'board', 'admin')),
  body              text NOT NULL,
  internal          boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS resident_violation_report_messages_report_idx
  ON public.resident_violation_report_messages(report_id, created_at ASC);

-- ─── RLS ────────────────────────────────────────────────────────────
ALTER TABLE public.arc_request_messages                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resident_violation_report_messages   ENABLE ROW LEVEL SECURITY;

-- arc_request_messages: residents see non-internal messages on own request
DROP POLICY IF EXISTS resident_own_arc_messages     ON public.arc_request_messages;
DROP POLICY IF EXISTS board_or_admin_arc_messages   ON public.arc_request_messages;

CREATE POLICY resident_own_arc_messages ON public.arc_request_messages
  FOR ALL
  USING (
    internal = false
    AND EXISTS (
      SELECT 1 FROM public.arc_requests r
      WHERE r.id = arc_request_messages.arc_request_id
        AND r.submitted_by = auth.uid()
        AND r.organization_id = ANY (public.auth_org_ids())
    )
  )
  WITH CHECK (
    internal = false
    AND EXISTS (
      SELECT 1 FROM public.arc_requests r
      WHERE r.id = arc_request_messages.arc_request_id
        AND r.submitted_by = auth.uid()
        AND r.organization_id = ANY (public.auth_org_ids())
    )
  );

CREATE POLICY board_or_admin_arc_messages ON public.arc_request_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.arc_requests r
      WHERE r.id = arc_request_messages.arc_request_id
        AND r.organization_id = ANY (public.auth_org_ids())
        AND public.auth_is_board_or_admin(r.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.arc_requests r
      WHERE r.id = arc_request_messages.arc_request_id
        AND r.organization_id = ANY (public.auth_org_ids())
        AND public.auth_is_board_or_admin(r.organization_id)
    )
  );

-- resident_violation_report_messages: reporter sees non-internal on own report
DROP POLICY IF EXISTS resident_own_report_messages     ON public.resident_violation_report_messages;
DROP POLICY IF EXISTS board_or_admin_report_messages   ON public.resident_violation_report_messages;

CREATE POLICY resident_own_report_messages ON public.resident_violation_report_messages
  FOR ALL
  USING (
    internal = false
    AND EXISTS (
      SELECT 1 FROM public.resident_violation_reports r
      WHERE r.id = resident_violation_report_messages.report_id
        AND r.reported_by = auth.uid()
        AND r.organization_id = ANY (public.auth_org_ids())
    )
  )
  WITH CHECK (
    internal = false
    AND EXISTS (
      SELECT 1 FROM public.resident_violation_reports r
      WHERE r.id = resident_violation_report_messages.report_id
        AND r.reported_by = auth.uid()
        AND r.organization_id = ANY (public.auth_org_ids())
    )
  );

CREATE POLICY board_or_admin_report_messages ON public.resident_violation_report_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.resident_violation_reports r
      WHERE r.id = resident_violation_report_messages.report_id
        AND r.organization_id = ANY (public.auth_org_ids())
        AND public.auth_is_board_or_admin(r.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.resident_violation_reports r
      WHERE r.id = resident_violation_report_messages.report_id
        AND r.organization_id = ANY (public.auth_org_ids())
        AND public.auth_is_board_or_admin(r.organization_id)
    )
  );
