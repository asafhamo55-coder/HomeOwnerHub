-- rollback-0086-property-photos.sql
--
-- Undoes 0086. Turn M20 off in code first (packages/db/src/m20.ts), or the app
-- will call objects that are gone. Uploaded files in the bucket are lost; the
-- Street View photo then shows again.

DROP FUNCTION IF EXISTS public.set_property_photo(uuid, text);

DROP POLICY IF EXISTS "org_can_read_property_photos"   ON storage.objects;
DROP POLICY IF EXISTS "org_can_insert_property_photos" ON storage.objects;
DROP POLICY IF EXISTS "org_can_update_property_photos" ON storage.objects;
DROP POLICY IF EXISTS "org_can_delete_property_photos" ON storage.objects;

DROP FUNCTION IF EXISTS public.property_photo_property_id(text);

-- Supabase will not delete a bucket that still holds files. If the next line
-- fails, empty the bucket in the dashboard (Storage, property-photos, select
-- all, Delete) and run it again.
DELETE FROM storage.buckets WHERE id = 'property-photos';

ALTER TABLE public.hoa_properties
  DROP COLUMN IF EXISTS photo_updated_by,
  DROP COLUMN IF EXISTS photo_updated_at,
  DROP COLUMN IF EXISTS photo_path;
