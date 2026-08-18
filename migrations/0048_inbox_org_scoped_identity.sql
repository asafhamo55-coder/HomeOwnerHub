-- 0048_inbox_org_scoped_identity.sql
--
-- Move the Gmail dedupe key from MAILBOX ACCOUNT scope to ORGANIZATION
-- scope, and merge the duplicate rows that mailbox-account scope let in.
--
-- WHAT HAPPENED
--
-- A Madison Park board member disconnected the Gmail mailbox on
-- 2026-08-12 and immediately reconnected the SAME address. connect.ts
-- only looked for a LIVE mailbox_accounts row (disconnected_at IS NULL),
-- found none, and created a SECOND account row for the same address. The
-- new account started with an empty sync cursor, so the backfill re-
-- imported the whole mailbox under the new account id.
--
-- Every dedupe key in the inbox is scoped by mailbox_account_id:
--   inbox_messages_gmail_uniq  UNIQUE (mailbox_account_id, gmail_message_id)  -- 0030
--   inbox_threads_gmail_uniq   UNIQUE (mailbox_account_id, gmail_thread_id)   -- 0029
-- so nothing collided. The same 437 Gmail messages and 229 Gmail threads
-- now exist twice in one organization, once under each account id, and
-- the board sees every conversation twice. Measured in production
-- 2026-08-13: all 437 duplicate message groups span exactly 2 accounts
-- and 0 are within one account -- i.e. the per-mailbox key did its job,
-- the identity was simply the wrong one.
--
-- The duplicate copies are byte-identical in subject, sent_at and body.
-- They are NOT identical in attachments: the older copy carries 1,618
-- attachment rows across 175 messages, the newer only 869. The re-
-- backfill did not fetch everything. So "keep the newest" would silently
-- destroy 749 attachment rows -- inbox_attachments.message_id and
-- inbox_reply_embeddings.message_id (0034) are both ON DELETE CASCADE,
-- and a cascade leaves no trace.
--
-- WHY ORGANIZATION SCOPE, AND WHY NOT GLOBAL
--
-- 0030 rescoped this key from global to per-mailbox on purpose, and that
-- reasoning still holds and must not be lost: Gmail only guarantees
-- message-id uniqueness WITHIN a mailbox, Google documents no cross-
-- account guarantee. Under a GLOBAL unique index, the ingest path's
-- `INSERT ... ON CONFLICT DO NOTHING` silently discards one tenant's
-- genuinely-new email as a "duplicate" of an unrelated tenant's message.
-- No error, no log line -- cross-tenant data loss that is invisible until
-- a resident asks where their email went.
--
-- Organization scope keeps that protection intact: the key still cannot
-- span two tenants. It only widens the identity to the boundary that
-- actually matters to a user -- "this HOA has already stored this email"
-- -- so reconnecting a mailbox, or connecting the same address a second
-- time, converges on the existing row instead of forking a second copy.
--
-- The residual risk org scope adds, stated honestly: if ONE org connects
-- TWO DIFFERENT mailboxes and Gmail hands out the same message id in
-- both, the second is treated as a duplicate. That is one tenant's own
-- data, not a cross-tenant leak, and section 1 below refuses to merge any
-- group whose copies disagree on sender or sent_at -- the signature of a
-- genuine collision rather than a re-import.
--
-- WHAT THIS MIGRATION DOES, IN ORDER
--   1. refuses to run if a "duplicate" group is not a re-import artifact
--   2. merges duplicate THREADS on (organization_id, gmail_thread_id),
--      keeping the copy that carries real triage work and re-pointing
--      every child row before deleting the loser
--   3. merges duplicate MESSAGES on (organization_id, gmail_message_id),
--      keeping the copy with the MOST attachments and moving any
--      attachment the survivor does not already have
--   4. re-points surviving rows at the org's LIVE mailbox account
--   5. swaps the two unique indexes to organization scope
--   6. asserts the result and RAISEs (rolling everything back) if the
--      merge lost anything
--
-- Applied BY HAND in the Supabase SQL editor. Idempotent: a second run
-- finds no duplicates, re-points nothing, and re-asserts clean.
--
-- Hard-deletes ONLY the duplicate inbox_threads / inbox_messages rows and
-- the child rows that are exact duplicates of a row kept on the survivor.
-- Nothing else is deleted -- in particular the disconnected
-- mailbox_accounts row is KEPT, because 0029 keeps disconnected accounts
-- for audit and this migration is not the place to change that.

BEGIN;

-- The SQL editor applies a 60s statement timeout. Every statement here
-- touches only rows in duplicate groups (656 messages / 458 threads in
-- the org that has them), so this is a safety valve for the two CREATE
-- UNIQUE INDEX statements, not an expectation of slowness.
SET LOCAL statement_timeout = '120s';


