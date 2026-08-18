-- check-inbox-gmail-alignment.sql
--
-- READ-ONLY standing health check: "is HomeownerHub showing the same thing
-- as Gmail?" Run it any time, against prod, as often as you like. Nothing
-- here writes.
--
-- ─── HOW TO READ THIS ────────────────────────────────────────────────────
--
-- THE NUMBER TO COMPARE AGAINST GMAIL IS `visible threads (what the UI
-- shows)`. Nothing else on this list is the app's inbox count. Open Gmail,
-- read the conversation count on the account's inbox, and compare it to
-- that one row.
--
-- The predicate it uses is copied from the UI, not approximated:
-- apps/hoa/src/lib/inbox/queries.ts `applyGmailVisibility` (~line 359) hides
-- threads via `.not('gmail_state', 'in', '("archived","trashed")')`. So the
-- app hides EXACTLY 'archived' and 'trashed', and shows everything else —
-- including 'unknown'.
--
-- 'unknown' is the default for gmail_state (migration 0043) and means "we
-- have never observed this thread in Gmail". The UI deliberately puts it on
-- the VISIBLE side: mail whose filing state was never checked must not be
-- hidden on the assumption the board probably filed it. That is the right
-- call for the user and a trap for this check — a LARGE `threads never
-- reconciled ('unknown')` number means reconciliation has never successfully
-- applied, and the app is over-reporting by roughly that amount. Threads the
-- board archived months ago are still being counted as live inbox.
--
-- So: `visible threads` far above Gmail + a large `unknown` count is not a
-- duplicate-row problem. It is a reconciliation problem. Fix the sync, do
-- not delete rows.
--
-- Deliberately ONE result set. The Supabase SQL editor only surfaces the
-- last statement of a multi-statement script, which has already burned this
-- repo once (see diagnose-inbox-duplicates-onequery.sql). Every row below is
-- a UNION ALL branch of a single SELECT, ordered by `ord`.
--
-- Scoped to Madison Park. To check another org, change the one uuid in the
-- `org` CTE below — it is referenced everywhere else by name.

WITH org AS (
  SELECT 'a4906f16-baf3-4232-a2bd-a78ea432ad86'::uuid AS id
),

thr AS (
  SELECT t.* FROM public.inbox_threads t, org WHERE t.organization_id = org.id
),

msg AS (
  SELECT m.* FROM public.inbox_messages m, org WHERE m.organization_id = org.id
),

acct AS (
  SELECT a.* FROM public.mailbox_accounts a, org WHERE a.organization_id = org.id
),

-- Message counts per mailbox account, including disconnected ones. A
-- disconnected row still holding messages is half of what caused the
-- August 2026 incident: the disconnect left the old row's mail in place and
-- the reconnect imported all of it again under a new row.
acct_load AS (
  SELECT a.id,
         a.email_address,
         a.sync_status,
         a.sync_error,
         a.disconnected_at,
         a.connected_at,
         (SELECT count(*) FROM public.inbox_messages m WHERE m.mailbox_account_id = a.id) AS msgs,
         (SELECT count(*) FROM public.inbox_threads  t WHERE t.mailbox_account_id = a.id) AS thrs
    FROM acct a
),

dup_msg AS (
  SELECT count(*) AS groups, COALESCE(sum(n - 1), 0) AS excess
    FROM (SELECT count(*) AS n FROM public.inbox_messages
           GROUP BY organization_id, gmail_message_id HAVING count(*) > 1) z
),

dup_thr AS (
  SELECT count(*) AS groups, COALESCE(sum(n - 1), 0) AS excess
    FROM (SELECT count(*) AS n FROM public.inbox_threads
           GROUP BY organization_id, gmail_thread_id HAVING count(*) > 1) z
),

