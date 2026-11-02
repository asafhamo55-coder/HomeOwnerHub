-- 0079_mailed_letters.sql
--
-- DRAFT. NOT APPLIED. BL-032 print-and-mail letters for violation and
-- collections letters. The owner applies it, then a one-line PR flips
-- M14_APPLIED in packages/db/src/m14.ts. Until then nothing in the app reads
-- or writes this table.
--
-- One table, one row per letter a board explicitly sent to a print-and-mail
-- provider. It holds the cost the board saw and confirmed, the provider's id
-- and the tracking facts. Written only by the server (service role); board and
-- admin read their own organization's rows. No names, addresses or letter text
-- are stored here: the letter body stays in approval_requests.
--
-- Idempotent and in one transaction.

BEGIN;

DO $pre$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orgs', 'associations', 'approval_requests', 'collection_cases', 'profiles'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION '0079: public.% is missing', t;
    END IF;
  END LOOP;
  IF to_regprocedure('public.tenant_fk_same_org()') IS NULL
     OR to_regprocedure('public.auth_is_board_or_admin(uuid)') IS NULL
     OR to_regprocedure('public.auth_org_ids()') IS NULL THEN
    RAISE EXCEPTION '0079: apply 0070_tenant_isolation.sql first';
  END IF;
END $pre$;

CREATE TABLE IF NOT EXISTS public.mailed_letters (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id        uuid NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  -- The approved letter this send belongs to. One send per approved letter.
  approval_request_id   uuid NOT NULL REFERENCES public.approval_requests(id) ON DELETE RESTRICT,
  collection_case_id    uuid REFERENCES public.collection_cases(id) ON DELETE SET NULL,
  provider              text NOT NULL CHECK (provider IN ('lob', 'postgrid', 'fake')),
  provider_letter_id    text CHECK (provider_letter_id IS NULL OR char_length(provider_letter_id) BETWEEN 1 AND 100),
  mail_method           text NOT NULL CHECK (mail_method IN ('first_class', 'certified', 'certified_return_receipt')),
  color                 boolean NOT NULL DEFAULT false,
  pages                 smallint NOT NULL CHECK (pages BETWEEN 1 AND 60),
  -- Integer cents. The board confirmed exactly this amount before the send.
  quoted_cents          integer NOT NULL CHECK (quoted_cents >= 0),
  confirmed_cents       integer NOT NULL CHECK (confirmed_cents = quoted_cents),
  status                text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'in_transit', 'delivered', 'returned', 'failed')),
  tracking_number       text CHECK (tracking_number IS NULL OR char_length(tracking_number) <= 100),
  expected_delivery_on  date,
  mailed_on             date,
  delivered_on          date,
  confirmed_by          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (delivered_on IS NULL OR mailed_on IS NULL OR delivered_on >= mailed_on),
  UNIQUE (approval_request_id)
);
CREATE INDEX IF NOT EXISTS mailed_letters_org_idx ON public.mailed_letters (organization_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS mailed_letters_provider_id_once
  ON public.mailed_letters (provider, provider_letter_id) WHERE provider_letter_id IS NOT NULL;

COMMENT ON TABLE public.mailed_letters IS
  '0079 (BL-032): one row per approved letter a board confirmed and sent to a print-and-mail provider. Cost in integer cents. No names, addresses or text. Board/admin read; written only by the server (service role).';

CREATE OR REPLACE FUNCTION public.mailed_letters_touch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS mailed_letters_touch ON public.mailed_letters;
CREATE TRIGGER mailed_letters_touch BEFORE UPDATE ON public.mailed_letters
  FOR EACH ROW EXECUTE FUNCTION public.mailed_letters_touch();

-- Same-org guards (AFTER ROW triggers), as 0070/0073.
DO $triggers$
DECLARE
  r record;
  v_name text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('association_id',      'associations'),
      ('approval_request_id', 'approval_requests'),
      ('collection_case_id',  'collection_cases')
    ) v(fk, parent)
  LOOP
    v_name := 'zz_org_fk_mailed_letters_' || r.fk;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.mailed_letters', v_name);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OF %I, organization_id ON public.mailed_letters
         FOR EACH ROW EXECUTE FUNCTION public.tenant_fk_same_org(%L, %L, %L, %L)',
      v_name, r.fk, r.fk, r.parent, 'organization_id', 'organization_id');
  END LOOP;
END $triggers$;

ALTER TABLE public.mailed_letters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mailed_letters_board_select ON public.mailed_letters;
CREATE POLICY mailed_letters_board_select ON public.mailed_letters
  FOR SELECT TO authenticated
  USING (organization_id = ANY (public.auth_org_ids())
         AND public.auth_is_board_or_admin(organization_id));

REVOKE ALL ON public.mailed_letters FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.mailed_letters FROM authenticated;
GRANT SELECT ON public.mailed_letters TO authenticated;

COMMIT;
