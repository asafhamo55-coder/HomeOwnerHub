-- 0075_online_voting.sql
--
-- DRAFT. NOT APPLIED. BL-156 online voting and elections
-- (docs/specs/2026-11-02-online-voting.md). The owner applies it, then a
-- one-line PR flips M10_APPLIED in packages/db/src/m10.ts.
--
-- Secret-ballot design: ballot_voters (who voted, date only) and ballot_box
-- (what was chosen, no user/home/time) are never joined. Both are written in
-- one transaction by cast_ballot() and can never be updated or deleted.
-- Idempotent, one transaction.

BEGIN;

DO $pre$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orgs', 'profiles', 'associations', 'units', 'ownerships', 'hoa_properties',
                           'property_residents', 'hoa_meeting_minutes', 'audit_log'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION '0075: public.% is missing', t;
    END IF;
  END LOOP;
  IF to_regprocedure('public.tenant_fk_same_org()') IS NULL THEN
    RAISE EXCEPTION '0075: apply 0070_tenant_isolation.sql first';
  END IF;
  IF to_regprocedure('public.auth_is_board_or_admin(uuid)') IS NULL
     OR to_regprocedure('public.auth_org_ids()') IS NULL THEN
    RAISE EXCEPTION '0075: an auth helper is missing';
  END IF;
END $pre$;

-- ── 1. ballots ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ballots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id  uuid NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  meeting_id      uuid REFERENCES public.hoa_meeting_minutes(id) ON DELETE RESTRICT,
  kind            text NOT NULL CHECK (kind IN ('election', 'question')),
  title           text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description     text CHECK (description IS NULL OR char_length(description) <= 2000),
  max_selections  smallint NOT NULL DEFAULT 1 CHECK (max_selections BETWEEN 1 AND 25),
  status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed')),
  opens_at        timestamptz,
  closes_at       timestamptz,
  -- The board's acknowledgement that electronic voting is allowed.
  authority_basis        text CHECK (authority_basis IN ('governing_documents', 'state_law', 'both')),
  authority_text_version text CHECK (authority_text_version IS NULL OR char_length(authority_text_version) BETWEEN 1 AND 40),
  authority_ack_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  authority_ack_at       timestamptz,
  opened_at       timestamptz,
  closed_at       timestamptz,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (opens_at IS NULL OR closes_at IS NULL OR closes_at > opens_at),
  CHECK (status = 'draft' OR (opens_at IS NOT NULL AND closes_at IS NOT NULL
         AND authority_basis IS NOT NULL AND authority_text_version IS NOT NULL
         AND authority_ack_at IS NOT NULL AND opened_at IS NOT NULL)),
  CHECK ((status = 'closed') = (closed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ballots_assoc_idx ON public.ballots (association_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ballots_org_status_idx ON public.ballots (organization_id, status);

-- ── 2. ballot_options ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ballot_options (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  ballot_id       uuid NOT NULL REFERENCES public.ballots(id) ON DELETE CASCADE,
  label           text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 120),
  position        smallint NOT NULL CHECK (position >= 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ballot_id, position)
);
CREATE UNIQUE INDEX IF NOT EXISTS ballot_options_label_uniq ON public.ballot_options (ballot_id, lower(label));

-- ── 3. ballot_voters: who voted (never what) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.ballot_voters (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  ballot_id       uuid NOT NULL REFERENCES public.ballots(id) ON DELETE CASCADE,
  property_id     uuid NOT NULL REFERENCES public.hoa_properties(id) ON DELETE RESTRICT,
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  voted_on        date NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date),
  UNIQUE (ballot_id, property_id)
);

-- ── 4. ballot_box: what was chosen (never by whom) ─────────────────────
CREATE TABLE IF NOT EXISTS public.ballot_box (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  ballot_id       uuid NOT NULL REFERENCES public.ballots(id) ON DELETE CASCADE,
  selections      uuid[] NOT NULL CHECK (cardinality(selections) BETWEEN 1 AND 25)
);
CREATE INDEX IF NOT EXISTS ballot_box_ballot_idx ON public.ballot_box (ballot_id);

COMMENT ON TABLE public.ballot_box IS
  '0075: the secret ballots. No user, home or timestamp. No role can SELECT; counts come from ballot_results() after the deadline.';
COMMENT ON TABLE public.ballot_voters IS
  '0075: which home voted and who cast it, date only. Never the choice. Append-only.';

-- ── 5. same-org foreign keys ───────────────────────────────────────────
DO $triggers$
DECLARE
  r record;
  v_name text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('ballots',        'association_id', 'associations',        'organization_id', 'organization_id'),
      ('ballots',        'meeting_id',     'hoa_meeting_minutes', 'org_id',          'organization_id'),
      ('ballot_options', 'ballot_id',      'ballots',             'organization_id', 'organization_id'),
      ('ballot_voters',  'ballot_id',      'ballots',             'organization_id', 'organization_id'),
      ('ballot_voters',  'property_id',    'hoa_properties',      'org_id',          'organization_id'),
      ('ballot_box',     'ballot_id',      'ballots',             'organization_id', 'organization_id')
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

-- ── 6. immutability ────────────────────────────────────────────────────
-- A cascade runs the trigger at depth > 1, but depth alone is not enough: deleting
-- an association (or any trigger-driven delete) also cascades to ballots and would
-- wipe cast votes. The one allowed exception is deleting the whole organization,
-- so the delete must be nested AND the organization row must already be gone
-- (the RI cascade fires after the parent row is deleted). Anything else is refused.
CREATE OR REPLACE FUNCTION public.ballot_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $f$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1
     AND NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = OLD.organization_id) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '%: votes cannot be changed or removed', TG_TABLE_NAME USING errcode = '55000';
