-- 0064_m1_batch.sql — migration batch M1
--
-- Apply: docs/specs/2026-10-18-m1-apply.sql (part 1 pre-check -> part 2 =
--        this block -> part 3 verify). REQUIRES 0063 (asserted below).
--
-- Seven items, one block. Sections are independent; each is idempotent.
--
--   A. BL-020  member_email_consent_events (CA Civ. Code §4040 consent
--              evidence, append-only) + RLS.
--   B. BL-050  hoa_meeting_minutes.notice_posted_at.
--   C. BL-052  hoa_documents / governing_documents.visible_to_owners; the
--              resident SELECT policies (and chunks) honour it.
--   D. BL-052 + BL-058  storage.objects read/insert policies for the
--              hoa-documents and governing-docs buckets: a non-board member
--              signs only an object a row they can read points at (or their
--              own submission upload). Bills, vendor files, RFP bids, inbox
--              mail, collection letters: board/admin only.
--   E. BL-063  hoa_recurring_events.alert_failed_attempts / alert_failed_for.
--   F. Stripe  stripe_webhook_events (dedupe ledger) + stripe_subscriptions
--              (per-subscription state) + stripe_webhook_* functions; orgs
--              plan check accepts 'monthly' / 'annual'.
--   G. P3      auth_resident_charges_from(unit) + assessments/payments
--              SELECT so a buyer cannot read seller-era rows.
--
-- App code reads none of the new columns until M1_APPLIED is flipped
-- (packages/db/src/m1.ts). Every app path works with the columns present
-- and the flag false: the allowlisted document types stay visible, the
-- seller-era rows were already hidden by the app, the webhook keeps its
-- current writes (which now also succeed for 'monthly'/'annual').
--
-- ─── F. Why per-subscription, not per-org (the refuted r2 0064) ──────
--
-- r2 kept ONE clock per org (orgs.billing_event_at) and advanced it on a
-- deletion. An org switching sub_1 -> sub_2 produces checkout(sub_2) at T2
-- and deleted(sub_1) at T3 > T2. Stripe does not order deliveries: if
-- deleted(sub_1) is processed first it downgrades the org (sub_1 is still
-- current) and moves the clock to T3; checkout(sub_2) then reads as stale
-- (T2 < T3) and is dropped. A paying org stays on free, permanently.
--
-- Rule here: the org's billing state is a FUNCTION OF THE SET of events
-- seen, not of their arrival order.
--   * stripe_subscriptions keeps one row per subscription: started_at (its
--     checkout's event.created), deleted_at (its deletion's), plan.
--   * After every event the org is recomputed: current = its live
--     (deleted_at IS NULL, started) subscription with the latest started_at
--     (tie: sub id, so the result is deterministic). None live -> 'free'
--     only if the org's current stripe_sub_id is a recorded-deleted one;
--     an untracked legacy subscription (pre-M1) is left alone.
--   * A deletion that arrives before its own checkout leaves a tombstone
--     row; the checkout then fills in started_at but the row stays dead.
-- Any arrival order of {checkout(sub_1), checkout(sub_2), deleted(sub_1)}
-- ends on sub_2. The only order-dependent part is a transient: between a
-- deleted(sub_1) and a not-yet-delivered checkout(sub_2) the org reads
-- free, which nothing can avoid without asking Stripe.
--
-- Serialisation: advisory xact lock on the event id (two deliveries of one
-- event) and the subscription id, then FOR UPDATE on the org row before
-- the subscription row is written and the org recomputed, so two events
-- for one org recompute one after the other (READ COMMITTED: each
-- statement after the lock sees the other's committed row).
--
-- SECURITY SHAPE (F): RLS on, no policies, on both stripe tables: only the
-- service role (which bypasses RLS) reads or writes them. Functions are
-- SECURITY INVOKER and EXECUTE is revoked from PUBLIC/anon/authenticated,
-- so even a re-grant (local replay re-grants every routine) leaves an
-- authenticated caller unable to write anything. No PII anywhere: ids,
-- types, timestamps, outcome codes.
--
-- ─── D. Storage shape ────────────────────────────────────────────────
--
-- SELECT, hoa-documents: the object is in the caller's org AND one of
--   board/admin of that org;
--   an hoa_documents row the caller can read (RLS, section C) points at it;
--   a submission_attachments row the caller can read points at it;
--   the caller uploaded it themselves under <org>/submissions/ (the upload
--     happens before its attachments row exists, and INSERT ... RETURNING
--     needs the new object to be readable).
-- SELECT, governing-docs: org AND (board/admin OR a governing_documents row
--   the caller can read points at it).
-- INSERT, hoa-documents: org AND (board/admin OR under <org>/submissions/).
-- INSERT, governing-docs: org AND board/admin (only the board upload route
--   writes it).
-- UPDATE/DELETE stay 0059's. hoa-photos and eviction-docs are untouched.
-- The subqueries run under the caller's RLS on purpose: "you may sign a
-- file iff you may read a row that names it".
--
-- Every service-role path (vendor-onboard, rfp-bid, Inngest jobs, the
-- Stripe webhook) bypasses RLS and is unaffected.
--
-- Idempotent. Safe to re-run. ONE statement (single DO block) — see 0048's
-- header for why multi-statement scripts are unreliable in the Supabase SQL
-- editor. Any failed assertion raises and rolls the whole block back.

DO $mig$
DECLARE
  p          record;
  hoa_vis    constant text :=
    $$(%1$stype::text IN ('ccr', 'bylaws', 'rules') OR %1$svisible_to_owners)$$;
  gov_vis    constant text :=
    $$(%1$stype::text IN ('declaration', 'bylaws', 'rules', 'amendment', 'policy') OR %1$svisible_to_owners)
      AND %1$ssuperseded_at IS NULL AND %1$sai_generated IS NOT TRUE$$;
  n          integer;
BEGIN
  -- ─── 0. prerequisite: 0063 ─────────────────────────────────────────
  IF to_regprocedure('public.auth_resident_property_ids()') IS NULL
     OR to_regprocedure('public.auth_resident_unit_ids()') IS NULL THEN
    RAISE EXCEPTION '0064: apply 0061 and 0063 first (auth_resident_unit_ids / auth_resident_property_ids missing)';
  END IF;

  -- ─── A. BL-020: email consent evidence (append-only) ──────────────
  CREATE TABLE IF NOT EXISTS public.member_email_consent_events (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid        NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    -- whose consent this is
    user_id         uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    granted         boolean     NOT NULL,
    -- portal: the member clicked it themselves; written / email: the board
    -- recorded a signed form or an email from the member (§4040(b)).
    method          text        NOT NULL CHECK (method IN ('portal', 'written', 'email')),
    recorded_by     uuid        REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
    created_at      timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS member_email_consent_events_member_idx
    ON public.member_email_consent_events (organization_id, user_id, created_at DESC);
  ALTER TABLE public.member_email_consent_events ENABLE ROW LEVEL SECURITY;
  COMMENT ON TABLE public.member_email_consent_events IS
    'BL-020: CA Civ. Code §4040 email-delivery consent, one row per grant/revoke. Append-only: no UPDATE/DELETE policy, UPDATE blocked by trigger. Current state = newest row per (organization_id, user_id). No PII beyond ids.';

  CREATE OR REPLACE FUNCTION public.member_email_consent_events_immutable()
  RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $fn$
  BEGIN
    RAISE EXCEPTION 'member_email_consent_events is append-only' USING ERRCODE = '42501';
  END
  $fn$;
  DROP TRIGGER IF EXISTS member_email_consent_events_no_update ON public.member_email_consent_events;
  CREATE TRIGGER member_email_consent_events_no_update
    BEFORE UPDATE ON public.member_email_consent_events
    FOR EACH ROW EXECUTE FUNCTION public.member_email_consent_events_immutable();

  FOR p IN SELECT policyname FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'member_email_consent_events' LOOP
    EXECUTE format('DROP POLICY %I ON public.member_email_consent_events', p.policyname);
  END LOOP;
  CREATE POLICY member_email_consent_events_select ON public.member_email_consent_events
    FOR SELECT TO authenticated
    USING (public.auth_is_board_or_admin(organization_id)
           OR (organization_id = ANY (public.auth_org_ids()) AND user_id = auth.uid()));
  -- Written as yourself. A member records their own (portal); the board
  -- records a member's written or emailed consent.
  CREATE POLICY member_email_consent_events_insert ON public.member_email_consent_events
    FOR INSERT TO authenticated
    WITH CHECK (
      organization_id = ANY (public.auth_org_ids())
      AND recorded_by = auth.uid()
      AND (
        (user_id = auth.uid() AND method = 'portal')
        OR (public.auth_is_board_or_admin(organization_id) AND method IN ('written', 'email'))
      )
    );

  -- ─── B. BL-050: when the meeting notice was posted ────────────────
  ALTER TABLE public.hoa_meeting_minutes ADD COLUMN IF NOT EXISTS notice_posted_at timestamptz;
  COMMENT ON COLUMN public.hoa_meeting_minutes.notice_posted_at IS
    'BL-050: when the board posted this meeting''s notice (FL §720.303(2): 14 days / 48 hours). NULL = not recorded.';

  -- ─── C. BL-052: board-set document visibility ─────────────────────
  ALTER TABLE public.hoa_documents       ADD COLUMN IF NOT EXISTS visible_to_owners boolean NOT NULL DEFAULT false;
  ALTER TABLE public.governing_documents ADD COLUMN IF NOT EXISTS visible_to_owners boolean NOT NULL DEFAULT false;
  COMMENT ON COLUMN public.hoa_documents.visible_to_owners IS
    'BL-052: board posted this document to owners. Residents read ccr/bylaws/rules OR visible_to_owners (RLS + storage, 0064).';
  COMMENT ON COLUMN public.governing_documents.visible_to_owners IS
    'BL-052: board posted this document to owners. Residents read the allowlisted types OR visible_to_owners, current and not AI-generated (0064).';
  CREATE INDEX IF NOT EXISTS hoa_documents_storage_path_idx       ON public.hoa_documents (storage_path);
  CREATE INDEX IF NOT EXISTS governing_documents_storage_path_idx ON public.governing_documents (storage_path);
  CREATE INDEX IF NOT EXISTS submission_attachments_storage_path_idx ON public.submission_attachments (storage_path);

  DROP POLICY IF EXISTS hoa_documents_select ON public.hoa_documents;
  EXECUTE format($p$
    CREATE POLICY hoa_documents_select ON public.hoa_documents FOR SELECT TO authenticated
      USING (
        public.auth_is_board_or_admin(org_id)
        OR (org_id = ANY (public.auth_org_ids()) AND %s)
      )$p$, format(hoa_vis, ''));

  DROP POLICY IF EXISTS governing_documents_select ON public.governing_documents;
  EXECUTE format($p$
    CREATE POLICY governing_documents_select ON public.governing_documents FOR SELECT TO authenticated
      USING (
        public.auth_is_board_or_admin(organization_id)
        OR (organization_id = ANY (public.auth_org_ids()) AND %s)
      )$p$, format(gov_vis, ''));

  DROP POLICY IF EXISTS governing_document_chunks_select ON public.governing_document_chunks;
  EXECUTE format($p$
    CREATE POLICY governing_document_chunks_select ON public.governing_document_chunks FOR SELECT TO authenticated
      USING (
        public.auth_is_board_or_admin(organization_id)
        OR (organization_id = ANY (public.auth_org_ids())
            AND EXISTS (SELECT 1 FROM public.governing_documents d
                         WHERE d.id = governing_document_chunks.document_id
                           AND d.organization_id = governing_document_chunks.organization_id
                           AND %s))
      )$p$, format(gov_vis, 'd.'));

  -- ─── D. BL-052 + BL-058: storage reads follow the rows ────────────
  -- Drop every SELECT / INSERT / ALL policy on storage.objects that names
  -- either bucket, not just the known names: permissive policies OR
  -- together, so a leftover dashboard-made one would keep the hole open.
  -- UPDATE / DELETE (0059) are left alone.
  FOR p IN SELECT policyname FROM pg_policies
            WHERE schemaname = 'storage' AND tablename = 'objects'
              AND cmd IN ('SELECT', 'INSERT', 'ALL')
              AND (coalesce(qual, '') || coalesce(with_check, '')) ~ '(hoa-documents|governing-docs)' LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', p.policyname);
  END LOOP;

  CREATE POLICY "m1_read_hoa_documents" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'hoa-documents'
    AND public.storage_object_org_id(objects.name) = ANY (public.auth_org_ids())
    AND (
      public.auth_is_board_or_admin(public.storage_object_org_id(objects.name))
      OR EXISTS (SELECT 1 FROM public.hoa_documents d
                  WHERE d.storage_path = objects.name
                    AND d.org_id = public.storage_object_org_id(objects.name))
      OR EXISTS (SELECT 1 FROM public.submission_attachments a
                  WHERE a.storage_path = objects.name
                    AND a.organization_id = public.storage_object_org_id(objects.name))
      OR (objects.owner_id = (auth.uid())::text
          AND (storage.foldername(objects.name))[2] = 'submissions')
    )
  );

  CREATE POLICY "m1_insert_hoa_documents" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'hoa-documents'
    AND public.storage_object_org_id(objects.name) = ANY (public.auth_org_ids())
    AND (
      public.auth_is_board_or_admin(public.storage_object_org_id(objects.name))
      OR (storage.foldername(objects.name))[2] = 'submissions'
    )
  );

  CREATE POLICY "m1_read_governing_docs" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'governing-docs'
    AND public.storage_object_org_id(objects.name) = ANY (public.auth_org_ids())
    AND (
      public.auth_is_board_or_admin(public.storage_object_org_id(objects.name))
      OR EXISTS (SELECT 1 FROM public.governing_documents g
                  WHERE g.storage_path = objects.name
                    AND g.organization_id = public.storage_object_org_id(objects.name))
    )
  );

  CREATE POLICY "m1_insert_governing_docs" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'governing-docs'
    AND public.storage_object_org_id(objects.name) = ANY (public.auth_org_ids())
    AND public.auth_is_board_or_admin(public.storage_object_org_id(objects.name))
  );

  -- ─── E. BL-063: retry cap for alerts that write no communications row
  ALTER TABLE public.hoa_recurring_events
    ADD COLUMN IF NOT EXISTS alert_failed_attempts integer NOT NULL DEFAULT 0;
  ALTER TABLE public.hoa_recurring_events
    ADD COLUMN IF NOT EXISTS alert_failed_for date;
  ALTER TABLE public.hoa_recurring_events DROP CONSTRAINT IF EXISTS hoa_recurring_events_alert_failed_attempts_check;
  ALTER TABLE public.hoa_recurring_events ADD CONSTRAINT hoa_recurring_events_alert_failed_attempts_check
    CHECK (alert_failed_attempts >= 0);
  COMMENT ON COLUMN public.hoa_recurring_events.alert_failed_attempts IS
    'BL-063: days the alert for occurrence alert_failed_for delivered nothing. Counts only while alert_failed_for = event_date; the cron stops at its cap.';
  COMMENT ON COLUMN public.hoa_recurring_events.alert_failed_for IS
    'BL-063: the event_date alert_failed_attempts counts for. A moved or rolled date resets the count implicitly.';

  -- ─── F. Stripe webhook: dedupe + per-subscription ordering ────────
  CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
    event_id      text        PRIMARY KEY CHECK (length(event_id) BETWEEN 1 AND 255),
    event_type    text        NOT NULL CHECK (length(event_type) BETWEEN 1 AND 255),
    event_created timestamptz NOT NULL,
    object_id     text        CHECK (object_id IS NULL OR length(object_id) BETWEEN 1 AND 255),
    org_id        uuid        REFERENCES public.orgs(id) ON DELETE SET NULL,
    outcome       text        NOT NULL CHECK (length(outcome) BETWEEN 1 AND 64),
    processed_at  timestamptz NOT NULL DEFAULT now()
  );
  ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
  COMMENT ON TABLE public.stripe_webhook_events IS
    'Stripe webhook dedupe ledger (0064). Service role only (RLS on, no policies).';

  CREATE TABLE IF NOT EXISTS public.stripe_subscriptions (
    sub_id      text        PRIMARY KEY CHECK (length(sub_id) BETWEEN 1 AND 255),
    org_id      uuid        REFERENCES public.orgs(id) ON DELETE CASCADE,
    customer_id text        CHECK (customer_id IS NULL OR length(customer_id) BETWEEN 1 AND 255),
    plan        text        CHECK (plan IS NULL OR length(plan) BETWEEN 1 AND 64),
    -- event.created of the checkout.session.completed that started it
    started_at  timestamptz,
    -- event.created of its customer.subscription.deleted (a tombstone)
    deleted_at  timestamptz,
    updated_at  timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX IF NOT EXISTS stripe_subscriptions_org_idx ON public.stripe_subscriptions (org_id);
  ALTER TABLE public.stripe_subscriptions ENABLE ROW LEVEL SECURITY;
  COMMENT ON TABLE public.stripe_subscriptions IS
    'Per-subscription Stripe state (0064). orgs.plan/stripe_sub_id are recomputed from it after every event, so the result does not depend on delivery order. Service role only.';

  -- 0000's check never allowed the plans HOA checkout writes
  -- (apps/hoa/src/lib/billing.ts: 'monthly' / 'annual'), so every HOA
  -- subscription write failed with 23514, unseen.
  ALTER TABLE public.orgs DROP CONSTRAINT IF EXISTS orgs_plan_check;
  ALTER TABLE public.orgs ADD CONSTRAINT orgs_plan_check CHECK (plan = ANY (ARRAY[
    'free', 'starter', 'standard', 'pro', 'enterprise', 'per_case', 'unlimited',
    'monthly', 'annual'
  ]));

  -- Recompute one org from its subscriptions. Caller holds the org row lock.
  CREATE OR REPLACE FUNCTION public.stripe_billing_recompute(p_org_id uuid)
  RETURNS text
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = public, pg_temp
  AS $fn$
  DECLARE
    v_org public.orgs%ROWTYPE;
    v_cur public.stripe_subscriptions%ROWTYPE;
  BEGIN
    SELECT * INTO v_org FROM public.orgs WHERE id = p_org_id;
    IF NOT FOUND THEN
      RETURN 'org_not_found';
    END IF;

    SELECT * INTO v_cur FROM public.stripe_subscriptions
     WHERE org_id = p_org_id AND deleted_at IS NULL AND started_at IS NOT NULL
     ORDER BY started_at DESC, sub_id DESC
     LIMIT 1;

    IF FOUND THEN
      UPDATE public.orgs
         SET stripe_sub_id      = v_cur.sub_id,
             stripe_customer_id = COALESCE(v_cur.customer_id, stripe_customer_id),
             plan               = COALESCE(v_cur.plan, plan)
       WHERE id = p_org_id
         AND (stripe_sub_id IS DISTINCT FROM v_cur.sub_id
              OR plan IS DISTINCT FROM COALESCE(v_cur.plan, plan)
              OR stripe_customer_id IS DISTINCT FROM COALESCE(v_cur.customer_id, stripe_customer_id));
      RETURN 'current:' || v_cur.sub_id;
    END IF;

    -- No live subscription we know of. Downgrade only when the org's
    -- current one is recorded as deleted; an untracked (pre-M1) one stays.
    IF v_org.stripe_sub_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.stripe_subscriptions s
       WHERE s.sub_id = v_org.stripe_sub_id AND s.deleted_at IS NOT NULL
    ) THEN
      UPDATE public.orgs SET plan = 'free', stripe_sub_id = NULL WHERE id = p_org_id;
      RETURN 'free';
    END IF;
    RETURN 'unchanged';
  END
  $fn$;

  -- checkout.session.completed, mode = subscription
  CREATE OR REPLACE FUNCTION public.stripe_webhook_checkout_subscription(
    p_event_id      text,
    p_event_created timestamptz,
    p_org_id        uuid,
    p_customer_id   text,
    p_sub_id        text,
    p_plan          text
  ) RETURNS text
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = public, pg_temp
  AS $fn$
  DECLARE
    v_found   boolean;
    v_dead    boolean;
    v_now     text;
    v_outcome text;
  BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('stripe_evt:' || p_event_id, 0));
    IF p_sub_id IS NOT NULL THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('stripe_sub:' || p_sub_id, 0));
    END IF;

    IF EXISTS (SELECT 1 FROM public.stripe_webhook_events WHERE event_id = p_event_id) THEN
      RETURN 'duplicate';
    END IF;

    PERFORM 1 FROM public.orgs WHERE id = p_org_id FOR UPDATE;
    v_found := FOUND;

    IF NOT v_found THEN
      v_outcome := 'ignored_org_not_found';
    ELSIF p_sub_id IS NULL THEN
      v_outcome := 'ignored_subscription_missing';
    ELSE
      INSERT INTO public.stripe_subscriptions AS s (sub_id, org_id, customer_id, plan, started_at)
      VALUES (p_sub_id, p_org_id, p_customer_id, p_plan, p_event_created)
      ON CONFLICT (sub_id) DO UPDATE
        SET org_id      = COALESCE(s.org_id, EXCLUDED.org_id),
            customer_id = COALESCE(EXCLUDED.customer_id, s.customer_id),
            plan        = COALESCE(EXCLUDED.plan, s.plan),
            started_at  = COALESCE(LEAST(s.started_at, EXCLUDED.started_at), EXCLUDED.started_at),
            updated_at  = now();

      SELECT deleted_at IS NOT NULL INTO v_dead FROM public.stripe_subscriptions WHERE sub_id = p_sub_id;
      PERFORM public.stripe_billing_recompute(p_org_id);
      SELECT stripe_sub_id INTO v_now FROM public.orgs WHERE id = p_org_id;

      v_outcome := CASE
        WHEN v_now IS NOT DISTINCT FROM p_sub_id THEN 'subscription_started'
        WHEN v_dead THEN 'ignored_subscription_deleted'
        ELSE 'ignored_not_current_subscription'
      END;
    END IF;

    INSERT INTO public.stripe_webhook_events
      (event_id, event_type, event_created, object_id, org_id, outcome)
    VALUES
      (p_event_id, 'checkout.session.completed', p_event_created, p_sub_id,
       CASE WHEN v_found THEN p_org_id END, v_outcome);

    RETURN v_outcome;
  END
  $fn$;

  -- checkout.session.completed, mode = payment (never touches plan)
  CREATE OR REPLACE FUNCTION public.stripe_webhook_checkout_payment(
    p_event_id          text,
    p_event_created     timestamptz,
    p_org_id            uuid,
    p_customer_id       text,
    p_case_id           uuid,
    p_payment_intent_id text
  ) RETURNS text
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = public, pg_temp
  AS $fn$
  DECLARE
    v_found   boolean;
    v_rows    integer;
    v_outcome text;
  BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('stripe_evt:' || p_event_id, 0));

    IF EXISTS (SELECT 1 FROM public.stripe_webhook_events WHERE event_id = p_event_id) THEN
      RETURN 'duplicate';
    END IF;

    PERFORM 1 FROM public.orgs WHERE id = p_org_id FOR UPDATE;
    v_found := FOUND;

    IF NOT v_found THEN
      v_outcome := 'ignored_org_not_found';
    ELSE
      IF p_customer_id IS NOT NULL THEN
        UPDATE public.orgs SET stripe_customer_id = p_customer_id WHERE id = p_org_id;
      END IF;
      v_outcome := 'one_time_payment';
      IF p_case_id IS NOT NULL AND p_payment_intent_id IS NOT NULL THEN
        UPDATE public.eviction_cases
           SET stripe_payment_id = p_payment_intent_id
         WHERE id = p_case_id
           AND org_id = p_org_id;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_outcome := CASE WHEN v_rows > 0 THEN 'case_payment_recorded' ELSE 'ignored_case_not_found' END;
      END IF;
    END IF;

    INSERT INTO public.stripe_webhook_events
      (event_id, event_type, event_created, object_id, org_id, outcome)
    VALUES
      (p_event_id, 'checkout.session.completed', p_event_created, NULL,
       CASE WHEN v_found THEN p_org_id END, v_outcome);

    RETURN v_outcome;
  END
  $fn$;

  -- customer.subscription.deleted
  CREATE OR REPLACE FUNCTION public.stripe_webhook_subscription_deleted(
    p_event_id      text,
    p_event_created timestamptz,
    p_sub_id        text
  ) RETURNS text
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = public, pg_temp
  AS $fn$
  DECLARE
    v_org_id  uuid;
    v_before  text;
    v_after   text;
    v_outcome text;
  BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('stripe_evt:' || p_event_id, 0));
    PERFORM pg_advisory_xact_lock(hashtextextended('stripe_sub:' || p_sub_id, 0));

    IF EXISTS (SELECT 1 FROM public.stripe_webhook_events WHERE event_id = p_event_id) THEN
      RETURN 'duplicate';
    END IF;

    -- Whose subscription: the one its checkout recorded, else (pre-M1
    -- subscriptions) the org currently on it.
    SELECT org_id INTO v_org_id FROM public.stripe_subscriptions WHERE sub_id = p_sub_id;
    IF v_org_id IS NULL THEN
      SELECT id INTO v_org_id FROM public.orgs WHERE stripe_sub_id = p_sub_id ORDER BY id LIMIT 1;
    END IF;

    IF v_org_id IS NOT NULL THEN
      SELECT stripe_sub_id INTO v_before FROM public.orgs WHERE id = v_org_id FOR UPDATE;
    END IF;

    -- Tombstone, recorded whether or not an org is known yet: a checkout
    -- delivered later for this subscription must find it dead.
    INSERT INTO public.stripe_subscriptions AS s (sub_id, org_id, deleted_at)
    VALUES (p_sub_id, v_org_id, p_event_created)
    ON CONFLICT (sub_id) DO UPDATE
      SET org_id     = COALESCE(s.org_id, EXCLUDED.org_id),
          deleted_at = COALESCE(LEAST(s.deleted_at, EXCLUDED.deleted_at), EXCLUDED.deleted_at),
          updated_at = now();

    IF v_org_id IS NOT NULL THEN
      PERFORM public.stripe_billing_recompute(v_org_id);
      SELECT stripe_sub_id INTO v_after FROM public.orgs WHERE id = v_org_id;
    END IF;

    v_outcome := CASE
      WHEN v_org_id IS NOT NULL AND v_before IS NOT DISTINCT FROM p_sub_id
           AND v_after IS DISTINCT FROM p_sub_id THEN 'subscription_deleted'
      ELSE 'ignored_not_current_subscription'
    END;

    INSERT INTO public.stripe_webhook_events
      (event_id, event_type, event_created, object_id, org_id, outcome)
    VALUES
      (p_event_id, 'customer.subscription.deleted', p_event_created, p_sub_id, v_org_id, v_outcome);

    RETURN v_outcome;
  END
  $fn$;

  REVOKE ALL ON FUNCTION public.stripe_billing_recompute(uuid) FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION public.stripe_webhook_checkout_subscription(text, timestamptz, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION public.stripe_webhook_checkout_payment(text, timestamptz, uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
  REVOKE ALL ON FUNCTION public.stripe_webhook_subscription_deleted(text, timestamptz, text) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.stripe_billing_recompute(uuid) TO service_role;
  GRANT EXECUTE ON FUNCTION public.stripe_webhook_checkout_subscription(text, timestamptz, uuid, text, text, text) TO service_role;
  GRANT EXECUTE ON FUNCTION public.stripe_webhook_checkout_payment(text, timestamptz, uuid, text, uuid, text) TO service_role;
  GRANT EXECUTE ON FUNCTION public.stripe_webhook_subscription_deleted(text, timestamptz, text) TO service_role;

  -- ─── G. P3: a buyer does not read the seller's charges ────────────
  -- The first day the caller sees on a unit: the start of their CURRENT
  -- ownership of it when that ownership began with a recorded sale. NULL
  -- (sees the whole unit history) for every other ownership — an import or
  -- invite is dated by when it was typed in, not when the home was bought —
  -- and for a resident linked only through property_residents. Mirrors
  -- apps/hoa/src/lib/resident-sale-window.ts. SECURITY DEFINER so the
  -- policy does not depend on ownerships' own RLS; it only reads the
  -- caller's own rows.
  CREATE OR REPLACE FUNCTION public.auth_resident_charges_from(p_unit uuid)
  RETURNS date
  LANGUAGE sql STABLE
  SECURITY DEFINER
  SET search_path = public
  AS $fn$
    SELECT max(o.valid_from)::date
      FROM public.ownerships o
     WHERE o.unit_id = p_unit
       AND o.owner_user_id = auth.uid()
       AND o.valid_to IS NULL
       AND o.source = 'sale'
  $fn$;
  REVOKE ALL ON FUNCTION public.auth_resident_charges_from(uuid) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.auth_resident_charges_from(uuid) TO authenticated, service_role;

  DROP POLICY IF EXISTS assessments_select ON public.assessments;
  CREATE POLICY assessments_select ON public.assessments FOR SELECT TO authenticated
    USING (
      public.auth_is_board_or_admin(organization_id)
      OR (
        organization_id = ANY (public.auth_org_ids())
        AND unit_id = ANY ((SELECT public.auth_resident_unit_ids())::uuid[])
        AND due_date >= COALESCE(public.auth_resident_charges_from(unit_id), '-infinity'::date)
      )
    );

  -- A payment against a charge follows the charge; an unapplied one is
  -- dated in Eastern time (the app uses the association's zone: a payment
  -- within hours of midnight on settlement day can differ by one day).
  DROP POLICY IF EXISTS payments_select ON public.payments;
  CREATE POLICY payments_select ON public.payments FOR SELECT TO authenticated
    USING (
      public.auth_is_board_or_admin(organization_id)
      OR (
        organization_id = ANY (public.auth_org_ids())
        AND (
          (assessment_id IS NULL
            AND unit_id = ANY ((SELECT public.auth_resident_unit_ids())::uuid[])
            AND (paid_at AT TIME ZONE 'America/New_York')::date
                >= COALESCE(public.auth_resident_charges_from(unit_id), '-infinity'::date))
          OR EXISTS (
            SELECT 1 FROM public.assessments a
             WHERE a.id = payments.assessment_id
               AND a.unit_id = ANY ((SELECT public.auth_resident_unit_ids())::uuid[])
               AND a.due_date >= COALESCE(public.auth_resident_charges_from(a.unit_id), '-infinity'::date)
          )
        )
      )
    );

  -- ─── assertions: any failure rolls the whole block back ───────────
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema = 'public' AND (table_name, column_name) IN (
     ('hoa_meeting_minutes', 'notice_posted_at'),
     ('hoa_documents', 'visible_to_owners'),
     ('governing_documents', 'visible_to_owners'),
     ('hoa_recurring_events', 'alert_failed_attempts'),
     ('hoa_recurring_events', 'alert_failed_for'));
  IF n <> 5 THEN RAISE EXCEPTION '0064: expected 5 new columns, found %', n; END IF;

  SELECT count(*) INTO n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public' AND c.relrowsecurity
     AND c.relname IN ('member_email_consent_events', 'stripe_webhook_events', 'stripe_subscriptions');
  IF n <> 3 THEN RAISE EXCEPTION '0064: expected 3 new tables with RLS on, found %', n; END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
              AND tablename IN ('stripe_webhook_events', 'stripe_subscriptions')) THEN
    RAISE EXCEPTION '0064: stripe tables must carry no policies (service role only)';
  END IF;

  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'member_email_consent_events';
  IF n <> 2 OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
                        AND tablename = 'member_email_consent_events' AND cmd NOT IN ('SELECT', 'INSERT')) THEN
    RAISE EXCEPTION '0064: consent events must have exactly SELECT + INSERT policies';
  END IF;

  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND policyname IN (
        'hoa_documents_select', 'governing_documents_select', 'governing_document_chunks_select')
        AND qual LIKE '%visible_to_owners%') <> 3 THEN
    RAISE EXCEPTION '0064: document SELECT policies do not honour visible_to_owners';
  END IF;

  -- Storage: exactly our four policies grant SELECT/INSERT on the two buckets.
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'storage' AND tablename = 'objects'
     AND cmd IN ('SELECT', 'INSERT', 'ALL')
     AND (coalesce(qual, '') || coalesce(with_check, '')) ~ '(hoa-documents|governing-docs)';
  IF n <> 4 OR (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                 AND policyname IN ('m1_read_hoa_documents', 'm1_insert_hoa_documents',
                                    'm1_read_governing_docs', 'm1_insert_governing_docs')) <> 4 THEN
    RAISE EXCEPTION '0064: expected exactly the 4 m1_* storage policies on hoa-documents/governing-docs, found %', n;
  END IF;

  IF to_regprocedure('public.stripe_webhook_checkout_subscription(text, timestamptz, uuid, text, text, text)') IS NULL
     OR to_regprocedure('public.stripe_webhook_checkout_payment(text, timestamptz, uuid, text, uuid, text)') IS NULL
     OR to_regprocedure('public.stripe_webhook_subscription_deleted(text, timestamptz, text)') IS NULL
     OR to_regprocedure('public.stripe_billing_recompute(uuid)') IS NULL
     OR to_regprocedure('public.auth_resident_charges_from(uuid)') IS NULL THEN
    RAISE EXCEPTION '0064: a function is missing';
  END IF;

  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
       AND policyname IN ('assessments_select', 'payments_select')
       AND qual LIKE '%auth_resident_charges_from%') <> 2 THEN
    RAISE EXCEPTION '0064: assessments/payments SELECT do not apply the sale floor';
  END IF;

  RAISE NOTICE '0064 ok: M1 batch applied (consent, notice_posted_at, document visibility + storage, alert attempts, stripe ordering, sale floor).';
END
$mig$;
