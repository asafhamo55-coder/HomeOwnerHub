-- 0074_polls.sql
--
-- DRAFT. NOT APPLIED. B1 surveys and polls (BL-023): the board asks residents a
-- question, residents answer in the portal, the board sees the tally.
-- The owner applies it (runbook: pbcopy the SQL, wait for confirmation), then a
-- one-line PR flips M9_APPLIED in packages/db/src/m9.ts. Until then nothing in
-- the app reads or writes these objects.
--
-- THESE ARE INFORMAL POLLS, NOT VOTES. A poll has no quorum, no proxy, no
-- ballot secrecy promise and no legal effect. A binding election has state
-- rules (for example CA AB 2159) and lives in the elections feature, not here.
-- The app says so on every screen that shows a poll.
--
-- One answer per home: UNIQUE (poll_id, unit_id). Any resident linked to the
-- home can answer or change the answer until the poll closes; the home still has
-- exactly one answer. A person who lives in two homes answers once for each.
--
-- Who can do what:
--   * board/admin of the org: create, edit (while draft), open, close and delete
--     (while draft) polls and their options, through their own session (RLS).
--     They read tallies through poll_results(); they cannot read who answered
--     what, because they have no SELECT on poll_responses.
--   * a resident: reads open and closed polls of their own association, reads
--     their own home's answer, and writes ONLY through submit_poll_response().
--   * nobody has INSERT/UPDATE/DELETE on poll_responses or poll_response_choices
--     through the REST API; the SECURITY DEFINER function is the only writer.
--
-- Idempotent (IF NOT EXISTS / DROP IF EXISTS / OR REPLACE), one transaction.

BEGIN;

-- ── 0. prerequisites ───────────────────────────────────────────────────
DO $pre$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orgs', 'profiles', 'associations', 'units'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION '0074: public.% is missing', t;
    END IF;
  END LOOP;
  IF to_regprocedure('public.tenant_fk_same_org()') IS NULL THEN
    RAISE EXCEPTION '0074: tenant_fk_same_org() is missing; apply 0070_tenant_isolation.sql first';
  END IF;
  IF to_regprocedure('public.auth_is_board_or_admin(uuid)') IS NULL
     OR to_regprocedure('public.auth_org_ids()') IS NULL
     OR to_regprocedure('public.auth_resident_unit_ids()') IS NULL THEN
    RAISE EXCEPTION '0074: an auth helper is missing (0012, 0061, 0070)';
  END IF;
END $pre$;

