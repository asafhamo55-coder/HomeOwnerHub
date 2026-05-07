-- 0003_storage_policies.sql
-- Storage RLS for the three Phase 1 buckets.
--
-- Without these, an authenticated user can call .upload() (because the
-- bucket exists) but .createSignedUrl() returns null because there's no
-- SELECT policy on storage.objects for that bucket. The violation wizard
-- silently can't enable its Analyze button in that case (we have a
-- storagePath but no signedUrl), and document uploads land but can't be
-- read back.
--
-- Phase 1 scoping: any authenticated user can read/write any object in
-- these buckets. Org isolation is achieved at the path level (each app
-- writes to {org_id}/{filename}), and the upload routes always stamp the
-- correct org_id from the authenticated user. Phase 2 should tighten
-- this to "owner can only read their own org's prefix" via path parsing.
--
-- Idempotent. Safe to re-run.

DO $$
BEGIN
  -- ── hoa-photos ──────────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_can_read_hoa_photos') THEN
    CREATE POLICY "auth_can_read_hoa_photos"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'hoa-photos');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_can_insert_hoa_photos') THEN
    CREATE POLICY "auth_can_insert_hoa_photos"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'hoa-photos');
  END IF;

  -- ── hoa-documents ───────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_can_read_hoa_documents') THEN
    CREATE POLICY "auth_can_read_hoa_documents"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'hoa-documents');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_can_insert_hoa_documents') THEN
    CREATE POLICY "auth_can_insert_hoa_documents"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'hoa-documents');
  END IF;

  -- ── eviction-docs ───────────────────────────────────────────────────
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_can_read_eviction_docs') THEN
    CREATE POLICY "auth_can_read_eviction_docs"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'eviction-docs');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_can_insert_eviction_docs') THEN
    CREATE POLICY "auth_can_insert_eviction_docs"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'eviction-docs');
  END IF;
END $$;