-- Everything the verdict depends on, computed once.
facts AS (
  SELECT
    (SELECT count(*) FROM thr WHERE gmail_state NOT IN ('archived','trashed')) AS visible,
    (SELECT count(*) FROM thr WHERE gmail_state IN ('archived','trashed'))     AS hidden,
    (SELECT count(*) FROM thr WHERE gmail_state = 'unknown')                   AS unknown_thr,
    (SELECT count(*) FROM msg)                                                 AS msgs,
    (SELECT count(*) FROM msg WHERE gmail_state_at IS NULL)                    AS msgs_unreconciled,
    (SELECT count(*) FROM acct_load WHERE disconnected_at IS NULL)             AS live_accts,
    (SELECT count(*) FROM acct_load WHERE disconnected_at IS NOT NULL AND msgs > 0) AS zombie_accts,
    (SELECT COALESCE(sum(msgs), 0) FROM acct_load WHERE disconnected_at IS NOT NULL) AS zombie_msgs,
    (SELECT groups FROM dup_msg) AS dup_msg_groups,
    (SELECT groups FROM dup_thr) AS dup_thr_groups
)

-- ─── A. The number to compare against Gmail ──────────────────────────────
SELECT 1 AS ord,
       'A. visible threads (what the UI shows) <-- COMPARE THIS TO GMAIL' AS check,
       (SELECT visible::text FROM facts) AS value

UNION ALL
SELECT 2, 'A. hidden threads (archived/trashed in Gmail)',
       (SELECT hidden::text FROM facts)

UNION ALL
-- Counted inside `visible` above, not in addition to it. This is the slice
-- of the visible number the app is guessing at.
SELECT 3, 'A. of which never reconciled (gmail_state=''unknown'', SHOWN by UI)',
       (SELECT unknown_thr::text FROM facts)

UNION ALL
-- ─── B. Messages ─────────────────────────────────────────────────────────
SELECT 10, 'B. messages total', (SELECT msgs::text FROM facts)

UNION ALL
SELECT 11, 'B. messages never reconciled (gmail_state_at IS NULL)',
       (SELECT msgs_unreconciled::text FROM facts)

UNION ALL
-- inbox_threads has no gmail_state_at column — only inbox_messages does —
-- so the freshest message reconcile IS the freshest reconcile there is.
-- NOT a reconcile timestamp. ingest.ts:637-638 stamps gmail_state and
-- gmail_state_at at CAPTURE time, so this is the most recently
-- INGESTED message. It advances whenever new mail arrives, even if
-- reconciliation has never run — which is exactly how it misled us:
-- it read 17:24 while reconcile_ran_at was still NEVER. Use R.45.
SELECT 12, 'B. newest message state stamp (INGEST, not reconcile — see R.45)',
       COALESCE((SELECT max(gmail_state_at)::text FROM msg), 'NEVER — reconciliation has never run')

UNION ALL
-- ─── C. Mailbox accounts ─────────────────────────────────────────────────
-- More than one LIVE row, or a disconnected row still holding messages, is
-- the failure that produced 437 duplicate messages and 229 duplicate threads.
-- Address masked: this output gets pasted into tickets and chat.
SELECT 20 + row_number() OVER (ORDER BY a.connected_at, a.id),
       'C. mailbox ' || left(a.email_address, 3) || '***@' || split_part(a.email_address, '@', 2),
       CASE WHEN a.disconnected_at IS NULL
            THEN 'LIVE' ELSE 'DISCONNECTED ' || a.disconnected_at::date::text END
       || ', sync_status=' || a.sync_status
       || ', ' || a.msgs::text || ' msg / ' || a.thrs::text || ' thread'
       || CASE WHEN a.sync_error IS NULL THEN ', no sync_error'
               ELSE ', sync_error=' || left(a.sync_error, 120) END
  FROM acct_load a

UNION ALL
SELECT 40, 'C. live mailbox accounts (expected 1)',
       (SELECT live_accts::text FROM facts)

UNION ALL
SELECT 41, 'C. disconnected accounts still holding messages (expected 0)',
       (SELECT zombie_accts::text || ' account(s), ' || zombie_msgs::text || ' message(s)' FROM facts)

