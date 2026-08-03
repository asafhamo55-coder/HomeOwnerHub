-- 0037_inbox_vendor_assignment.sql
--
-- File an inbox thread under a vendor, independently of its property
-- filing. A thread may be filed under a property AND a vendor at once —
-- the landscaper writing about 907 Urban Ash is both.
--
-- Mirrors unit_id's treatment: ON DELETE SET NULL so removing a vendor
-- unfiles its threads rather than cascading them away, and a partial index
-- because vendor_id is null on most rows.
--
-- Deliberately NOT reusing inbox_thread_links: that table's resource_id has
-- no foreign key (see the comment at apps/hoa/src/lib/inbox/actions.ts:372
-- — any fabricated UUID can be linked there, and the first reader must
-- org-scope its own join). A real column gets real referential integrity.
--
-- No RLS change: inbox_threads policies are row-scoped by org, not
-- column-scoped.

ALTER TABLE public.inbox_threads
  ADD COLUMN IF NOT EXISTS vendor_id uuid
    REFERENCES public.vendors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS inbox_threads_vendor_idx
  ON public.inbox_threads(vendor_id, last_message_at DESC)
  WHERE vendor_id IS NOT NULL;