-- ─── 0. Snapshot what must still exist at the end ────────────────────
-- These are the proof material for section 6. They are captured BEFORE
-- anything is merged, expressed in identities that survive the merge
-- (org + Gmail id), never in row ids -- half the row ids are about to be
-- deleted by design.

DROP TABLE IF EXISTS public.mig0048_msg_keys;
CREATE TABLE public.mig0048_msg_keys AS
  SELECT DISTINCT organization_id, gmail_message_id
    FROM public.inbox_messages;

-- One row per logical attachment: the file as identified by the same
-- natural key 0031 made unique per message, lifted to the message's Gmail
-- identity so it does not matter which duplicate copy holds it today.
DROP TABLE IF EXISTS public.mig0048_attach_keys;
CREATE TABLE public.mig0048_attach_keys AS
  SELECT DISTINCT m.organization_id,
                  m.gmail_message_id,
                  a.file_name,
                  COALESCE(a.gmail_attachment_id, '') AS attach_key
    FROM public.inbox_attachments a
    JOIN public.inbox_messages m ON m.id = a.message_id;

-- How many messages each Gmail thread had, summed across its duplicate
-- copies. A thread that had messages and ends with none means a re-point
-- was missed and a cascade ate them.
DROP TABLE IF EXISTS public.mig0048_thread_msgs;
CREATE TABLE public.mig0048_thread_msgs AS
  SELECT t.organization_id, t.gmail_thread_id, count(m.id) AS msg_count
    FROM public.inbox_threads t
    LEFT JOIN public.inbox_messages m ON m.thread_id = t.id
   GROUP BY t.organization_id, t.gmail_thread_id;


-- ─── 1. Refuse to merge anything that is not a re-import ─────────────
-- A re-imported copy of the same email agrees with the original on who
-- sent it and when. If two rows sharing (organization_id,
-- gmail_message_id) disagree on either, they are not two copies of one
-- email -- most plausibly one org connected two different mailboxes whose
-- ids collided -- and merging them would destroy a real message. Stop
-- instead, and let a human look.
--
-- Subject and body are deliberately NOT compared: a partial re-backfill
-- legitimately produces a truncated body or a missing body_html, and
-- refusing over that would block the fix for the actual incident.
DO $$
DECLARE
  bad_groups integer;
BEGIN
  SELECT count(*) INTO bad_groups
    FROM (
      SELECT organization_id, gmail_message_id
        FROM public.inbox_messages
       GROUP BY organization_id, gmail_message_id
      HAVING count(*) > 1
         AND count(DISTINCT COALESCE(from_email, '') || '|'
                          || COALESCE(sent_at::text, '')) > 1
    ) g;

  IF bad_groups > 0 THEN
    RAISE EXCEPTION
      '0048 aborted: % duplicate (organization_id, gmail_message_id) group(s) '
      'disagree on sender or sent_at. These are not re-imported copies of the '
      'same email and merging them would delete real mail. Investigate before '
      're-running.', bad_groups;
  END IF;
END$$;


-- ─── 2. Merge duplicate THREADS on (organization_id, gmail_thread_id) ─
-- Survivor = the copy carrying real triage work, because triage is the
-- only thing here a human produced by hand. Priority:
--   1. a status other than the 'needs_review' default (someone worked it)
--   2. assigned_to set
--   3. unit_id set
--   4. oldest created_at  -- the copy the board has been looking at
--   5. id                 -- deterministic, so a re-run picks the same row
DROP TABLE IF EXISTS public.mig0048_thread_map;
CREATE TABLE public.mig0048_thread_map AS
WITH dups AS (
  SELECT organization_id, gmail_thread_id
    FROM public.inbox_threads
   GROUP BY organization_id, gmail_thread_id
  HAVING count(*) > 1
), ranked AS (
  SELECT t.id,
         t.organization_id,
         t.gmail_thread_id,
         row_number() OVER (
           PARTITION BY t.organization_id, t.gmail_thread_id
           -- false sorts before true, so each predicate is written as the
           -- NEGATIVE case: "is still the default" / "is null" sinks.
           ORDER BY (t.status IS NOT DISTINCT FROM 'needs_review'),
                    (t.assigned_to IS NULL),
                    (t.unit_id IS NULL),
                    t.created_at,
                    t.id
         ) AS rn
    FROM public.inbox_threads t
    JOIN dups d ON d.organization_id = t.organization_id
               AND d.gmail_thread_id = t.gmail_thread_id
)
SELECT l.id        AS loser_id,
       s.id        AS survivor_id,
       l.rn        AS loser_rank,
       l.organization_id,
       l.gmail_thread_id
  FROM ranked l
  JOIN ranked s ON s.organization_id = l.organization_id
               AND s.gmail_thread_id = l.gmail_thread_id
               AND s.rn = 1
 WHERE l.rn > 1;

CREATE INDEX ON public.mig0048_thread_map (loser_id);
CREATE INDEX ON public.mig0048_thread_map (survivor_id);

