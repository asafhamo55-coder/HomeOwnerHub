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
-- This file was extended (not superseded by an 0041) after review: it has
-- never been applied to any database — 0039 itself is unapplied everywhere,
-- since both live on this unmerged branch — so there is no
-- migration-already-run hazard, and one constraint is better described by
-- one file than by a file plus a patch. 0041 was free had it been needed.
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

    -- The three predicates below close the URL-normalization class.
    --
    -- `@supabase/storage-js` does not percent-encode: `_getFinalPath` is
    -- `` `${bucketId}/${path.replace(/^\/+/,'')}` `` and `download`
    -- concatenates that into a URL STRING passed to `fetch` (verified in
    -- 2.105.3, dist/index.cjs:1499 and :1157). The WHATWG parser then
    -- rewrites the string before the request is made — stripping CR/LF/TAB,
    -- decoding `%2e`, reading `\` as `/`, and removing dot segments. So
    -- `<org>/%2e%2e/<other org>/CCRs.pdf` satisfies every predicate above
    -- and still fetches the other org's file.
    --
    -- A bare '%' is deliberately NOT rejected: `sanitizeStorageName`
    -- (apps/hoa/src/lib/documents.ts) sanitizes only the BASE of a filename
    -- and passes the extension tail through untouched, so real stored keys
    -- contain '%', spaces and parentheses. Rejecting '%' would make existing
    -- documents unattachable. Only the escapes that decode into a dot
    -- segment or a separator are refused.
    --
    -- This is the coarse net; packages/jobs/src/mailbox-send.ts holds the
    -- precise one (`attachmentPathIsInOrg`), which resolves the key exactly
    -- as `fetch` will and compares.
    AND storage_path !~ '[[:cntrl:]]'
    AND storage_path !~* '%2[ef]'
    -- Backslash: the WHATWG parser treats it as '/' in a special-scheme URL,
    -- so `<org>/..\<other org>/x` escapes this org's prefix at parse time.
    -- Beyond the letter of the review note, but the same class and one
    -- predicate wide.
    AND storage_path !~ '\\'

    AND (
      starts_with(storage_path, organization_id::text || '/')
      OR starts_with(storage_path, 'inbox-drafts/' || organization_id::text || '/')
    )
  );
