-- 0086_property_photos.sql  (M20)
--
-- Upload your own house photo. Ships dark: the app ignores all of this until
-- packages/db/src/m20.ts is flipped (OA-55).
--
-- 1. hoa_properties gets three nullable columns for the uploaded photo.
-- 2. A PRIVATE storage bucket, property-photos, holding {org_id}/{property_id}/front.jpg.
-- 3. storage.objects policies, same shape as the hoa-documents ones in
--    0055_storage_org_prefix_scope.sql (they use storage_object_org_id(name)
--    and auth_org_ids()):
--      read   any member of the org
--      write  board or admin of the org, or an owner/resident of that property
-- 4. set_property_photo(property_id, path), SECURITY DEFINER, the ONLY way an
--    owner or resident can touch hoa_properties. It updates just the three
--    photo columns. The existing RLS on hoa_properties is not changed: its
--    INSERT/UPDATE/DELETE policies (0063) stay board-or-admin only, so a
--    resident still cannot write owner_name, notes or anything else directly.
--
-- Idempotent: safe to run twice.

-- 1. Columns -----------------------------------------------------------------
ALTER TABLE public.hoa_properties
  ADD COLUMN IF NOT EXISTS photo_path text NULL,
  ADD COLUMN IF NOT EXISTS photo_updated_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS photo_updated_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.hoa_properties.photo_path IS
  'Storage path in the property-photos bucket ({org_id}/{property_id}/front.jpg), or NULL for Street View.';

-- 2. Private bucket ----------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('property-photos', 'property-photos', false, 5242880, ARRAY['image/jpeg'])
ON CONFLICT (id) DO NOTHING;

-- 3. Storage policies --------------------------------------------------------
-- The property id is segment 2 of the path. Cast only behind a CASE so a
-- malformed name denies the row instead of aborting the whole scan (see 0055).
CREATE OR REPLACE FUNCTION public.property_photo_property_id(object_name text) RETURNS uuid
    LANGUAGE sql IMMUTABLE PARALLEL SAFE SECURITY INVOKER
    AS $$
  SELECT CASE
    WHEN (storage.foldername(object_name))[2] ~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    THEN (storage.foldername(object_name))[2]::uuid
    ELSE NULL
  END
$$;

DROP POLICY IF EXISTS "org_can_read_property_photos"   ON storage.objects;
DROP POLICY IF EXISTS "org_can_insert_property_photos" ON storage.objects;
DROP POLICY IF EXISTS "org_can_update_property_photos" ON storage.objects;
DROP POLICY IF EXISTS "org_can_delete_property_photos" ON storage.objects;

CREATE POLICY "org_can_read_property_photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'property-photos'
  AND public.storage_object_org_id(name) = ANY (public.auth_org_ids())
);

-- Writes are pinned to the one legal name, {org}/{property}/front.jpg, for a
-- home that really belongs to that org. Without the pin a resident could push
-- an unprocessed file (EXIF, a huge or odd image) straight through Storage
-- under any other name, skipping the route's re-encode.
CREATE POLICY "org_can_insert_property_photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'property-photos'
  AND public.storage_object_org_id(name) = ANY (public.auth_org_ids())
  AND (
    public.auth_is_board_or_admin(public.storage_object_org_id(name))
    OR public.property_photo_property_id(name) = ANY (public.auth_resident_property_ids())
  )
  AND name = public.storage_object_org_id(name)::text || '/' || public.property_photo_property_id(name)::text || '/front.jpg'
  AND EXISTS (SELECT 1 FROM public.hoa_properties hp
               WHERE hp.id = public.property_photo_property_id(name)
                 AND hp.org_id = public.storage_object_org_id(name))
);

CREATE POLICY "org_can_update_property_photos"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'property-photos'
  AND public.storage_object_org_id(name) = ANY (public.auth_org_ids())
  AND (
    public.auth_is_board_or_admin(public.storage_object_org_id(name))
    OR public.property_photo_property_id(name) = ANY (public.auth_resident_property_ids())
  )
  AND name = public.storage_object_org_id(name)::text || '/' || public.property_photo_property_id(name)::text || '/front.jpg'
  AND EXISTS (SELECT 1 FROM public.hoa_properties hp
               WHERE hp.id = public.property_photo_property_id(name)
                 AND hp.org_id = public.storage_object_org_id(name))
)
WITH CHECK (
  bucket_id = 'property-photos'
  AND public.storage_object_org_id(name) = ANY (public.auth_org_ids())
  AND (
    public.auth_is_board_or_admin(public.storage_object_org_id(name))
    OR public.property_photo_property_id(name) = ANY (public.auth_resident_property_ids())
  )
  AND name = public.storage_object_org_id(name)::text || '/' || public.property_photo_property_id(name)::text || '/front.jpg'
  AND EXISTS (SELECT 1 FROM public.hoa_properties hp
               WHERE hp.id = public.property_photo_property_id(name)
                 AND hp.org_id = public.storage_object_org_id(name))
);

CREATE POLICY "org_can_delete_property_photos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'property-photos'
  AND public.storage_object_org_id(name) = ANY (public.auth_org_ids())
  AND (
    public.auth_is_board_or_admin(public.storage_object_org_id(name))
    OR public.property_photo_property_id(name) = ANY (public.auth_resident_property_ids())
  )
  AND name = public.storage_object_org_id(name)::text || '/' || public.property_photo_property_id(name)::text || '/front.jpg'
  AND EXISTS (SELECT 1 FROM public.hoa_properties hp
               WHERE hp.id = public.property_photo_property_id(name)
                 AND hp.org_id = public.storage_object_org_id(name))
);

-- 4. The narrow writer -------------------------------------------------------
-- p_path NULL means "remove the photo" (fall back to Street View). A non-NULL
-- path must be exactly {org_id}/{property_id}/front.jpg for THIS property.
CREATE OR REPLACE FUNCTION public.set_property_photo(p_property_id uuid, p_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_org uuid;
BEGIN
  SELECT org_id INTO v_org
    FROM public.hoa_properties
   WHERE id = p_property_id AND deleted_at IS NULL;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'property_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.auth_is_board_or_admin(v_org)
    OR (v_org = ANY (public.auth_org_ids())
        AND p_property_id = ANY (public.auth_resident_property_ids()))
  ) THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  IF p_path IS NOT NULL AND p_path <> v_org::text || '/' || p_property_id::text || '/front.jpg' THEN
    RAISE EXCEPTION 'bad_path' USING ERRCODE = '22023';
  END IF;

  UPDATE public.hoa_properties
     SET photo_path = p_path,
         photo_updated_at = CASE WHEN p_path IS NULL THEN NULL ELSE now() END,
         -- NULL, not an error, for a caller with no profile row (the FK needs one)
         photo_updated_by = CASE WHEN p_path IS NULL THEN NULL
                                 ELSE (SELECT pr.id FROM public.profiles pr WHERE pr.id = auth.uid()) END
   WHERE id = p_property_id;
END
$fn$;

REVOKE ALL ON FUNCTION public.set_property_photo(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_property_photo(uuid, text) TO authenticated, service_role;