-- Carry over any triage field the survivor lacks. Losing a duplicate row
-- must never lose a fact: if the newer copy got filed to a unit and the
-- older one holds the assignment, the survivor ends up with both.
-- "Set" means non-null; for the three enum-ish columns it means
-- "not the default", since those are NOT NULL and default to a value
-- that means nobody has touched it.
UPDATE public.inbox_threads s
   SET unit_id          = COALESCE(s.unit_id,      p.unit_id),
       resident_id      = COALESCE(s.resident_id,  p.resident_id),
       assigned_to      = COALESCE(s.assigned_to,  p.assigned_to),
       vendor_id        = COALESCE(s.vendor_id,    p.vendor_id),
       match_reason     = COALESCE(s.match_reason, p.match_reason),
       subject          = COALESCE(s.subject,      p.subject),
       last_direction   = COALESCE(s.last_direction, p.last_direction),
       participants     = CASE WHEN s.participants = '[]'::jsonb
                               THEN COALESCE(p.participants, s.participants) ELSE s.participants END,
       -- GREATEST ignores nulls in Postgres, so a null on either side is
       -- not contagious.
       last_message_at  = GREATEST(s.last_message_at, p.last_message_at),
       status           = CASE WHEN s.status = 'needs_review'
                               THEN COALESCE(p.status, s.status) ELSE s.status END,
       match_source     = CASE WHEN s.match_source = 'auto'
                               THEN COALESCE(p.match_source, s.match_source) ELSE s.match_source END,
       match_confidence = CASE WHEN s.match_confidence = 'none'
                               THEN COALESCE(p.match_confidence, s.match_confidence) ELSE s.match_confidence END,
       gmail_state      = CASE WHEN s.gmail_state = 'unknown'
                               THEN COALESCE(p.gmail_state, s.gmail_state) ELSE s.gmail_state END
  FROM (
    SELECT m.survivor_id,
           -- first non-null value in loser priority order
           (array_remove(array_agg(l.unit_id        ORDER BY m.loser_rank), NULL))[1] AS unit_id,
           (array_remove(array_agg(l.resident_id    ORDER BY m.loser_rank), NULL))[1] AS resident_id,
           (array_remove(array_agg(l.assigned_to    ORDER BY m.loser_rank), NULL))[1] AS assigned_to,
           (array_remove(array_agg(l.vendor_id      ORDER BY m.loser_rank), NULL))[1] AS vendor_id,
           (array_remove(array_agg(l.match_reason   ORDER BY m.loser_rank), NULL))[1] AS match_reason,
           (array_remove(array_agg(l.subject        ORDER BY m.loser_rank), NULL))[1] AS subject,
           (array_remove(array_agg(l.last_direction ORDER BY m.loser_rank), NULL))[1] AS last_direction,
           max(l.last_message_at)                                                     AS last_message_at,
           (array_remove(array_agg(nullif(l.participants, '[]'::jsonb) ORDER BY m.loser_rank), NULL))[1] AS participants,
           (array_remove(array_agg(nullif(l.status,           'needs_review') ORDER BY m.loser_rank), NULL))[1] AS status,
           (array_remove(array_agg(nullif(l.match_source,     'auto')         ORDER BY m.loser_rank), NULL))[1] AS match_source,
           (array_remove(array_agg(nullif(l.match_confidence, 'none')         ORDER BY m.loser_rank), NULL))[1] AS match_confidence,
           (array_remove(array_agg(nullif(l.gmail_state,      'unknown')      ORDER BY m.loser_rank), NULL))[1] AS gmail_state
      FROM public.mig0048_thread_map m
      JOIN public.inbox_threads l ON l.id = m.loser_id
     GROUP BY m.survivor_id
  ) p
 WHERE s.id = p.survivor_id;

-- Re-point every child that carries thread_id. All four FKs are ON DELETE
-- CASCADE (inbox_drafts.source_thread_id is SET NULL), so anything still
-- pointing at a loser when section 2's DELETE runs is destroyed or
-- orphaned silently. The full list, verified against every migration that
-- references inbox_threads(id): inbox_messages, inbox_attachments,
-- inbox_thread_links, inbox_drafts.thread_id, inbox_drafts.source_thread_id.
UPDATE public.inbox_messages c
   SET thread_id = m.survivor_id
  FROM public.mig0048_thread_map m
 WHERE c.thread_id = m.loser_id;

UPDATE public.inbox_attachments c
   SET thread_id = m.survivor_id
  FROM public.mig0048_thread_map m
 WHERE c.thread_id = m.loser_id;

UPDATE public.inbox_drafts c
   SET thread_id = m.survivor_id
  FROM public.mig0048_thread_map m
 WHERE c.thread_id = m.loser_id;