END;
$f$;

DROP TRIGGER IF EXISTS ballot_voters_append_only ON public.ballot_voters;
CREATE TRIGGER ballot_voters_append_only BEFORE UPDATE OR DELETE ON public.ballot_voters
  FOR EACH ROW EXECUTE FUNCTION public.ballot_append_only();
DROP TRIGGER IF EXISTS ballot_box_append_only ON public.ballot_box;
CREATE TRIGGER ballot_box_append_only BEFORE UPDATE OR DELETE ON public.ballot_box
  FOR EACH ROW EXECUTE FUNCTION public.ballot_append_only();

-- A ballot box row must be a valid ballot for an open ballot (defence in depth).
CREATE OR REPLACE FUNCTION public.ballot_box_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $f$
DECLARE
  b public.ballots%ROWTYPE;
  v_ok int;
BEGIN
  SELECT * INTO b FROM public.ballots WHERE id = NEW.ballot_id;
  IF NOT FOUND OR b.status <> 'open' OR b.organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'ballot_box: ballot is not open' USING errcode = '55000';
  END IF;
  IF cardinality(NEW.selections) > b.max_selections THEN
    RAISE EXCEPTION 'ballot_box: too many choices' USING errcode = '22023';
  END IF;
  IF (SELECT count(DISTINCT s) FROM unnest(NEW.selections) s) <> cardinality(NEW.selections) THEN
    RAISE EXCEPTION 'ballot_box: duplicate choice' USING errcode = '22023';
  END IF;
  SELECT count(*) INTO v_ok FROM public.ballot_options o
   WHERE o.ballot_id = NEW.ballot_id AND o.id = ANY (NEW.selections);
  IF v_ok <> cardinality(NEW.selections) THEN
    RAISE EXCEPTION 'ballot_box: choice is not on this ballot' USING errcode = '22023';
  END IF;
  RETURN NEW;
END;
$f$;
DROP TRIGGER IF EXISTS ballot_box_validate ON public.ballot_box;
CREATE TRIGGER ballot_box_validate BEFORE INSERT ON public.ballot_box
  FOR EACH ROW EXECUTE FUNCTION public.ballot_box_validate();