-- ── 1. polls ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.polls (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id     uuid NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  title              text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 140),
  description        text CHECK (description IS NULL OR char_length(description) <= 2000),
  -- false: pick one. true: pick any number.
  allow_multiple     boolean NOT NULL DEFAULT false,
  -- 'after_close': residents see the tally only once the poll is closed.
  -- 'live': residents see the running tally while it is open.
  -- The board always sees the running tally.
  results_visibility text NOT NULL DEFAULT 'after_close'
    CHECK (results_visibility IN ('after_close', 'live')),
  status             text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'open', 'closed')),
  -- Optional end. A poll past this instant takes no more answers even if the
  -- board has not pressed Close.
  closes_at          timestamptz,
  opened_at          timestamptz,
  closed_at          timestamptz,
  created_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'closed') = (closed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS polls_assoc_status_idx
  ON public.polls (association_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS polls_org_idx ON public.polls (organization_id);

COMMENT ON TABLE public.polls IS
  '0074 (BL-023): informal, non-binding resident polls. Not a legal vote. Board/admin write through RLS; residents read open and closed polls of their own association.';

-- ── 2. poll_options ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.poll_options (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  poll_id          uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  label            text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 140),
  position         smallint NOT NULL CHECK (position BETWEEN 0 AND 19),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (poll_id, position)
);
CREATE INDEX IF NOT EXISTS poll_options_poll_idx ON public.poll_options (poll_id);

COMMENT ON TABLE public.poll_options IS
  '0074: the choices of a poll (2 to 20, enforced when the poll opens). Editable only while the poll is a draft.';

-- ── 3. poll_responses: ONE row per home per poll ───────────────────────
CREATE TABLE IF NOT EXISTS public.poll_responses (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id   uuid NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  poll_id          uuid NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  unit_id          uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  -- Who in the home answered last. Kept for support; the board cannot read it.
  user_id          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (poll_id, unit_id)
);
CREATE INDEX IF NOT EXISTS poll_responses_unit_idx ON public.poll_responses (unit_id);

COMMENT ON TABLE public.poll_responses IS
  '0074: a home''s answer to a poll. UNIQUE (poll_id, unit_id) is the one-answer-per-home rule. Written only by submit_poll_response().';

-- ── 4. poll_response_choices ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.poll_response_choices (
  response_id      uuid NOT NULL REFERENCES public.poll_responses(id) ON DELETE CASCADE,
  option_id        uuid NOT NULL REFERENCES public.poll_options(id) ON DELETE CASCADE,
  organization_id  uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  PRIMARY KEY (response_id, option_id)
);
CREATE INDEX IF NOT EXISTS poll_response_choices_option_idx ON public.poll_response_choices (option_id);

COMMENT ON TABLE public.poll_response_choices IS
  '0074: the option(s) a home picked. Written only by submit_poll_response().';

-- ── 5. triggers ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.polls_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $f$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$f$;

DROP TRIGGER IF EXISTS polls_touch ON public.polls;
CREATE TRIGGER polls_touch BEFORE UPDATE ON public.polls
  FOR EACH ROW EXECUTE FUNCTION public.polls_touch();

-- Lifecycle guard. A poll moves draft -> open -> closed and never back; where
-- it lives never changes; the question's shape is frozen once it is open (so
-- nobody can change "pick one" to "pick many" under people who already
-- answered); a poll cannot open with fewer than two options.
CREATE OR REPLACE FUNCTION public.polls_lifecycle_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $f$
DECLARE
  v_options integer;
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.association_id IS DISTINCT FROM OLD.association_id THEN
    RAISE EXCEPTION 'polls: a poll cannot move to another association' USING errcode = '23514';
  END IF;
  IF OLD.status = 'closed' AND NEW.status <> 'closed' THEN
    RAISE EXCEPTION 'polls: a closed poll cannot be reopened' USING errcode = '23514';
  END IF;
  IF OLD.status = 'open' AND NEW.status = 'draft' THEN
    RAISE EXCEPTION 'polls: an open poll cannot go back to draft' USING errcode = '23514';
  END IF;
  IF OLD.status <> 'draft' AND (
       NEW.allow_multiple IS DISTINCT FROM OLD.allow_multiple
       OR NEW.title IS DISTINCT FROM OLD.title) THEN
    RAISE EXCEPTION 'polls: the question cannot change once the poll is open' USING errcode = '23514';
  END IF;
  IF OLD.status = 'draft' AND NEW.status <> 'draft' THEN
    SELECT count(*) INTO v_options FROM public.poll_options WHERE poll_id = NEW.id;
    IF v_options < 2 THEN
      RAISE EXCEPTION 'polls: a poll needs at least two options before it opens' USING errcode = '23514';
    END IF;
    IF NEW.status = 'open' THEN
      NEW.opened_at := COALESCE(NEW.opened_at, now());
    END IF;
  END IF;
  IF NEW.status = 'closed' AND NEW.closed_at IS NULL THEN
    NEW.closed_at := now();
  END IF;
  RETURN NEW;
END;
$f$;

DROP TRIGGER IF EXISTS polls_lifecycle_guard ON public.polls;
CREATE TRIGGER polls_lifecycle_guard BEFORE UPDATE ON public.polls
  FOR EACH ROW EXECUTE FUNCTION public.polls_lifecycle_guard();

-- A choice must name an option of the SAME poll as its response.
CREATE OR REPLACE FUNCTION public.poll_choice_same_poll()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $f$
DECLARE
  v_resp_poll uuid;
  v_opt_poll  uuid;
BEGIN
  SELECT poll_id INTO v_resp_poll FROM public.poll_responses WHERE id = NEW.response_id;
  SELECT poll_id INTO v_opt_poll FROM public.poll_options WHERE id = NEW.option_id;
  IF v_resp_poll IS NULL OR v_resp_poll IS DISTINCT FROM v_opt_poll THEN
    RAISE EXCEPTION 'poll_response_choices: option is not part of this poll' USING errcode = '23503';
  END IF;
  RETURN NEW;
