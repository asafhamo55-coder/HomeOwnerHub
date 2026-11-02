-- 0076_amenity_reservations.sql
--
-- DRAFT. NOT APPLIED. BL-034 amenity reservations (clubhouse, pool pavilion,
-- tennis court ...). The owner applies it (runbook: pbcopy the SQL, wait for
-- confirmation), then a one-line PR flips M11_APPLIED in packages/db/src/m11.ts.
-- Until then nothing in the app reads or writes these objects.
--
-- Idempotent (IF NOT EXISTS / DROP IF EXISTS / OR REPLACE), one transaction.
--
-- What it adds:
--   1. amenities              what the board offers and its rules: opening
--                             hours, longest booking, how far ahead, bookings
--                             per home, and whether the board must approve.
--   2. amenity_reservations   one row per request. status machine:
--                               pending -> approved | denied | canceled
--                               approved -> canceled
--   3. amenity_reservation_no_overlap(): the double-booking guard. A pending or
--      approved booking holds its time; a second one that overlaps it is
--      refused with SQLSTATE 23P01 (exclusion_violation), whatever the app does.
--
-- No money. Fees and deposits are out of scope for this version (they wait for
-- online payments, BL-035), so there is no amount column here.
--
-- Writes: the web roles can read what they should and can write NOTHING; every
-- write goes through the server with the service role (same shape as 0073).

BEGIN;

-- ── 0. prerequisites ───────────────────────────────────────────────────
DO $pre$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orgs', 'profiles', 'associations', 'units'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION '0076: public.% is missing', t;
    END IF;
  END LOOP;
  IF to_regprocedure('public.tenant_fk_same_org()') IS NULL THEN
    RAISE EXCEPTION '0076: tenant_fk_same_org() is missing; apply 0070_tenant_isolation.sql first';
  END IF;
  IF to_regprocedure('public.auth_is_board_or_admin(uuid)') IS NULL
     OR to_regprocedure('public.auth_org_ids()') IS NULL
     OR to_regprocedure('public.auth_resident_unit_ids()') IS NULL THEN
    RAISE EXCEPTION '0076: an auth helper is missing (0012, 0061, 0070)';
  END IF;
END $pre$;