-- Options only change while the ballot is a draft.
CREATE OR REPLACE FUNCTION public.ballot_options_frozen()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $f$
DECLARE
  v_status text;
  v_ballot uuid := COALESCE(NEW.ballot_id, OLD.ballot_id);
BEGIN
  -- Nested delete after the ballot itself is gone (a draft ballot removed, or the org).
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1
     AND NOT EXISTS (SELECT 1 FROM public.ballots WHERE id = OLD.ballot_id) THEN
    RETURN OLD;
  END IF;
  SELECT status INTO v_status FROM public.ballots WHERE id = v_ballot;
  IF v_status IS NOT NULL AND v_status <> 'draft' THEN
    RAISE EXCEPTION 'ballot_options: the ballot is open or closed' USING errcode = '55000';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$f$;
DROP TRIGGER IF EXISTS ballot_options_frozen ON public.ballot_options;
CREATE TRIGGER ballot_options_frozen BEFORE INSERT OR UPDATE OR DELETE ON public.ballot_options
  FOR EACH ROW EXECUTE FUNCTION public.ballot_options_frozen();

-- The ballot itself: draft -> open -> closed, nothing else; terms freeze at open.
CREATE OR REPLACE FUNCTION public.ballots_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $f$
DECLARE
  v_opts int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft'
       AND NOT (pg_trigger_depth() > 1 AND NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = OLD.organization_id)) THEN
      RAISE EXCEPTION 'ballots: an opened ballot cannot be deleted' USING errcode = '55000';
    END IF;
    RETURN OLD;
  END IF;
  NEW.updated_at := now();
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'ballots: a ballot starts as a draft' USING errcode = '55000';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = 'draft' AND NEW.status = 'open' THEN
    IF NEW.authority_ack_at IS NULL OR NEW.authority_basis IS NULL OR NEW.authority_text_version IS NULL THEN
      RAISE EXCEPTION 'ballots: the board must acknowledge that electronic voting is allowed' USING errcode = '55000';
    END IF;
    SELECT count(*) INTO v_opts FROM public.ballot_options WHERE ballot_id = NEW.id;
    IF v_opts < 2 OR v_opts <= NEW.max_selections THEN
      RAISE EXCEPTION 'ballots: needs more choices than seats' USING errcode = '22023';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = 'open' AND NEW.status = 'closed' THEN
    IF now() < OLD.closes_at THEN
      RAISE EXCEPTION 'ballots: voting is still open' USING errcode = '55000';
    END IF;
  ELSIF OLD.status <> 'draft' AND NEW.status = OLD.status THEN
    NULL;
  ELSIF NOT (OLD.status = 'draft' AND NEW.status = 'draft') THEN
    RAISE EXCEPTION 'ballots: invalid status change' USING errcode = '55000';
  END IF;
  IF OLD.status <> 'draft' AND (
       NEW.kind IS DISTINCT FROM OLD.kind OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.description IS DISTINCT FROM OLD.description
    OR NEW.max_selections IS DISTINCT FROM OLD.max_selections
    OR NEW.opens_at IS DISTINCT FROM OLD.opens_at OR NEW.closes_at IS DISTINCT FROM OLD.closes_at
    OR NEW.authority_basis IS DISTINCT FROM OLD.authority_basis
    OR NEW.authority_text_version IS DISTINCT FROM OLD.authority_text_version
    OR NEW.authority_ack_by IS DISTINCT FROM OLD.authority_ack_by
    OR NEW.authority_ack_at IS DISTINCT FROM OLD.authority_ack_at
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.association_id IS DISTINCT FROM OLD.association_id
    OR NEW.meeting_id IS DISTINCT FROM OLD.meeting_id) THEN
    RAISE EXCEPTION 'ballots: the terms are fixed once voting opens' USING errcode = '55000';
  END IF;
  RETURN NEW;
END;
$f$;
DROP TRIGGER IF EXISTS ballots_guard ON public.ballots;
CREATE TRIGGER ballots_guard BEFORE INSERT OR UPDATE OR DELETE ON public.ballots
  FOR EACH ROW EXECUTE FUNCTION public.ballots_guard();

