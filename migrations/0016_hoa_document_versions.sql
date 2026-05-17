-- 0010_hoa_document_versions.sql
-- Version history for hoa_documents.
--
-- Each row is a snapshot of an hoa_documents row at the moment it was
-- replaced (or deleted via "delete-but-keep-history" — that pattern
-- can land later). storage_path points at the immutable file in
-- Supabase Storage that existed at snapshot time; replacing the
-- document doesn't touch prior version files so a restore can
-- re-point to them.
--
-- Idempotent. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.hoa_document_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id     uuid NOT NULL REFERENCES public.hoa_documents(id) ON DELETE CASCADE,
  org_id          uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  version_number  integer NOT NULL,                  -- 1-based, monotonic per document_id
  name            text NOT NULL,
  storage_path    text NOT NULL,                      -- old file lives at this path
  file_size       bigint,
  parsed_text     text,
  parsed_at       timestamptz,
  reason          text,                               -- optional manager note ("CC&R update Q2 2026")
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  UNIQUE (document_id, version_number)
);

CREATE INDEX IF NOT EXISTS hoa_document_versions_document_idx
  ON public.hoa_document_versions(document_id, version_number DESC);

ALTER TABLE public.hoa_document_versions ENABLE ROW LEVEL SECURITY;

-- hoa_documents itself is org-scoped via org_id but doesn't carry a
-- canonical RLS policy we can reference here. Delegate by joining to
-- the parent row.
DROP POLICY IF EXISTS org_access ON public.hoa_document_versions;
CREATE POLICY org_access ON public.hoa_document_versions
  USING (
    EXISTS (
      SELECT 1 FROM public.hoa_documents d
       WHERE d.id = hoa_document_versions.document_id
         AND d.org_id = ANY (public.auth_org_ids())
    )
  );
