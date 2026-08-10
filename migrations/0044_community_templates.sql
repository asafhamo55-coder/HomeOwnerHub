-- 0044_community_templates.sql
--
-- Global community email template library.
--
-- Three changes, all idempotent and safe to re-run:
--   1. organization_id becomes nullable. NULL means "global" — a template
--      that ships with the product and is visible to every org.
--   2. A new category value, 'community', added to BOTH check constraints.
--      Widening only communication_templates lets template selection and
--      audience resolution succeed and then blows up at the communications
--      INSERT in send.ts, after the user has clicked Send.
--   3. Five columns carrying the template's shape, its declared questions,
--      its visual block config, its accent, and clone provenance.
--
-- Renumbered from the plan's 0031 to 0044: 0031 was claimed in this tree by
-- concurrent inbox work (0031_inbox_attachment_uniq.sql) before this task
-- landed. 0044 is the next free slot after 0043_inbox_gmail_state.sql.
--
-- The RLS rewrite is the dangerous part and is explained inline below.

BEGIN;

-- ─── 1. organization_id nullable ─────────────────────────────────────
ALTER TABLE public.communication_templates
  ALTER COLUMN organization_id DROP NOT NULL;

-- ─── 2. category: add 'community' to both tables ─────────────────────
ALTER TABLE public.communication_templates
  DROP CONSTRAINT IF EXISTS communication_templates_category_check;
ALTER TABLE public.communication_templates
  ADD CONSTRAINT communication_templates_category_check
  CHECK (category IN (
    'welcome', 'dues', 'meeting', 'violation', 'arc',
    'financial', 'emergency', 'announcement', 'custom', 'community'
  ));

ALTER TABLE public.communications
  DROP CONSTRAINT IF EXISTS communications_category_check;
ALTER TABLE public.communications
  ADD CONSTRAINT communications_category_check
  CHECK (category IN (
    'welcome', 'dues', 'meeting', 'violation', 'arc',
    'financial', 'emergency', 'announcement', 'custom', 'community'
  ));

-- ─── 3. new columns ──────────────────────────────────────────────────
ALTER TABLE public.communication_templates
  ADD COLUMN IF NOT EXISTS topic_slug         text,
  ADD COLUMN IF NOT EXISTS shape              text,
  ADD COLUMN IF NOT EXISTS questions          jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS visual_block       jsonb,
  ADD COLUMN IF NOT EXISTS accent_color       text,
  ADD COLUMN IF NOT EXISTS source_template_id uuid
    REFERENCES public.communication_templates(id) ON DELETE SET NULL;

ALTER TABLE public.communication_templates
  DROP CONSTRAINT IF EXISTS communication_templates_shape_check;
ALTER TABLE public.communication_templates
  ADD CONSTRAINT communication_templates_shape_check
  CHECK (shape IS NULL OR shape IN ('reminder', 'invitation', 'submission_request', 'notice'));

-- One global template per topic_slug. Partial so tenant clones of the same
-- topic don't collide with the global row or with each other.
CREATE UNIQUE INDEX IF NOT EXISTS comm_templates_global_slug_idx
  ON public.communication_templates(topic_slug)
  WHERE organization_id IS NULL;

-- ─── 4. RLS ──────────────────────────────────────────────────────────
-- The existing policy (0018:233-234) is:
--
--   CREATE POLICY org_access ON public.communication_templates
--     USING (organization_id = ANY (public.auth_org_ids()));
--
-- No FOR clause means FOR ALL, and no WITH CHECK means Postgres reuses the
-- USING expression as WITH CHECK. So simply adding "OR organization_id IS
-- NULL" to it would let any authenticated user INSERT and UPDATE rows in
-- the global library. Split into four per-command policies.
--
-- Note the helper is auth_org_ids() — plural, returns an array, compared
-- with = ANY. A user can belong to more than one org.
DROP POLICY IF EXISTS org_access ON public.communication_templates;

DROP POLICY IF EXISTS templates_select ON public.communication_templates;
CREATE POLICY templates_select ON public.communication_templates
  FOR SELECT
  USING (
    organization_id IS NULL
    OR organization_id = ANY (public.auth_org_ids())
  );

DROP POLICY IF EXISTS templates_insert ON public.communication_templates;
CREATE POLICY templates_insert ON public.communication_templates
  FOR INSERT
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = ANY (public.auth_org_ids())
  );

DROP POLICY IF EXISTS templates_update ON public.communication_templates;
CREATE POLICY templates_update ON public.communication_templates
  FOR UPDATE
  USING (
    organization_id IS NOT NULL
    AND organization_id = ANY (public.auth_org_ids())
  )
  WITH CHECK (
    organization_id IS NOT NULL
    AND organization_id = ANY (public.auth_org_ids())
  );

DROP POLICY IF EXISTS templates_delete ON public.communication_templates;
CREATE POLICY templates_delete ON public.communication_templates
  FOR DELETE
  USING (
    organization_id IS NOT NULL
    AND organization_id = ANY (public.auth_org_ids())
  );

COMMIT;