END;
$f$;

DROP TRIGGER IF EXISTS poll_choice_same_poll ON public.poll_response_choices;
CREATE TRIGGER poll_choice_same_poll BEFORE INSERT OR UPDATE ON public.poll_response_choices
  FOR EACH ROW EXECUTE FUNCTION public.poll_choice_same_poll();

-- Same-org foreign keys (same ratchet as 0072/0073;
-- tests/integration/schema/fk-same-org-ratchet.test.ts).
DO $triggers$
DECLARE
  r record;
  v_name text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('polls',                 'association_id', 'associations',   'organization_id', 'organization_id'),
      ('poll_options',          'poll_id',        'polls',          'organization_id', 'organization_id'),
      ('poll_responses',        'association_id', 'associations',   'organization_id', 'organization_id'),
      ('poll_responses',        'poll_id',        'polls',          'organization_id', 'organization_id'),
      ('poll_responses',        'unit_id',        'units',          'organization_id', 'organization_id'),
      ('poll_response_choices', 'response_id',    'poll_responses', 'organization_id', 'organization_id'),
      ('poll_response_choices', 'option_id',      'poll_options',   'organization_id', 'organization_id')
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

-- ── 6. helper: the associations a resident belongs to ──────────────────
CREATE OR REPLACE FUNCTION public.poll_resident_association_ids()
RETURNS uuid[]
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN ARRAY[]::uuid[];
  END IF;
  RETURN COALESCE(
    ARRAY(SELECT DISTINCT u.association_id
            FROM public.units u
           WHERE u.id = ANY (public.auth_resident_unit_ids())),
    ARRAY[]::uuid[]);
END;
$fn$;

REVOKE ALL ON FUNCTION public.poll_resident_association_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.poll_resident_association_ids() TO authenticated;

-- ── 7. row level security ──────────────────────────────────────────────
ALTER TABLE public.polls                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_options          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_responses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_response_choices ENABLE ROW LEVEL SECURITY;

-- polls: board/admin see everything in their org and write it.
DROP POLICY IF EXISTS polls_board_select ON public.polls;
CREATE POLICY polls_board_select ON public.polls FOR SELECT TO authenticated
  USING (organization_id = ANY (public.auth_org_ids())
         AND public.auth_is_board_or_admin(organization_id));