UPDATE public.inbox_drafts c
   SET source_thread_id = m.survivor_id
  FROM public.mig0048_thread_map m
 WHERE c.source_thread_id = m.loser_id;

-- inbox_thread_links is UNIQUE (thread_id, resource_type, resource_id)
-- (0029), so a blind re-point would collide when both copies link the
-- same ticket. Move only links whose (resource_type, resource_id) the
-- survivor does not already have, and only one per key -- the rest are by
-- definition duplicates of a link the survivor keeps, and go with the
-- loser row.
WITH movable AS (
  SELECT l.id,
         m.survivor_id,
         row_number() OVER (
           PARTITION BY m.survivor_id, l.resource_type, l.resource_id
           ORDER BY l.created_at, l.id
         ) AS rn
    FROM public.inbox_thread_links l
    JOIN public.mig0048_thread_map m ON m.loser_id = l.thread_id
   WHERE NOT EXISTS (
     SELECT 1 FROM public.inbox_thread_links e
      WHERE e.thread_id     = m.survivor_id
        AND e.resource_type = l.resource_type
        AND e.resource_id   = l.resource_id
   )
)
UPDATE public.inbox_thread_links l
   SET thread_id = movable.survivor_id
  FROM movable
 WHERE movable.id = l.id
   AND movable.rn = 1;

DELETE FROM public.inbox_threads t
 USING public.mig0048_thread_map m
 WHERE t.id = m.loser_id;


-- ─── 3. Merge duplicate MESSAGES on (organization_id, gmail_message_id) ─
-- Survivor = the copy with the MOST attachment rows. This is the whole
-- reason the migration cannot just "keep the oldest": the older copy has
-- 1,618 attachment rows and the newer 869, and inbox_attachments and
-- inbox_reply_embeddings both cascade from inbox_messages. Picking wrong
-- deletes files with no error and no log line.
-- Tie-break: oldest ingested_at, then id (deterministic on re-run).
DROP TABLE IF EXISTS public.mig0048_message_map;
CREATE TABLE public.mig0048_message_map AS
WITH dups AS (
  SELECT organization_id, gmail_message_id
    FROM public.inbox_messages
   GROUP BY organization_id, gmail_message_id
  HAVING count(*) > 1
), counted AS (
  SELECT m.id,
         m.organization_id,
         m.gmail_message_id,
         m.ingested_at,
         count(a.id) AS attach_count
    FROM public.inbox_messages m
    JOIN dups d ON d.organization_id = m.organization_id
               AND d.gmail_message_id = m.gmail_message_id
    LEFT JOIN public.inbox_attachments a ON a.message_id = m.id
   GROUP BY m.id, m.organization_id, m.gmail_message_id, m.ingested_at
), ranked AS (
  SELECT c.*,
         row_number() OVER (
           PARTITION BY c.organization_id, c.gmail_message_id
           ORDER BY c.attach_count DESC, c.ingested_at, c.id
         ) AS rn
    FROM counted c
)
SELECT l.id  AS loser_id,
       s.id  AS survivor_id,
       l.rn  AS loser_rank,
       l.organization_id,
       l.gmail_message_id
  FROM ranked l
  JOIN ranked s ON s.organization_id  = l.organization_id
               AND s.gmail_message_id = l.gmail_message_id
               AND s.rn = 1
 WHERE l.rn > 1;

CREATE INDEX ON public.mig0048_message_map (loser_id);
CREATE INDEX ON public.mig0048_message_map (survivor_id);

