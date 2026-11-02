-- 0078_community_board.sql
--
-- DRAFT. NOT APPLIED. Backlog B5: a community message board that is private to
-- ONE association's residents and its board. The owner applies it (runbook:
-- pbcopy the SQL, wait for confirmation), then a one-line PR flips M13_APPLIED
-- in packages/db/src/m13.ts. Until then nothing in the app reads or writes
-- these objects and the app behaves exactly as today.
--
-- Idempotent (IF NOT EXISTS / DROP IF EXISTS / OR REPLACE), one transaction.
--
-- What it adds:
--   1. board_threads        a topic. Closed threads accept no new replies.
--   2. board_posts          the opening post and the replies. A post the board
--      hides disappears for residents; the board still sees it, with who hid it.
--   3. board_post_reports   a resident's "report this post" to the board.
--   4. community_board_association_ids()  the associations the signed-in
--      person lives in (via a current ownership), for the read policies.
--
-- Privacy rules baked in here, not left to the app:
--   * a resident reads only threads and posts of an association they own a
--     unit in, and never a hidden one. Board and admin read their whole org.
--   * a resident reads only their OWN reports. Only the board reads the queue.
--   * the web roles can read and can write NOTHING. Every write goes through
--     the server (service role) after the route has checked membership, the
--     closed flag and the author. So a resident's own session can never edit a
--     post, un-hide one, or plant a thread in another association.
--   * nothing here sends email or text (backlog B5: no notifications by
--     default).

BEGIN;

-- ── 0. prerequisites ───────────────────────────────────────────────────
DO $pre$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orgs', 'profiles', 'associations', 'units', 'ownerships'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION '0078: public.% is missing', t;
    END IF;
  END LOOP;
  IF to_regprocedure('public.tenant_fk_same_org()') IS NULL THEN
    RAISE EXCEPTION '0078: tenant_fk_same_org() is missing; apply 0070_tenant_isolation.sql first';
  END IF;
  IF to_regprocedure('public.auth_is_board_or_admin(uuid)') IS NULL
     OR to_regprocedure('public.auth_org_ids()') IS NULL
     OR to_regprocedure('public.auth_resident_unit_ids()') IS NULL THEN
    RAISE EXCEPTION '0078: an auth helper is missing (0012, 0061, 0070)';
  END IF;
END $pre$;

-- ── 1. board_threads ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.board_threads (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id   uuid NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
  title            text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  created_by       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Moderation. Closed: no new replies. Hidden: gone for residents.
  closed_at        timestamptz,
  closed_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  hidden_at        timestamptz,
  hidden_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- Target of the composite same-association FK on board_posts.
  UNIQUE (id, organization_id, association_id)
);
CREATE INDEX IF NOT EXISTS board_threads_assoc_activity_idx
  ON public.board_threads (association_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS board_threads_org_idx ON public.board_threads (organization_id);

COMMENT ON TABLE public.board_threads IS
  '0078 (B5): a community board topic, private to one association. Read-only for the web roles; written by the server (service role).';

-- ── 2. board_posts ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.board_posts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  association_id   uuid NOT NULL,
  thread_id        uuid NOT NULL,
  author_id        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Snapshots taken when the post is written, so a neighbour sees a name and
  -- never an address, email or unit. author_is_board marks a board reply.
  author_label     text NOT NULL CHECK (char_length(author_label) BETWEEN 1 AND 80),
  author_is_board  boolean NOT NULL DEFAULT false,
  is_opening       boolean NOT NULL DEFAULT false,
  body             text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  hidden_at        timestamptz,
  hidden_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  hidden_reason    text CHECK (hidden_reason IS NULL OR char_length(hidden_reason) <= 300),
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- A post lives in a thread of its OWN organization and association.
  FOREIGN KEY (thread_id, organization_id, association_id)
    REFERENCES public.board_threads (id, organization_id, association_id) ON DELETE CASCADE,
  UNIQUE (id, organization_id, association_id)
);
CREATE INDEX IF NOT EXISTS board_posts_thread_idx ON public.board_posts (thread_id, created_at);
CREATE INDEX IF NOT EXISTS board_posts_org_idx ON public.board_posts (organization_id);
-- One opening post per thread.
CREATE UNIQUE INDEX IF NOT EXISTS board_posts_one_opening
  ON public.board_posts (thread_id) WHERE is_opening;

COMMENT ON TABLE public.board_posts IS
  '0078 (B5): posts of a community board thread. A hidden post is invisible to residents (RLS). Written by the server only.';

