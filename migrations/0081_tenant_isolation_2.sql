-- 0081_tenant_isolation_2.sql: second tenant-isolation pass for tables that are live
--
-- Needs 0063, 0064, 0070, 0071 and 0078 (community_board_association_ids), all
-- asserted below. Every statement is idempotent; any failed assertion raises and
-- rolls the whole file back.
--
-- WHAT THIS DOES
--
--   1. associations_select: board and admin read every association of their org;
--      a resident reads only the associations they live in.
--   2. governing_documents_select and governing_document_chunks_select: the
--      resident branch also needs the document's association to be one of theirs.
--      A document with no association stays org-wide. The governing-docs storage
--      policy (0064) reads through governing_documents under the caller's own
--      RLS, so it follows without change. hoa_documents has no association
--      column: it stays org-wide by design.
--   3. sa_resident_insert: the storage path must be exactly
--      <org>/submissions/<thread_type>/<parent_id>/<one file name>, with no
--      slash, backslash, control character or dot segment in the file name.
--   4. eviction_cases, pm_properties, pm_rent_ledger: the FOR ALL org_access
--      policy is replaced by a board or admin policy.
--
--   5. communications.audience_definition: the board reads it through the same
--      database role as residents, so a column privilege cannot separate them.
--      The application no longer stores contact lists in it (stripAudienceForPersist).
--      This file scrubs the rows written before that fix, keeping only kind, the
--      count (extra.count) and official_notice, then adds a CHECK constraint so
--      the keys emails, phones, emailNames and recipients cannot come back.
--      Nothing reads those keys back: the dispatcher reads kind and official_notice,
--      the detail page reads kind (and ownersOnly) via followUpAudience, and
--      delivery reads communication_recipients. A draft keeps its composer state
--      under the 'composer' key, which the constraint does not touch.

BEGIN;

DO $pre$
BEGIN
  IF to_regprocedure('public.community_board_association_ids()') IS NULL THEN
    RAISE EXCEPTION '0081: apply 0078 first (community_board_association_ids missing)';
  END IF;
  IF to_regprocedure('public.auth_is_board_or_admin(uuid)') IS NULL
     OR to_regprocedure('public.auth_org_ids()') IS NULL THEN
    RAISE EXCEPTION '0081: auth helpers missing';
  END IF;
END $pre$;

-- 1. associations ---------------------------------------------------------
DROP POLICY IF EXISTS associations_select ON public.associations;
CREATE POLICY associations_select ON public.associations FOR SELECT TO authenticated
  USING (
    public.auth_is_board_or_admin(organization_id)
    OR (organization_id = ANY (public.auth_org_ids())
        AND id = ANY ((SELECT public.community_board_association_ids())::uuid[]))
  );

-- 2. governing documents and their chunks ------------------------------------
DROP POLICY IF EXISTS governing_documents_select ON public.governing_documents;
CREATE POLICY governing_documents_select ON public.governing_documents FOR SELECT TO authenticated
  USING (
    public.auth_is_board_or_admin(organization_id)
    OR (organization_id = ANY (public.auth_org_ids())
        AND (type::text IN ('declaration', 'bylaws', 'rules', 'amendment', 'policy') OR visible_to_owners)
        AND superseded_at IS NULL AND ai_generated IS NOT TRUE
        AND (association_id IS NULL
             OR association_id = ANY ((SELECT public.community_board_association_ids())::uuid[])))
  );

DROP POLICY IF EXISTS governing_document_chunks_select ON public.governing_document_chunks;
CREATE POLICY governing_document_chunks_select ON public.governing_document_chunks FOR SELECT TO authenticated
  USING (
    public.auth_is_board_or_admin(organization_id)
    OR (organization_id = ANY (public.auth_org_ids())
        AND EXISTS (SELECT 1 FROM public.governing_documents d
                     WHERE d.id = governing_document_chunks.document_id
                       AND d.organization_id = governing_document_chunks.organization_id
                       AND (d.type::text IN ('declaration', 'bylaws', 'rules', 'amendment', 'policy') OR d.visible_to_owners)
                       AND d.superseded_at IS NULL AND d.ai_generated IS NOT TRUE
                       AND (d.association_id IS NULL
                            OR d.association_id = ANY ((SELECT public.community_board_association_ids())::uuid[]))))
  );