-- Same principle as threads: a field present on a loser and null on the
-- survivor is a fact, and deleting the row must not delete the fact. The
-- partial re-backfill is exactly the case where the newer copy is missing
-- body_html or stripped_text. communication_id is the one that is
-- hand-made -- it links this email to a communications record.
UPDATE public.inbox_messages s
   SET communication_id  = COALESCE(s.communication_id,  p.communication_id),
       body_text         = COALESCE(s.body_text,         p.body_text),
       body_html         = COALESCE(s.body_html,         p.body_html),
       stripped_text     = COALESCE(s.stripped_text,     p.stripped_text),
       subject           = COALESCE(s.subject,           p.subject),
       sent_at           = COALESCE(s.sent_at,           p.sent_at),
       from_name         = COALESCE(s.from_name,         p.from_name),
       rfc822_message_id = COALESCE(s.rfc822_message_id, p.rfc822_message_id),
       in_reply_to       = COALESCE(s.in_reply_to,       p.in_reply_to),
       -- The two text[] columns cannot ride the array_agg trick below:
       -- array_agg over arrays of unequal length raises "cannot accumulate
       -- arrays of different dimensionality". Correlated pick instead.
       references_ids    = COALESCE(s.references_ids, (
         SELECT l.references_ids
           FROM public.mig0048_message_map mm
           JOIN public.inbox_messages l ON l.id = mm.loser_id
          WHERE mm.survivor_id = s.id AND l.references_ids IS NOT NULL
          ORDER BY mm.loser_rank LIMIT 1)),
       gmail_labels      = COALESCE(s.gmail_labels, (
         SELECT l.gmail_labels
           FROM public.mig0048_message_map mm
           JOIN public.inbox_messages l ON l.id = mm.loser_id
          WHERE mm.survivor_id = s.id AND l.gmail_labels IS NOT NULL
          ORDER BY mm.loser_rank LIMIT 1)),
       gmail_state       = CASE WHEN s.gmail_state = 'unknown'
                                THEN COALESCE(p.gmail_state, s.gmail_state)
                                ELSE s.gmail_state END,
       gmail_state_at    = COALESCE(s.gmail_state_at,    p.gmail_state_at)
  FROM (
    SELECT m.survivor_id,
           (array_remove(array_agg(l.communication_id  ORDER BY m.loser_rank), NULL))[1] AS communication_id,
           (array_remove(array_agg(l.body_text         ORDER BY m.loser_rank), NULL))[1] AS body_text,
           (array_remove(array_agg(l.body_html         ORDER BY m.loser_rank), NULL))[1] AS body_html,
           (array_remove(array_agg(l.stripped_text     ORDER BY m.loser_rank), NULL))[1] AS stripped_text,
           (array_remove(array_agg(l.subject           ORDER BY m.loser_rank), NULL))[1] AS subject,
           (array_remove(array_agg(l.sent_at           ORDER BY m.loser_rank), NULL))[1] AS sent_at,
           (array_remove(array_agg(l.from_name         ORDER BY m.loser_rank), NULL))[1] AS from_name,
           (array_remove(array_agg(l.rfc822_message_id ORDER BY m.loser_rank), NULL))[1] AS rfc822_message_id,
           (array_remove(array_agg(l.in_reply_to       ORDER BY m.loser_rank), NULL))[1] AS in_reply_to,
           (array_remove(array_agg(nullif(l.gmail_state, 'unknown') ORDER BY m.loser_rank), NULL))[1] AS gmail_state,
           (array_remove(array_agg(l.gmail_state_at    ORDER BY m.loser_rank), NULL))[1] AS gmail_state_at
      FROM public.mig0048_message_map m
      JOIN public.inbox_messages l ON l.id = m.loser_id
     GROUP BY m.survivor_id
  ) p
 WHERE s.id = p.survivor_id;

-- Where BOTH copies hold the same file, the survivor's row is the one
-- that stays -- and the survivor may be the copy whose bytes were never
-- fetched (fetch_status 'pending', storage_path null), while the row
-- about to be cascaded away is the one actually pointing at the object in
-- hoa-documents. That would leave a file the board can see listed and
-- cannot open. Promote the storage pointer onto the survivor's row first.
-- Bytes are not copied or moved; only the pointer to them.
WITH stored_loser AS (
  SELECT DISTINCT ON (m.survivor_id, a.file_name, COALESCE(a.gmail_attachment_id, ''))
         m.survivor_id,
         a.file_name,
         COALESCE(a.gmail_attachment_id, '') AS attach_key,
         a.storage_path, a.sha256, a.size_bytes, a.content_type
    FROM public.inbox_attachments a
    JOIN public.mig0048_message_map m ON m.loser_id = a.message_id
   WHERE a.fetch_status = 'stored'
     AND a.storage_path IS NOT NULL
   ORDER BY m.survivor_id, a.file_name, COALESCE(a.gmail_attachment_id, ''),
            a.created_at, a.id
)
UPDATE public.inbox_attachments e
   SET storage_path = stored_loser.storage_path,
       sha256       = COALESCE(e.sha256,       stored_loser.sha256),
       size_bytes   = COALESCE(e.size_bytes,   stored_loser.size_bytes),
       content_type = COALESCE(e.content_type, stored_loser.content_type),
       fetch_status = 'stored'
  FROM stored_loser
 WHERE e.message_id = stored_loser.survivor_id
   AND e.file_name  = stored_loser.file_name
   AND COALESCE(e.gmail_attachment_id, '') = stored_loser.attach_key
   AND e.fetch_status IS DISTINCT FROM 'stored'
   AND e.storage_path IS NULL;

