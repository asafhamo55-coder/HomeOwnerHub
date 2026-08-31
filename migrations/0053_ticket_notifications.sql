-- 0053_ticket_notifications.sql
-- Notify the board when a resident opens a ticket.
--
-- WHAT IS MISSING TODAY
--
-- createResidentTicket (apps/hoa/src/lib/resident-tickets.ts) inserts the
-- row, revalidates two paths, and returns. Nobody is told, on any channel.
-- A resident reports a leak and it waits until a board member happens to
-- open /tickets.
--
-- TWO TABLES, DIFFERENT LIFETIMES
--
-- `notifications` is the durable record of "this person was told this".
-- It backs the in-app list and survives whether or not a push was
-- delivered, so a board member who never enables push still sees the item.
-- Push delivery is an OPTIMISATION over this table, never the record.
--
-- `push_subscriptions` is per (user, device) and is disposable. A browser
-- may revoke an endpoint at any time and the push service then answers 404
-- or 410; the sender deletes it on that signal. Rows here are expected to
-- churn, which is why nothing references them.
--
-- WHY endpoint IS THE UNIQUE KEY
--
-- The push endpoint URL is the device identity as far as the push service
-- is concerned. Re-subscribing the same browser returns the same endpoint,
-- so upserting on it is what stops one laptop accumulating a row per
-- login. A user legitimately has several rows -- phone and laptop.
--
-- read_at NULL MEANS UNREAD
--
-- Deliberately a timestamp rather than a boolean: "when did they see it"
-- answers questions a flag cannot, and costs the same.
--
-- Idempotent. Safe to re-run. Runs as ONE statement -- see 0048's header
-- for why anything multi-statement is unreliable in the Supabase editor.

DO $mig$
BEGIN
  CREATE TABLE IF NOT EXISTS public.notifications (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    kind            text NOT NULL,
    title           text NOT NULL,
    body            text,
    -- Where clicking it should land, e.g. /tickets/<id>. Stored rather
    -- than derived so a future kind can point anywhere without a migration.
    link            text,
    -- The row that caused this, for dedupe and for cleaning up if it dies.
    entity_type     text,
    entity_id       uuid,
    read_at         timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
    ON public.notifications (user_id, created_at DESC)
    WHERE read_at IS NULL;

  CREATE INDEX IF NOT EXISTS notifications_org_idx
    ON public.notifications (organization_id, created_at DESC);

  -- One notification per person per event, however many times a job retries.
  CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_idx
    ON public.notifications (user_id, kind, entity_id)
    WHERE entity_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint        text NOT NULL UNIQUE,
    p256dh          text NOT NULL,
    auth            text NOT NULL,
    -- Only to help a person recognise a device in a future settings list.
    user_agent      text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    last_used_at    timestamptz
  );

  CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx
    ON public.push_subscriptions (user_id);

  ALTER TABLE public.notifications       ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.push_subscriptions  ENABLE ROW LEVEL SECURITY;

  -- Org membership gates the row, matching every other table here; the
  -- application additionally scopes to user_id. Service-role bypasses this
  -- entirely, which is how the Inngest fan-out writes for other users.
  DROP POLICY IF EXISTS org_access ON public.notifications;
  CREATE POLICY org_access ON public.notifications
    USING (organization_id = ANY (public.auth_org_ids()));

  DROP POLICY IF EXISTS org_access ON public.push_subscriptions;
  CREATE POLICY org_access ON public.push_subscriptions
    USING (organization_id = ANY (public.auth_org_ids()));

  RAISE NOTICE '0053 ok: notifications + push_subscriptions present.';
END
$mig$;
