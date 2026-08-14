-- 0047_collections.sql
--
-- HOA collections as a SYSTEM OF RECORD: what stage an account is at, who
-- the attorney is, and an immutable dated trail of what was done and when.
-- Nothing here sends anything -- see "Deliberately not built" at the end.
--
-- WHY NOW
--
-- Madison Park's collections process lives entirely in CINCSystems and PDF
-- aging reports. The app holds the balances but none of the workflow: that
-- Kaur is at "Lien Letter", that Wilson is with Dorough & Dorough presuit,
-- that the board authorised suit on 5/29/26, or that as of 7/21/26 the
-- manager is waiting on a board decision about a Final Notice. None of it
-- has anywhere to live, so the board cannot see it and the app cannot
-- report on it.
--
-- SHAPE OF THE REAL DATA
--
-- Every escalation step in the CINC aging report creates a dated,
-- dollar-valued charge, and the charge's date is the ACTION date, not a
-- billing-cycle date -- the $175.00 lien filing fee is dated 2026-06-09
-- because that is when the lien letter went out. The ladder, reconstructed
-- from the fee history and the dated notes in
-- migrations/seed-madison-park-dues-aging.sql and
-- migrations/update-madison-park-dues-aging-2026-07-21.sql:
--
--   delinquent -> collection letter ($40/$45/$55)
--              -> collection processing ($185)
--              -> 30-day warning of lien letter
--              -> lien letter (+ lien filing fee $155/$175)
--              -> board authorises suit
--              -> turned over to attorney, presuit demand letter
--                 (+ legal fee $185.11/$193.47)
--
-- LEARNED FROM hoa_violations, WHICH IS THE CAUTIONARY TALE
--
-- Violations model the same shape -- a legally-constrained escalation with
-- notices and cure periods -- and four things went wrong there that this
-- migration deliberately avoids:
--
--   1. No history table at all. The only note is a scalar
--      `resolution_note`, overwritten on every save and set to NULL when
--      leaving a terminal status; `fine_start_date` is wiped the same way.
--      Collections notes are evidence, so they get their own append-only
--      table.
--   2. The app's status enum drifted from the DB CHECK ('fined' and
--      'dismissed' exist in TypeScript and are not valid values). The
--      status list here is defined once in SQL and mirrored in one TS
--      module, not re-spelled per call site.
--   3. hoa_violations.property_id points at legacy hoa_properties, so
--      every unit-scoped consumer hops through
--      units.legacy_hoa_property_id -- duplicated in four places today.
--      collection_cases references units(id) directly.
--   4. A single org-wide RLS policy with no board/resident split.
--      Collections data is sensitive; these tables are board/admin only.
--
-- Idempotent. Safe to re-run.

BEGIN;

-- ─── 1. Assessment categories for collection costs ───────────────────
--
-- O.C.G.A. § 44-3-234 requires that the notice preceding foreclosure
-- itemise the amount due broken out by principal, interest, late fees and
-- attorneys' fees. Today assessment_type is
-- ('regular','special','late_fee','fine'), so every collection cost is
-- crammed into 'special' and becomes indistinguishable from a roof
-- assessment once written: Madison Park's "Lien Filing Fee 2026" ($175.00)
-- and "Legal Fee - Collection 2026" ($193.47) are both 'special' right now.
-- The statutory breakout is therefore not derivable from the data.
--
-- Widening the constraint is what makes it derivable. This migration does
-- NOT ship a view that asserts the four-way statutory mapping -- deciding
-- which of these buckets counts as "attorneys' fees" under § 44-3-234 is a
-- legal conclusion, and PROJECT_FOUNDATION.md:308 requires GA attorney
-- review before legal output ships. The categories make that mapping
-- possible; a lawyer confirms it.

ALTER TABLE public.assessments
  DROP CONSTRAINT IF EXISTS assessments_assessment_type_check;

ALTER TABLE public.assessments
  ADD CONSTRAINT assessments_assessment_type_check
  CHECK (assessment_type IN (
    'regular',
    'special',
    'late_fee',
    'fine',
    -- new in 0047
    'lien_filing',            -- fee to file/record a lien
    'collection_legal',       -- attorney fees for collection
    'collection_letter',      -- per-letter charge
    'collection_processing'   -- association's own processing charge
  ));


