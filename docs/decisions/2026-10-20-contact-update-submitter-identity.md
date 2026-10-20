# Contact-update requests: identity comes from the authenticated submitter

- **Date:** 2026-10-20
- **Status:** Accepted (Claude, under the owner's delegation of 2026-10-19)

## Context
Contact-update requests are tickets whose body was parsed for a "Signed in as: <email>" line. A resident could type someone else's address and key a change against another person's rows on the same home. Board approval was still required.

## Decision
- A "Signed in as" line counts only if it matches the ticket submitter's auth email (case-insensitive). On a mismatch, or with no known email, the ticket is not a contact request.
- The submitter's email is read with one read-only service-role call, `auth.admin.getUserById` (`apps/hoa/src/lib/contact-updates/submitter-email.ts`). `profiles.email` is user-writable under `own_profile`, so it can't be trusted. Other modules already use the same pattern (`lib/members.ts`, `lib/communications/audience.ts`).
- Every row read and write still uses the board's RLS client. A failed lookup fails closed. Logs hold ids and status codes only.
- "Emailed in by" (an Inbox filing) is honoured only when a board or admin member submitted the ticket.

## Alternative not taken
A SECURITY DEFINER RPC returning the submitter's email. It needs a migration; revisit it with the next migration batch if service-role reads are to be minimised.

## Follow-up
BL-105: the Inbox "verified sender" check relies on the email From header. Use the inbound provider's SPF/DKIM/DMARC verdict, where available, before treating a sender as verified.