UNION ALL
-- ─── D. Duplicates under the org-scoped identity key (0048) ──────────────
-- ─── Reconciliation health (0049) ───────────────────────────────────
-- reconcile used to write its skip reason to sync_error, which
-- mailboxSyncJob blanks every 2 minutes on a clean run. An account could
-- refuse to reconcile on every pass and still report no error at all.
-- 0049 gave reconciliation its own columns; nothing else writes them.
--
-- R.45 is the row that separates the two failures which look identical
-- from outside: a job that never runs, and one that runs and legitimately
-- has nothing to change.
SELECT 45, 'R. reconciliation last ran',
       COALESCE(
         (SELECT max(reconcile_ran_at)::text FROM public.mailbox_accounts
           WHERE organization_id = 'a4906f16-baf3-4232-a2bd-a78ea432ad86'),
         'NEVER - no completed pass for this mailbox')
UNION ALL
SELECT 46, 'R. reconciliation refusing?',
       COALESCE(
         (SELECT left(reconcile_error, 200) FROM public.mailbox_accounts
           WHERE organization_id = 'a4906f16-baf3-4232-a2bd-a78ea432ad86'
             AND reconcile_error IS NOT NULL
           ORDER BY reconcile_skipped_at DESC NULLS LAST LIMIT 1),
         'no - last pass applied, or it has never run (see R.45)')
UNION ALL
SELECT 50, 'D. duplicate (organization_id, gmail_message_id) groups (expected 0)',
       (SELECT groups::text || ' group(s), ' || excess::text || ' excess row(s)' FROM dup_msg)

UNION ALL
SELECT 51, 'D. duplicate (organization_id, gmail_thread_id) groups (expected 0)',
       (SELECT groups::text || ' group(s), ' || excess::text || ' excess row(s)' FROM dup_thr)

UNION ALL
-- ─── E. Verdict ──────────────────────────────────────────────────────────
-- Ordered by what to fix first: duplicate identity, then mailbox topology,
-- then reconciliation. Each cause makes the app over-report; fixing a later
-- one while an earlier one holds will not make the numbers match Gmail.
SELECT 99, 'E. VERDICT',
       (SELECT CASE
          WHEN dup_msg_groups > 0 OR dup_thr_groups > 0
            THEN 'NOT ALIGNED — duplicate rows survive under the org-scoped key ('
                 || dup_thr_groups::text || ' thread group(s), '
                 || dup_msg_groups::text || ' message group(s)). 0048 did not fully apply; '
                 || 'run verify-0048-inbox-identity.sql.'
          WHEN live_accts > 1
            THEN 'NOT ALIGNED — ' || live_accts::text || ' LIVE mailbox accounts for this org. '
                 || 'Each one backfills independently, so mail is being imported more than once. '
                 || 'Disconnect all but the intended one BEFORE deduping, or it will re-duplicate.'
          WHEN live_accts = 0
            THEN 'NOT ALIGNED — no live mailbox account. Nothing is syncing; the inbox is a '
                 || 'frozen snapshot and will drift further from Gmail every day.'
          WHEN zombie_accts > 0
            THEN 'NOT ALIGNED — a disconnected mailbox still holds ' || zombie_msgs::text
                 || ' message(s). Those are stranded: no sync will ever reconcile them, so their '
                 || 'threads stay ''unknown'' and stay visible forever.'
          WHEN unknown_thr > 0
            THEN 'NOT ALIGNED — ' || unknown_thr::text || ' of ' || visible::text
                 || ' visible threads have gmail_state=''unknown'' (never reconciled). The UI shows '
                 || 'unknown threads, so the app is over-reporting by up to that many. '
                 || 'Reconciliation has not applied — fix the sync, do not delete rows.'
          WHEN msgs_unreconciled > 0
            THEN 'MOSTLY ALIGNED — thread states are all reconciled, but ' || msgs_unreconciled::text
                 || ' message(s) still have gmail_state_at IS NULL. Thread counts are trustworthy; '
                 || 'per-message Gmail state is not.'
          ELSE 'ALIGNED — one live mailbox, no duplicates, every thread reconciled against Gmail. '
               || 'Row A''s visible-thread count (' || visible::text
               || ') should match the Gmail inbox.'
        END FROM facts)

ORDER BY 1;
