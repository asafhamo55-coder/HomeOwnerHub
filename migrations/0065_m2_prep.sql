-- 0065_m2_prep.sql — BL-123, next migration batch (M2-prep)
--
-- Apply: docs/specs/2026-10-20-sql-runbook.md, Section H. Needs 0063 and
-- 0064 (runbook sections A and B).
--
-- Four parts, each idempotent and each identical in effect to the spec
-- file the owner may already have pasted, so applying the spec, this
-- file, or both (in either order, any number of times) ends in the same
-- state:
--
--   1. BL-104  orgs_plan_check also allows 'essentials', 'complete',
--              'pilot', 'legacy_per_door'. Blocks the PRICING_V2 flip:
--              without it the band plans fail with 23514, unseen, exactly
--              like 'monthly' / 'annual' before 0064. Every value 0064
--              allowed is kept.
--   2. BL-088  public.resident_meeting_notices()
--              = docs/specs/2026-10-19-resident-meeting-notices.sql
--              (runbook C1).
--   3. BL-110  resident_sms_opt_in_self_only trigger
--              = docs/specs/2026-10-20-sms-consent.sql part 2 (runbook D2).
--   4. BL-105  inbox_messages.sender_auth + inbox_messages_sender_auth_check
--              = docs/specs/2026-10-20-inbound-auth.sql part 2 (runbook E2).
--              Nothing reads or writes the column until
--              SENDER_AUTH_COLUMN_LIVE (packages/mailbox/src/auth-results.ts)
--              is flipped; that is a separate change.
--
-- No table rewrite, no backfill. All-or-nothing.

BEGIN;

-- ── 1. orgs_plan_check ────────────────────────────────────────────────
-- Same list as 0064 plus the four BL-104 values
-- (packages/billing/src/billing-status.ts PLAN_FOR_LOOKUP_KEY writes
-- essentials / complete; packages/billing/src/pricing-v2.ts reserves pilot
-- and legacy_per_door). Drop-and-add is idempotent; existing rows already
-- satisfy the wider list.
ALTER TABLE public.orgs DROP CONSTRAINT IF EXISTS orgs_plan_check;
ALTER TABLE public.orgs ADD CONSTRAINT orgs_plan_check CHECK (plan = ANY (ARRAY[
  'free', 'starter', 'standard', 'pro', 'enterprise', 'per_case', 'unlimited',
  'monthly', 'annual',
  'essentials', 'complete', 'pilot', 'legacy_per_door'
]));

-- ── 2. resident_meeting_notices() ─────────────────────────────────────
-- Verbatim from docs/specs/2026-10-19-resident-meeting-notices.sql.
-- Safe-column read for residents: no raw_transcript, attendees, motions or
-- action items. /resident/meetings switches on by itself once it exists.
CREATE OR REPLACE FUNCTION public.resident_meeting_notices()
RETURNS TABLE (id uuid, org_id uuid, meeting_date date, meeting_type text,
               status text, body text, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id, m.org_id, m.meeting_date, m.meeting_type, m.status,
         CASE WHEN m.status = 'approved' THEN m.ai_summary
              WHEN m.updated_at < (m.meeting_date::timestamp AT TIME ZONE 'UTC') THEN m.ai_summary
         END,
         m.updated_at
    FROM public.hoa_meeting_minutes m
   WHERE m.org_id = ANY (public.auth_org_ids())
     AND m.deleted_at IS NULL
     AND (   (m.status = 'approved' AND m.meeting_date <= current_date + 1)
          OR (m.status = 'draft'    AND m.meeting_date >= current_date - 1));
$$;
REVOKE ALL ON FUNCTION public.resident_meeting_notices() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resident_meeting_notices() TO authenticated, service_role;

-- ── 3. SMS consent guard ──────────────────────────────────────────────
-- Verbatim from docs/specs/2026-10-20-sms-consent.sql part 2. Refuses any
-- authenticated (non-service-role) write that turns sms_opt_in ON for a
-- row whose user_id is not the caller, any UPDATE that moves an opted-in
-- row to a user_id other than the caller (fires on UPDATE OF sms_opt_in,
-- user_id), and any sms_opt_in = true on a unit-only row. Turning texts
-- OFF stays open to everyone RLS allows.
create or replace function public.resident_sms_opt_in_self_only()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  v_turning_on boolean :=
    new.sms_opt_in = true
    and (tg_op = 'INSERT' or old.sms_opt_in is distinct from true);
  -- Moving an opted-in row to another person is the same as turning texts
  -- on for them: that person never agreed. Only they (or the service role)
  -- may do it.
  v_reassigning boolean :=
    tg_op = 'UPDATE'
    and new.sms_opt_in = true
    and new.user_id is distinct from old.user_id;
begin
  if not (v_turning_on or v_reassigning) then
    return new;
  end if;
  if new.user_id is null then
    raise exception 'sms_opt_in can only be set by the resident themselves'
      using errcode = '42501';
  end if;
  if v_role in ('authenticated', 'anon') and auth.uid() is distinct from new.user_id then
    raise exception 'sms_opt_in can only be set by the resident themselves'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists resident_sms_opt_in_self_only on public.resident_communication_preferences;
create trigger resident_sms_opt_in_self_only
  before insert or update of sms_opt_in, user_id on public.resident_communication_preferences
  for each row execute function public.resident_sms_opt_in_self_only();

-- ── 4. inbox_messages.sender_auth ─────────────────────────────────────
-- Verbatim from docs/specs/2026-10-20-inbound-auth.sql part 2 (minus its
-- own begin/commit: this file is one transaction already).
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

COMMIT;

-- PostgREST: pick up the new function and column.
NOTIFY pgrst, 'reload schema';