-- ── 1. amenities ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.amenities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id   uuid NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  name             text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  description      text CHECK (description IS NULL OR char_length(description) <= 1000),
  -- The house rules a resident reads before booking (free text, board-written).
  rules            text CHECK (rules IS NULL OR char_length(rules) <= 4000),
  -- true: a booking waits for the board; false: it is confirmed at once.
  requires_approval boolean NOT NULL DEFAULT true,
  -- Bookable hours in the association's local time. Whole hours: 8 to 22 is
  -- 8:00 AM to 10:00 PM. close_hour 24 means midnight.
  open_hour        smallint NOT NULL DEFAULT 8  CHECK (open_hour BETWEEN 0 AND 23),
  close_hour       smallint NOT NULL DEFAULT 22 CHECK (close_hour BETWEEN 1 AND 24),
  -- Longest single booking, in hours.
  max_hours        smallint NOT NULL DEFAULT 4  CHECK (max_hours BETWEEN 1 AND 24),
  -- How many days ahead a resident may book.
  advance_days     smallint NOT NULL DEFAULT 60 CHECK (advance_days BETWEEN 1 AND 365),
  -- How many pending or approved future bookings one home may hold.
  max_active_per_unit smallint NOT NULL DEFAULT 2 CHECK (max_active_per_unit BETWEEN 1 AND 20),
  is_active        boolean NOT NULL DEFAULT true,
  created_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (close_hour > open_hour),
  CHECK (max_hours <= close_hour - open_hour)
);
CREATE INDEX IF NOT EXISTS amenities_assoc_idx
  ON public.amenities (association_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS amenities_org_idx
  ON public.amenities (organization_id);

COMMENT ON TABLE public.amenities IS
  '0076 (BL-034): what the board lets residents book, with its rules. Members of the org read; written only by the server (service role).';

-- ── 2. amenity_reservations ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.amenity_reservations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id   uuid NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  amenity_id       uuid NOT NULL REFERENCES public.amenities(id) ON DELETE CASCADE,
  unit_id          uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  requested_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  starts_at        timestamptz NOT NULL,
  ends_at          timestamptz NOT NULL,
  status           text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied', 'canceled')),
  -- What the resident is booking it for ("birthday party, about 20 people").
  purpose          text CHECK (purpose IS NULL OR char_length(purpose) <= 500),
  -- The board's reason, shown to the resident (always for a denial).
  decision_note    text CHECK (decision_note IS NULL OR char_length(decision_note) <= 500),
  decided_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at       timestamptz,
  canceled_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  canceled_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK (ends_at - starts_at <= interval '24 hours'),
  CHECK ((status = 'canceled') = (canceled_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS amenity_reservations_amenity_time_idx
  ON public.amenity_reservations (amenity_id, starts_at)
  WHERE status IN ('pending', 'approved');
CREATE INDEX IF NOT EXISTS amenity_reservations_unit_idx
  ON public.amenity_reservations (unit_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS amenity_reservations_assoc_status_idx
  ON public.amenity_reservations (association_id, status, starts_at);

COMMENT ON TABLE public.amenity_reservations IS
  '0076 (BL-034): one row per booking request. A pending or approved row holds its time; the trigger amenity_reservation_no_overlap refuses an overlap. Board reads the association''s rows; a resident reads their home''s. Written only by the server.';

-- ── 3. updated_at ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.amenities_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $f$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$f$;

DO $touch$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['amenities', 'amenity_reservations'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_touch', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.amenities_touch()',
                   t || '_touch', t);
  END LOOP;
END $touch$;

-- ── 4. no double booking ───────────────────────────────────────────────
-- A pending or approved booking holds its time. Two requests for the same
-- amenity that overlap cannot both be stored, however they arrive: the
-- transaction takes a lock on the amenity first, so two requests that race
-- are checked one after the other, and the second sees the first.
-- Back-to-back bookings (one ends when the next starts) are allowed.
--
-- Invoker rights on purpose: it is a trigger, never called directly, and the
-- writes come from the service role, which sees every row. EXECUTE is revoked
-- from the web roles anyway.
CREATE OR REPLACE FUNCTION public.amenity_reservation_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.status NOT IN ('pending', 'approved') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.status IN ('pending', 'approved')
     AND OLD.amenity_id = NEW.amenity_id
     AND OLD.starts_at = NEW.starts_at
     AND OLD.ends_at = NEW.ends_at THEN
    RETURN NEW;   -- same slot, still holding it (approve, edit a note): nothing new to check
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('amenity_reservation:' || NEW.amenity_id::text, 0));

  IF EXISTS (
    SELECT 1
      FROM public.amenity_reservations r
     WHERE r.amenity_id = NEW.amenity_id
       AND r.id <> NEW.id
       AND r.status IN ('pending', 'approved')
       AND r.starts_at < NEW.ends_at
       AND r.ends_at   > NEW.starts_at
  ) THEN
    RAISE EXCEPTION 'amenity_slot_taken'
      USING ERRCODE = '23P01',
            DETAIL = 'Another pending or approved booking overlaps this time.';
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.amenity_reservation_no_overlap() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS amenity_reservations_no_overlap ON public.amenity_reservations;
CREATE TRIGGER amenity_reservations_no_overlap
  BEFORE INSERT OR UPDATE OF status, amenity_id, starts_at, ends_at ON public.amenity_reservations
  FOR EACH ROW EXECUTE FUNCTION public.amenity_reservation_no_overlap();

-- ── 5. same-org foreign keys ───────────────────────────────────────────
-- A row can never point at an association, amenity or home of another
-- organization (tests/integration/schema/fk-same-org-ratchet.test.ts).
DO $triggers$
DECLARE
  r record;
  v_name text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('amenities',             'association_id', 'associations', 'organization_id', 'organization_id'),
      ('amenity_reservations',  'association_id', 'associations', 'organization_id', 'organization_id'),
      ('amenity_reservations',  'amenity_id',     'amenities',    'organization_id', 'organization_id'),
      ('amenity_reservations',  'unit_id',        'units',        'organization_id', 'organization_id')
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

-- ── 6. row level security ──────────────────────────────────────────────
-- Read-only for the web roles. There is deliberately no INSERT/UPDATE/DELETE
-- policy: a resident's own session can never edit a booking through the REST
-- API. The server checks who is asking, then writes with the service role.
ALTER TABLE public.amenities            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.amenity_reservations ENABLE ROW LEVEL SECURITY;

-- any member of the org reads the amenities (a resident needs them to book)
DROP POLICY IF EXISTS amenities_member_select ON public.amenities;
CREATE POLICY amenities_member_select ON public.amenities
  FOR SELECT TO authenticated
  USING (organization_id = ANY (public.auth_org_ids()));

-- board / admin read every booking of their org
DROP POLICY IF EXISTS amenity_reservations_board_select ON public.amenity_reservations;
CREATE POLICY amenity_reservations_board_select ON public.amenity_reservations
  FOR SELECT TO authenticated
  USING (organization_id = ANY (public.auth_org_ids())
         AND public.auth_is_board_or_admin(organization_id));

-- a resident reads their own home's bookings
DROP POLICY IF EXISTS amenity_reservations_resident_select ON public.amenity_reservations;
CREATE POLICY amenity_reservations_resident_select ON public.amenity_reservations
  FOR SELECT TO authenticated
  USING (organization_id = ANY (public.auth_org_ids())
         AND unit_id = ANY ((SELECT public.auth_resident_unit_ids())::uuid[]));

REVOKE ALL ON public.amenities, public.amenity_reservations FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.amenities, public.amenity_reservations FROM authenticated;
GRANT SELECT ON public.amenities, public.amenity_reservations TO authenticated;

COMMIT;