-- Move every attachment the survivor does not already have, instead of
-- letting the cascade take it. The asymmetry is the point: 175 messages
-- carry 1,618 rows on one copy and 869 on the other, and "most
-- attachments wins" only guarantees the survivor has the LARGER set, not
-- the UNION. Anything the loser holds and the survivor does not moves
-- across; only exact duplicates of a row already on the survivor are left
-- to the cascade.
--
-- Dedupe key is 0031's natural key -- (message_id, file_name,
-- COALESCE(gmail_attachment_id, '')) -- written as the expression rather
-- than reading the gmail_attachment_key generated column, so this
-- statement does not depend on that column existing.
-- thread_id moves too: it is a denormalised copy of the message's thread
-- and would otherwise still name the loser thread (already deleted) or
-- the wrong survivor.
WITH movable AS (
  SELECT a.id,
         m.survivor_id,
         sm.thread_id AS survivor_thread_id,
         row_number() OVER (
           PARTITION BY m.survivor_id, a.file_name, COALESCE(a.gmail_attachment_id, '')
           -- among competing losers prefer one whose bytes are actually
           -- in storage over one that never got fetched
           ORDER BY (a.fetch_status = 'stored') DESC, a.created_at, a.id
         ) AS rn
    FROM public.inbox_attachments a
    JOIN public.mig0048_message_map m  ON m.loser_id = a.message_id
    JOIN public.inbox_messages sm ON sm.id = m.survivor_id
   WHERE NOT EXISTS (
     SELECT 1 FROM public.inbox_attachments e
      WHERE e.message_id = m.survivor_id
        AND e.file_name  = a.file_name
        AND COALESCE(e.gmail_attachment_id, '') = COALESCE(a.gmail_attachment_id, '')
   )
)
UPDATE public.inbox_attachments a
   SET message_id = movable.survivor_id,
       thread_id  = movable.survivor_thread_id
  FROM movable
 WHERE movable.id = a.id
   AND movable.rn = 1;

-- inbox_reply_embeddings is UNIQUE (message_id) (0034), so at most one row
-- can move, and only if the survivor has none. Prefer a real embedding
-- over a 0034c skip-marker row (embedding IS NULL). Anything left goes
-- with the cascade; embeddings are regenerable, attachments are not.
WITH movable AS (
  SELECT e.id,
         m.survivor_id,
         row_number() OVER (
           PARTITION BY m.survivor_id
           ORDER BY (e.embedding IS NULL), e.created_at, e.id
         ) AS rn
    FROM public.inbox_reply_embeddings e
    JOIN public.mig0048_message_map m ON m.loser_id = e.message_id
   WHERE NOT EXISTS (
     SELECT 1 FROM public.inbox_reply_embeddings x
      WHERE x.message_id = m.survivor_id
   )
)
UPDATE public.inbox_reply_embeddings e
   SET message_id = movable.survivor_id
  FROM movable
 WHERE movable.id = e.id
   AND movable.rn = 1;

DELETE FROM public.inbox_messages m
 USING public.mig0048_message_map map
 WHERE m.id = map.loser_id;


-- ─── 4. Hang everything off the live connection ──────────────────────
-- The survivors are now a mix: some point at the disconnected account,
-- some at the live one. Sync, backfill progress and the mailbox screens
-- all key off mailbox_account_id, so a row left on the dead account is
-- invisible to the connection that is actually syncing.
--
-- Only orgs with EXACTLY ONE live account are re-pointed. 0029's
-- mailbox_accounts_live_uniq is (organization_id, email_address) WHERE
-- disconnected_at IS NULL, so an org may legitimately have two live
-- accounts for two different addresses -- "the live account" is not
-- defined there and guessing would move mail into the wrong mailbox.
DROP TABLE IF EXISTS public.mig0048_live_account;
CREATE TABLE public.mig0048_live_account AS
  -- (array_agg)[1] rather than min(id): min(uuid) does not exist before
  -- Postgres 17 and this is applied by hand against whatever Supabase is
  -- running. HAVING count(*) = 1 makes the choice moot anyway.
  SELECT organization_id, (array_agg(id))[1] AS live_id
    FROM public.mailbox_accounts
   WHERE disconnected_at IS NULL
   GROUP BY organization_id
  HAVING count(*) = 1;

DO $$
DECLARE
  ambiguous integer;
BEGIN
  SELECT count(*) INTO ambiguous
    FROM (
      SELECT organization_id
        FROM public.mailbox_accounts
       WHERE disconnected_at IS NULL
       GROUP BY organization_id
      HAVING count(*) > 1
    ) g;
  IF ambiguous > 0 THEN
    RAISE NOTICE
      '0048: % org(s) have more than one live mailbox account; their rows were '
      'left on their current account (see section 4).', ambiguous;
  END IF;
END$$;

-- Safe under the OLD per-account unique indexes, which are still in place
-- at this point: sections 2 and 3 made (organization_id, gmail_*_id)
-- unique, so collapsing an org onto one account cannot produce a
-- (mailbox_account_id, gmail_*_id) collision.
UPDATE public.inbox_threads t
   SET mailbox_account_id = l.live_id
  FROM public.mig0048_live_account l
 WHERE t.organization_id = l.organization_id
   AND t.mailbox_account_id <> l.live_id
   AND EXISTS (SELECT 1 FROM public.mailbox_accounts a
                WHERE a.id = t.mailbox_account_id
                  AND a.organization_id = t.organization_id);