-- ─── 2. Reclassify Madison Park's existing collection costs ──────────
--
-- Eight rows currently sitting in 'special'. Amounts and due dates are
-- untouched, so the association AR total must not move: it stays
-- $9,475.88, matching the 07/21/2026 aging report.
--
-- Deliberately NOT reclassified: 914 Urban Ash's $49.50, which is a Gate
-- Opener charge and a genuine special assessment. It is the discriminator
-- that proves this block targets collection costs rather than every
-- 'special' row.

DO $$
DECLARE
  v_org_id  uuid := 'a4906f16-baf3-4232-a2bd-a78ea432ad86';
  v_unit_id uuid;
  v_total   numeric;
  v_moved   int := 0;
  v_n       int;
BEGIN
  -- Manpreet Kaur — 3580 Allee Elm Drive
  SELECT u.id INTO v_unit_id
  FROM public.units u
  JOIN public.hoa_properties hp ON hp.id = u.legacy_hoa_property_id
  WHERE u.organization_id = v_org_id AND hp.address ILIKE '%3580 Allee Elm%'
  LIMIT 1;

  IF v_unit_id IS NOT NULL THEN
    UPDATE public.assessments SET assessment_type = 'lien_filing'
    WHERE unit_id = v_unit_id AND assessment_type = 'special'
      AND amount = 175.00 AND due_date = '2026-06-09' AND deleted_at IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved + v_n;

    UPDATE public.assessments SET assessment_type = 'collection_letter'
    WHERE unit_id = v_unit_id AND assessment_type = 'special'
      AND amount = 55.00 AND due_date = '2026-04-01' AND deleted_at IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved + v_n;
  END IF;

  -- Larry & Jacqueline Wilson — 3597 Old Maple Drive
  SELECT u.id INTO v_unit_id
  FROM public.units u
  JOIN public.hoa_properties hp ON hp.id = u.legacy_hoa_property_id
  WHERE u.organization_id = v_org_id AND hp.address ILIKE '%3597 Old Maple%'
  LIMIT 1;

  IF v_unit_id IS NOT NULL THEN
    -- Legal Fee - Collection 2025 and 2026.
    -- NOTE the 185.11 / 185.00 pair: Wilson carries BOTH a $185.11 legal
    -- fee and a $185.00 collection processing fee dated 2025-04-01, so
    -- amount alone does not identify a row and every predicate here keys
    -- on (amount, due_date) together.
    UPDATE public.assessments SET assessment_type = 'collection_legal'
    WHERE unit_id = v_unit_id AND assessment_type = 'special'
      AND amount = 185.11 AND due_date = '2025-04-01' AND deleted_at IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved + v_n;

    UPDATE public.assessments SET assessment_type = 'collection_legal'
    WHERE unit_id = v_unit_id AND assessment_type = 'special'
      AND amount = 193.47 AND due_date = '2026-06-01' AND deleted_at IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved + v_n;

    UPDATE public.assessments SET assessment_type = 'lien_filing'
    WHERE unit_id = v_unit_id AND assessment_type = 'special'
      AND amount = 155.00 AND due_date = '2024-10-01' AND deleted_at IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved + v_n;

    UPDATE public.assessments SET assessment_type = 'collection_letter'
    WHERE unit_id = v_unit_id AND assessment_type = 'special'
      AND amount = 40.00 AND due_date = '2020-03-01' AND deleted_at IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved + v_n;

    UPDATE public.assessments SET assessment_type = 'collection_letter'
    WHERE unit_id = v_unit_id AND assessment_type = 'special'
      AND amount = 45.00 AND due_date = '2024-07-01' AND deleted_at IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved + v_n;

    UPDATE public.assessments SET assessment_type = 'collection_processing'
    WHERE unit_id = v_unit_id AND assessment_type = 'special'
      AND amount = 185.00 AND due_date = '2025-04-01' AND deleted_at IS NULL;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_moved := v_moved + v_n;
  END IF;

  -- The reclassification must move money between categories without
  -- changing what is owed. Assert inside this DO block so a mismatch rolls
  -- the whole thing back rather than leaving AR half-recategorised.
  SELECT COALESCE(SUM(a.amount), 0) INTO v_total
  FROM public.assessments a
  WHERE a.organization_id = v_org_id
    AND a.status = 'open'
    AND a.deleted_at IS NULL;

  IF v_total <> 9475.88 THEN
    RAISE EXCEPTION
      'Madison Park AR is %, expected $9,475.88. Reclassification rolled back. Apply seed-madison-park-dues-aging.sql and update-madison-park-dues-aging-2026-07-21.sql first.',
      to_char(v_total, 'FM$9,999,990.00');
  END IF;

  RAISE NOTICE 'Reclassified % collection-cost assessments; Madison Park AR unchanged at $9,475.88.', v_moved;