DROP POLICY IF EXISTS polls_board_insert ON public.polls;
CREATE POLICY polls_board_insert ON public.polls FOR INSERT TO authenticated
  WITH CHECK (organization_id = ANY (public.auth_org_ids())
              AND public.auth_is_board_or_admin(organization_id)
              AND status = 'draft'
              AND created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS polls_board_update ON public.polls;
CREATE POLICY polls_board_update ON public.polls FOR UPDATE TO authenticated
  USING (organization_id = ANY (public.auth_org_ids())
         AND public.auth_is_board_or_admin(organization_id))
  WITH CHECK (organization_id = ANY (public.auth_org_ids())
              AND public.auth_is_board_or_admin(organization_id));

-- Only a draft can be deleted: once residents may have answered, the record stays.
DROP POLICY IF EXISTS polls_board_delete ON public.polls;
CREATE POLICY polls_board_delete ON public.polls FOR DELETE TO authenticated
  USING (organization_id = ANY (public.auth_org_ids())
         AND public.auth_is_board_or_admin(organization_id)
         AND status = 'draft');

-- polls: a resident reads open and closed polls of their own association.
DROP POLICY IF EXISTS polls_resident_select ON public.polls;
CREATE POLICY polls_resident_select ON public.polls FOR SELECT TO authenticated
  USING (organization_id = ANY (public.auth_org_ids())
         AND status IN ('open', 'closed')
         AND association_id = ANY ((SELECT public.poll_resident_association_ids())::uuid[]));

-- poll_options
DROP POLICY IF EXISTS poll_options_board_select ON public.poll_options;
CREATE POLICY poll_options_board_select ON public.poll_options FOR SELECT TO authenticated
  USING (organization_id = ANY (public.auth_org_ids())
         AND public.auth_is_board_or_admin(organization_id));

DROP POLICY IF EXISTS poll_options_resident_select ON public.poll_options;
CREATE POLICY poll_options_resident_select ON public.poll_options FOR SELECT TO authenticated
  USING (organization_id = ANY (public.auth_org_ids())
         AND EXISTS (SELECT 1 FROM public.polls p
                      WHERE p.id = poll_options.poll_id
                        AND p.status IN ('open', 'closed')
                        AND p.association_id = ANY ((SELECT public.poll_resident_association_ids())::uuid[])));

-- Options change only while their poll is a draft.
DROP POLICY IF EXISTS poll_options_board_insert ON public.poll_options;
CREATE POLICY poll_options_board_insert ON public.poll_options FOR INSERT TO authenticated
  WITH CHECK (organization_id = ANY (public.auth_org_ids())
              AND public.auth_is_board_or_admin(organization_id)
              AND EXISTS (SELECT 1 FROM public.polls p
                           WHERE p.id = poll_options.poll_id AND p.status = 'draft'));

DROP POLICY IF EXISTS poll_options_board_update ON public.poll_options;
CREATE POLICY poll_options_board_update ON public.poll_options FOR UPDATE TO authenticated
  USING (organization_id = ANY (public.auth_org_ids())
         AND public.auth_is_board_or_admin(organization_id)
         AND EXISTS (SELECT 1 FROM public.polls p
                      WHERE p.id = poll_options.poll_id AND p.status = 'draft'))
  WITH CHECK (organization_id = ANY (public.auth_org_ids())
              AND public.auth_is_board_or_admin(organization_id));

DROP POLICY IF EXISTS poll_options_board_delete ON public.poll_options;
CREATE POLICY poll_options_board_delete ON public.poll_options FOR DELETE TO authenticated
  USING (organization_id = ANY (public.auth_org_ids())
         AND public.auth_is_board_or_admin(organization_id)
         AND EXISTS (SELECT 1 FROM public.polls p
                      WHERE p.id = poll_options.poll_id AND p.status = 'draft'));

-- poll_responses / poll_response_choices: a resident reads their own home's
-- answer. The board has NO read policy: it sees tallies through poll_results().
DROP POLICY IF EXISTS poll_responses_own_home_select ON public.poll_responses;
CREATE POLICY poll_responses_own_home_select ON public.poll_responses FOR SELECT TO authenticated
  USING (organization_id = ANY (public.auth_org_ids())
         AND unit_id = ANY ((SELECT public.auth_resident_unit_ids())::uuid[]));

DROP POLICY IF EXISTS poll_response_choices_own_home_select ON public.poll_response_choices;
CREATE POLICY poll_response_choices_own_home_select ON public.poll_response_choices FOR SELECT TO authenticated
  USING (organization_id = ANY (public.auth_org_ids())
         AND EXISTS (SELECT 1 FROM public.poll_responses r
                      WHERE r.id = poll_response_choices.response_id
                        AND r.unit_id = ANY ((SELECT public.auth_resident_unit_ids())::uuid[])));

-- Grants. PUBLIC and anon keep nothing. Authenticated writes polls and options
-- (RLS narrows to board/admin) and only reads the answer tables.
REVOKE ALL ON public.polls, public.poll_options, public.poll_responses, public.poll_response_choices
  FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.poll_responses, public.poll_response_choices
  FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.polls, public.poll_options TO authenticated;
GRANT SELECT ON public.poll_responses, public.poll_response_choices TO authenticated;

-- ── 8. submit_poll_response(): the only way an answer is written ───────
-- Replaces the home's earlier answer while the poll is open. Refuses: no
-- signed-in user, a home that is not the caller's, a poll of another
-- association, a poll that is not open or is past its end, no choice, two
-- choices on a pick-one poll, and any option that belongs to another poll.
CREATE OR REPLACE FUNCTION public.submit_poll_response(
  p_poll_id uuid,
  p_unit_id uuid,
  p_option_ids uuid[]
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid      uuid := auth.uid();
  v_poll     public.polls%ROWTYPE;
  v_unit_assoc uuid;
  v_ids      uuid[];
  v_resp     uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'submit_poll_response: sign in first' USING errcode = '42501';
  END IF;
  IF p_unit_id IS NULL OR NOT (p_unit_id = ANY (public.auth_resident_unit_ids())) THEN
    RAISE EXCEPTION 'submit_poll_response: that is not your home' USING errcode = '42501';
  END IF;

  SELECT * INTO v_poll FROM public.polls WHERE id = p_poll_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'submit_poll_response: poll not found' USING errcode = 'P0002';
  END IF;
  SELECT association_id INTO v_unit_assoc FROM public.units WHERE id = p_unit_id;
  IF v_unit_assoc IS DISTINCT FROM v_poll.association_id THEN
    RAISE EXCEPTION 'submit_poll_response: this poll is for another association' USING errcode = '42501';
  END IF;
  IF v_poll.status <> 'open' OR (v_poll.closes_at IS NOT NULL AND v_poll.closes_at <= now()) THEN
    RAISE EXCEPTION 'submit_poll_response: this poll is closed' USING errcode = '55000';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT x), ARRAY[]::uuid[]) INTO v_ids
    FROM unnest(COALESCE(p_option_ids, ARRAY[]::uuid[])) AS x;
  IF cardinality(v_ids) = 0 THEN
    RAISE EXCEPTION 'submit_poll_response: pick an answer' USING errcode = '22023';
  END IF;
  IF NOT v_poll.allow_multiple AND cardinality(v_ids) > 1 THEN
    RAISE EXCEPTION 'submit_poll_response: pick one answer' USING errcode = '22023';
  END IF;
  IF (SELECT count(*) FROM public.poll_options
       WHERE poll_id = p_poll_id AND id = ANY (v_ids)) <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'submit_poll_response: unknown option' USING errcode = '22023';
  END IF;

  INSERT INTO public.poll_responses (organization_id, association_id, poll_id, unit_id, user_id)
  VALUES (v_poll.organization_id, v_poll.association_id, p_poll_id, p_unit_id, v_uid)
  ON CONFLICT (poll_id, unit_id)
  DO UPDATE SET user_id = EXCLUDED.user_id, updated_at = now()
  RETURNING id INTO v_resp;

  DELETE FROM public.poll_response_choices WHERE response_id = v_resp;
  INSERT INTO public.poll_response_choices (response_id, option_id, organization_id)
  SELECT v_resp, x, v_poll.organization_id FROM unnest(v_ids) AS x;

  RETURN v_resp;
