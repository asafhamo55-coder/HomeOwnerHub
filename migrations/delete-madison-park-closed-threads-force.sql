-- delete-madison-park-closed-threads-force.sql
--
-- Removes EVERY remaining closed thread for Madison Park, including the
-- ones delete-madison-park-closed-unknown-threads.sql deliberately refused
-- to touch because they carry an attachment, a draft, or a link.
--
-- THIS DESTROYS THOSE. Read the notices it prints.
--
-- inbox_attachments.thread_id, inbox_attachments.message_id,
-- inbox_thread_links.thread_id, inbox_drafts.thread_id and the reply
-- embeddings are all ON DELETE CASCADE from the thread or its messages, so
-- deleting the thread deletes them too. Files already fetched into storage
-- are NOT removed from the storage bucket by this script -- only the rows
-- that point at them, which orphans the objects rather than deleting them.
-- inbox_drafts.source_thread_id is ON DELETE SET NULL, so a draft composed
-- FROM one of these threads survives with its origin blanked.
--
-- It prints a full inventory BEFORE deleting anything, so the run itself
-- is the record of what was destroyed. Nothing here is recoverable from
-- the application afterwards.
--
-- Replies still come back: deleting the row tells Gmail nothing, so if
-- someone answers one of these later, sync ingests the new inbound message
-- and the thread reappears as new work.
--
-- Idempotent. One statement.

DO $mig$
DECLARE
  v_org      uuid := 'a4906f16-baf3-4232-a2bd-a78ea432ad86';
  v_threads  integer;
  v_msgs     integer;
  v_atts     integer;
  v_stored   integer;
  v_links    integer;
  v_drafts   integer;
  v_deleted  integer;
  r          record;
BEGIN
  CREATE TEMP TABLE mig_force_targets ON COMMIT DROP AS
    SELECT t.id, t.subject
      FROM public.inbox_threads t
     WHERE t.organization_id = v_org
       AND t.status = 'closed';

  SELECT count(*) INTO v_threads FROM mig_force_targets;

  SELECT
    (SELECT count(*) FROM public.inbox_messages m
       JOIN mig_force_targets g ON g.id = m.thread_id),
    (SELECT count(*) FROM public.inbox_attachments a
       JOIN mig_force_targets g ON g.id = a.thread_id),
    (SELECT count(*) FROM public.inbox_attachments a
       JOIN mig_force_targets g ON g.id = a.thread_id
      WHERE a.storage_path IS NOT NULL),
    (SELECT count(*) FROM public.inbox_thread_links l
       JOIN mig_force_targets g ON g.id = l.thread_id),
    (SELECT count(*) FROM public.inbox_drafts d
       JOIN mig_force_targets g ON g.id = d.thread_id)
    INTO v_msgs, v_atts, v_stored, v_links, v_drafts;

  RAISE NOTICE 'DESTROYING % closed thread(s): % message(s), % attachment row(s) (% with a stored file), % link(s), % draft(s).',
    v_threads, v_msgs, v_atts, v_stored, v_links, v_drafts;

  -- Per-thread inventory. Ids and counts only -- no subject, sender or
  -- body reaches the log.
  FOR r IN
    SELECT g.id,
           (SELECT count(*) FROM public.inbox_messages m     WHERE m.thread_id = g.id) AS msgs,
           (SELECT count(*) FROM public.inbox_attachments a  WHERE a.thread_id = g.id) AS atts,
           (SELECT count(*) FROM public.inbox_thread_links l WHERE l.thread_id = g.id) AS links,
           (SELECT count(*) FROM public.inbox_drafts d       WHERE d.thread_id = g.id) AS drafts
      FROM mig_force_targets g ORDER BY g.id
  LOOP
    RAISE NOTICE '  thread %: % msg, % attachment(s), % link(s), % draft(s)',
      r.id, r.msgs, r.atts, r.links, r.drafts;
  END LOOP;

  DELETE FROM public.inbox_threads t
   USING mig_force_targets g
   WHERE t.id = g.id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted <> v_threads THEN
    RAISE EXCEPTION 'Expected to delete % thread(s), deleted %. Rolled back.', v_threads, v_deleted;
  END IF;

  IF EXISTS (SELECT 1 FROM public.inbox_threads
              WHERE organization_id = v_org AND status = 'closed') THEN
    RAISE EXCEPTION 'Closed threads still present after the delete. Rolled back.';
  END IF;

  RAISE NOTICE 'Done. % thread(s) gone. % storage object(s) are now orphaned in the bucket and are not removed by this script.',
    v_deleted, v_stored;
END
$mig$;
