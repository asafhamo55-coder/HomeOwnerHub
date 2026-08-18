-- diagnose-inbox-index-defs.sql — READ-ONLY, one result set.
--
-- The previous diagnostic asked whether inbox_messages_gmail_uniq EXISTS
-- and got "PRESENT" alongside 437 duplicate gmail_message_ids. Those two
-- facts cannot both be true of a global UNIQUE(gmail_message_id), so the
-- live definition differs from migrations/0029_inbox.sql:139. Checking the
-- name was the wrong question; this asks for the definition.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('inbox_messages', 'inbox_threads')
  AND indexdef ILIKE '%UNIQUE%'
ORDER BY tablename, indexname;
