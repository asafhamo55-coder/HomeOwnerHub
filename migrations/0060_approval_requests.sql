-- 0060_approval_requests.sql
--
-- Sub-project D: the approval layer. First consumer: W18 bank
-- reconciliation, whose Step A used to post a cash-receipt journal entry
-- and mark the assessment paid with no human in the loop. W18 now writes a
-- `proposed` row here instead; a board member or admin approves (which
-- posts, exactly once) or rejects with a reason.
--
-- Spec: docs/specs/2026-10-15-approval-layer.md (states, idempotency, why a
-- table rather than ai_runs, how other workflows adopt this).
--
-- SECURITY SHAPE
--   * SELECT: board/admin of the row's org only (payload carries financial
--     detail; same rule 0036 gave ai_runs).
--   * INSERT / UPDATE / DELETE: NO policy for authenticated => denied.
--     Proposals are inserted and posted by server code under service role.
--     A user cannot edit `payload` (the amount, the assessment) and then
--     approve it, and cannot hand-set `posted`.
--   * The ONLY user-reachable write is decide_approval_request(), a
--     SECURITY DEFINER function that checks auth_is_board_or_admin() for the
--     row's org and performs proposed -> approved|rejected with a
--     conditional UPDATE, so of two concurrent approvals exactly one "wins".
--
-- FORWARD ONLY: no backfill. JEs W18 auto-posted before this migration are
-- untouched.
--
-- Idempotent. Safe to re-run. Runs as ONE statement (a single DO block) --
-- see 0048's header for why multi-statement scripts are unreliable in the
-- Supabase SQL editor.

DO $mig$
BEGIN
  CREATE TABLE IF NOT EXISTS public.approval_requests (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    workflow_id      text NOT NULL,
    action_type      text NOT NULL,
    subject_type     text NOT NULL,
    subject_id       uuid NOT NULL,
    payload          jsonb NOT NULL,
    summary          text NOT NULL,
    amount           numeric(12,2),
    status           text NOT NULL DEFAULT 'proposed'
      CHECK (status IN ('proposed', 'approved', 'rejected', 'posted', 'failed')),
    proposed_at      timestamptz NOT NULL DEFAULT now(),
    decided_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    decided_at       timestamptz,
    decision_reason  text,
    posted_at        timestamptz,
    result_ref       uuid,
    error            text,
    -- A decided row always records when; a rejection always records why.
    CONSTRAINT approval_requests_decided_stamp CHECK (
      status = 'proposed' OR decided_at IS NOT NULL
    ),
    CONSTRAINT approval_requests_reject_reason CHECK (
      status <> 'rejected' OR length(btrim(coalesce(decision_reason, ''))) > 0
    ),
    CONSTRAINT approval_requests_posted_ref CHECK (
      status <> 'posted' OR (posted_at IS NOT NULL AND result_ref IS NOT NULL)
    )
  );

  -- At most one LIVE proposal per (action, subject). rejected/failed free
  -- the slot so a deliberate re-match can propose again; posted keeps it so
  -- a re-run can never propose a second posting of the same transaction.
  CREATE UNIQUE INDEX IF NOT EXISTS approval_requests_live_subject_uniq
    ON public.approval_requests (action_type, subject_id)
    WHERE status IN ('proposed', 'approved', 'posted');

  CREATE INDEX IF NOT EXISTS approval_requests_org_status_idx
    ON public.approval_requests (organization_id, status, proposed_at DESC);

  ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS approval_requests_select ON public.approval_requests;
  CREATE POLICY approval_requests_select ON public.approval_requests
    FOR SELECT TO authenticated
    USING (organization_id = ANY (public.auth_org_ids())
           AND public.auth_is_board_or_admin(organization_id));

  COMMENT ON TABLE public.approval_requests IS
    'Sub-project D approval layer. One row per proposed side effect an AI workflow wants to perform (first: W18 cash receipts). Lifecycle proposed -> approved|rejected -> posted|failed. Users can only read (board/admin) and decide via decide_approval_request(); inserts and posting are service-role only. See docs/specs/2026-10-15-approval-layer.md.';

  CREATE OR REPLACE FUNCTION public.decide_approval_request(
    p_id uuid,
    p_decision text,
    p_reason text DEFAULT NULL
  ) RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $fn$
  DECLARE
    v_uid  uuid := auth.uid();
    v_row  public.approval_requests%ROWTYPE;
    v_won  boolean := false;
  BEGIN
    IF p_decision NOT IN ('approve', 'reject') THEN
      RAISE EXCEPTION 'invalid decision %', p_decision USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_row FROM public.approval_requests WHERE id = p_id;

    -- Missing, anonymous, resident, or another org's row: one indistinct
    -- error, so this cannot be used to probe which ids exist.
    IF v_uid IS NULL
       OR NOT FOUND
       OR NOT public.auth_is_board_or_admin(v_row.organization_id) THEN
      RAISE EXCEPTION 'not authorized to decide this approval request'
        USING ERRCODE = '42501';
    END IF;

    IF p_decision = 'reject' AND length(btrim(coalesce(p_reason, ''))) = 0 THEN
      RAISE EXCEPTION 'a reason is required to reject' USING ERRCODE = '22023';
    END IF;

    -- The claim. Row locking serialises concurrent callers; the loser
    -- re-evaluates status = 'proposed' after the winner commits and
    -- updates nothing.
    UPDATE public.approval_requests
       SET status          = CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END,
           decided_by      = v_uid,
           decided_at      = now(),
           decision_reason = NULLIF(btrim(coalesce(p_reason, '')), '')
     WHERE id = p_id
       AND status = 'proposed'
    RETURNING * INTO v_row;

    IF FOUND THEN
      v_won := true;
    ELSE
      SELECT * INTO v_row FROM public.approval_requests WHERE id = p_id;
    END IF;

    RETURN jsonb_build_object(
      'won',        v_won,
      'id',         v_row.id,
      'status',     v_row.status,
      'result_ref', v_row.result_ref
    );
  END
  $fn$;

  REVOKE ALL ON FUNCTION public.decide_approval_request(uuid, text, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.decide_approval_request(uuid, text, text) FROM anon;
  GRANT EXECUTE ON FUNCTION public.decide_approval_request(uuid, text, text)
    TO authenticated, service_role;

  RAISE NOTICE '0060 ok: approval_requests + decide_approval_request present.';
END
$mig$;
