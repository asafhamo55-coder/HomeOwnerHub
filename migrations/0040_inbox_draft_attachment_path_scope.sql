-- Defence in depth for the tenant boundary on outgoing attachments.
--
-- `inbox_draft_attachments`'s `board_access` policy (migration 0039)
-- constrains `organization_id` and nothing else. `storage_path` is
-- unconstrained, so a board member holding an ordinary authenticated
-- anon-key browser client can INSERT a row for their OWN org — passing RLS
-- — whose `storage_path` names ANOTHER org's object:
--
--   insert into inbox_draft_attachments (organization_id, draft_id, source,
--     storage_path, file_name, size_bytes)
--   values ('<their org>', '<their draft>', 'document',
--           '<victim org uuid>/CCRs.pdf', 'x.pdf', 1);
--
-- packages/jobs/src/mailbox-send.ts then downloads that path with the
-- service role, which bypasses storage policies entirely, and mails the
-- bytes to whatever recipients they approved. Only the victim org's uuid
-- stands in the way, and filenames are guessable — the document library
-- builds paths as `<org id>/<sanitized file name>`.
--
-- The send job now refuses a path outside the draft's org
-- (`storagePathBelongsToOrg`). This constraint is the second, independent
-- gate: a CHECK cannot reference another table, but it CAN reference another
-- column of the same row, and `organization_id` is right there. It holds for
-- every writer — the server action, a forged browser insert, a future
-- preview endpoint or archive job — rather than for the one caller that
-- exists today.
--
-- The three legitimate shapes on this branch:
--   `<orgId>/…`                        document-library files
--   `<orgId>/inbox/…`                  inbound attachment files (a special
--                                      case of the first shape)
--   `inbox-drafts/<orgId>/<draftId>/…` browser uploads
--
-- `starts_with()` rather than LIKE: no wildcard semantics to reason about,
-- and it is IMMUTABLE, which a CHECK requires.
--
-- Ordering note: this runs after 0039 CREATEs the table, and no environment
-- has applied 0039 yet, so there are no existing rows for it to invalidate.
-- Even on a database that had applied 0039, every row written by
-- `addDraftAttachment` already satisfies this — it resolves the path from an
-- org-scoped read or from the `inbox-drafts/<org>/<draft>/` prefix it mints
-- itself.
ALTER TABLE public.inbox_draft_attachments
  DROP CONSTRAINT IF EXISTS inbox_draft_attachments_path_in_org;

ALTER TABLE public.inbox_draft_attachments
  ADD CONSTRAINT inbox_draft_attachments_path_in_org CHECK (
    -- No '.' or '..' path segment, no empty segment (leading, doubled, or
    -- trailing separator). Supabase Storage keys are opaque strings today,
    -- but that is a property of the backend, not something a tenant
    -- boundary should rest on.
    storage_path !~ '(^|/)\.\.?(/|$)'
    AND storage_path NOT LIKE '%//%'
    AND storage_path NOT LIKE '/%'
    AND storage_path NOT LIKE '%/'
    AND (
      starts_with(storage_path, organization_id::text || '/')
      OR starts_with(storage_path, 'inbox-drafts/' || organization_id::text || '/')
    )
  );
