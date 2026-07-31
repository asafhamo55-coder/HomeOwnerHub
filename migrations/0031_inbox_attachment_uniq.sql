-- 0031_inbox_attachment_uniq.sql
-- Fix: make inbox_attachments inserts idempotent.
--
-- The bug: ingestMessages() (apps/hoa/src/lib/inbox/ingest.ts) uses a
-- message row's mere EXISTENCE as the sole idempotency signal. Trace a
-- partial failure:
--   1. Message row inserts successfully.
--   2. The attachment loop throws on attachment #2 of 3 (transient DB or
--      network error).
--   3. The whole call rejects; attachment #3 never got its insert attempt.
--   4. On retry, the message upsert finds the row already present, the
--      `ignoreDuplicates` upsert returns an empty array, `messageId` is
--      falsy, and (pre-fix) the code `continue`s straight past the
--      attachment loop for that message.
--   5. Attachment #3 is now permanently missing. Nothing detects it —
--      there is no unique constraint on inbox_attachments and no
--      completeness marker on inbox_messages — while messagesSkipped++
--      reports the retry as a clean no-op.
--
-- The fix has two parts. This migration is part (a): a unique index that
-- lets an attachment insert become an idempotent upsert. Part (b) is in
-- ingest.ts — the skip path no longer `continue`s past attachments; it
-- fetches the existing message id and re-runs the attachment loop as an
-- upsert on this conflict target with `ignoreDuplicates: true`. A fully
-- ingested message then re-processes to zero writes; a partially
-- ingested one is repaired on the next retry.
--
-- Natural key: (message_id, gmail_attachment_id) is the obvious choice,
-- but gmail_attachment_id is NULLABLE — a MIME part can have a filename
-- with no Gmail attachmentId (some inline parts). NULL never equals NULL
-- in a plain btree unique index, so two such rows for the same message
-- would not collide and idempotency would silently fail exactly for the
-- case that most needs it. The key is therefore
-- (message_id, file_name, COALESCE(gmail_attachment_id, '')).
--
-- Why a generated column instead of an expression index directly:
-- Postgres itself is happy to use an expression index
-- (`... ON CONFLICT (message_id, file_name, COALESCE(gmail_attachment_id,
-- '')) DO NOTHING`) as a conflict-inference target in raw SQL. But
-- ingest.ts writes through supabase-js, and PostgREST's upsert
-- `on_conflict` parameter only accepts a literal comma-separated column
-- list — it cannot carry an expression, and Postgres's conflict-target
-- inference does not match a plain column list against an expression
-- index. Confirmed live against this project: running
-- `INSERT ... ON CONFLICT (message_id, file_name, gmail_attachment_id)
-- DO NOTHING` against a COALESCE expression index on those columns fails
-- with `42P10: there is no unique or exclusion constraint matching the
-- ON CONFLICT specification`. Two partial unique indexes have the same
-- problem — partial-index inference also requires an index_predicate
-- that PostgREST's on_conflict has no way to supply.
--
-- So the dedupe key is materialized into a real, non-nullable, plain
-- column (`gmail_attachment_key`) via a stored generated column, and the
-- unique index is a plain btree over three ordinary columns — something
-- supabase-js's `.upsert(..., { onConflict: 'message_id,file_name,
-- gmail_attachment_key', ignoreDuplicates: true })` can target directly.
-- ingest.ts never reads or writes gmail_attachment_key itself; Postgres
-- computes it from gmail_attachment_id on every insert.
--
-- A single message legitimately re-attaching two files that share both
-- file_name AND lack a Gmail attachment id is exceedingly rare for one
-- email; if it ever happens the second is deduped rather than silently
-- duplicated forever — the safer failure mode for a module whose stated
-- contract is "every re-delivery path is a no-op."
--
-- Idempotent. Safe to re-run.

-- The expression-index attempt tested against this project (see comment
-- above) — drop it if a prior run of this migration's earlier form
-- created it, so this migration converges to the generated-column form
-- regardless of which version last ran.
DROP INDEX IF EXISTS public.inbox_attachments_message_uniq;

ALTER TABLE public.inbox_attachments
  ADD COLUMN IF NOT EXISTS gmail_attachment_key text
    GENERATED ALWAYS AS (COALESCE(gmail_attachment_id, '')) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS inbox_attachments_message_uniq
  ON public.inbox_attachments(message_id, file_name, gmail_attachment_key);
