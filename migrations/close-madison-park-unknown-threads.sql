-- close-madison-park-unknown-threads.sql
--
-- Takes the still-visible gmail_state='unknown' threads out of Madison
-- Park's active queues by setting status='closed'.
--
-- WHY status AND NOT gmail_state
--
-- Setting gmail_state='archived' would not survive. mailboxReconcileJob
-- recomputes every thread's state from its messages each 15 minutes, and
-- threadStateFromMessages (packages/mailbox/src/labels.ts:94-121) resolves
-- a thread with no OBSERVED INBOUND message to 'unknown' by design -- an
-- outbound message carries SENT and never INBOX, so counting it would
-- classify every thread the HOA started as archived the moment it was
-- sent. So an 'archived' stamp here would be reverted within the hour.
-- status is app-owned; no job writes it.
--
-- WHAT THESE THREADS PROBABLY ARE
--
-- Most are expected to be outbound-only: mail the board sent that nobody
-- replied to. Gmail does not show them in its inbox either -- they are in
-- Sent. HomeownerHub keeps them visible on purpose because its inbox is a
-- work queue and an unanswered outbound message is open work. The
-- breakdown below prints how many have NO inbound message before anything
-- changes, so the effect is visible rather than assumed.
--
-- REVERSING IT
--
-- The previous status of every affected thread is printed below. Closing
-- is reversible per-thread from the UI, or in bulk by setting status back
-- for the ids listed. Nothing is deleted; no attachment is touched.
--
-- Idempotent: re-running closes nothing further. One statement -- see
-- 0048's header for why multi-statement scripts are unreliable here.

DO $mig$
DECLARE
  v_org        uuid := 'a4906f16-baf3-4232-a2bd-a78ea432ad86';
  v_target     integer;
  v_outbound   integer;
  v_inbound    integer;
  v_closed     integer;
  r            record;
BEGIN
  -- What is about to change, and what it is made of.
  SELECT count(*) INTO v_target
    FROM public.inbox_threads t
   WHERE t.organization_id = v_org
     AND t.gmail_state = 'unknown'
     AND t.status <> 'closed';

  SELECT
    count(*) FILTER (WHERE NOT EXISTS (
      SELECT 1 FROM public.inbox_messages m
       WHERE m.thread_id = t.id AND m.direction = 'inbound')),
    count(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM public.inbox_messages m
       WHERE m.thread_id = t.id AND m.direction = 'inbound'))
    INTO v_outbound, v_inbound
    FROM public.inbox_threads t
   WHERE t.organization_id = v_org
     AND t.gmail_state = 'unknown'
     AND t.status <> 'closed';

  RAISE NOTICE 'About to close % thread(s): % outbound-only (no reply yet), % with inbound mail.',
    v_target, v_outbound, v_inbound;

  -- Prior status, so this can be undone deliberately rather than guessed at.
  FOR r IN
    SELECT status, count(*) AS n
      FROM public.inbox_threads t
     WHERE t.organization_id = v_org
       AND t.gmail_state = 'unknown'
       AND t.status <> 'closed'
     GROUP BY status ORDER BY count(*) DESC
  LOOP
    RAISE NOTICE '  was status=%: % thread(s)', r.status, r.n;
  END LOOP;

  UPDATE public.inbox_threads t
     SET status = 'closed'
   WHERE t.organization_id = v_org
     AND t.gmail_state = 'unknown'
     AND t.status <> 'closed';

  GET DIAGNOSTICS v_closed = ROW_COUNT;

  IF v_closed <> v_target THEN
    RAISE EXCEPTION 'Expected to close % thread(s), closed %. Rolled back.', v_target, v_closed;
  END IF;

  RAISE NOTICE 'Done. % thread(s) closed. Nothing deleted; reopen from the UI to undo.', v_closed;
END
$mig$;