-- ── 3. board_post_reports ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.board_post_reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  association_id   uuid NOT NULL,
  post_id          uuid NOT NULL,
  reported_by      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason           text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'actioned')),
  resolved_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (post_id, organization_id, association_id)
    REFERENCES public.board_posts (id, organization_id, association_id) ON DELETE CASCADE,
  -- One report per person per post: a second tap changes nothing.
  UNIQUE (post_id, reported_by)
);
CREATE INDEX IF NOT EXISTS board_post_reports_open_idx
  ON public.board_post_reports (association_id, created_at DESC) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS board_post_reports_org_idx ON public.board_post_reports (organization_id);

COMMENT ON TABLE public.board_post_reports IS
  '0078 (B5): "report this post". The board reads the queue; a reporter reads only their own rows. Written by the server only.';

-- ── 4. updated_at, same-org foreign keys ───────────────────────────────
CREATE OR REPLACE FUNCTION public.community_board_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $f$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$f$;

DROP TRIGGER IF EXISTS board_threads_touch ON public.board_threads;
CREATE TRIGGER board_threads_touch BEFORE UPDATE ON public.board_threads
  FOR EACH ROW EXECUTE FUNCTION public.community_board_touch();

-- A row can never point at an association of another organization (same
-- ratchet as 0070/0072/0073; tests/integration/schema/fk-same-org-ratchet.test.ts).
-- The thread and post keys are composite and carry organization_id.
DO $triggers$
DECLARE
  r record;
  v_name text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('board_threads',      'association_id', 'associations', 'organization_id', 'organization_id'),
      ('board_posts',        'association_id', 'associations', 'organization_id', 'organization_id'),
      ('board_post_reports', 'association_id', 'associations', 'organization_id', 'organization_id')
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

-- ── 5. community_board_association_ids() ───────────────────────────────
-- The associations the signed-in person lives in: the association of every
-- unit auth_resident_unit_ids() returns (a CURRENT ownership or resident row in
-- the same org, confirmed email, org not suspended; 0070). The null-uid guard
-- is in the BODY: CI re-grants EXECUTE to anon, so a REVOKE alone is invisible.
CREATE OR REPLACE FUNCTION public.community_board_association_ids()
RETURNS uuid[]
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(
    ARRAY(
      SELECT DISTINCT u.association_id
        FROM public.units u
       WHERE auth.uid() IS NOT NULL
         AND u.association_id IS NOT NULL
         AND u.id = ANY (public.auth_resident_unit_ids())
    ),
    ARRAY[]::uuid[]
  )
$fn$;

REVOKE ALL ON FUNCTION public.community_board_association_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_board_association_ids() TO authenticated;

-- ── 6. row level security ──────────────────────────────────────────────
-- Read-only for the web roles. There is deliberately no INSERT/UPDATE/DELETE
-- policy: the server writes with the service role, which bypasses RLS.
ALTER TABLE public.board_threads      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_posts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_post_reports ENABLE ROW LEVEL SECURITY;

-- board / admin: the whole organization, hidden items included
DO $pol$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['board_threads', 'board_posts', 'board_post_reports'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_board_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
         USING (organization_id = ANY (public.auth_org_ids())
                AND public.auth_is_board_or_admin(organization_id))',
      t || '_board_select', t);
  END LOOP;
END $pol$;

-- a resident: only their own association, and never a hidden item
DROP POLICY IF EXISTS board_threads_resident_select ON public.board_threads;
CREATE POLICY board_threads_resident_select ON public.board_threads
  FOR SELECT TO authenticated
  USING (organization_id = ANY (public.auth_org_ids())
         AND hidden_at IS NULL
         AND association_id = ANY ((SELECT public.community_board_association_ids())::uuid[]));

DROP POLICY IF EXISTS board_posts_resident_select ON public.board_posts;
CREATE POLICY board_posts_resident_select ON public.board_posts
  FOR SELECT TO authenticated
  USING (organization_id = ANY (public.auth_org_ids())
         AND hidden_at IS NULL
         AND association_id = ANY ((SELECT public.community_board_association_ids())::uuid[])
         AND EXISTS (SELECT 1 FROM public.board_threads t
                      WHERE t.id = board_posts.thread_id AND t.hidden_at IS NULL));

-- a reporter reads only their own reports
DROP POLICY IF EXISTS board_post_reports_own_select ON public.board_post_reports;
CREATE POLICY board_post_reports_own_select ON public.board_post_reports
  FOR SELECT TO authenticated
  USING (organization_id = ANY (public.auth_org_ids())
         AND reported_by = (SELECT auth.uid()));

REVOKE ALL ON public.board_threads, public.board_posts, public.board_post_reports FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.board_threads, public.board_posts, public.board_post_reports
  FROM authenticated;
GRANT SELECT ON public.board_threads, public.board_posts, public.board_post_reports TO authenticated;

COMMIT;
