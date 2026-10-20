-- 2026-10-20-inbound-auth.sql — BL-105 inbound sender authentication
--
-- NOT APPLIED. For the owner to run in the Supabase SQL editor (prod).
-- Candidate for the next migration batch (0065).
--
-- What: inbox_messages.sender_auth — the receiving server's SPF/DKIM/DMARC
-- verdict for the From address, read at ingest from the topmost
-- Authentication-Results header (packages/mailbox/src/auth-results.ts):
--   'pass' | 'fail' | 'none'.  NULL = stored before this column existed.
--
-- Additive and idempotent: a nullable text column with a CHECK, no default,
-- no backfill, no table rewrite. Existing RLS on inbox_messages covers it
-- (the column inherits the table's policies). Writes come from the Gmail
-- sync job (service role); the Inbox reads it on the board's RLS client.
--
-- After applying:
--   1. Run part 3 (verify) below.
--   2. Set SENDER_AUTH_COLUMN_LIVE = true in
--      packages/mailbox/src/auth-results.ts and deploy (hoa + jobs).
--      Until then nothing writes or reads this column.
--   3. Optionally `pnpm gen:types` — but only once every migration in
--      migrations/ is applied (CLAUDE.md footgun 3).
--
-- Old mail stays NULL (= 'none', the softer note in the Inbox rail) until a
-- mailbox reconnect backfill re-observes it; ingest fills the column on
-- re-observe too.

-- ── part 1: pre-check (read-only) ─────────────────────────────────────
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'inbox_messages' and column_name = 'sender_auth';
-- expect 0 rows on first apply (1 row = already applied; part 2 is a no-op)

-- ── part 2: apply ─────────────────────────────────────────────────────
begin;

alter table public.inbox_messages
  add column if not exists sender_auth text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'inbox_messages_sender_auth_check'
      and conrelid = 'public.inbox_messages'::regclass
  ) then
    alter table public.inbox_messages
      add constraint inbox_messages_sender_auth_check
      check (sender_auth is null or sender_auth in ('pass', 'fail', 'none'));
  end if;
end $$;

comment on column public.inbox_messages.sender_auth is
  'BL-105: receiving server SPF/DKIM/DMARC verdict for the From address (pass | fail | none), from the topmost Authentication-Results header at ingest. NULL = stored before the column existed. fail = unverified sender in the Inbox.';

commit;

-- ── part 3: verify (read-only) ────────────────────────────────────────
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'inbox_messages' and column_name = 'sender_auth';
-- expect: sender_auth | text | YES

select conname
from pg_constraint
where conrelid = 'public.inbox_messages'::regclass and conname = 'inbox_messages_sender_auth_check';
-- expect: 1 row

select sender_auth, count(*) from public.inbox_messages group by 1;
-- expect: a single NULL bucket right after applying (counts only, no PII)
