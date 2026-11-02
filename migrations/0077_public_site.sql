-- 0077_public_site.sql
--
-- DRAFT. NOT APPLIED. BL-038 (B4): a simple public community page per HOA,
-- built from documents and announcements the board explicitly marks public.
-- The owner applies it (runbook: pbcopy the SQL, wait for confirmation), then
-- a one-line PR flips M12_APPLIED in packages/db/src/m12.ts. Until then
-- nothing in the app reads or writes these objects.
--
-- Default is private: no site row means no page; a site row starts with
-- published = false; an item is only on the page because a board member added
-- it. The public page is rendered by the server with the service role from
-- an explicit column list. The web roles (anon, authenticated) have NO write
-- path and anon has no read path at all.
--
-- Idempotent, one transaction.

BEGIN;

DO $pre$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orgs', 'profiles', 'associations', 'hoa_documents', 'governing_documents'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION '0077: public.% is missing', t;
    END IF;
  END LOOP;
  IF to_regprocedure('public.tenant_fk_same_org()') IS NULL THEN
    RAISE EXCEPTION '0077: tenant_fk_same_org() is missing; apply 0070_tenant_isolation.sql first';
  END IF;
  IF to_regprocedure('public.auth_is_board_or_admin(uuid)') IS NULL
     OR to_regprocedure('public.auth_org_ids()') IS NULL THEN
    RAISE EXCEPTION '0077: an auth helper is missing (0012, 0061)';
  END IF;
END $pre$;

-- 1. public_sites: one per association.
CREATE TABLE IF NOT EXISTS public.public_sites (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id  uuid NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  slug            text NOT NULL CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$'),
  published       boolean NOT NULL DEFAULT false,
  title           text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  about           text NOT NULL DEFAULT '' CHECK (char_length(about) <= 4000),
  -- A contact the board chose to show. Never read from member or owner rows.
  contact_email   text CHECK (contact_email IS NULL OR char_length(contact_email) <= 200),
  contact_phone   text CHECK (contact_phone IS NULL OR char_length(contact_phone) <= 40),
  published_at    timestamptz,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (association_id),
  UNIQUE (slug)
);
CREATE INDEX IF NOT EXISTS public_sites_org_idx ON public.public_sites (organization_id);

COMMENT ON TABLE public.public_sites IS
  '0077 (BL-038): the public community page of an association. published = false until a board member publishes. Board/admin read; written only by the server (service role).';

-- 2. public_site_items: what the board put on the page.
-- A document item points at the document (the title is the board's public
-- title). An announcement item is a COPY of the text the board reviewed when
-- they posted it, so later edits to the source message cannot leak.
CREATE TABLE IF NOT EXISTS public.public_site_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  site_id               uuid NOT NULL REFERENCES public.public_sites(id) ON DELETE CASCADE,
  kind                  text NOT NULL CHECK (kind IN ('document', 'announcement')),
  hoa_document_id       uuid REFERENCES public.hoa_documents(id) ON DELETE CASCADE,
  governing_document_id uuid REFERENCES public.governing_documents(id) ON DELETE CASCADE,
  title                 text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  body                  text CHECK (body IS NULL OR char_length(body) <= 8000),
  posted_at             timestamptz NOT NULL DEFAULT now(),
  created_by            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT public_site_items_shape CHECK (
    (kind = 'document'
       AND body IS NULL
       AND ((hoa_document_id IS NOT NULL)::int + (governing_document_id IS NOT NULL)::int) = 1)
    OR
    (kind = 'announcement'
       AND body IS NOT NULL
       AND hoa_document_id IS NULL AND governing_document_id IS NULL)
  ),
  UNIQUE (site_id, hoa_document_id),
  UNIQUE (site_id, governing_document_id)
);
CREATE INDEX IF NOT EXISTS public_site_items_site_idx ON public.public_site_items (site_id, kind, posted_at DESC);
CREATE INDEX IF NOT EXISTS public_site_items_org_idx ON public.public_site_items (organization_id);

COMMENT ON TABLE public.public_site_items IS
  '0077 (BL-038): documents and announcements a board member explicitly put on the public page. Board/admin read; written only by the server (service role).';

-- 3. updated_at and same-org foreign keys
CREATE OR REPLACE FUNCTION public.public_sites_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $f$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$f$;

DROP TRIGGER IF EXISTS public_sites_touch ON public.public_sites;
CREATE TRIGGER public_sites_touch BEFORE UPDATE ON public.public_sites
  FOR EACH ROW EXECUTE FUNCTION public.public_sites_touch();

DO $triggers$
DECLARE
  r record;
  v_name text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public_sites',      'association_id',        'associations',        'organization_id', 'organization_id'),
      ('public_site_items', 'site_id',               'public_sites',        'organization_id', 'organization_id'),
      ('public_site_items', 'hoa_document_id',       'hoa_documents',       'org_id',          'organization_id'),
      ('public_site_items', 'governing_document_id', 'governing_documents', 'organization_id', 'organization_id')
    ) v(child, fk, parent, parent_org, child_org)
  LOOP
    v_name := 'zz_org_fk_' || r.child || '_' || r.fk;
    IF octet_length(v_name) > 63 THEN
      v_name := left(v_name, 54) || '_' || substr(md5(v_name), 1, 8);
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', v_name, r.child);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OF %I, %I ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.tenant_fk_same_org(%L, %L, %L, %L)',
      v_name, r.fk, r.child_org, r.child,
      r.fk, r.parent, r.parent_org, r.child_org);
  END LOOP;
END $triggers$;

-- 4. row level security: board/admin read, nobody writes but the server
ALTER TABLE public.public_sites      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_site_items ENABLE ROW LEVEL SECURITY;

DO $pol$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['public_sites', 'public_site_items'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_board_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
         USING (organization_id = ANY (public.auth_org_ids())
                AND public.auth_is_board_or_admin(organization_id))',
      t || '_board_select', t);
  END LOOP;
END $pol$;

REVOKE ALL ON public.public_sites, public.public_site_items FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.public_sites, public.public_site_items FROM authenticated;
GRANT SELECT ON public.public_sites, public.public_site_items TO authenticated;

COMMIT;
