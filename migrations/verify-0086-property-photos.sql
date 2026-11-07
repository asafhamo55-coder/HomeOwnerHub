-- verify-0086-property-photos.sql
--
-- Run AFTER 0086_property_photos.sql. One result set: every row is PASS or FAIL.
-- Read-only: safe to run any number of times.

SELECT 'photo columns exist' AS check,
       CASE WHEN count(*) = 3 THEN 'PASS' ELSE 'FAIL: expected 3, got ' || count(*) END AS result
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'hoa_properties'
  AND column_name IN ('photo_path', 'photo_updated_at', 'photo_updated_by')
  AND is_nullable = 'YES'
UNION ALL
SELECT 'photo_updated_by references profiles, set null on delete',
       CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL: foreign key missing or wrong' END
FROM pg_constraint c
WHERE c.conrelid = 'public.hoa_properties'::regclass AND c.contype = 'f'
  AND c.confrelid = 'public.profiles'::regclass AND c.confdeltype = 'n'
  AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid = 'public.hoa_properties'::regclass AND attname = 'photo_updated_by')]
UNION ALL
SELECT 'bucket exists and is private',
       CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL: property-photos missing or public' END
FROM storage.buckets WHERE id = 'property-photos' AND public = false
UNION ALL
SELECT 'four storage policies on the bucket',
       CASE WHEN count(*) = 4 THEN 'PASS' ELSE 'FAIL: expected 4, got ' || count(*) END
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname IN ('org_can_read_property_photos', 'org_can_insert_property_photos',
                     'org_can_update_property_photos', 'org_can_delete_property_photos')
UNION ALL
SELECT 'every property-photos policy is org scoped',
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL: ' || count(*) || ' policy without auth_org_ids' END
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname IN ('org_can_read_property_photos', 'org_can_insert_property_photos',
                     'org_can_update_property_photos', 'org_can_delete_property_photos')
  AND coalesce(qual, '') || coalesce(with_check, '') NOT LIKE '%auth_org_ids%'
UNION ALL
SELECT 'set_property_photo is security definer with a fixed search_path',
       CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL: missing, not definer or no search_path' END
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'set_property_photo'
  AND p.prosecdef AND p.proconfig::text LIKE '%search_path=public%'
UNION ALL
SELECT 'set_property_photo not callable by anon',
       CASE WHEN NOT has_function_privilege('anon', 'public.set_property_photo(uuid, text)', 'EXECUTE')
             AND has_function_privilege('authenticated', 'public.set_property_photo(uuid, text)', 'EXECUTE')
            THEN 'PASS' ELSE 'FAIL: wrong execute grants' END
UNION ALL
SELECT 'hoa_properties write policies still board or admin only',
       CASE WHEN count(*) = 3 THEN 'PASS' ELSE 'FAIL: expected 3 board-only write policies, got ' || count(*) END
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'hoa_properties' AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
  AND coalesce(qual, '') || coalesce(with_check, '') LIKE '%auth_is_board_or_admin%'
  AND coalesce(qual, '') || coalesce(with_check, '') NOT LIKE '%auth_resident_property_ids%';
