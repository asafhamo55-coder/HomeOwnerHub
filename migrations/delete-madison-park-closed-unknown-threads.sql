-- delete-madison-park-closed-unknown-threads.sql
--
-- Permanently removes the Madison Park threads that were closed by
-- close-madison-park-unknown-threads.sql and are still gmail_state
-- 'unknown' -- the ones still showing under Closed.
--
-- WHY DELETE RATHER THAN HIDE
--
-- inbox_threads has no deleted_at (0022 predates the inbox tables), and
-- adding one means filtering it at 30 query sites across 15 files. Missing
-- one leaves a "deleted" thread surfacing somewhere unpredictable. For 18
-- rows, deleting is smaller and more honest than a half-applied filter.
--
-- WHAT THIS WILL NOT DO
--
-- It refuses to delete any thread that carries work: an attachment, a
-- draft, or a link to a violation or work order. Those cascade
-- (inbox_attachments and inbox_drafts are ON DELETE CASCADE from
-- inbox_threads) and would be destroyed silently. Such threads are listed
-- and skipped, not deleted. If the count skipped is not zero, look at them
-- before deciding.
--
-- REPLIES STILL COME BACK. Deleting the row does not tell Gmail anything.
-- If a resident later replies, sync ingests the new inbound message and
-- the thread reappears as new work -- which is the correct outcome for an
-- outbound message that finally got an answer.
--
-- Idempotent: re-running deletes nothing further. One statement.

DO $mig$
DECLARE
  v_org      uuid := 'a4906f16-baf3-4232-a2bd-a78ea432ad86';
  v_target   integer;
  v_blocked  integer;
  v_msgs     integer;
  v_deleted  integer;
  r          record;
BEGIN
  CREATE TEMP TABLE mig_del_candidates ON COMMIT DROP AS
  SELECT t.id,
         (SELECT count(*) FROM public.inbox_messages m    WHERE m.thread_id = t.id) AS msgs,
         (SELECT count(*) FROM public.inbox_attachments a WHERE a.thread_id = t.id) AS atts,
         (SELECT count(*) FROM public.inbox_thread_links l WHERE l.thread_id = t.id) AS links,
         (SELECT count(*) FROM public.inbox_drafts d
           WHERE d.thread_id = t.id OR d.source_thread_id = t.id)                    AS drafts
    FROM public.inbox_threads t
   WHERE t.organization_id = v_org
     AND t.gmail_state = 'unknown'
     AND t.status = 'closed';

  SELECT count(*) INTO v_target FROM mig_del_candidates;
  SELECT count(*) INTO v_blocked FROM mig_del_candidates WHERE atts > 0 OR links > 0 OR drafts > 0;
  SELECT COALESCE(sum(msgs), 0) INTO v_msgs FROM mig_del_candidates WHERE atts = 0 AND links = 0 AND drafts = 0;

  RAISE NOTICE 'Candidates: % closed unknown thread(s). % carry attachments/drafts/links and will be SKIPPED.',
    v_target, v_blocked;

  FOR r IN SELECT id, msgs, atts, links, drafts FROM mig_del_candidates
            WHERE atts > 0 OR links > 0 OR drafts > 0 ORDER BY id
  LOOP
    RAISE NOTICE '  SKIPPED thread %: % msg, % attachment(s), % link(s), % draft(s)',
      r.id, r.msgs, r.atts, r.links, r.drafts;
  END LOOP;

  DELETE FROM public.inbox_threads t
   USING mig_del_candidates c
   WHERE t.id = c.id
     AND c.atts = 0 AND c.links = 0 AND c.drafts = 0;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted <> v_target - v_blocked THEN
    RAISE EXCEPTION 'Expected to delete % thread(s), deleted %. Rolled back.',
      v_target - v_blocked, v_deleted;
  END IF;

  RAISE NOTICE 'Deleted % thread(s) and their % message(s). % skipped as carrying work.',
    v_deleted, v_msgs, v_blocked;
END
$mig$;