-- ── 7. row level security ──────────────────────────────────────────────
ALTER TABLE public.ballots        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ballot_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ballot_voters  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ballot_box     ENABLE ROW LEVEL SECURITY;   -- and no policy: nobody reads it

DROP POLICY IF EXISTS ballots_select ON public.ballots;
CREATE POLICY ballots_select ON public.ballots FOR SELECT TO authenticated
  USING (organization_id = ANY (public.auth_org_ids())
         AND (public.auth_is_board_or_admin(organization_id)
              OR (status <> 'draft'
                  AND association_id = ANY ((SELECT public.poll_resident_association_ids())::uuid[]))));

DROP POLICY IF EXISTS ballot_options_select ON public.ballot_options;
CREATE POLICY ballot_options_select ON public.ballot_options FOR SELECT TO authenticated
  USING (organization_id = ANY (public.auth_org_ids())
         AND (public.auth_is_board_or_admin(organization_id)
              OR EXISTS (SELECT 1 FROM public.ballots b
                          WHERE b.id = ballot_id AND b.status <> 'draft'
                            AND b.association_id = ANY ((SELECT public.poll_resident_association_ids())::uuid[]))));

-- The board sees which homes voted; a voter sees their own row.
DROP POLICY IF EXISTS ballot_voters_select ON public.ballot_voters;
CREATE POLICY ballot_voters_select ON public.ballot_voters FOR SELECT TO authenticated
  USING (organization_id = ANY (public.auth_org_ids())
         AND (public.auth_is_board_or_admin(organization_id) OR user_id = (SELECT auth.uid())));

REVOKE ALL ON public.ballots, public.ballot_options, public.ballot_voters, public.ballot_box FROM PUBLIC, anon;
REVOKE ALL ON public.ballot_box FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.ballots, public.ballot_options, public.ballot_voters FROM authenticated;
GRANT SELECT ON public.ballots, public.ballot_options, public.ballot_voters TO authenticated;

-- ── 8. who may vote ────────────────────────────────────────────────────
-- Owners only (tenants and family members cannot), in a live organization.
CREATE OR REPLACE FUNCTION public.ballot_voter_property_ids()
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(ARRAY(
    SELECT hp.id
      FROM public.ownerships o
      JOIN public.units u ON u.id = o.unit_id AND u.organization_id = o.organization_id
      JOIN public.hoa_properties hp ON hp.id = u.legacy_hoa_property_id AND hp.org_id = u.organization_id
      JOIN public.orgs g ON g.id = hp.org_id
     WHERE auth.uid() IS NOT NULL AND o.owner_user_id = auth.uid() AND o.valid_to IS NULL
       AND o.valid_from <= current_date
       AND hp.deleted_at IS NULL AND g.suspended_at IS NULL AND g.archived_at IS NULL
    UNION
    SELECT hp.id
      FROM public.property_residents pr
      JOIN public.hoa_properties hp ON hp.id = pr.property_id AND hp.org_id = pr.organization_id
      JOIN public.orgs g ON g.id = hp.org_id
     WHERE auth.uid() IS NOT NULL AND pr.role = 'owner' AND pr.moved_out_at IS NULL
       AND NULLIF(pr.email, '') IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.units uu
                    WHERE uu.legacy_hoa_property_id = hp.id AND uu.organization_id = hp.org_id)
       AND hp.deleted_at IS NULL AND g.suspended_at IS NULL AND g.archived_at IS NULL
       AND lower(pr.email) = (SELECT lower(NULLIF(au.email, '')) FROM auth.users au
                               WHERE au.id = auth.uid() AND au.email_confirmed_at IS NOT NULL)
  ), ARRAY[]::uuid[]);
$fn$;

