-- 2026-10-20-sms-consent.sql — BL-110 resident text-message consent
--
-- NOT APPLIED. For the owner to run in the Supabase SQL editor (prod).
-- Candidate for the next migration batch.
--
-- The app does NOT need this to work. BL-110 ships without a schema
-- change:
--   * resident_communication_preferences.sms_opt_in (0018) is the switch;
--     the resident flips it on their own RLS-bound client
--     (apps/hoa/src/lib/sms-consent.ts, sms-consent-actions.ts).
--   * The consent evidence is an audit_log row, action
--     'sms_consent_granted' / 'sms_consent_revoked', entity_type
--     'resident_communication_preferences', metadata:
--       { disclosure_version, disclosure_sha256, phone_sha256[], method:
--         'portal', consented_at }   (revoke: { method, revoked_at })
--     written with the service role (0063's audit_log insert policy is
--     board/admin only), user_id = the resident.
--
-- What this adds — defence in depth for "a board can never opt a
-- resident in". 0063's resident_communication_preferences_update policy
-- lets board/admin UPDATE any row in their org, so a board member with
-- the anon key could flip someone's sms_opt_in straight through
-- PostgREST, bypassing the app. This trigger refuses any authenticated
-- (non-service-role) write that turns sms_opt_in ON for a row whose
-- user_id is not the caller, any UPDATE that moves an opted-in row to a
-- different user_id other than the caller (the new person never agreed),
-- and any sms_opt_in = true on a unit-only row (user_id null: nobody can
-- have agreed). Turning texts OFF stays open to everyone allowed by RLS —
-- stopping is always safe.
--
-- Service role (STOP webhook when one exists, jobs) and direct SQL
-- (no JWT) are unaffected.
--
-- Additive and idempotent. No table rewrite, no backfill.

-- ── part 1: pre-check (read-only) ─────────────────────────────────────
-- Any rows that are already on? (Expected 0 before BL-110 ships: nothing
-- wrote the column.) Ids and counts only.
select count(*) as sms_on_rows,
       count(*) filter (where user_id is null) as sms_on_unit_only_rows
from public.resident_communication_preferences
where sms_opt_in = true;

-- ── part 2: apply ─────────────────────────────────────────────────────
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

-- ── part 3: verify (read-only) ────────────────────────────────────────
-- covers_user_id = true: the current version (also fires on user_id).
select tgname, tgenabled, pg_get_triggerdef(oid) like '%user_id%' as covers_user_id
from pg_trigger
where tgrelid = 'public.resident_communication_preferences'::regclass
  and tgname = 'resident_sms_opt_in_self_only';

-- ── rollback ──────────────────────────────────────────────────────────
-- drop trigger if exists resident_sms_opt_in_self_only on public.resident_communication_preferences;
-- drop function if exists public.resident_sms_opt_in_self_only();