UPDATE public.inbox_messages m
   SET mailbox_account_id = l.live_id
  FROM public.mig0048_live_account l
 WHERE m.organization_id = l.organization_id
   AND m.mailbox_account_id <> l.live_id
   AND EXISTS (SELECT 1 FROM public.mailbox_accounts a
                WHERE a.id = m.mailbox_account_id
                  AND a.organization_id = m.organization_id);

-- Drafts too. A queued kind='new' / 'vendor_request' draft names the
-- mailbox it sends FROM (0038, 0042); left on the disconnected account it
-- has no usable credentials and the send fails.
UPDATE public.inbox_drafts d
   SET mailbox_account_id = l.live_id
  FROM public.mig0048_live_account l
 WHERE d.organization_id = l.organization_id
   AND d.mailbox_account_id IS NOT NULL
   AND d.mailbox_account_id <> l.live_id
   AND EXISTS (SELECT 1 FROM public.mailbox_accounts a
                WHERE a.id = d.mailbox_account_id
                  AND a.organization_id = d.organization_id);


-- ─── 5. Swap the unique indexes to organization scope ────────────────
-- The new names are a contract with apps/hoa/src/lib/inbox/ingest.ts,
-- whose ON CONFLICT targets them. Do not rename them.
DROP INDEX IF EXISTS public.inbox_messages_gmail_uniq;
DROP INDEX IF EXISTS public.inbox_threads_gmail_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS inbox_messages_org_gmail_uniq
  ON public.inbox_messages(organization_id, gmail_message_id);

CREATE UNIQUE INDEX IF NOT EXISTS inbox_threads_org_gmail_uniq
  ON public.inbox_threads(organization_id, gmail_thread_id);

-- The dropped indexes were also the only access path for "this mailbox's
-- threads by Gmail id" (the sync loop, admin diagnostics). inbox_messages
-- already has inbox_messages_mailbox_idx from 0030; inbox_threads had
-- nothing but the unique index being dropped.
CREATE INDEX IF NOT EXISTS inbox_threads_mailbox_idx
  ON public.inbox_threads(mailbox_account_id, gmail_thread_id);

COMMENT ON INDEX public.inbox_messages_org_gmail_uniq IS
  'Gmail dedupe key, ORGANIZATION-scoped (0048). Was mailbox-account '
  'scoped (0030), which let a disconnect/reconnect of the same address '
  'fork a second copy of the whole mailbox. Must never be widened to a '
  'global unique index: Gmail guarantees message-id uniqueness only '
  'within a mailbox, so a global key would silently discard one tenant''s '
  'new mail as a duplicate of another tenant''s.';

COMMENT ON INDEX public.inbox_threads_org_gmail_uniq IS
  'Gmail thread dedupe key, ORGANIZATION-scoped (0048). Same reasoning as '
  'inbox_messages_org_gmail_uniq.';


-- ─── 6. Prove it, or roll the whole thing back ───────────────────────
-- Everything above is one transaction, so a RAISE here undoes all of it.
-- These checks compare against the section 0 snapshot; they are not
-- tautologies over post-merge state.
DO $$
DECLARE
  dup_messages   integer;
  dup_threads    integer;
  lost_messages  integer;
  lost_attach    integer;
  attach_now     integer;
  attach_expect  integer;
  msg_now        integer;
  emptied        integer;
  idx_missing    integer;
