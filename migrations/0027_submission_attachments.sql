-- 0027_submission_attachments.sql
-- Document attachments for the resident-submission conversation threads:
--   - arc      → arc_requests
--   - ticket   → tickets
--   - concern  → resident_violation_reports
--
-- Files live in the existing private `hoa-documents` storage bucket under
-- {org_id}/submissions/{thread_type}/{parent_id}/...; this table is the
-- metadata index the UI reads back. Both the board and the resident who
-- owns a submission can attach and read.
--
-- Reuses the storage RLS from 0003_storage_policies.sql (authenticated
-- users can read/insert into hoa-documents); real access control is this
-- table's RLS plus signed URLs generated server-side.
--
-- Idempotent. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.submission_attachments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  thread_type       text NOT NULL CHECK (thread_type IN ('arc', 'ticket', 'concern')),
  parent_id         uuid NOT NULL,          -- arc_request_id / ticket_id / report_id
  storage_path      text NOT NULL,          -- path within the hoa-documents bucket
  file_name         text NOT NULL,
  content_type      text,
  size_bytes        bigint,
  uploaded_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  uploaded_by_role  text NOT NULL CHECK (uploaded_by_role IN ('resident', 'board', 'admin')),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS submission_attachments_parent_idx
  ON public.submission_attachments(thread_type, parent_id, created_at);

ALTER TABLE public.submission_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sa_board_or_admin_all ON public.submission_attachments;
DROP POLICY IF EXISTS sa_resident_read      ON public.submission_attachments;
DROP POLICY IF EXISTS sa_resident_insert    ON public.submission_attachments;

-- Board / admin: full access to attachments in their org.
CREATE POLICY sa_board_or_admin_all ON public.submission_attachments
  FOR ALL
  USING (
    organization_id = ANY (public.auth_org_ids())
    AND public.auth_is_board_or_admin(organization_id)
  )
  WITH CHECK (
    organization_id = ANY (public.auth_org_ids())
    AND public.auth_is_board_or_admin(organization_id)
  );

-- Resident: read attachments on submissions they own.
CREATE POLICY sa_resident_read ON public.submission_attachments
  FOR SELECT
  USING (
    organization_id = ANY (public.auth_org_ids())
    AND (
      (thread_type = 'arc' AND EXISTS (
        SELECT 1 FROM public.arc_requests r
        WHERE r.id = parent_id AND r.submitted_by = auth.uid()))
      OR (thread_type = 'ticket' AND EXISTS (
        SELECT 1 FROM public.tickets t
        WHERE t.id = parent_id AND t.submitted_by = auth.uid()))
      OR (thread_type = 'concern' AND EXISTS (
        SELECT 1 FROM public.resident_violation_reports v
        WHERE v.id = parent_id AND v.reported_by = auth.uid()))
    )
  );

-- Resident: attach to their own submissions, as themselves.
CREATE POLICY sa_resident_insert ON public.submission_attachments
  FOR INSERT
  WITH CHECK (
    organization_id = ANY (public.auth_org_ids())
    AND uploaded_by = auth.uid()
    AND (
      (thread_type = 'arc' AND EXISTS (
        SELECT 1 FROM public.arc_requests r
        WHERE r.id = parent_id AND r.submitted_by = auth.uid()))
      OR (thread_type = 'ticket' AND EXISTS (
        SELECT 1 FROM public.tickets t
        WHERE t.id = parent_id AND t.submitted_by = auth.uid()))
      OR (thread_type = 'concern' AND EXISTS (
        SELECT 1 FROM public.resident_violation_reports v
        WHERE v.id = parent_id AND v.reported_by = auth.uid()))
    )
  );
