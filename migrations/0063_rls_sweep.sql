-- 0063_rls_sweep.sql
--
-- Role-scope every remaining public table that a plain resident could
-- write (or over-read) through the anon key and their own session.
-- Spec:  docs/specs/2026-10-16-rls-sweep.md
-- Apply: docs/specs/2026-10-16-rls-sweep-apply.sql (pre-check -> this block -> verify)
--
-- THE HOLE
--
-- 0006/0017/0018/0024-era tables still carried a single FOR ALL policy
--
--   USING (organization_id = ANY (public.auth_org_ids()))   -- or org_id
--
-- with no WITH CHECK, so membership alone gated SELECT, INSERT, UPDATE and
-- DELETE. The resident submission tables (tickets, arc_requests,
-- resident_violation_reports and their message tables) carried a resident
-- "own row" FOR ALL policy that also let the submitter rewrite the board's
-- side of the record. Proven by tests/integration/security/rls-sweep.test.ts
-- (99 failures before this migration). Among other things a resident could:
--
--   - re-point the Zelle recipient in associations.compliance_settings
--     (defended until now only by the app-level HMAC signature, which stays);
--   - forge an ownerships row, or re-point units.legacy_hoa_property_id,
--     widening auth_resident_unit_ids() to a neighbour's unit and so reading
--     that unit's dues through 0061's resident read path (BL-007);
--   - approve their own ARC request, close their own ticket, mark their own
--     violation resolved, post as "board" in their own thread;
--   - poison Ask-the-Docs by inserting governing_document_chunks;
--   - read every neighbour's ownership, tenancy, contact details,
--     violations, collection letters and push-subscription keys;
--   - write or wipe audit_log, rename or delete the org.
--
-- THE SHAPE (per command; B = auth_is_board_or_admin(org),
--            M = org = ANY(auth_org_ids()), A = auth_is_admin(org),
--            RU = auth_resident_unit_ids(), uid = auth.uid())
--
--   members read, board writes .... units, hoa_properties, hoa_documents,
--                                   hoa_meeting_minutes, hoa_recurring_events,
--                                   governing_documents, governing_document_chunks
--                                   (+ hoa_document_versions via its document,
--                                    communication_templates incl. global rows)
--   board only ..................... communication_threads, communication_replies,
--                                   lease_waiting_list, property_events,
--                                   hoa_digests, meeting_action_items
--   board, or the resident's own ... ownerships (owner_user_id = uid)
--     rows (writes board only)       tenancies (tenant_user_id = uid)
--                                   property_residents (email = JWT email)
--                                   hoa_violations (property of a unit in RU)
--                                   communication_recipients (user / unit in RU / email)
--                                   communications (has such a recipient row)
--   associations ................... SELECT M, UPDATE B, INSERT/DELETE A
--   orgs ........................... SELECT member, UPDATE A; no user INSERT/DELETE
--   audit_log ...................... SELECT B, INSERT B as yourself; append-only
--   notifications .................. own rows: SELECT, UPDATE (mark read)
--   push_subscriptions ............. own rows only, all commands
--   resident_communication_preferences  B, or own row (no DELETE for residents)
--   tickets / arc_requests / resident_violation_reports
--                                   SELECT B or own; INSERT B or own in the
--                                   initial state only (and, for tickets/ARC,
--                                   only for a unit in RU); UPDATE B (plus:
--                                   a resident may withdraw their own pending
--                                   ARC request); DELETE B
--   *_messages ..................... SELECT B or own thread's non-internal;
--                                   INSERT B, or a non-internal message
--                                   authored as themselves with role
--                                   'resident' on their own thread;
--                                   UPDATE/DELETE B
--
-- Every service-role path (import-units, member invite attachToOrg,
-- onboarding, platform admin, Stripe/Resend webhooks, Inngest jobs,
-- W1/W18) bypasses RLS and is unaffected.
--
-- ALL existing policies on each swept table are dropped first, not just
-- the known names: policies are permissive and OR together, so a leftover
-- hand-made policy in production would silently keep the hole open.
--
-- Also: property_bridge_gaps (0028) is a plain view owned by postgres, so
-- it bypassed RLS and was granted to anon -- every org's unbridged
-- addresses, no login needed. It becomes security_invoker and is revoked
-- from anon/authenticated (no app code reads it; it is an ops view).
--
-- OUT OF SCOPE (see spec): pm_properties, pm_rent_ledger, eviction_cases
-- (PM/eviction role model unresolved: onboarding writes role 'owner');
-- state_law_updates (global table; board of any org may write -- product
-- decision, not resident-reachable).
--
-- Idempotent. Safe to re-run. ONE statement (single DO block) -- see 0048's
-- header for why multi-statement scripts are unreliable in the Supabase
-- SQL editor.

