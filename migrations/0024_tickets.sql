-- 0024_tickets.sql
-- Ticket system — residents open support tickets, board responds,
-- manages lifecycle (open → in_progress → closed), and optionally
-- creates action items linked to tickets.
--
-- RLS: two-policy pattern matching 0013_resident_submissions.sql.
--   - Residents see/create their own tickets + non-internal messages.
--   - Board/admin see everything in their org.
--
-- Idempotent. Safe to re-run.

-- ─── tickets ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tickets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  association_id    uuid REFERENCES public.associations(id) ON DELETE SET NULL,
  unit_id           uuid REFERENCES public.units(id) ON DELETE SET NULL,
  submitted_by      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,

  subject           text NOT NULL,
  category          text NOT NULL CHECK (category IN (
    'maintenance', 'noise', 'parking', 'common_area',
    'billing', 'access', 'safety', 'general', 'other'
  )),
  description       text NOT NULL,

  status            text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'closed')),
  priority          text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

  closed_at         timestamptz,
  closed_by         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

CREATE INDEX IF NOT EXISTS tickets_org_status_idx
  ON public.tickets(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS tickets_submitted_by_idx
  ON public.tickets(submitted_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_active
  ON public.tickets(organization_id, created_at DESC)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_tickets_updated ON public.tickets;
CREATE TRIGGER trg_tickets_updated
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── ticket_messages ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id         uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  author_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_role       text NOT NULL CHECK (author_role IN ('resident', 'board', 'admin')),
  body              text NOT NULL,
  internal          boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_messages_ticket_idx
  ON public.ticket_messages(ticket_id, created_at ASC);

-- ─── Link action items to tickets ───────────────────────────────────
ALTER TABLE public.meeting_action_items
  ADD COLUMN IF NOT EXISTS ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS meeting_action_items_ticket_idx
  ON public.meeting_action_items(ticket_id) WHERE ticket_id IS NOT NULL;

-- Allow action items without a meeting (ticket-originated).
ALTER TABLE public.meeting_action_items
  ALTER COLUMN meeting_id DROP NOT NULL;

-- At least one source must be set.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'action_item_has_source'
  ) THEN
    ALTER TABLE public.meeting_action_items
      ADD CONSTRAINT action_item_has_source
      CHECK (meeting_id IS NOT NULL OR ticket_id IS NOT NULL);
  END IF;
END $$;

-- ─── RLS ────────────────────────────────────────────────────────────
ALTER TABLE public.tickets               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages       ENABLE ROW LEVEL SECURITY;

-- tickets: residents own + board/admin all
DROP POLICY IF EXISTS resident_own_ticket       ON public.tickets;
DROP POLICY IF EXISTS board_or_admin_ticket     ON public.tickets;

CREATE POLICY resident_own_ticket ON public.tickets
  USING (
    submitted_by = auth.uid()
    AND organization_id = ANY (public.auth_org_ids())
  )
  WITH CHECK (
    submitted_by = auth.uid()
    AND organization_id = ANY (public.auth_org_ids())
  );

CREATE POLICY board_or_admin_ticket ON public.tickets
  USING (
    organization_id = ANY (public.auth_org_ids())
    AND public.auth_is_board_or_admin(organization_id)
  )
  WITH CHECK (
    organization_id = ANY (public.auth_org_ids())
    AND public.auth_is_board_or_admin(organization_id)
  );

-- ticket_messages: residents see non-internal messages on own tickets
DROP POLICY IF EXISTS resident_own_messages     ON public.ticket_messages;
DROP POLICY IF EXISTS board_or_admin_messages   ON public.ticket_messages;

CREATE POLICY resident_own_messages ON public.ticket_messages
  FOR ALL
  USING (
    internal = false
    AND EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_messages.ticket_id
        AND t.submitted_by = auth.uid()
        AND t.organization_id = ANY (public.auth_org_ids())
    )
  )
  WITH CHECK (
    internal = false
    AND EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_messages.ticket_id
        AND t.submitted_by = auth.uid()
        AND t.organization_id = ANY (public.auth_org_ids())
    )
  );

CREATE POLICY board_or_admin_messages ON public.ticket_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_messages.ticket_id
        AND t.organization_id = ANY (public.auth_org_ids())
        AND public.auth_is_board_or_admin(t.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_messages.ticket_id
        AND t.organization_id = ANY (public.auth_org_ids())
        AND public.auth_is_board_or_admin(t.organization_id)
    )
  );
