-- diagnose-inbox-duplicates-onequery.sql
--
-- READ-ONLY. Everything the inbox-duplicate repair needs, as ONE result
-- set — the Supabase SQL editor only surfaces the last statement, so the
-- six-statement version was only ever showing its final query.
--
-- Copy the whole result back. Nothing here writes.

WITH dup AS (
  SELECT gmail_message_id
  FROM public.inbox_messages
  GROUP BY gmail_message_id
  HAVING count(*) > 1
),
dupmsg AS (
  SELECT m.*
  FROM public.inbox_messages m
  JOIN dup d ON d.gmail_message_id = m.gmail_message_id
),
ranked AS (
  SELECT m.id, m.gmail_message_id,
         row_number() OVER (PARTITION BY m.gmail_message_id
                            ORDER BY m.ingested_at, m.id) AS copy_no,
         (SELECT count(*) FROM public.inbox_attachments a WHERE a.message_id = m.id) AS atts
  FROM dupmsg m
),
grp AS (
  SELECT gmail_message_id,
         count(DISTINCT mailbox_account_id) AS accounts,
         count(DISTINCT thread_id)          AS threads,
         count(DISTINCT organization_id)    AS orgs
  FROM dupmsg GROUP BY gmail_message_id
)

--  A. is the unique index there?
SELECT 1 AS ord, 'A. inbox_messages_gmail_uniq' AS check,
       COALESCE((SELECT 'PRESENT' FROM pg_indexes
                 WHERE schemaname='public' AND indexname='inbox_messages_gmail_uniq'),
                'MISSING — root cause') AS value
UNION ALL
SELECT 2, 'B. inbox_threads_gmail_uniq',
       COALESCE((SELECT 'PRESENT' FROM pg_indexes
                 WHERE schemaname='public' AND indexname='inbox_threads_gmail_uniq'),
                'MISSING')
UNION ALL
--  C. scale
SELECT 3, 'C. messages total', (SELECT count(*)::text FROM public.inbox_messages)
UNION ALL
SELECT 4, 'C. duplicated gmail ids', (SELECT count(*)::text FROM dup)
UNION ALL
SELECT 5, 'C. excess message rows',
       (SELECT COALESCE(sum(c-1),0)::text FROM
         (SELECT count(*) c FROM dupmsg GROUP BY gmail_message_id) z)
UNION ALL
--  D. how the copies differ
SELECT 6, 'D. groups spanning >1 account', (SELECT count(*)::text FROM grp WHERE accounts > 1)
UNION ALL
SELECT 7, 'D. groups inside ONE account',  (SELECT count(*)::text FROM grp WHERE accounts = 1)
UNION ALL
SELECT 8, 'D. groups spanning >1 thread',  (SELECT count(*)::text FROM grp WHERE threads > 1)
UNION ALL
SELECT 9, 'D. groups spanning >1 org',     (SELECT count(*)::text FROM grp WHERE orgs > 1)
UNION ALL
--  E. attachments per copy — decides which copy is safe to keep
SELECT 10 + copy_no, 'E. copy #' || copy_no,
       count(*)::text || ' rows, ' ||
       count(*) FILTER (WHERE atts > 0)::text || ' with attachments, ' ||
       COALESCE(sum(atts),0)::text || ' attachment rows'
FROM ranked GROUP BY copy_no
UNION ALL
--  F. duplicate THREADS (what the inbox actually lists)
SELECT 30, 'F. duplicate thread groups',
       (SELECT count(*)::text FROM
         (SELECT organization_id, gmail_thread_id
          FROM public.inbox_threads
          GROUP BY organization_id, gmail_thread_id HAVING count(*) > 1) t)
UNION ALL
SELECT 31, 'F. excess thread rows',
       (SELECT COALESCE(sum(c-1),0)::text FROM
         (SELECT count(*) c FROM public.inbox_threads
          GROUP BY organization_id, gmail_thread_id HAVING count(*) > 1) t)
UNION ALL
--  G. Madison Park mailbox accounts
SELECT 40 + row_number() OVER (ORDER BY ma.connected_at),
       'G. account ' || ma.email_address,
       ma.sync_status || ', connected ' || ma.connected_at::date ||
       CASE WHEN ma.disconnected_at IS NULL THEN ', LIVE' ELSE ', disconnected ' || ma.disconnected_at::date END ||
       ', ' || (SELECT count(*) FROM public.inbox_messages m WHERE m.mailbox_account_id = ma.id)::text || ' messages'
FROM public.mailbox_accounts ma
WHERE ma.organization_id = 'a4906f16-baf3-4232-a2bd-a78ea432ad86'
ORDER BY 1;
