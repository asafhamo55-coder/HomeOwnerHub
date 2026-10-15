-- 0059_storage_delete_update.sql
--
-- Adds DELETE and UPDATE policies to storage.objects.
--
-- 0003 granted only SELECT and INSERT; 0055/0056 scoped those to the
-- owning org but added nothing else. Under RLS no policy means deny, so
-- every .storage.remove() through a user-scoped client has always deleted
-- nothing — and remove() reports no error when RLS filters every row out,
-- so the callers (documents.ts, submission-attachments.ts, the inbox draft
-- attachment actions, the vendor documents route) never noticed. A
-- document a board "deleted" stayed on disk. upload(..., { upsert: true })
-- over an existing object was refused outright, because upsert needs UPDATE.
--
-- Rule, for all four buckets: the object must belong to one of the
-- caller's orgs (same storage_object_org_id helper as 0055, never a bare
-- cast), and the caller must be board/admin of that org OR the uploader
-- (storage.objects.owner_id, which the Storage API sets to the JWT sub).
-- A resident can clean up their own submission attachment but not a
-- board document.
--
-- UPDATE carries the same expression as WITH CHECK, so move() into
-- another org's prefix is refused: the new name must also resolve to an
-- org the caller administers or the caller must still own it in an org
-- they belong to.
--
-- Idempotent. Runs as ONE statement — see 0048's header.

DO $mig$
BEGIN
  DROP POLICY IF EXISTS "org_can_delete_objects" ON storage.objects;
  DROP POLICY IF EXISTS "org_can_update_objects" ON storage.objects;

  CREATE POLICY "org_can_delete_objects"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id IN ('hoa-photos', 'hoa-documents', 'eviction-docs', 'governing-docs')
    AND public.storage_object_org_id(name) = ANY (public.auth_org_ids())
    AND (
      public.auth_is_board_or_admin(public.storage_object_org_id(name))
      OR owner_id = (auth.uid())::text
    )
  );

  CREATE POLICY "org_can_update_objects"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('hoa-photos', 'hoa-documents', 'eviction-docs', 'governing-docs')
    AND public.storage_object_org_id(name) = ANY (public.auth_org_ids())
    AND (
      public.auth_is_board_or_admin(public.storage_object_org_id(name))
      OR owner_id = (auth.uid())::text
    )
  )
  WITH CHECK (
    bucket_id IN ('hoa-photos', 'hoa-documents', 'eviction-docs', 'governing-docs')
    AND public.storage_object_org_id(name) = ANY (public.auth_org_ids())
    AND (
      public.auth_is_board_or_admin(public.storage_object_org_id(name))
      OR owner_id = (auth.uid())::text
    )
  );

  RAISE NOTICE '0059 ok: storage.objects has org-scoped DELETE and UPDATE.';
END
$mig$;