-- 3. submission attachments -----------------------------------------------
DROP POLICY IF EXISTS sa_resident_insert ON public.submission_attachments;
CREATE POLICY sa_resident_insert ON public.submission_attachments
  FOR INSERT
  WITH CHECK (
    organization_id = ANY (public.auth_org_ids())
    AND uploaded_by = auth.uid()
    AND starts_with(storage_path,
          organization_id::text || '/submissions/' || thread_type || '/' || parent_id::text || '/')
    AND length(storage_path) > length(
          organization_id::text || '/submissions/' || thread_type || '/' || parent_id::text || '/')
    AND substr(storage_path, length(
          organization_id::text || '/submissions/' || thread_type || '/' || parent_id::text || '/') + 1)
        !~ '[/\\[:cntrl:]]'
    AND substr(storage_path, length(
          organization_id::text || '/submissions/' || thread_type || '/' || parent_id::text || '/') + 1)
        NOT IN ('.', '..')
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

-- 4. pm and eviction tables -----------------------------------------------
DROP POLICY IF EXISTS org_access ON public.eviction_cases;
DROP POLICY IF EXISTS eviction_cases_board_all ON public.eviction_cases;
CREATE POLICY eviction_cases_board_all ON public.eviction_cases FOR ALL TO authenticated
  USING (public.auth_is_board_or_admin(org_id))
  WITH CHECK (public.auth_is_board_or_admin(org_id));

DROP POLICY IF EXISTS org_access ON public.pm_properties;
DROP POLICY IF EXISTS pm_properties_board_all ON public.pm_properties;
CREATE POLICY pm_properties_board_all ON public.pm_properties FOR ALL TO authenticated
  USING (public.auth_is_board_or_admin(org_id))
  WITH CHECK (public.auth_is_board_or_admin(org_id));

DROP POLICY IF EXISTS org_access ON public.pm_rent_ledger;
DROP POLICY IF EXISTS pm_rent_ledger_board_all ON public.pm_rent_ledger;
CREATE POLICY pm_rent_ledger_board_all ON public.pm_rent_ledger FOR ALL TO authenticated
  USING (public.auth_is_board_or_admin(org_id))
  WITH CHECK (public.auth_is_board_or_admin(org_id));

-- 5. audience_definition holds no contact lists ------------------------------
-- One-time scrub. A manual_emails row is rebuilt from kind, its count and
-- official_notice; any other row with a contact key just loses those keys.
UPDATE public.communications c
   SET audience_definition = CASE
     WHEN audience_definition ->> 'kind' = 'manual_emails' THEN
       jsonb_strip_nulls(jsonb_build_object(
         'kind', 'manual_emails',
         'extra', jsonb_build_object('count', coalesce(
            CASE WHEN jsonb_typeof(audience_definition -> 'extra' -> 'count') = 'number'
                 THEN (audience_definition -> 'extra' ->> 'count')::int END,
            greatest(
              CASE WHEN jsonb_typeof(audience_definition -> 'emails') = 'array'
                   THEN jsonb_array_length(audience_definition -> 'emails') ELSE 0 END,
              CASE WHEN jsonb_typeof(audience_definition -> 'phones') = 'array'
                   THEN jsonb_array_length(audience_definition -> 'phones') ELSE 0 END))),
         'official_notice', audience_definition -> 'official_notice'))
     ELSE audience_definition - 'emails' - 'phones' - 'emailNames' - 'recipients'
   END
 WHERE audience_definition ->> 'kind' = 'manual_emails'
    OR audience_definition ?| ARRAY['emails', 'phones', 'emailNames', 'recipients'];

ALTER TABLE public.communications DROP CONSTRAINT IF EXISTS communications_audience_no_contacts;
ALTER TABLE public.communications ADD CONSTRAINT communications_audience_no_contacts
  CHECK (NOT (audience_definition ?| ARRAY['emails', 'phones', 'emailNames', 'recipients']));

-- post-checks ---------------------------------------------------------------
DO $post$
BEGIN
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'associations'
         AND cmd IN ('SELECT', 'ALL')) <> 1 THEN
    RAISE EXCEPTION '0081: associations must have exactly one read policy';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
              AND tablename IN ('eviction_cases', 'pm_properties', 'pm_rent_ledger')
              AND coalesce(qual, '') NOT LIKE '%auth_is_board_or_admin%') THEN
    RAISE EXCEPTION '0081: a pm or eviction policy is not board or admin only';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'governing_documents'
                  AND policyname = 'governing_documents_select' AND qual LIKE '%community_board_association_ids%') THEN
    RAISE EXCEPTION '0081: governing_documents_select not rewritten';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.communications'::regclass
                    AND conname = 'communications_audience_no_contacts') THEN
    RAISE EXCEPTION '0081: audience_definition contact-key constraint missing';
  END IF;
  RAISE NOTICE '0081 ok: tenant isolation pass 2 applied.';
END $post$;

COMMIT;
