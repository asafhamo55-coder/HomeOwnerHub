-- verify-0048-inbox-identity.sql
--
-- Run AFTER 0048_inbox_org_scoped_identity.sql. READ-ONLY: safe to run any
-- number of times, in any order, against prod.
--
-- Every row returns PASS or FAIL with the offending value, in the style of
-- verify-0047-collections.sql — with ONE deliberate difference: 0047 is a
-- series of separate statements, and the Supabase SQL editor only surfaces
-- the LAST statement it is handed. That has already cost this repo one
-- round trip (see the header of diagnose-inbox-duplicates-onequery.sql), so
-- this file is a single UNION ALL result set instead. Paste the whole thing,
-- read every row.
--
-- The check that matters most is #1/#2: the two new unique indexes are
-- verified BY DEFINITION, not by name. migrations/diagnose-inbox-index-defs.sql
-- exists because an earlier diagnostic asked only whether
-- `inbox_messages_gmail_uniq` EXISTED, got "PRESENT", and reported the
-- dedupe key as healthy while 437 duplicate messages sat in the table — the
-- live index had been rebuilt on different columns than the migration said.
-- An index name is a label someone chose; the column list is the constraint.
-- So #1/#2 assert, from pg_index directly:
--   * the index is UNIQUE (indisunique),
--   * its key columns are EXACTLY (organization_id, gmail_message_id) /
--     (organization_id, gmail_thread_id), in that order,
--   * it has no WHERE clause (indpred IS NULL) — a partial unique index
--     enforces nothing outside its predicate, which is exactly the shape of
--     a hole you would not notice, and
--   * it is on the expected table.
-- When one fails, the row prints the live definition so the difference is
-- visible immediately rather than requiring a second query.
--
-- Expected after a clean 0048: every row PASS, and exactly ONE
-- "BREAKDOWN: mailbox" row for Madison Park. Two breakdown rows with
-- non-zero message counts means the duplicate mailbox was never merged.

WITH org AS (
  SELECT 'a4906f16-baf3-4232-a2bd-a78ea432ad86'::uuid AS id
),

-- Every index on the two inbox tables, resolved to its real key columns.
-- indkey is the ordered attnum vector; unnest WITH ORDINALITY preserves that
-- order, which matters — (gmail_message_id, organization_id) is a different
-- index from (organization_id, gmail_message_id) for prefix lookups even
-- though it enforces the same uniqueness.
idx AS (
  SELECT ic.relname                AS index_name,
         tc.relname                AS table_name,
         i.indisunique             AS is_unique,
         i.indpred IS NOT NULL     AS is_partial,
         pg_get_indexdef(i.indexrelid) AS def,
         (SELECT array_agg(a.attname::text ORDER BY k.ord)
            FROM unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
            JOIN pg_attribute a
              ON a.attrelid = i.indrelid AND a.attnum = k.attnum
           WHERE k.ord <= i.indnkeyatts) AS key_cols
    FROM pg_index i
    JOIN pg_class ic ON ic.oid = i.indexrelid
    JOIN pg_class tc ON tc.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = tc.relnamespace
   WHERE n.nspname = 'public'
     AND tc.relname IN ('inbox_messages', 'inbox_threads')
),

dup_msg AS (
  SELECT organization_id, gmail_message_id, count(*) AS n
    FROM public.inbox_messages
   GROUP BY organization_id, gmail_message_id
  HAVING count(*) > 1
),

dup_thr AS (
  SELECT organization_id, gmail_thread_id, count(*) AS n
    FROM public.inbox_threads
   GROUP BY organization_id, gmail_thread_id
  HAVING count(*) > 1
)

-- ─── 1. inbox_messages_org_gmail_uniq is UNIQUE (organization_id, gmail_message_id)
SELECT 1 AS ord,
       'new index: inbox_messages_org_gmail_uniq' AS check,
       COALESCE(
         (SELECT CASE
                   WHEN NOT is_unique
                     THEN 'FAIL — exists but is NOT UNIQUE: ' || def
                   WHEN is_partial
                     THEN 'FAIL — has a WHERE clause, so it enforces nothing outside it: ' || def
                   WHEN table_name <> 'inbox_messages'
                     THEN 'FAIL — on the wrong table: ' || table_name
                   WHEN key_cols <> ARRAY['organization_id','gmail_message_id']
                     THEN 'FAIL — wrong columns: (' || array_to_string(key_cols, ', ') || ')'
                   ELSE 'PASS'
                 END
            FROM idx WHERE index_name = 'inbox_messages_org_gmail_uniq'),
         'FAIL — index does not exist') AS result