BEGIN
  -- (a) the new keys actually hold
  SELECT count(*) INTO dup_messages FROM (
    SELECT 1 FROM public.inbox_messages
     GROUP BY organization_id, gmail_message_id HAVING count(*) > 1) x;
  SELECT count(*) INTO dup_threads FROM (
    SELECT 1 FROM public.inbox_threads
     GROUP BY organization_id, gmail_thread_id HAVING count(*) > 1) x;
  IF dup_messages > 0 OR dup_threads > 0 THEN
    RAISE EXCEPTION
      '0048 assertion failed: % duplicate message group(s) and % duplicate '
      'thread group(s) remain under the org-scoped keys.',
      dup_messages, dup_threads;
  END IF;

  -- (b) no email disappeared -- merged, yes; gone, no
  SELECT count(*) INTO lost_messages
    FROM (SELECT organization_id, gmail_message_id FROM public.mig0048_msg_keys
          EXCEPT
          SELECT organization_id, gmail_message_id FROM public.inbox_messages) x;
  IF lost_messages > 0 THEN
    RAISE EXCEPTION
      '0048 assertion failed: % (organization_id, gmail_message_id) '
      'identit(ies) present before the merge are gone.', lost_messages;
  END IF;

  -- (c) no attachment disappeared. Compared as logical files, not row
  -- counts: the merge legitimately deletes a row that is an exact
  -- duplicate of one kept on the survivor, and never anything else.
  SELECT count(*) INTO lost_attach
    FROM (SELECT organization_id, gmail_message_id, file_name, attach_key
            FROM public.mig0048_attach_keys
          EXCEPT
          SELECT m.organization_id, m.gmail_message_id, a.file_name,
                 COALESCE(a.gmail_attachment_id, '')
            FROM public.inbox_attachments a
            JOIN public.inbox_messages m ON m.id = a.message_id) x;
  IF lost_attach > 0 THEN
    RAISE EXCEPTION
      '0048 assertion failed: % attachment(s) lost by the merge. Every file '
      'held by a deleted duplicate must have moved to its survivor.', lost_attach;
  END IF;

  -- (d) and the total row count matches that exactly. After the merge,
  -- (organization_id, gmail_message_id) is unique and 0031 makes
  -- (message_id, file_name, key) unique, so one row per logical file is
  -- the only possible count. A shortfall means rows were dropped; an
  -- excess means the re-point duplicated something.
  SELECT count(*) INTO attach_now    FROM public.inbox_attachments;
  SELECT count(*) INTO attach_expect FROM public.mig0048_attach_keys;
  IF attach_now <> attach_expect THEN
    RAISE EXCEPTION
      '0048 assertion failed: % attachment row(s) after the merge, expected '
      '% (one per distinct file).', attach_now, attach_expect;
  END IF;

  -- (e) no thread lost its mail to a cascade
  SELECT count(*) INTO emptied
    FROM public.mig0048_thread_msgs b
    JOIN public.inbox_threads t ON t.organization_id = b.organization_id
                               AND t.gmail_thread_id = b.gmail_thread_id
   WHERE b.msg_count > 0
     AND NOT EXISTS (SELECT 1 FROM public.inbox_messages m WHERE m.thread_id = t.id);
  IF emptied > 0 THEN
    RAISE EXCEPTION
      '0048 assertion failed: % thread(s) had messages before the merge and '
      'have none now.', emptied;
  END IF;

  -- (f) the indexes ingest.ts targets exist, and the old ones are gone
  SELECT count(*) INTO idx_missing
    FROM (VALUES ('inbox_messages_org_gmail_uniq'), ('inbox_threads_org_gmail_uniq')) v(n)
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = v.n);
  IF idx_missing > 0 THEN
    RAISE EXCEPTION
      '0048 assertion failed: % of the 2 org-scoped unique indexes missing.',
      idx_missing;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_indexes
              WHERE schemaname = 'public'
                AND indexname IN ('inbox_messages_gmail_uniq', 'inbox_threads_gmail_uniq')) THEN
    RAISE EXCEPTION
      '0048 assertion failed: a mailbox-account-scoped unique index survived '
      'the swap.';
  END IF;

  SELECT count(*) INTO msg_now FROM public.inbox_messages;
  RAISE NOTICE
    '0048 ok: % message row(s), % attachment row(s), no duplicates under '
    'the org-scoped keys.', msg_now, attach_now;
END$$;

-- ─── Scratch teardown ────────────────────────────────────────────────
-- These were TEMP tables with ON COMMIT DROP. Supabase's SQL editor does
-- not preserve session-scoped temp tables across the statements of one
-- script, so the first reference to them failed there with 42P01 while
-- passing under psql. Plain tables in public behave identically for our
-- purposes and are dropped explicitly here; the DROP IF EXISTS at the top
-- of each section keeps a re-run clean if a previous attempt aborted.
DROP TABLE IF EXISTS public.mig0048_attach_keys;
DROP TABLE IF EXISTS public.mig0048_live_account;
DROP TABLE IF EXISTS public.mig0048_message_map;
DROP TABLE IF EXISTS public.mig0048_msg_keys;
DROP TABLE IF EXISTS public.mig0048_thread_map;
DROP TABLE IF EXISTS public.mig0048_thread_msgs;

COMMIT;


-- ─── Deliberately not done here ──────────────────────────────────────
--
-- * Deleting the disconnected mailbox_accounts row. 0029 keeps
--   disconnected accounts on purpose ("kept for audit"), and deleting one
--   cascades to mailbox_account_secrets, inbox_threads, inbox_messages
--   and inbox_drafts. Section 4 empties it of children; that is enough.
--
-- * Fixing connect.ts. The schema now makes the duplicate impossible to
--   store, but a reconnect still needs to FIND the existing account row
--   (including a disconnected one for the same address) and revive it
--   rather than insert a second. That is a code change, in flight
--   separately.
--
-- * Re-fetching the 749 attachment rows the second backfill never pulled.
--   This migration preserves every attachment ROW either copy had; it
--   cannot invent metadata for a file neither copy recorded. Whether the
--   older copy's set is complete is a question for the backfill, not for
--   SQL.
--
-- * Touching inbox_sender_aliases. Its key is already
--   (organization_id, lower(email_address)) (0029/0033) -- org-scoped
--   before this migration existed, and unaffected by the reconnect.
