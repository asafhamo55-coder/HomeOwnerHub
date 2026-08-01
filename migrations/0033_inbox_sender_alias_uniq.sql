-- 0033_inbox_sender_alias_uniq.sql
-- Fix: make inbox_sender_aliases writable via supabase-js upsert().
--
-- 0029_inbox.sql created inbox_sender_aliases_uniq as an EXPRESSION index:
--   CREATE UNIQUE INDEX inbox_sender_aliases_uniq
--     ON public.inbox_sender_aliases(organization_id, lower(email_address));
--
-- Task 21 (apps/hoa/src/lib/inbox/actions.ts, assignThreadToProperty) needs
-- to upsert this table so two managers who assign the same sender's thread
-- concurrently converge on one row instead of racing two inserts. Postgres
-- itself is happy to use an expression index as an ON CONFLICT target in
-- raw SQL, but the app writes through supabase-js, and PostgREST's upsert
-- `on_conflict` parameter only accepts a literal comma-separated COLUMN
-- list — it cannot carry an expression like `lower(email_address)`, and
-- Postgres's conflict-target inference does not match a plain column list
-- against an expression index. Confirmed live against this project: running
--   INSERT INTO inbox_sender_aliases (organization_id, email_address, ...)
--   VALUES (...) ON CONFLICT (organization_id, email_address) DO NOTHING;
-- against this index fails with
--   42P10: there is no unique or exclusion constraint matching the ON
--   CONFLICT specification
-- exactly the failure mode migration 0031 hit and fixed the same way for
-- inbox_attachments — see that file's header for the full precedent.
--
-- So the case-fold is materialized into a real, non-nullable, plain column
-- (`email_address_lower`) via a stored generated column, and the unique
-- index is a plain btree over two ordinary columns — something
-- supabase-js's `.upsert(..., { onConflict:
-- 'organization_id,email_address_lower' })` can target directly.
-- actions.ts never reads or writes email_address_lower itself; Postgres
-- computes it from email_address on every insert. match.ts's alias lookup
-- (lib/inbox/match.ts) is unaffected — it reads via .ilike() on
-- email_address, not through this index.
--
-- No existing rows to reconcile: inbox_sender_aliases was empty at the
-- time this migration was written (confirmed:
-- `select count(*) from inbox_sender_aliases` -> 0), and the OLD index
-- already enforced (organization_id, lower(email_address)) uniqueness, so
-- no two live rows could collide under the new index either.
--
-- Idempotent. Safe to re-run.

-- Drop the expression-index form so this migration converges to the
-- generated-column form regardless of which version last ran.
DROP INDEX IF EXISTS public.inbox_sender_aliases_uniq;

ALTER TABLE public.inbox_sender_aliases
  ADD COLUMN IF NOT EXISTS email_address_lower text
    GENERATED ALWAYS AS (lower(email_address)) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS inbox_sender_aliases_uniq
  ON public.inbox_sender_aliases(organization_id, email_address_lower);
