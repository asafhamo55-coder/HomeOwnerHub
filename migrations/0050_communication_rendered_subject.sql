-- 0050_communication_rendered_subject.sql
-- Record the subject line each recipient actually received.
--
-- WHAT IS MISSING TODAY
--
-- communications.subject stores the TEMPLATE, not the message. The send
-- pipeline renders it per recipient at delivery time
-- (apps/hoa/src/lib/communications/send.ts:345, renderTemplateStrict over
-- the bag from merge-bag.ts) and then discards the result the instant the
-- provider call returns.
--
-- So nothing in the database records what anyone was sent. The staff
-- history at /communications showed the raw template --
--   "{{association_name_text}} dues -- {{amount_summary}}"
-- -- for every dues reminder ever sent, and no query could recover the
-- real line, because {{amount_summary}} is per-owner and lives only in the
-- in-memory bag.
--
-- WHY ONLY THE SUBJECT
--
-- Deliberately not the body. The dues bag carries {{dues_table}}, a full
-- HTML charge table built per owner (dues-reminders/actions.ts:198), so a
-- rendered_body column would store a copy of that table per recipient --
-- roughly a megabyte per campaign, to serve a preview. Bodies stay
-- resolved at read time by lib/communications/display.ts instead. Subjects
-- are bounded (communications.subject is capped at 255 by the send
-- schema), which is what makes storing them cheap enough to be worth it.
--
-- NULL IS MEANINGFUL AND EXPECTED
--
-- Three ways a row legitimately has none:
--   1. It predates this migration. Every existing row. The history falls
--      back to resolving association-level fields and labelling the rest.
--   2. Rendering threw before the send -- markFailed runs before a subject
--      exists, so a strict-render failure stores the error, not a subject.
--   3. The row was queued and the campaign has not fanned out yet.
-- Readers must treat NULL as "unknown", never as "empty subject".
--
-- Idempotent. Safe to re-run. Runs as ONE statement -- see 0048's header
-- for why anything multi-statement is unreliable in the Supabase editor.

DO $mig$
BEGIN
  ALTER TABLE public.communication_recipients
    ADD COLUMN IF NOT EXISTS rendered_subject text;

  COMMENT ON COLUMN public.communication_recipients.rendered_subject IS
    'The subject line this recipient actually received, after merge fields were resolved. NULL means unknown -- the row predates migration 0050, its render threw before sending, or it is still queued. Never interpret NULL as an empty subject.';

  RAISE NOTICE '0050 ok: rendered_subject is present on communication_recipients.';
END
$mig$;