END;
$fn$;

REVOKE ALL ON FUNCTION public.submit_poll_response(uuid, uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_poll_response(uuid, uuid, uuid[]) TO authenticated;

-- ── 9. poll_results(): tallies, never names ────────────────────────────
-- Board/admin of the org: always. A resident of the poll's association: only
-- when the poll is visible to them and either live or finished. One row per
-- option, in order; homes_answered repeats on every row.
CREATE OR REPLACE FUNCTION public.poll_results(p_poll_id uuid)
RETURNS TABLE (option_id uuid, label text, option_position smallint, votes bigint, homes_answered bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid  uuid := auth.uid();
  v_poll public.polls%ROWTYPE;
  v_done boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'poll_results: sign in first' USING errcode = '42501';
  END IF;
  SELECT * INTO v_poll FROM public.polls WHERE id = p_poll_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'poll_results: poll not found' USING errcode = 'P0002';
  END IF;
  v_done := v_poll.status = 'closed'
            OR (v_poll.closes_at IS NOT NULL AND v_poll.closes_at <= now());

  IF NOT (v_poll.organization_id = ANY (public.auth_org_ids())
          AND public.auth_is_board_or_admin(v_poll.organization_id)) THEN
    IF NOT (v_poll.organization_id = ANY (public.auth_org_ids())
            AND v_poll.status IN ('open', 'closed')
            AND v_poll.association_id = ANY (public.poll_resident_association_ids())
            AND (v_poll.results_visibility = 'live' OR v_done)) THEN
      RAISE EXCEPTION 'poll_results: not available' USING errcode = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT o.id,
         o.label,
         o.position,
         (SELECT count(*) FROM public.poll_response_choices c WHERE c.option_id = o.id),
         (SELECT count(*) FROM public.poll_responses r WHERE r.poll_id = p_poll_id)
    FROM public.poll_options o
   WHERE o.poll_id = p_poll_id
   ORDER BY o.position;
END;
$fn$;

REVOKE ALL ON FUNCTION public.poll_results(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.poll_results(uuid) TO authenticated;

COMMIT;
