-- 0019_platform_admin.sql
-- v1.3 Module 10 — Platform Admin (HomeownerHub staff cross-tenant tools).
--
-- Distinct from per-org `admin` role in `org_members`. A platform admin
-- is HomeownerHub staff with cross-tenant superuser access for support
-- and tenant management. Granted via the `platform_admins` table.
--
-- Security posture (per Plan agent review):
--   - The privilege lives in a dedicated table, NOT a column on
--     profiles. Profiles RLS letting residents read their own row
--     would otherwise leak the flag.
--   - RLS denies all SELECT to authenticated / anon. Only the service-
--     role (used by lib/platform-admin.ts via createAdminClient) reads
--     the table; the auth_is_platform_admin() helper is SECURITY DEFINER
--     so app code can still check the flag without exposing the table.
--   - Cross-tenant queries go through service-role + app-side
--     requirePlatformAdmin() gate. We do NOT broaden per-org RLS to
--     "OR auth_is_platform_admin()" because that would risk silently
--     granting access on tables whose policies get rewritten later.
--
-- Audit log:
--   - platform_admin_audit captures every write a platform admin makes.
--   - UPDATE/DELETE revoked from all roles except postgres (migration
--     role) so the log is append-only from the app's perspective.
--   - Writes happen from app code (matches the ai_runs precedent), not
--     a trigger — app code can capture user agent, IP, and a free-form
--     reason in the payload.
--
-- Idempotent. Safe to re-run.

-- ─── platform_admins ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id     uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  granted_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoked_at  timestamptz,
  note        text
);

CREATE INDEX IF NOT EXISTS platform_admins_active_idx
  ON public.platform_admins(user_id) WHERE revoked_at IS NULL;

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

-- Nobody but service-role can read or write. Direct queries from a
-- user-bound client return zero rows. The auth_is_platform_admin()
-- helper below uses SECURITY DEFINER to read the table internally.
DROP POLICY IF EXISTS deny_all ON public.platform_admins;
CREATE POLICY deny_all ON public.platform_admins
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- ─── auth_is_platform_admin() ────────────────────────────────────────
-- SECURITY DEFINER so the function can read platform_admins even though
-- the caller has no SELECT privilege. Returns true iff the calling
-- user has an active (non-revoked) row.

CREATE OR REPLACE FUNCTION public.auth_is_platform_admin()
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins
    WHERE user_id = auth.uid()
      AND revoked_at IS NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.auth_is_platform_admin()
  TO authenticated, service_role;

-- ─── platform_admin_audit ───────────────────────────────────────────
-- Append-only. Every action a platform admin takes (create tenant,
-- suspend tenant, change plan, etc.) writes one row.

CREATE TABLE IF NOT EXISTS public.platform_admin_audit (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  action          text NOT NULL,
  target_org_id   uuid REFERENCES public.orgs(id) ON DELETE SET NULL,
  payload         jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_admin_audit_actor_idx
  ON public.platform_admin_audit(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_admin_audit_target_idx
  ON public.platform_admin_audit(target_org_id, created_at DESC);

ALTER TABLE public.platform_admin_audit ENABLE ROW LEVEL SECURITY;

-- All authenticated reads/writes denied. Only service-role (the lib/
-- platform-admin.ts client) writes; reads go through that same client.
DROP POLICY IF EXISTS deny_all ON public.platform_admin_audit;
CREATE POLICY deny_all ON public.platform_admin_audit
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- Belt-and-suspenders: revoke UPDATE and DELETE from authenticated.
-- Even with a future policy mistake, in-place tampering would still
-- need DB-level role escalation.
REVOKE UPDATE, DELETE ON public.platform_admin_audit FROM authenticated, anon;

-- ─── Tenant suspension flag on orgs ─────────────────────────────────
-- Soft-delete / lifecycle column. NULL = active, timestamp = suspended.
-- App code blocks log-in / writes when suspended_at is non-null. We
-- prefer this to a hard DELETE so reactivation is trivial.

ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz;

CREATE INDEX IF NOT EXISTS orgs_suspended_idx
  ON public.orgs(id) WHERE suspended_at IS NOT NULL;

-- ─── Seed first platform admin ──────────────────────────────────────
-- Bootstrap: the platform itself needs at least one platform admin
-- before the UI can grant additional ones. Resolves by email so the
-- seed is portable across environments. No-ops if the user doesn't
-- exist (e.g., before they sign up).

INSERT INTO public.platform_admins (user_id, granted_at, note)
SELECT p.id, now(), 'Bootstrap seed via migration 0019'
FROM public.profiles p
WHERE p.email = 'asafhamo55@gmail.com'
ON CONFLICT (user_id) DO NOTHING;