DO $mig$
DECLARE
  t     text;
  c     text;
  p     record;
  swept text[] := ARRAY[
    'units', 'hoa_properties', 'hoa_documents', 'hoa_meeting_minutes',
    'hoa_recurring_events', 'governing_documents', 'governing_document_chunks',
    'communication_threads', 'communication_replies', 'lease_waiting_list',
    'property_events', 'hoa_digests', 'meeting_action_items',
    'ownerships', 'tenancies', 'property_residents', 'hoa_violations',
    'communication_recipients', 'communications',
    'associations', 'communication_templates', 'hoa_document_versions',
    'notifications', 'push_subscriptions', 'resident_communication_preferences',
    'audit_log', 'orgs',
    'tickets', 'arc_requests', 'resident_violation_reports',
    'ticket_messages', 'arc_request_messages', 'resident_violation_report_messages'
  ];
  -- table:org_column. Members read, board/admin write.
  member_read text[] := ARRAY[
    'units:organization_id', 'hoa_properties:org_id', 'hoa_documents:org_id',
    'hoa_meeting_minutes:org_id', 'hoa_recurring_events:organization_id',
    'governing_documents:organization_id', 'governing_document_chunks:organization_id'
  ];
  -- table:org_column. Board/admin for every command.
  board_only text[] := ARRAY[
    'communication_threads:organization_id', 'communication_replies:organization_id',
    'lease_waiting_list:organization_id', 'property_events:organization_id',
    'hoa_digests:org_id', 'meeting_action_items:org_id'
  ];
  -- Resident identity predicates, reused below.
  jwt_email constant text := $$lower(coalesce(auth.jwt() ->> 'email', ''))$$;
  ru        constant text := $$((SELECT public.auth_resident_unit_ids())::uuid[])$$;
  recipient_is_me text;
  parent       text;
  owner_col    text;
  board_parent text;
  own_parent   text;
