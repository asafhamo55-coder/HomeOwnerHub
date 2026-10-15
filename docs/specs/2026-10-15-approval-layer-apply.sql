-- Production apply for migration 0060_approval_requests (sub-project D).
-- Spec: docs/specs/2026-10-15-approval-layer.md
--
-- Run the three parts separately in the Supabase SQL editor, IN ORDER.
-- Ship the dependent code (branch claude/approval-layer) only AFTER part 3
-- returns all-true. The new W18 inserts into approval_requests, so if the
-- code is deployed before the table exists, every Step A run fails, and the
-- txn stays unstamped and gets retried each plaid-sync tick until the
-- table appears.

-- ─── PART 1: pre-check (read-only) ────────────────────────────────────
-- Expect: table_exists = false, fn_exists = false (first apply), helpers
-- both true, orgs/profiles both true. If table_exists is already true, the
-- migration is idempotent and part 2 is still safe to run.
SELECT
  to_regclass('public.approval_requests') IS NOT NULL                AS table_exists,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'decide_approval_request') AS fn_exists,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'auth_org_ids')            AS has_auth_org_ids,
  EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'auth_is_board_or_admin')  AS has_auth_is_board_or_admin,
  to_regclass('public.orgs')     IS NOT NULL                          AS has_orgs,
  to_regclass('public.profiles') IS NOT NULL                          AS has_profiles;

-- ─── PART 2: apply ────────────────────────────────────────────────────
-- Paste the ENTIRE contents of migrations/0060_approval_requests.sql (a
-- single DO block, no BEGIN/COMMIT). Expected output:
--   NOTICE: 0060 ok: approval_requests + decide_approval_request present.

-- ─── PART 3: verify (read-only) ───────────────────────────────────────
-- Every column must be true.
SELECT
  to_regclass('public.approval_requests') IS NOT NULL AS table_exists,
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.approval_requests'::regclass) AS rls_enabled,
  -- Exactly one policy, and it is SELECT-only: users get no write path
  -- except the RPC.
  (SELECT count(*) = 1 AND bool_and(cmd = 'SELECT')
     FROM pg_policies WHERE schemaname = 'public' AND tablename = 'approval_requests') AS select_only_policy,
  EXISTS (SELECT 1 FROM pg_indexes
           WHERE schemaname = 'public' AND indexname = 'approval_requests_live_subject_uniq') AS live_uniq_index,
  (SELECT prosecdef FROM pg_proc WHERE proname = 'decide_approval_request') AS rpc_security_definer,
  (SELECT position('auth_is_board_or_admin' IN prosrc) > 0
     FROM pg_proc WHERE proname = 'decide_approval_request') AS rpc_checks_role,
  has_function_privilege('authenticated', 'public.decide_approval_request(uuid,text,text)', 'EXECUTE') AS authenticated_can_call,
  NOT has_function_privilege('anon', 'public.decide_approval_request(uuid,text,text)', 'EXECUTE')     AS anon_cannot_call,
  (SELECT count(*) = 0 FROM public.approval_requests) AS starts_empty_forward_only;
