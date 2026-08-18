-- diagnose-inbox-duplicates.sql
--
-- READ-ONLY. Follow-up to diagnose-madison-park-inbox-sync.sql, which
-- found duplicate gmail_message_id rows.
--
-- WHY THAT SHOULD BE IMPOSSIBLE
--
-- 0029_inbox.sql:139 declares
--   CREATE UNIQUE INDEX IF NOT EXISTS inbox_messages_gmail_uniq
--     ON public.inbox_messages(gmail_message_id);
-- globally, not per account. Duplicates cannot exist while that index
-- does. CREATE UNIQUE INDEX fails outright if duplicates are already
-- present, so the likeliest history is that the statement errored when
-- 0029 was applied and the remaining statements carried on without it.
--
-- Query 1 settles that. The rest establish a SAFE de-duplication rule
-- before anything is deleted: inbox_attachments.message_id and the reply
-- embeddings both reference inbox_messages ON DELETE CASCADE, so removing
-- the wrong copy silently destroys its attachments.

-- ─── 1. Does the unique index actually exist? ──────────────────────
SELECT
  '1. unique index'                                  AS check,
  COALESCE(
    (SELECT indexdef FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'inbox_messages_gmail_uniq'),
    'MISSING — this is why duplicates accumulated'
  )                                                  AS result;

-- ─── 2. Scale, org-wide (not just Madison Park) ────────────────────
WITH d AS (
  SELECT gmail_message_id, count(*) AS copies
  FROM public.inbox_messages
  GROUP BY gmail_message_id
  HAVING count(*) > 1
)
SELECT
  '2. duplication scale'                             AS check,
  (SELECT count(*) FROM public.inbox_messages)       AS messages_total,
  (SELECT count(*) FROM d)                           AS duplicated_ids,
  (SELECT COALESCE(sum(copies - 1), 0) FROM d)       AS excess_rows,
  (SELECT COALESCE(max(copies), 0) FROM d)           AS worst_case;

-- ─── 3. Do the copies sit in different accounts or threads? ────────
-- If account_ids differ, a reconnect created a second mailbox_accounts row
-- and the backfill re-imported everything under it. If they match, the
-- same account ingested twice.
WITH d AS (
  SELECT gmail_message_id
  FROM public.inbox_messages GROUP BY gmail_message_id HAVING count(*) > 1
)
SELECT
  '3. how copies differ'                                        AS check,
  count(*)                                                      AS duplicate_groups,
  count(*) FILTER (WHERE accounts > 1)                          AS across_accounts,
  count(*) FILTER (WHERE accounts = 1)                          AS same_account,
  count(*) FILTER (WHERE threads > 1)                           AS across_threads,
  count(*) FILTER (WHERE orgs > 1)                              AS across_orgs
FROM (
  SELECT m.gmail_message_id,
         count(DISTINCT m.mailbox_account_id) AS accounts,
         count(DISTINCT m.thread_id)          AS threads,
         count(DISTINCT m.organization_id)    AS orgs
  FROM public.inbox_messages m
  JOIN d ON d.gmail_message_id = m.gmail_message_id
  GROUP BY m.gmail_message_id
) x;

-- ─── 4. Mailbox accounts for Madison Park ──────────────────────────
-- A second live row, or a disconnected one with messages still attached,
-- confirms the reconnect theory.
SELECT
  '4. accounts'                                      AS check,
  ma.id,
  ma.email_address,
  ma.sync_status,
  ma.connected_at,
  ma.disconnected_at,
  (SELECT count(*) FROM public.inbox_messages m
    WHERE m.mailbox_account_id = ma.id)              AS messages
FROM public.mailbox_accounts ma
WHERE ma.organization_id = 'a4906f16-baf3-4232-a2bd-a78ea432ad86'
ORDER BY ma.connected_at;

-- ─── 5. Which copy carries the attachments? ────────────────────────
-- Decides the de-duplication rule. If attachments cluster on one copy,
-- keeping "the oldest" blindly would delete them via ON DELETE CASCADE.
WITH d AS (
  SELECT gmail_message_id
  FROM public.inbox_messages GROUP BY gmail_message_id HAVING count(*) > 1
),
ranked AS (
  SELECT m.id, m.gmail_message_id,
         row_number() OVER (PARTITION BY m.gmail_message_id
                            ORDER BY m.ingested_at, m.id) AS copy_no,
         (SELECT count(*) FROM public.inbox_attachments a
           WHERE a.message_id = m.id)                     AS attachments
  FROM public.inbox_messages m
  JOIN d ON d.gmail_message_id = m.gmail_message_id
)
SELECT
  '5. attachments by copy'                           AS check,
  copy_no,
  count(*)                                           AS rows,
  count(*) FILTER (WHERE attachments > 0)            AS rows_with_attachments,
  COALESCE(sum(attachments), 0)                      AS attachment_rows
FROM ranked
GROUP BY copy_no
ORDER BY copy_no;

-- ─── 6. Are the copies actually identical? ─────────────────────────
-- If subject/sent_at/body differ, they are not simple re-ingests and a
-- blind de-dup would lose real content.
WITH d AS (
  SELECT gmail_message_id
  FROM public.inbox_messages GROUP BY gmail_message_id HAVING count(*) > 1
)
SELECT
  '6. copies identical?'                                          AS check,
  count(*)                                                        AS duplicate_groups,
  count(*) FILTER (WHERE subjects > 1)                            AS differing_subject,
  count(*) FILTER (WHERE sent_ats > 1)                            AS differing_sent_at,
  count(*) FILTER (WHERE bodies > 1)                              AS differing_body
FROM (
  SELECT m.gmail_message_id,
         count(DISTINCT COALESCE(m.subject, ''))       AS subjects,
         count(DISTINCT m.sent_at)                     AS sent_ats,
         count(DISTINCT md5(COALESCE(m.body_text, ''))) AS bodies
  FROM public.inbox_messages m
  JOIN d ON d.gmail_message_id = m.gmail_message_id
  GROUP BY m.gmail_message_id
) y;