BEGIN
  -- ─── drop every existing policy on every swept table ──────────────
  FOREACH t IN ARRAY swept LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
  END LOOP;

  -- ─── members read, board/admin write ──────────────────────────────
  FOREACH t IN ARRAY member_read LOOP
    c := split_part(t, ':', 2);
    t := split_part(t, ':', 1);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
                      USING (%I = ANY (public.auth_org_ids()))', t || '_select', t, c);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
                      WITH CHECK (public.auth_is_board_or_admin(%I))', t || '_insert', t, c);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
                      USING (public.auth_is_board_or_admin(%I))
                      WITH CHECK (public.auth_is_board_or_admin(%I))', t || '_update', t, c, c);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
                      USING (public.auth_is_board_or_admin(%I))', t || '_delete', t, c);
  END LOOP;

  -- ─── board/admin only ─────────────────────────────────────────────
  FOREACH t IN ARRAY board_only LOOP
    c := split_part(t, ':', 2);
    t := split_part(t, ':', 1);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
                      USING (public.auth_is_board_or_admin(%I))', t || '_select', t, c);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
                      WITH CHECK (public.auth_is_board_or_admin(%I))', t || '_insert', t, c);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
                      USING (public.auth_is_board_or_admin(%I))
                      WITH CHECK (public.auth_is_board_or_admin(%I))', t || '_update', t, c, c);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
                      USING (public.auth_is_board_or_admin(%I))', t || '_delete', t, c);
  END LOOP;

  -- ─── board writes; board or the resident's own rows read ─────────
  -- Writes for all six are board/admin. Reads differ only in the
  -- "own row" predicate, so build them from one template.
  recipient_is_me := format(
    '(%%1$s.user_id = auth.uid() OR %%1$s.unit_id = ANY %s OR (%%1$s.email IS NOT NULL AND lower(%%1$s.email) = %s))',
    ru, jwt_email);

  FOR t, c IN
    SELECT * FROM (VALUES
      ('ownerships', 'organization_id'),
      ('tenancies', 'organization_id'),
      ('property_residents', 'organization_id'),
      ('hoa_violations', 'org_id'),
      ('communication_recipients', 'organization_id'),
      ('communications', 'organization_id')
    ) v(tbl, col)
  LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
                      WITH CHECK (public.auth_is_board_or_admin(%I))', t || '_insert', t, c);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
                      USING (public.auth_is_board_or_admin(%I))
                      WITH CHECK (public.auth_is_board_or_admin(%I))', t || '_update', t, c, c);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
                      USING (public.auth_is_board_or_admin(%I))', t || '_delete', t, c);
  END LOOP;

  CREATE POLICY ownerships_select ON public.ownerships FOR SELECT TO authenticated
    USING (
      public.auth_is_board_or_admin(organization_id)
      OR (organization_id = ANY (public.auth_org_ids()) AND owner_user_id = auth.uid())
    );

  CREATE POLICY tenancies_select ON public.tenancies FOR SELECT TO authenticated
    USING (
      public.auth_is_board_or_admin(organization_id)
      OR (organization_id = ANY (public.auth_org_ids()) AND tenant_user_id = auth.uid())
    );

  -- lib/resident.ts getOwnedUnits() email fallback (ilike on the user's email).
  EXECUTE format($p$
    CREATE POLICY property_residents_select ON public.property_residents FOR SELECT TO authenticated
      USING (
        public.auth_is_board_or_admin(organization_id)
        OR (organization_id = ANY (public.auth_org_ids())
            AND email IS NOT NULL AND lower(email) = %s)
      )$p$, jwt_email);

  -- lib/resident-dashboard.ts: violations on the hoa_properties behind the
  -- resident's units (units.legacy_hoa_property_id).
  EXECUTE format($p$
    CREATE POLICY hoa_violations_select ON public.hoa_violations FOR SELECT TO authenticated
      USING (
        public.auth_is_board_or_admin(org_id)
        OR (org_id = ANY (public.auth_org_ids())
            AND property_id IN (
              SELECT u.legacy_hoa_property_id FROM public.units u
               WHERE u.id = ANY %s AND u.legacy_hoa_property_id IS NOT NULL))
      )$p$, ru);

  -- /resident/announcements: buildRecipientIdentityFilters (unit, user, email).
  EXECUTE format($p$
    CREATE POLICY communication_recipients_select ON public.communication_recipients FOR SELECT TO authenticated
      USING (
        public.auth_is_board_or_admin(organization_id)
        OR (organization_id = ANY (public.auth_org_ids()) AND %s)
      )$p$, format(recipient_is_me, 'communication_recipients'));

  EXECUTE format($p$
    CREATE POLICY communications_select ON public.communications FOR SELECT TO authenticated
      USING (
        public.auth_is_board_or_admin(organization_id)
        OR (organization_id = ANY (public.auth_org_ids())
            AND EXISTS (SELECT 1 FROM public.communication_recipients r
                         WHERE r.communication_id = communications.id AND %s))
      )$p$, format(recipient_is_me, 'r'));

  -- ─── associations: the Zelle recipient lives in compliance_settings ─
  CREATE POLICY associations_select ON public.associations FOR SELECT TO authenticated
    USING (organization_id = ANY (public.auth_org_ids()));
  CREATE POLICY associations_insert ON public.associations FOR INSERT TO authenticated
    WITH CHECK (public.auth_is_admin(organization_id));
  CREATE POLICY associations_update ON public.associations FOR UPDATE TO authenticated
    USING (public.auth_is_board_or_admin(organization_id))
    WITH CHECK (public.auth_is_board_or_admin(organization_id));
  CREATE POLICY associations_delete ON public.associations FOR DELETE TO authenticated
    USING (public.auth_is_admin(organization_id));

  -- ─── communication_templates: global rows readable by everyone ────
  CREATE POLICY communication_templates_select ON public.communication_templates FOR SELECT TO authenticated
    USING (organization_id IS NULL OR organization_id = ANY (public.auth_org_ids()));
  CREATE POLICY communication_templates_insert ON public.communication_templates FOR INSERT TO authenticated
    WITH CHECK (organization_id IS NOT NULL AND public.auth_is_board_or_admin(organization_id));
  CREATE POLICY communication_templates_update ON public.communication_templates FOR UPDATE TO authenticated
    USING (organization_id IS NOT NULL AND public.auth_is_board_or_admin(organization_id))
    WITH CHECK (organization_id IS NOT NULL AND public.auth_is_board_or_admin(organization_id));
  CREATE POLICY communication_templates_delete ON public.communication_templates FOR DELETE TO authenticated
    USING (organization_id IS NOT NULL AND public.auth_is_board_or_admin(organization_id));

  -- ─── hoa_document_versions: scoped through the document ───────────
  CREATE POLICY hoa_document_versions_select ON public.hoa_document_versions FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.hoa_documents d
                    WHERE d.id = hoa_document_versions.document_id
                      AND d.org_id = ANY (public.auth_org_ids())));
  CREATE POLICY hoa_document_versions_insert ON public.hoa_document_versions FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.hoa_documents d
                         WHERE d.id = hoa_document_versions.document_id
                           AND d.org_id = hoa_document_versions.org_id
                           AND public.auth_is_board_or_admin(d.org_id)));
  CREATE POLICY hoa_document_versions_update ON public.hoa_document_versions FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.hoa_documents d
                    WHERE d.id = hoa_document_versions.document_id
                      AND public.auth_is_board_or_admin(d.org_id)))
    WITH CHECK (EXISTS (SELECT 1 FROM public.hoa_documents d
                         WHERE d.id = hoa_document_versions.document_id
                           AND d.org_id = hoa_document_versions.org_id
                           AND public.auth_is_board_or_admin(d.org_id)));
  CREATE POLICY hoa_document_versions_delete ON public.hoa_document_versions FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.hoa_documents d
                    WHERE d.id = hoa_document_versions.document_id
                      AND public.auth_is_board_or_admin(d.org_id)));

  -- ─── per-user rows ────────────────────────────────────────────────
  -- notifications: written only by the ticket-notifications job (service
  -- role). A user reads and marks read their own.
  CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated
    USING (user_id = auth.uid() AND organization_id = ANY (public.auth_org_ids()));
  CREATE POLICY notifications_update ON public.notifications FOR UPDATE TO authenticated
    USING (user_id = auth.uid() AND organization_id = ANY (public.auth_org_ids()))
    WITH CHECK (user_id = auth.uid() AND organization_id = ANY (public.auth_org_ids()));

  -- push_subscriptions hold the browser's p256dh/auth keys: own rows only.
  CREATE POLICY push_subscriptions_select ON public.push_subscriptions FOR SELECT TO authenticated
    USING (user_id = auth.uid() AND organization_id = ANY (public.auth_org_ids()));
  CREATE POLICY push_subscriptions_insert ON public.push_subscriptions FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid() AND organization_id = ANY (public.auth_org_ids()));
  CREATE POLICY push_subscriptions_update ON public.push_subscriptions FOR UPDATE TO authenticated
    USING (user_id = auth.uid() AND organization_id = ANY (public.auth_org_ids()))
    WITH CHECK (user_id = auth.uid() AND organization_id = ANY (public.auth_org_ids()));
  CREATE POLICY push_subscriptions_delete ON public.push_subscriptions FOR DELETE TO authenticated
    USING (user_id = auth.uid() AND organization_id = ANY (public.auth_org_ids()));

  -- resident_communication_preferences: board, or a member's own row
  -- (BL-020 consent lands here).
  CREATE POLICY resident_communication_preferences_select ON public.resident_communication_preferences FOR SELECT TO authenticated
    USING (public.auth_is_board_or_admin(organization_id)
           OR (organization_id = ANY (public.auth_org_ids()) AND user_id = auth.uid()));
  CREATE POLICY resident_communication_preferences_insert ON public.resident_communication_preferences FOR INSERT TO authenticated
    WITH CHECK (public.auth_is_board_or_admin(organization_id)
                OR (organization_id = ANY (public.auth_org_ids()) AND user_id = auth.uid()));
  CREATE POLICY resident_communication_preferences_update ON public.resident_communication_preferences FOR UPDATE TO authenticated
    USING (public.auth_is_board_or_admin(organization_id)
           OR (organization_id = ANY (public.auth_org_ids()) AND user_id = auth.uid()))
    WITH CHECK (public.auth_is_board_or_admin(organization_id)
                OR (organization_id = ANY (public.auth_org_ids()) AND user_id = auth.uid()));
  CREATE POLICY resident_communication_preferences_delete ON public.resident_communication_preferences FOR DELETE TO authenticated
    USING (public.auth_is_board_or_admin(organization_id));

  -- ─── audit_log: append-only, written as yourself ──────────────────
  CREATE POLICY audit_log_select ON public.audit_log FOR SELECT TO authenticated
    USING (public.auth_is_board_or_admin(org_id));
  CREATE POLICY audit_log_insert ON public.audit_log FOR INSERT TO authenticated
    WITH CHECK (public.auth_is_board_or_admin(org_id) AND user_id = auth.uid());

  -- ─── orgs: every create/delete/billing path is service role ───────
  CREATE POLICY orgs_select ON public.orgs FOR SELECT TO authenticated
    USING (id = ANY (public.auth_org_ids()));
  CREATE POLICY orgs_update ON public.orgs FOR UPDATE TO authenticated
    USING (public.auth_is_admin(id))
    WITH CHECK (public.auth_is_admin(id));

  -- ─── tickets ──────────────────────────────────────────────────────
  CREATE POLICY tickets_select ON public.tickets FOR SELECT TO authenticated
    USING (public.auth_is_board_or_admin(organization_id)
           OR (organization_id = ANY (public.auth_org_ids()) AND submitted_by = auth.uid()));
  EXECUTE format($p$
    CREATE POLICY tickets_insert ON public.tickets FOR INSERT TO authenticated
      WITH CHECK (
        public.auth_is_board_or_admin(organization_id)
        OR (organization_id = ANY (public.auth_org_ids())
            AND submitted_by = auth.uid()
            AND status = 'open' AND priority = 'normal'
            AND closed_at IS NULL AND closed_by IS NULL AND deleted_at IS NULL
            AND (unit_id IS NULL OR unit_id = ANY %s))
      )$p$, ru);
  CREATE POLICY tickets_update ON public.tickets FOR UPDATE TO authenticated
    USING (public.auth_is_board_or_admin(organization_id))
    WITH CHECK (public.auth_is_board_or_admin(organization_id));
  CREATE POLICY tickets_delete ON public.tickets FOR DELETE TO authenticated
    USING (public.auth_is_board_or_admin(organization_id));

  -- ─── arc_requests ─────────────────────────────────────────────────
  CREATE POLICY arc_requests_select ON public.arc_requests FOR SELECT TO authenticated
    USING (public.auth_is_board_or_admin(organization_id)
           OR (organization_id = ANY (public.auth_org_ids()) AND submitted_by = auth.uid()));
  EXECUTE format($p$
    CREATE POLICY arc_requests_insert ON public.arc_requests FOR INSERT TO authenticated
      WITH CHECK (
        public.auth_is_board_or_admin(organization_id)
        OR (organization_id = ANY (public.auth_org_ids())
            AND submitted_by = auth.uid()
            AND status = 'submitted'
            AND board_response IS NULL AND board_response_at IS NULL AND board_response_by IS NULL
            AND deleted_at IS NULL
            AND (unit_id IS NULL OR unit_id = ANY %s))
      )$p$, ru);
  CREATE POLICY arc_requests_update ON public.arc_requests FOR UPDATE TO authenticated
    USING (public.auth_is_board_or_admin(organization_id))
    WITH CHECK (public.auth_is_board_or_admin(organization_id));
  -- withdrawMyArcRequest: only a still-pending request, only to 'withdrawn'.
  CREATE POLICY arc_requests_withdraw_own ON public.arc_requests FOR UPDATE TO authenticated
    USING (organization_id = ANY (public.auth_org_ids())
           AND submitted_by = auth.uid()
           AND status IN ('submitted', 'in_review')
           AND deleted_at IS NULL)
    WITH CHECK (organization_id = ANY (public.auth_org_ids())
                AND submitted_by = auth.uid()
                AND status = 'withdrawn'
                AND board_response IS NULL AND board_response_at IS NULL AND board_response_by IS NULL
                AND deleted_at IS NULL);
  CREATE POLICY arc_requests_delete ON public.arc_requests FOR DELETE TO authenticated
    USING (public.auth_is_board_or_admin(organization_id));

  -- ─── resident_violation_reports ───────────────────────────────────
  CREATE POLICY resident_violation_reports_select ON public.resident_violation_reports FOR SELECT TO authenticated
    USING (public.auth_is_board_or_admin(organization_id)
           OR (organization_id = ANY (public.auth_org_ids()) AND reported_by = auth.uid()));
  CREATE POLICY resident_violation_reports_insert ON public.resident_violation_reports FOR INSERT TO authenticated
    WITH CHECK (
      public.auth_is_board_or_admin(organization_id)
      OR (organization_id = ANY (public.auth_org_ids())
          AND reported_by = auth.uid()
          AND status = 'submitted'
          AND board_note IS NULL AND reviewed_at IS NULL AND reviewed_by IS NULL
          AND hoa_violation_id IS NULL)
    );
  CREATE POLICY resident_violation_reports_update ON public.resident_violation_reports FOR UPDATE TO authenticated
    USING (public.auth_is_board_or_admin(organization_id))
    WITH CHECK (public.auth_is_board_or_admin(organization_id));
  CREATE POLICY resident_violation_reports_delete ON public.resident_violation_reports FOR DELETE TO authenticated
    USING (public.auth_is_board_or_admin(organization_id));

  -- ─── thread messages: scoped through the parent ───────────────────
  FOR t, c, parent, owner_col IN
    SELECT * FROM (VALUES
      ('ticket_messages', 'ticket_id', 'tickets', 'submitted_by'),
      ('arc_request_messages', 'arc_request_id', 'arc_requests', 'submitted_by'),
      ('resident_violation_report_messages', 'report_id', 'resident_violation_reports', 'reported_by')
    ) v(tbl, fk, par, own)
  LOOP
    -- board/admin of the parent's org
    board_parent := format(
      'EXISTS (SELECT 1 FROM public.%1$I p WHERE p.id = %2$I.%3$I AND public.auth_is_board_or_admin(p.organization_id))',
      parent, t, c);
    -- the caller's own thread
    own_parent := format(
      'EXISTS (SELECT 1 FROM public.%1$I p WHERE p.id = %2$I.%3$I AND p.%4$I = auth.uid() AND p.organization_id = ANY (public.auth_org_ids()))',
      parent, t, c, owner_col);

    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
                      USING (%s OR (internal = false AND %s))', t || '_select', t, board_parent, own_parent);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
                      WITH CHECK (%s OR (internal = false AND author_id = auth.uid()
                                         AND author_role = ''resident'' AND %s))',
                   t || '_insert', t, board_parent, own_parent);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
                      USING (%s) WITH CHECK (%s)', t || '_update', t, board_parent, board_parent);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
                      USING (%s)', t || '_delete', t, board_parent);
  END LOOP;

  -- ─── property_bridge_gaps: an RLS-bypassing view granted to anon ──
  IF to_regclass('public.property_bridge_gaps') IS NOT NULL THEN
    ALTER VIEW public.property_bridge_gaps SET (security_invoker = true);
    REVOKE ALL ON public.property_bridge_gaps FROM anon, authenticated;
  END IF;

  RAISE NOTICE '0063 ok: % tables swept, % policies on them.',
    array_length(swept, 1),
    (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY (swept));
END
$mig$;
