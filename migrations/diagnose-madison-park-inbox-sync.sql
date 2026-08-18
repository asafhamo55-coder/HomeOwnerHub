-- diagnose-madison-park-inbox-sync.sql
--
-- READ-ONLY. Diagnoses why HomeownerHub's inbox shows more mail than Gmail
-- for Madison Park. Run in the Supabase SQL editor; changes nothing.
--
-- THE MECHANISM BEING TESTED
--
-- inbox_threads.gmail_state is 'unknown' by default and is only corrected
-- by mailboxReconcileJob (packages/jobs/src/mailbox-reconcile.ts), which
-- runs every 15 minutes. The inbox list hides a thread only when its state
-- is 'archived' or 'trashed' (apps/hoa/src/lib/inbox/queries.ts:345,364) --
-- so anything still 'unknown' is DISPLAYED.
--
-- That job refuses to apply a snapshot it could not read whole: absence is
-- how "archived" is derived, so a truncated read would hide a live inbox.
-- The cap is 50 pages x 100 messages = 5,000 messages in scope. When it
-- refuses it writes the reason to mailbox_accounts.sync_error and changes
-- nothing -- which looks exactly like "the app never forgets an email".
--
-- Query 1 is therefore the one that matters most.

-- ─── 1. Account health, and whether reconciliation is refusing ──────
SELECT
  'account'                                   AS check,
  ma.email_address,
  ma.sync_status,
  ma.scope_mode,
  ma.scope_value,
  ma.backfill_status,
  ma.last_synced_at,
  ma.disconnected_at,
  COALESCE(ma.sync_error, '(none)')           AS sync_error
FROM public.mailbox_accounts ma
JOIN public.orgs o ON o.id = ma.organization_id
WHERE ma.organization_id = 'a4906f16-baf3-4232-a2bd-a78ea432ad86';

-- ─── 2. Thread states: what the app shows vs hides ─────────────────
-- 'unknown' here is the smoking gun. In a reconciled mailbox it should be
-- a small, recent residue; a large 'unknown' count means reconciliation
-- has never successfully applied.
SELECT
  '2. thread gmail_state'                     AS check,
  t.gmail_state,
  count(*)                                    AS threads,
  CASE WHEN t.gmail_state IN ('archived','trashed')
       THEN 'hidden' ELSE 'SHOWN in app' END  AS visibility,
  min(t.last_message_at)                      AS oldest,
  max(t.last_message_at)                      AS newest
FROM public.inbox_threads t
WHERE t.organization_id = 'a4906f16-baf3-4232-a2bd-a78ea432ad86'
GROUP BY t.gmail_state
ORDER BY threads DESC;

-- ─── 3. The headline number: visible in app vs total ───────────────
-- `visible_in_app` is the count to compare against what Gmail shows.
SELECT
  '3. totals'                                                          AS check,
  count(*)                                                             AS threads_total,
  count(*) FILTER (WHERE gmail_state NOT IN ('archived','trashed'))     AS visible_in_app,
  count(*) FILTER (WHERE gmail_state IN ('archived','trashed'))         AS hidden,
  count(*) FILTER (WHERE gmail_state = 'unknown')                       AS never_reconciled
FROM public.inbox_threads
WHERE organization_id = 'a4906f16-baf3-4232-a2bd-a78ea432ad86';

-- ─── 4. Has reconciliation EVER written a message state? ───────────
-- gmail_state_at is stamped only by a successful reconcile pass. All NULL
-- means the job has never applied a snapshot for this mailbox.
SELECT
  '4. message reconciliation'                          AS check,
  count(*)                                             AS messages_total,
  count(*) FILTER (WHERE gmail_state_at IS NOT NULL)   AS ever_reconciled,
  max(gmail_state_at)                                  AS last_reconciled_at,
  count(*) FILTER (WHERE gmail_state = 'unknown')      AS state_unknown
FROM public.inbox_messages m
WHERE m.mailbox_account_id IN (
  SELECT id FROM public.mailbox_accounts
  WHERE organization_id = 'a4906f16-baf3-4232-a2bd-a78ea432ad86'
);

-- ─── 5. Is the inbox above the 5,000-message reconciliation cap? ────
-- If in_scope_messages is at or near 5,000, every reconcile pass will
-- refuse and the app can never drop a filed thread.
SELECT
  '5. reconciliation cap'                    AS check,
  count(*)                                   AS in_scope_messages,
  5000                                       AS cap,
  CASE WHEN count(*) >= 5000
       THEN 'OVER CAP — reconciliation will always refuse'
       ELSE 'under cap — reconciliation can complete' END AS verdict
FROM public.inbox_messages m
WHERE m.mailbox_account_id IN (
  SELECT id FROM public.mailbox_accounts
  WHERE organization_id = 'a4906f16-baf3-4232-a2bd-a78ea432ad86'
)
AND m.gmail_state <> 'deleted';

-- ─── 6. Duplicate detection (the other way to over-count) ──────────
-- inbox_messages_gmail_uniq should make this impossible; a non-empty
-- result would mean the unique index is missing or scoped differently
-- than assumed.
SELECT
  '6. duplicate gmail ids'                   AS check,
  gmail_message_id,
  count(*)                                   AS copies
FROM public.inbox_messages m
WHERE m.mailbox_account_id IN (
  SELECT id FROM public.mailbox_accounts
  WHERE organization_id = 'a4906f16-baf3-4232-a2bd-a78ea432ad86'
)
GROUP BY gmail_message_id
HAVING count(*) > 1
LIMIT 20;