UNION ALL
-- ─── 2. inbox_threads_org_gmail_uniq is UNIQUE (organization_id, gmail_thread_id)
SELECT 2,
       'new index: inbox_threads_org_gmail_uniq',
       COALESCE(
         (SELECT CASE
                   WHEN NOT is_unique
                     THEN 'FAIL — exists but is NOT UNIQUE: ' || def
                   WHEN is_partial
                     THEN 'FAIL — has a WHERE clause, so it enforces nothing outside it: ' || def
                   WHEN table_name <> 'inbox_threads'
                     THEN 'FAIL — on the wrong table: ' || table_name
                   WHEN key_cols <> ARRAY['organization_id','gmail_thread_id']
                     THEN 'FAIL — wrong columns: (' || array_to_string(key_cols, ', ') || ')'
                   ELSE 'PASS'
                 END
            FROM idx WHERE index_name = 'inbox_threads_org_gmail_uniq'),
         'FAIL — index does not exist')

UNION ALL
-- ─── 3. The old mailbox-scoped message index is gone.
-- Leaving it in place is not merely redundant: it still enforces
-- (mailbox_account_id, gmail_message_id), so a future legitimate re-import
-- of the same message under a re-connected mailbox would be rejected by an
-- index nobody remembers exists.
SELECT 3,
       'old index dropped: inbox_messages_gmail_uniq',
       COALESCE(
         (SELECT 'FAIL — still present: ' || def
            FROM idx WHERE index_name = 'inbox_messages_gmail_uniq'),
         'PASS')

UNION ALL
-- ─── 4. The old mailbox-scoped thread index is gone.
SELECT 4,
       'old index dropped: inbox_threads_gmail_uniq',
       COALESCE(
         (SELECT 'FAIL — still present: ' || def
            FROM idx WHERE index_name = 'inbox_threads_gmail_uniq'),
         'PASS')

UNION ALL
-- ─── 5. Zero duplicate messages under the org-scoped key.
-- If #1 passed, this is guaranteed by the index — but only because #1
-- checked the definition. Run both: this one is the observable fact, #1 is
-- the thing that keeps it true tomorrow.
SELECT 5,
       'no duplicate (organization_id, gmail_message_id)',
       CASE WHEN (SELECT count(*) FROM dup_msg) = 0 THEN 'PASS'
            ELSE 'FAIL — ' || (SELECT count(*) FROM dup_msg)::text
                 || ' duplicated gmail_message_id(s), '
                 || (SELECT sum(n - 1) FROM dup_msg)::text
                 || ' excess row(s); e.g. gmail_message_id '
                 || (SELECT gmail_message_id FROM dup_msg ORDER BY n DESC, gmail_message_id LIMIT 1)
                 || ' x' || (SELECT max(n) FROM dup_msg)::text
       END

UNION ALL
-- ─── 6. Zero duplicate threads under the org-scoped key.
-- Threads are what the inbox list renders, so this is the count a board
-- member would actually have noticed as "more mail than Gmail".
SELECT 6,
       'no duplicate (organization_id, gmail_thread_id)',
       CASE WHEN (SELECT count(*) FROM dup_thr) = 0 THEN 'PASS'
            ELSE 'FAIL — ' || (SELECT count(*) FROM dup_thr)::text
                 || ' duplicated gmail_thread_id(s), '
                 || (SELECT sum(n - 1) FROM dup_thr)::text
                 || ' excess row(s); e.g. gmail_thread_id '
                 || (SELECT gmail_thread_id FROM dup_thr ORDER BY n DESC, gmail_thread_id LIMIT 1)
                 || ' x' || (SELECT max(n) FROM dup_thr)::text
       END

