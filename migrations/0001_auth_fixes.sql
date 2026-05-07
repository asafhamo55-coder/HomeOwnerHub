-- 0001_auth_fixes.sql
-- Run after schema.sql. Fixes two issues we hit during the first
-- end-to-end run on Supabase project xwdjsxfskvreguyvryhc.
--
-- 1. The auto-profile trigger (public.handle_new_user) referenced an
--    unqualified `profiles` table. Under SECURITY DEFINER the function's
--    search_path didn't include public, so signup failed with
--    "relation profiles does not exist". This rewrite uses
--    public.profiles + a pinned search_path.
--
-- 2. Founder onboarding needs to INSERT into orgs and org_members
--    before the user is a member of either, which the existing
--    auth_org_ids()-based policies block. The application now uses
--    the admin (service role) client for the founder flow so the
--    INSERT bypasses RLS, but we still install role-agnostic INSERT
--    policies so the regular client can fall back if needed.
--
-- Idempotent. Safe to run multiple times.

-- ─── Fix 1: profile trigger ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created    ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_inserted   ON auth.users;
DROP TRIGGER IF EXISTS create_profile_for_user ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ─── Fix 2: INSERT policies for the founder flow ────────────────────
DROP POLICY IF EXISTS "auth_can_insert_orgs"             ON public.orgs;
DROP POLICY IF EXISTS "auth_can_self_insert_org_members" ON public.org_members;

CREATE POLICY "auth_can_insert_orgs"
ON public.orgs
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "auth_can_self_insert_org_members"
ON public.org_members
FOR INSERT
WITH CHECK (auth.uid() = user_id);
