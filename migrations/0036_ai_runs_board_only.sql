-- 0036_ai_runs_board_only.sql
-- Restrict `ai_runs` to board members and admins.
--
-- 0004_v1_schema_phase2a.sql:268 created the policy with an org predicate
-- only:
--
--   CREATE POLICY org_access ON public.ai_runs
--     USING (organization_id = ANY (public.auth_org_ids()));
--
-- `auth_org_ids()` returns every org in which the caller holds ANY
-- `org_members` row — residents included. The browser talks to PostgREST
-- with the public anon key and the signed-in user's own JWT, so that policy
-- let any resident of an association read every `ai_runs` row belonging to
-- it, simply by querying the table directly.
--
-- What that exposes changed materially in Phase B. `packages/ai/src/
-- workflow.ts` persists each run's `input` verbatim, and W32 (Reply
-- Drafter) has the highest-PII input in the product: the resident's full
-- inbound email, the rendered property summary (resident names, address,
-- outstanding dues balance, open violations) and, before this wave, the
-- complete bodies of up to five past outbound replies — correspondence
-- about OTHER households. One resident could read all of it.
--
-- Every application read of `ai_runs` is already a board/admin surface:
--   - apps/hoa/src/app/(dashboard)/accounting/bank/queue/page.tsx  (W18)
--   - apps/hoa/src/app/(dashboard)/violations/approval-queue/page.tsx (W3)
--     — both under (dashboard)/layout.tsx, which redirects role='resident'
--       to /resident before any page body runs.
--   - apps/hoa/src/lib/inbox/draft/actions.ts (createDraft's model lookup)
--     — behind requireBoardOrAdmin().
--   - apps/hoa/src/lib/platform-admin.ts — service-role (createAdminClient),
--     which bypasses RLS entirely and is unaffected either way.
-- Nothing under apps/hoa/src/app/resident, and nothing in apps/pm,
-- apps/eviction or apps/marketing, reads this table. Tightening the policy
-- therefore breaks no existing surface.
--
-- `auth_org_ids()` returns uuid[], so `= ANY (...)` is the correct form here.
-- `organization_id IN (SELECT public.auth_org_ids())` fails with 42883.
--
-- Idempotent. Safe to re-run.

DROP POLICY IF EXISTS org_access ON public.ai_runs;

CREATE POLICY org_access ON public.ai_runs
  USING (organization_id = ANY (public.auth_org_ids())
         AND public.auth_is_board_or_admin(organization_id));

-- `ai_feedback` carries the identical role-free policy from the same
-- migration and joins to `ai_runs` via ai_run_id. Its own contents are far
-- lower-risk than a run's input — a rating and an optional comment — but the
-- gap is the same shape, and leaving it open means a resident can still
-- enumerate which runs exist for their association and read whatever a board
-- member typed into a feedback comment.
--
-- Zero application references exist: searching apps/ and packages/ for
-- `ai_feedback` returns only entries in the generated database types. No
-- surface reads or writes it, so tightening it cannot break anything.
DROP POLICY IF EXISTS org_access ON public.ai_feedback;

CREATE POLICY org_access ON public.ai_feedback
  USING (organization_id = ANY (public.auth_org_ids())
         AND public.auth_is_board_or_admin(organization_id));
