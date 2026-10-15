-- 0055_storage_org_prefix_scope.sql
--
-- Scopes the three storage buckets to the owning tenant.
--
-- 0003_storage_policies.sql is the only file in this repo that touches
-- storage.objects, and all six of its policies look like:
--
--   CREATE POLICY "auth_can_read_hoa_documents"
--   ON storage.objects FOR SELECT TO authenticated
--   USING (bucket_id = 'hoa-documents');
--
-- The sole predicate is which bucket, never which org. Any authenticated
-- user of any HOA could read — and, via the equally unscoped INSERT
-- policies, write — every other HOA's governing documents, violation
-- photos, and eviction filings. Isolation rested on nobody guessing a
-- path. 0003's own comment defers this to a "Phase 2" that never came.
--
-- Every object path in this codebase begins with the org id, so the fix
-- is to require that the first path segment is an org the caller belongs
-- to. storage.foldername(name) returns the path segments as an array;
-- [1] is the first.
--
-- public.auth_org_ids() (migrations/0000_schema.sql:36-43) returns the
-- caller's org ids and is already the predicate used by nearly every
-- table policy, so this makes storage consistent with the rest of the
-- schema rather than inventing a new rule.
--
-- GUARD FORM: a non-UUID prefix must not break the query. Local
-- storage.objects is currently empty (verified via
-- `select (storage.foldername(name))[1] from storage.objects`), but
-- production cannot be inspected from here, and a bad row reaching this
-- table by any path other than the app's own upload routes — a manual
-- insert, a future bucket, a path convention change — would otherwise
-- turn `(storage.foldername(name))[1]::uuid` into a hard error for every
-- row in the scan, not just a denial of the offending one.
--
-- A regex guard placed before the cast inside a plain AND is NOT
-- sufficient: Postgres does not guarantee left-to-right evaluation of
-- AND clauses in a policy predicate, so the planner is free to try the
-- cast first and still raise. CASE WHEN ... THEN ... ELSE ... END *is*
-- guaranteed to evaluate in order and short-circuit, so the guard lives
-- there, wrapped in a small SECURITY INVOKER helper so it is written
-- once rather than six times and reads the same way auth_org_ids() does.

-- Two path shapes exist, and missing the second one denies a live feature.
-- Six of the seven upload call sites lead with the org id:
--     <org>/<file>, <org>/vendors/..., <org>/submissions/..., <org>/inbox/...
-- One does not. apps/hoa/src/lib/inbox/draft/attachment-actions.ts:116 mints
--     inbox-drafts/<org>/<draft>/<uuid>
-- in the hoa-documents bucket, through a USER-scoped client, and that
-- convention is load-bearing elsewhere: resolveUploadPath validates it
-- (attachment-actions.ts:47) and migration 0040 encodes it as
-- starts_with(storage_path, 'inbox-drafts/' || organization_id::text || '/').
-- So the org id is segment 2 there, and a segment-1-only helper returns NULL,
-- which under RLS means denied — breaking every inbox draft attachment and
-- hiding already-attached files from existing drafts.
-- `inbox-drafts` is the ONLY literal-prefixed family; verified by grepping
-- every storage path template in apps/ and packages/.

CREATE OR REPLACE FUNCTION public.storage_object_org_id(object_name text) RETURNS uuid
    LANGUAGE sql IMMUTABLE PARALLEL SAFE SECURITY INVOKER
    AS $$
  SELECT CASE
    -- Literal-prefixed family: org id is the second segment.
    WHEN (storage.foldername(object_name))[1] = 'inbox-drafts'
     AND (storage.foldername(object_name))[2] ~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    THEN (storage.foldername(object_name))[2]::uuid
    -- Everything else: org id leads the path.
    WHEN (storage.foldername(object_name))[1] ~
         '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    THEN (storage.foldername(object_name))[1]::uuid
    ELSE NULL
  END
$$;

COMMENT ON FUNCTION public.storage_object_org_id(text) IS
  'Returns the owning org id for a storage object name, or NULL if the path '
  'carries none. Reads segment 2 for the inbox-drafts/<org>/<draft>/ family '
  'and segment 1 otherwise. Used by the storage.objects '
  'RLS policies below instead of a bare cast, because a cast that raises '
  'inside a policy predicate aborts the whole query rather than denying '
  'just the offending row, and Postgres does not guarantee that an AND '
  'guard runs before the cast it is meant to protect.';

-- Drop the unscoped policies.
DROP POLICY IF EXISTS "auth_can_read_hoa_photos"      ON storage.objects;
DROP POLICY IF EXISTS "auth_can_insert_hoa_photos"    ON storage.objects;
DROP POLICY IF EXISTS "auth_can_read_hoa_documents"   ON storage.objects;
DROP POLICY IF EXISTS "auth_can_insert_hoa_documents" ON storage.objects;
DROP POLICY IF EXISTS "auth_can_read_eviction_docs"   ON storage.objects;
DROP POLICY IF EXISTS "auth_can_insert_eviction_docs" ON storage.objects;

-- Recreate them org-scoped. One pair per bucket, matching the original
-- structure so a reader can diff 0003 against this file directly.

CREATE POLICY "org_can_read_hoa_photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'hoa-photos'
  AND public.storage_object_org_id(name) = ANY (public.auth_org_ids())
);

CREATE POLICY "org_can_insert_hoa_photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'hoa-photos'
  AND public.storage_object_org_id(name) = ANY (public.auth_org_ids())
);

CREATE POLICY "org_can_read_hoa_documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'hoa-documents'
  AND public.storage_object_org_id(name) = ANY (public.auth_org_ids())
);

CREATE POLICY "org_can_insert_hoa_documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'hoa-documents'
  AND public.storage_object_org_id(name) = ANY (public.auth_org_ids())
);

CREATE POLICY "org_can_read_eviction_docs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'eviction-docs'
  AND public.storage_object_org_id(name) = ANY (public.auth_org_ids())
);

CREATE POLICY "org_can_insert_eviction_docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'eviction-docs'
  AND public.storage_object_org_id(name) = ANY (public.auth_org_ids())
);