-- ── 9. open_ballot: the board's acknowledgement and the switch ─────────
CREATE OR REPLACE FUNCTION public.open_ballot(p_ballot uuid, p_basis text, p_text_version text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE
  b public.ballots%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'open_ballot: sign in required' USING errcode = '42501';
  END IF;
  SELECT * INTO b FROM public.ballots WHERE id = p_ballot FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'open_ballot: unknown ballot' USING errcode = '23503';
  END IF;
  IF NOT (b.organization_id = ANY (public.auth_org_ids()) AND public.auth_is_board_or_admin(b.organization_id)) THEN
    RAISE EXCEPTION 'open_ballot: board only' USING errcode = '42501';
  END IF;
  IF b.status <> 'draft' THEN
    RAISE EXCEPTION 'open_ballot: already opened' USING errcode = '55000';
  END IF;
  IF p_basis IS NULL OR p_basis NOT IN ('governing_documents', 'state_law', 'both')
     OR p_text_version IS NULL OR char_length(p_text_version) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'open_ballot: acknowledgement required' USING errcode = '22023';
  END IF;
  IF b.opens_at IS NULL OR b.closes_at IS NULL OR b.closes_at <= now() THEN
    RAISE EXCEPTION 'open_ballot: set a voting window that ends in the future' USING errcode = '22023';
  END IF;
  UPDATE public.ballots
     SET status = 'open', opened_at = now(), authority_basis = p_basis,
         authority_text_version = p_text_version, authority_ack_by = auth.uid(), authority_ack_at = now()
   WHERE id = p_ballot;
  INSERT INTO public.audit_log (org_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (b.organization_id, auth.uid(), 'ballot.opened', 'ballot', p_ballot,
          jsonb_build_object('basis', p_basis, 'text_version', p_text_version));
  RETURN jsonb_build_object('status', 'open');
END;
$fn$;

-- ── 10. cast_ballot ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cast_ballot(p_ballot uuid, p_property uuid, p_selections uuid[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE
  b public.ballots%ROWTYPE;
  v_sel uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'cast_ballot: sign in required' USING errcode = '42501';
  END IF;
  SELECT * INTO b FROM public.ballots WHERE id = p_ballot;
  IF NOT FOUND OR NOT (b.organization_id = ANY (public.auth_org_ids())) THEN
    RAISE EXCEPTION 'cast_ballot: unknown ballot' USING errcode = '42501';
  END IF;
  IF b.status <> 'open' OR now() < b.opens_at OR now() >= b.closes_at THEN
    RAISE EXCEPTION 'cast_ballot: ballot_not_open' USING errcode = '55000';
  END IF;
  IF p_property IS NULL OR NOT (p_property = ANY (public.ballot_voter_property_ids())) THEN
    RAISE EXCEPTION 'cast_ballot: not_an_owner_of_this_home' USING errcode = '42501';
  END IF;
  -- A home belongs to one association, and an owner votes only on their own
  -- association's ballot. A home must have a unit record in this ballot's association.
  IF NOT EXISTS (SELECT 1 FROM public.units u WHERE u.legacy_hoa_property_id = p_property
                    AND u.organization_id = b.organization_id AND u.association_id = b.association_id) THEN
    RAISE EXCEPTION 'cast_ballot: not_an_owner_of_this_home' USING errcode = '42501';
  END IF;
  IF p_selections IS NULL OR cardinality(p_selections) NOT BETWEEN 1 AND b.max_selections THEN
    RAISE EXCEPTION 'cast_ballot: bad_choice_count' USING errcode = '22023';
  END IF;
  -- Sorted, so the order the voter clicked in is not kept.
  SELECT array_agg(s ORDER BY s) INTO v_sel FROM unnest(p_selections) s;
  BEGIN
    INSERT INTO public.ballot_voters (organization_id, ballot_id, property_id, user_id)
    VALUES (b.organization_id, p_ballot, p_property, auth.uid());
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'cast_ballot: already_voted' USING errcode = '23505';
  END;
  INSERT INTO public.ballot_box (organization_id, ballot_id, selections)
  VALUES (b.organization_id, p_ballot, v_sel);
  RETURN jsonb_build_object('recorded', true);
END;
$fn$;

-- ── 10b. which of my homes have voted ──────────────────────────────────
-- A co-owner's row in ballot_voters is not theirs to read, so without this a spouse
-- would be shown the vote form for a home that has already voted. Returns only home
-- ids the caller owns, and nothing about who cast the vote or what it was.
CREATE OR REPLACE FUNCTION public.ballot_homes_voted(p_ballot uuid)
RETURNS uuid[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'ballot_homes_voted: sign in required' USING errcode = '42501';
  END IF;
  RETURN COALESCE(ARRAY(
    SELECT v.property_id FROM public.ballot_voters v
     WHERE v.ballot_id = p_ballot
       AND v.organization_id = ANY (public.auth_org_ids())
       AND v.property_id = ANY (public.ballot_voter_property_ids())
  ), ARRAY[]::uuid[]);
END;
$fn$;

-- ── 11. close_ballot and ballot_results ────────────────────────────────
CREATE OR REPLACE FUNCTION public.close_ballot(p_ballot uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE
  b public.ballots%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'close_ballot: sign in required' USING errcode = '42501';
  END IF;
  SELECT * INTO b FROM public.ballots WHERE id = p_ballot FOR UPDATE;
  IF NOT FOUND OR NOT (b.organization_id = ANY (public.auth_org_ids()) AND public.auth_is_board_or_admin(b.organization_id)) THEN
    RAISE EXCEPTION 'close_ballot: board only' USING errcode = '42501';
  END IF;
  IF b.status = 'closed' THEN
    RETURN jsonb_build_object('status', 'closed');
  END IF;
  IF b.status <> 'open' OR now() < b.closes_at THEN
    RAISE EXCEPTION 'close_ballot: voting is still open' USING errcode = '55000';
  END IF;
  UPDATE public.ballots SET status = 'closed', closed_at = now() WHERE id = p_ballot;
  INSERT INTO public.audit_log (org_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (b.organization_id, auth.uid(), 'ballot.closed', 'ballot', p_ballot, '{}'::jsonb);
  RETURN jsonb_build_object('status', 'closed');
END;
$fn$;

CREATE OR REPLACE FUNCTION public.ballot_results(p_ballot uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
DECLARE
  b public.ballots%ROWTYPE;
  v_opts jsonb;
  v_voters int;
  v_box int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'ballot_results: sign in required' USING errcode = '42501';
  END IF;
  SELECT * INTO b FROM public.ballots WHERE id = p_ballot;
  IF NOT FOUND OR NOT (b.organization_id = ANY (public.auth_org_ids()) AND public.auth_is_board_or_admin(b.organization_id)) THEN
    RAISE EXCEPTION 'ballot_results: board only' USING errcode = '42501';
  END IF;
  IF b.status = 'draft' OR now() < b.closes_at THEN
    RAISE EXCEPTION 'ballot_results: results_not_available_until_voting_ends' USING errcode = '55000';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('option_id', o.id, 'label', o.label, 'position', o.position,
           'votes', (SELECT count(*) FROM public.ballot_box x WHERE x.ballot_id = p_ballot AND o.id = ANY (x.selections)))
           ORDER BY o.position), '[]'::jsonb)
    INTO v_opts FROM public.ballot_options o WHERE o.ballot_id = p_ballot;
  SELECT count(*) INTO v_voters FROM public.ballot_voters WHERE ballot_id = p_ballot;
  SELECT count(*) INTO v_box FROM public.ballot_box WHERE ballot_id = p_ballot;
  INSERT INTO public.audit_log (org_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (b.organization_id, auth.uid(), 'ballot.results_viewed', 'ballot', p_ballot, '{}'::jsonb);
  RETURN jsonb_build_object('homes_voted', v_voters, 'ballots_in_box', v_box,
                            'matches', v_voters = v_box, 'options', v_opts);
END;
$fn$;

DO $grants$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.ballot_voter_property_ids()', 'public.open_ballot(uuid,text,text)',
                           'public.cast_ballot(uuid,uuid,uuid[])', 'public.ballot_homes_voted(uuid)', 'public.close_ballot(uuid)',
                           'public.ballot_results(uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $grants$;

COMMIT;
