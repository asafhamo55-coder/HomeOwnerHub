-- 0052_announcements_last_viewed.sql
-- Remember when a resident last read their announcements.
--
-- THE BUG
--
-- The resident portal's "N new" badge counted every communications row the
-- ORG had sent in 30 days, with no reach-through to
-- communication_recipients. A Madison Park owner saw "15 new" above a list
-- of 3, because the badge was counting other owners' mail, dues reminders
-- included. It is the same scope bug the announcements page documents
-- having already fixed in its own header ("a resident saw messages
-- addressed to other owners' units"); the badge was never updated to match.
--
-- Fixing the count alone leaves the badge clearing by AGE. This adds the
-- marker that lets "read" mean read.
--
-- ONE TIMESTAMP, NOT A READ RECEIPT PER MESSAGE
--
-- The announcements page renders every body inline, so reading is a single
-- act -- visiting that page -- and there is nothing finer to record.
--
-- WHY NOT communication_recipients.opened_at
--
-- That column is written by Resend's open-tracking pixel. Apple Mail
-- Privacy Protection pre-fetches images for every message, so it reports
-- opens no human made; reusing it would mark announcements read that
-- nobody opened, and the feature would look like it worked.
--
-- Idempotent. Safe to re-run. Runs as ONE statement -- see 0048's header
-- for why anything multi-statement is unreliable in the Supabase editor.

DO $mig$
BEGIN
  ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS announcements_last_viewed_at timestamptz;

  COMMENT ON COLUMN public.profiles.announcements_last_viewed_at IS
    'When this user last opened /resident/announcements. Announcements sent after this are "new". NULL means never opened, so everything received is new. Application code tolerates this column being absent -- it shipped ahead of this migration.';

  RAISE NOTICE '0052 ok: announcements_last_viewed_at is present on profiles.';
END
$mig$;
