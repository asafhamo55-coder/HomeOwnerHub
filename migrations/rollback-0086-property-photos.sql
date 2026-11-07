-- rollback-0086-property-photos.sql
--
-- Undoes 0086. Turn M20 off in code first (packages/db/src/m20.ts), or the app
-- will call objects that are gone. The Street View photo then shows again.

DROP FUNCTION IF EXISTS public.set_property_photo(uuid, text);

DROP POLICY IF EXISTS "org_can_read_property_photos"   ON storage.objects;
DROP POLICY IF EXISTS "org_can_insert_property_photos" ON storage.objects;
DROP POLICY IF EXISTS "org_can_update_property_photos" ON storage.objects;
DROP POLICY IF EXISTS "org_can_delete_property_photos" ON storage.objects;

DROP FUNCTION IF EXISTS public.property_photo_property_id(text);

ALTER TABLE public.hoa_properties
  DROP COLUMN IF EXISTS photo_updated_by,
  DROP COLUMN IF EXISTS photo_updated_at,
  DROP COLUMN IF EXISTS photo_path;

-- LAST, by hand: Supabase protects the storage tables, so SQL cannot delete the
-- bucket. In the dashboard open Storage, click property-photos, empty it, then
-- delete the bucket. (Leaving it in place is harmless: nothing points at it.)
