-- 0056_governing_docs_org_scope.sql
--
-- `governing-docs` is a fourth storage bucket, provisioned out of band in
-- production exactly like the three 0003/0055 cover (confirmed via
-- storage.listBuckets() against prod: it exists and holds 2 objects).
-- Unlike those three, NO migration has ever written a policy for it.
-- Under RLS, no policy means deny — every governing-docs operation
-- through a user-scoped client is refused. apps/hoa's upload route
-- (apps/hoa/src/app/api/governing-docs/upload/route.ts:130-141) already
-- tolerates this: a failed upload is logged as a warning and
-- storagePath is nulled rather than failing the request, which is why
-- this has not surfaced as a loud outage — uploads "succeed" with the
-- original file silently absent from Storage.
--
-- Path shape (route.ts:129):
--   `${org.id}/${associationId}/${Date.now()}-${safeName}`
-- Segment 1 is the org id — the standard family public.storage_object_org_id
-- already handles (0055), not the inbox-drafts/<org>/<draft>/ exception.
-- No change to the helper is needed; this file only adds the bucket's
-- policy pair, reusing storage_object_org_id(name) exactly as 0055 does
-- for the other three buckets. Do not write a bare
-- (storage.foldername(name))[1]::uuid cast here — see 0055's comment on
-- why a raising cast inside a policy predicate aborts the query instead
-- of denying just the offending row.

CREATE POLICY "org_can_read_governing_docs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'governing-docs'
  AND public.storage_object_org_id(name) = ANY (public.auth_org_ids())
);

CREATE POLICY "org_can_insert_governing_docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'governing-docs'
  AND public.storage_object_org_id(name) = ANY (public.auth_org_ids())
);