UNION ALL
-- ─── 7. No orphaned messages.
-- The merge re-points messages from the losing thread onto the surviving
-- one and then deletes the loser. A message left pointing at a deleted
-- thread is invisible in every thread view but still counted by every
-- "messages total" query — the exact shape of a discrepancy nobody can
-- explain.
SELECT 7,
       'no orphaned inbox_messages (thread_id -> missing thread)',
       CASE WHEN (SELECT count(*) FROM public.inbox_messages m
                   WHERE NOT EXISTS (SELECT 1 FROM public.inbox_threads t
                                      WHERE t.id = m.thread_id)) = 0
            THEN 'PASS'
            ELSE 'FAIL — ' || (SELECT count(*) FROM public.inbox_messages m
                                WHERE NOT EXISTS (SELECT 1 FROM public.inbox_threads t
                                                   WHERE t.id = m.thread_id))::text
                 || ' message(s) pointing at a thread that no longer exists; e.g. message '
                 || (SELECT m.id::text FROM public.inbox_messages m
                      WHERE NOT EXISTS (SELECT 1 FROM public.inbox_threads t
                                         WHERE t.id = m.thread_id)
                      ORDER BY m.id LIMIT 1)
       END

UNION ALL
-- ─── 8. No empty threads.
-- The mirror image of #7: the merge kept a thread row but moved its
-- messages elsewhere. An empty thread still occupies a row in the inbox
-- list, so this is directly "the app shows more than Gmail".
SELECT 8,
       'no inbox_threads with zero messages',
       CASE WHEN (SELECT count(*) FROM public.inbox_threads t
                   WHERE NOT EXISTS (SELECT 1 FROM public.inbox_messages m
                                      WHERE m.thread_id = t.id)) = 0
            THEN 'PASS'
            ELSE 'FAIL — ' || (SELECT count(*) FROM public.inbox_threads t
                                WHERE NOT EXISTS (SELECT 1 FROM public.inbox_messages m
                                                   WHERE m.thread_id = t.id))::text
                 || ' empty thread(s); e.g. thread '
                 || (SELECT t.id::text FROM public.inbox_threads t
                      WHERE NOT EXISTS (SELECT 1 FROM public.inbox_messages m
                                         WHERE m.thread_id = t.id)
                      ORDER BY t.id LIMIT 1)
       END

UNION ALL
-- ─── 9. Every message still points at a mailbox account that exists.
-- inbox_messages.mailbox_account_id is an FK with ON DELETE CASCADE
-- (0030), so a dangling value should be impossible — which is precisely
-- why it is worth asserting after a migration that deletes mailbox rows.
-- If 0048 dropped the FK to do its merge and did not restore it, this is
-- the row that says so.
SELECT 9,
       'every inbox_messages.mailbox_account_id resolves',
       CASE WHEN (SELECT count(*) FROM public.inbox_messages m
                   WHERE NOT EXISTS (SELECT 1 FROM public.mailbox_accounts a
                                      WHERE a.id = m.mailbox_account_id)) = 0
            THEN 'PASS'
            ELSE 'FAIL — ' || (SELECT count(*) FROM public.inbox_messages m
                                WHERE NOT EXISTS (SELECT 1 FROM public.mailbox_accounts a
                                                   WHERE a.id = m.mailbox_account_id))::text
                 || ' message(s) reference a deleted mailbox account; e.g. mailbox_account_id '
                 || (SELECT DISTINCT m.mailbox_account_id::text FROM public.inbox_messages m
                      WHERE NOT EXISTS (SELECT 1 FROM public.mailbox_accounts a
                                         WHERE a.id = m.mailbox_account_id)
                      LIMIT 1)
       END

UNION ALL
-- ─── 10+. BREAKDOWN — not PASS/FAIL. Eyeball this.
-- One row per mailbox account belonging to Madison Park, with what each
-- still holds. The whole incident was TWO rows here for one address; after
-- 0048 there should be one row carrying every message, and any surviving
-- disconnected row should carry zero.
-- The address is masked: this output gets pasted into tickets.
SELECT 10 + row_number() OVER (ORDER BY a.connected_at, a.id),
       'BREAKDOWN: mailbox ' || left(a.email_address, 3) || '***@'
         || split_part(a.email_address, '@', 2),
       CASE WHEN a.disconnected_at IS NULL
            THEN 'LIVE'
            ELSE 'disconnected ' || a.disconnected_at::date::text
       END
       || ', sync_status=' || a.sync_status
       || ', connected ' || a.connected_at::date::text
       || ', ' || (SELECT count(*) FROM public.inbox_messages m
                    WHERE m.mailbox_account_id = a.id)::text || ' message(s)'
       || ', ' || (SELECT count(*) FROM public.inbox_threads t
                    WHERE t.mailbox_account_id = a.id)::text || ' thread(s)'
  FROM public.mailbox_accounts a, org
 WHERE a.organization_id = org.id

ORDER BY 1;