END $$;


-- ─── 3. collection_cases ─────────────────────────────────────────────
--
-- One case per unit, not per owner. Two independent reasons agree:
-- migrations/0004_v1_schema_phase2a.sql:57 states the architectural rule
-- ("All open service requests, violations, and ARC history attach to the
-- unit, not the owner"), and under O.C.G.A. § 44-3-232 the lien attaches
-- to the LOT rather than to the person, surviving a change of ownership.
-- Owner-level rollup already exists for correspondence: dues reminder
-- packets group by owner email across units.

CREATE TABLE IF NOT EXISTS public.collection_cases (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id     uuid NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  unit_id            uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,

  status             text NOT NULL DEFAULT 'monitoring'
    CONSTRAINT collection_cases_status_check CHECK (status IN (
      'monitoring',             -- delinquent, no collection action taken yet
      'collection_letter',      -- association letter sent
      'lien_warning',           -- 30-day warning of lien letter
      'lien_letter',            -- lien letter sent
      'board_authorized_suit',  -- board voted to proceed
      'attorney_presuit',       -- turned over; demand letter stage
      'suit_filed',
      'resolved',               -- paid or otherwise cured
      'written_off'
    )),

  attorney_firm      text,   -- e.g. 'Dorough & Dorough, LLC'
  attorney_reference text,   -- the firm's own matter/file number

  opened_on          date NOT NULL DEFAULT CURRENT_DATE,
  closed_on          date,
  closed_reason      text,

  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);

-- A unit can accumulate closed cases over the years but may only have one
-- live case at a time, so "the collections status of this property" is
-- never ambiguous.
CREATE UNIQUE INDEX IF NOT EXISTS collection_cases_one_open_per_unit_idx
  ON public.collection_cases (unit_id)
  WHERE deleted_at IS NULL AND status NOT IN ('resolved', 'written_off');

CREATE INDEX IF NOT EXISTS collection_cases_org_status_idx
  ON public.collection_cases (organization_id, status, opened_on DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS collection_cases_unit_idx
  ON public.collection_cases (unit_id)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_collection_cases_updated ON public.collection_cases;
CREATE TRIGGER trg_collection_cases_updated
  BEFORE UPDATE ON public.collection_cases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─── 4. collection_events — append-only ──────────────────────────────
--
-- The dated trail. Mirrors how the manager already writes notes in CINC:
--
--   "4/9/2026 - 30 Day warning of lien letter sent to owner-gg"
--   "6/9/26- Lien Letter sent to owner.-ms"
--   "6/1/26- D&D sent dvl to owner for $5,595.71.ms"
--
-- so occurred_on is the action date, actor_initials preserves the trailing
-- "-ms"/"-gg" convention, and amount holds the point-in-time figure quoted
-- in a note (Wilson's demand letter says $5,595.71 while the account total
-- is $5,678.58 — a snapshot, not a live balance, and it must not be
-- recomputed).
--
-- No updated_at, no deleted_at, and RLS below grants only SELECT and
-- INSERT: there is deliberately no UPDATE or DELETE policy, so the trail is
-- immutable by construction rather than by convention. If a lien is ever
-- challenged, this is the evidence that the notices went out when the
-- association says they did. Correcting a mistake means adding a 'note'
-- event that says so.

CREATE TABLE IF NOT EXISTS public.collection_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  collection_case_id uuid NOT NULL REFERENCES public.collection_cases(id) ON DELETE CASCADE,

  event_type         text NOT NULL
    CONSTRAINT collection_events_event_type_check CHECK (event_type IN (
      'note',
      'collection_letter_sent',
      'lien_warning_sent',
      'lien_letter_sent',
      'lien_filed',
      'board_authorized_suit',
      'turned_over_to_attorney',
      'demand_letter_sent',
      'payment_received',
      'payment_plan_agreed',
      'status_changed',
      'case_closed'
    )),

  occurred_on        date NOT NULL,
  note               text,
  amount             numeric(12,2),
  actor_initials     text,

  recorded_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Set when the action was carried out through this app's comms system.
  -- NULL for anything done outside it, which is everything today.
  communication_id   uuid REFERENCES public.communications(id) ON DELETE SET NULL,

  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS collection_events_case_occurred_idx
  ON public.collection_events (collection_case_id, occurred_on DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS collection_events_org_occurred_idx
  ON public.collection_events (organization_id, occurred_on DESC);


-- ─── 5. RLS ──────────────────────────────────────────────────────────
--
-- Board/admin only on both tables. Residents must never read another
-- owner's collections file, and RLS is where that is enforced rather than
-- in app queries -- hoa_violations relies on app-level filtering and is the
-- reason this is spelled out.
--
-- FOR ALL with only USING silently reuses USING as WITH CHECK, and UPDATE
-- needs both (USING picks the targetable rows, WITH CHECK constrains what
-- they may become, else a row can be moved to another org). Both are given
-- explicitly.

ALTER TABLE public.collection_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_access ON public.collection_cases;
CREATE POLICY board_access ON public.collection_cases
  FOR ALL
  USING      (organization_id = ANY (public.auth_org_ids())
              AND public.auth_is_board_or_admin(organization_id))
  WITH CHECK (organization_id = ANY (public.auth_org_ids())
              AND public.auth_is_board_or_admin(organization_id));

ALTER TABLE public.collection_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_read ON public.collection_events;
CREATE POLICY board_read ON public.collection_events
  FOR SELECT
  USING (organization_id = ANY (public.auth_org_ids())
         AND public.auth_is_board_or_admin(organization_id));

DROP POLICY IF EXISTS board_insert ON public.collection_events;
CREATE POLICY board_insert ON public.collection_events
  FOR INSERT
  WITH CHECK (organization_id = ANY (public.auth_org_ids())
              AND public.auth_is_board_or_admin(organization_id));

-- No UPDATE policy and no DELETE policy on collection_events, on purpose.
-- With RLS enabled and no policy for a command, that command is denied for
-- every non-service-role caller. Dropping these two lines would silently
-- make the evidence trail editable.
--
-- HOW THIS FAILS, because it matters for anyone writing against it: RLS
-- denies by matching ZERO ROWS, not by raising. A board user running
-- `UPDATE collection_events SET note = ...` gets `UPDATE 0` and no error,
-- and PostgREST reports success. Verified on Postgres 16: UPDATE 0,
-- DELETE 0, row unchanged. So an "edit this note" feature built here would
-- appear to work in code review and do nothing in production. Do not add
-- one -- correct the record by inserting a 'note' event.

DROP POLICY IF EXISTS board_update ON public.collection_events;
DROP POLICY IF EXISTS board_delete ON public.collection_events;

COMMENT ON TABLE public.collection_cases IS
  'One collections case per unit (not per owner: the O.C.G.A. 44-3-232 lien attaches to the lot). Board/admin only.';

COMMENT ON TABLE public.collection_events IS
  'Append-only dated trail of collection actions. SELECT and INSERT only -- no UPDATE or DELETE policy exists, deliberately. Correct a mistake by adding a note event, never by editing history.';

COMMIT;


-- ─── Deliberately not built ──────────────────────────────────────────
--
-- * Sending. Nothing here composes or delivers a notice. The 'mail'
--   channel in communication_recipients is accepted by the schema but
--   send.ts marks it failed ("mail channel not yet implemented"), so
--   certified mail -- which § 44-3-234 requires, with return receipt plus
--   a first-class copy -- has no delivery path. collection_events records
--   that a letter went out; it does not claim to have sent it.
--
-- * AI letter drafting. PROJECT_FOUNDATION.md:308 requires a GA attorney
--   review gate before any Bar B legal output. Lien and demand letters are
--   squarely inside that.
--
-- * The § 44-3-221 POA Act applicability gate (whether the declaration
--   opts in, and its recording date). It is only load-bearing once
--   something COMPUTES a legal deadline. This migration computes none --
--   every date here is one a human recorded. That gate is required before
--   any cure-expiry or foreclosure-eligibility math is added.
--
-- * Deadline computation generally: no cure_expires_at, no
--   foreclosure_eligible_date. § 44-3-234's 30 days runs from the date of
--   MAILING, and this system does not mail.
--
-- * payment_plans wiring. The table exists (0006_accounting.sql:376) and is
--   unused; 'payment_plan_agreed' is available as an event type so the
--   trail can record one, without pretending the plan is managed here.
