-- 0052 — remember when a resident last read their announcements.
--
-- The resident portal's "N new" badge counted every communication the ORG
-- sent in 30 days, with no reach-through to communication_recipients. A
-- Madison Park owner saw "15 new" while their list showed 3 — the badge was
-- counting other owners' mail, including dues reminders. It is the same
-- scope bug already fixed in the announcements page itself (see the header
-- comment there); the badge was simply never updated to match.
--
-- Fixing the count alone would still leave the badge clearing by AGE rather
-- than by reading, so this adds the marker that lets "read" mean read.
--
-- One timestamp per profile, not a per-row read receipt: the announcements
-- page renders every body inline, so "read" is a single act — visiting that
-- page — and there is nothing finer to record.
--
-- Deliberately NOT communication_recipients.opened_at, which is written by
-- Resend's open-tracking pixel. Apple Mail Privacy Protection pre-fetches
-- images for every message, so that column reports opens no human made, and
-- reusing it would silently mark announcements read that nobody opened.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS announcements_last_viewed_at timestamptz;

COMMENT ON COLUMN public.profiles.announcements_last_viewed_at IS
  'When this user last opened /resident/announcements. Announcements sent after this are "new". NULL means never opened, so everything received is new.';
