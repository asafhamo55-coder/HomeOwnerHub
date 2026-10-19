-- BL-088 resident "Meetings and notices": safe-column read for residents.
-- Owner-applied, after 0063 and M1. Once applied, /resident/meetings switches on
-- with no deploy (the app treats a missing function as "not available yet").
-- It returns no raw_transcript, attendees, motions or action items.
CREATE OR REPLACE FUNCTION public.resident_meeting_notices()
RETURNS TABLE (id uuid, org_id uuid, meeting_date date, meeting_type text,
               status text, body text, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id, m.org_id, m.meeting_date, m.meeting_type, m.status,
         CASE WHEN m.status = 'approved' THEN m.ai_summary
              WHEN m.updated_at < (m.meeting_date::timestamp AT TIME ZONE 'UTC') THEN m.ai_summary
         END,
         m.updated_at
    FROM public.hoa_meeting_minutes m
   WHERE m.org_id = ANY (public.auth_org_ids())
     AND m.deleted_at IS NULL
     AND (   (m.status = 'approved' AND m.meeting_date <= current_date + 1)
          OR (m.status = 'draft'    AND m.meeting_date >= current_date - 1));
$$;
REVOKE ALL ON FUNCTION public.resident_meeting_notices() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resident_meeting_notices() TO authenticated, service_role;
NOTIFY pgrst, 'reload schema';
