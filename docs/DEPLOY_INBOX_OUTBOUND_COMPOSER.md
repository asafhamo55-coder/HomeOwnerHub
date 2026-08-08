# Deploying the inbox outbound composer

**Branch:** `claude/inbox-outbound-composer` (33 commits)
**Spec:** [`docs/superpowers/specs/2026-08-02-hoa-inbox-outbound-composer-design.md`](./superpowers/specs/2026-08-02-hoa-inbox-outbound-composer-design.md)
**State:** 604 unit tests passing, typecheck clean across 11 packages, all 4 apps build.

This feature sends real email carrying resident balances, violation history, and
attached documents. The steps below are ordered because getting them wrong takes
the inbox down or mails the wrong thing.

---

## 1. Apply three migrations BEFORE deploying the code

**This is a hard prerequisite, not a nice-to-have.** Deploying the code against
the current production schema does not degrade the inbox — it takes it down.
`getLatestDraft` selects `kind`, `to_emails`, `cc_emails`; the attachment paths
read `inbox_draft_attachments`. None of those exist in the deployed schema, so
every draft read errors.

Apply in order:

| Migration | What it does |
|---|---|
| `migrations/0038_inbox_outbound_recipients.sql` | `kind`, `to_emails`, `cc_emails`, `mailbox_account_id` on `inbox_drafts`; `thread_id` becomes nullable under a CHECK |
| `migrations/0039_inbox_draft_attachments.sql` | the `inbox_draft_attachments` table + RLS |
| `migrations/0040_inbox_draft_attachment_path_scope.sql` | CHECK constraint confining `storage_path` to the row's own organization |

Each was validated against a throwaway local PostgreSQL 16 database, including
proof that its CHECK constraints reject the cases they exist for. **No Supabase
database was touched during development** — every agent was barred from shared
databases.

`0040` is load-bearing for tenant isolation, not just hygiene. See §4.

### ⚠️ Numbers 0038, 0039 and 0040 are each used TWICE

Two branches picked migration numbers concurrently. After the merge the
directory contains:

| number | this feature | landed separately |
|---|---|---|
| 0038 | `0038_inbox_outbound_recipients.sql` | `0038_dashboard_daily_snapshots.sql` |
| 0039 | `0039_inbox_draft_attachments.sql` | `0039_property_list_view.sql` |
| 0040 | `0040_inbox_draft_attachment_path_scope.sql` | `0040_property_list_view_board_predicate.sql` |

**Nothing was renamed, deliberately.** These three were applied to Supabase
under exactly these filenames, and renaming an already-applied migration
breaks the link between what was run and what the repo says was run.

Practically this is safe: the two sets are independent (drafts/attachments
vs. dashboard snapshots and the property list view), so only the order
*within* each chain matters, and `0038 → 0039 → 0040` of this feature is
preserved by any sort. The trap to avoid is assuming a single `0038` exists
and applying only one of the pair.

If you rebuild an environment from scratch, apply **both** files at each of
0038/0039/0040. `migrations/apply-inbox-outbound-composer.sql` bundles this
feature's three; the others must be applied alongside.

The same collision hit earlier in this feature's life at 0036/0037 and was
resolved by renumbering — possible only because nothing had been applied yet.
That option is gone once a migration is live.

## 2. Regenerate the database types and diff them

`packages/db/src/database.types.ts` is generated from the deployed Supabase, so
it was **hand-patched** during development for the columns and table above.

After applying the migrations, run the project's `gen:types` and diff the result.
It should reproduce the hand-patched entries exactly. **If it does not, the
hand-patch was wrong and the code is misrepresenting the schema** — investigate
before deploying rather than committing the regenerated file over the top.

## 3. Verify Gmail threading on a preview deploy

`sendReply` moved from the JSON `messages/send` endpoint (which caps a request
near 5 MB — smaller than one phone photo) to
`/upload/gmail/v1/users/me/messages/send?uploadType=multipart`, which allows
35 MB.

Unit tests cannot prove Gmail honours the `threadId` carried in that endpoint's
metadata part. **Send one real reply from a preview deploy and confirm in Gmail
that it lands in the existing thread rather than starting a new conversation.**

If it does not thread, the documented fallback is `uploadType=media` (a raw
`message/rfc822` body, no metadata part) followed by a `messages/modify` call.

## 4. Understand what protects tenant isolation before you touch attachments

`inbox_draft_attachments` rows name storage objects, and the send job downloads
them with the **service role**, which bypasses storage policies entirely. The
table's RLS constrains `organization_id` and nothing else, and every board member
holds an authenticated anon-key browser client — so a forged row is reachable.

Three layers stop that today:

1. `attachment-actions.ts` validates every browser-supplied reference (exact path
   shape for uploads; org-scoped lookups for thread files and library documents —
   note the document tables scope by `org_id`, the inbox tables by
   `organization_id`).
2. `loadAttachments` in `packages/jobs/src/mailbox-send.ts` re-validates at the
   send boundary against **the key `fetch` will actually request**, not the raw
   column value. This matters because `@supabase/storage-js` does not
   percent-encode: it concatenates the key into a URL string, and the WHATWG
   parser then strips CR/LF/TAB, decodes `%2e`, and collapses dot-segments. A
   segment-based check alone is defeated by `<org>/%2e%2e/<victim>/file`.
3. Migration `0040`'s CHECK constraint, which is what closes the `%2f` / `%5c`
   sub-case that layer 2 does not.

**Anything added later that reads `storage_path`** — a preview endpoint, a
download route, an archive job — inherits the same exposure and needs layer 2's
check. Do not assume the action is the only writer.

## 5. Exercise the feature end to end on the preview deploy

Static review and unit tests cannot reach these:

- Reply with a Cc and an uploaded PDF → arrives, threaded, both recipients, file opens.
- Forward a thread carrying an inbound photo to an outside address → arrives with
  the photo; after the next sync the thread shows "Forwarded by HOA to …".
- Compose a new email with a library document → arrives; the conversation appears
  in the inbox after the next sync (up to ~2 minutes — this is by design, and the
  compose screen says so).
- Press Undo within 30 seconds on each → nothing sends.
- Attach a file at the 15 MB cap → sends; one byte over → refused before upload.

Item 3 also settles an open question: the compose route skips `revalidatePath`,
so if Next's post-action re-render assumption is wrong, the attachment list and
the undo countdown will not appear on `/inbox/compose`. One click-through
confirms it.

## 6. Then deploy

Use the project's `devops` agent (`.claude/agents/devops.md`) — typecheck +
build, push, wait for Vercel, smoke-test `/api/health` on all three apps.

---

## Known gaps, recorded deliberately

- **No virus scanning** of uploaded attachments (spec D9). Inbound attachments are
  not scanned today either, so this is consistent — but it is newly reachable by
  an outside party once forwarding is live.
- **No Bcc** (spec D3). Deliberate: a blind copy is invisible in the delivered
  message, and HOA mail carries balances and enforcement history that every
  recipient should be on the record for.
- **No AI drafting for forwards or new messages** (spec D2). `ai_run_id`, `model`
  and `prompt_version` are nullable, so this can be added without a migration.
- **No component tests anywhere** under `apps/hoa/src/app/`. The root Vitest
  harness is deliberately scoped to pure modules. This is not theoretical: it let
  a Forward button ship that was unreachable on any thread with a sent draft, and
  a dead button on the compose screen. Both were caught by review rather than by
  tests. A render-test harness is the highest-value follow-up.
- **`next lint` is broken repo-wide** — deprecated, and no ESLint config exists
  anywhere in the monorepo, so it drops into an interactive prompt and exits 1.
  Not caused by this branch; it means no linting has run on any recent work.
- **Storage keys whose extension tail contains `#`, `?`, or a trailing space** are
  refused at send time with a generic "no longer available" message.
  `sanitizeStorageName` sanitizes only the filename base, so such keys are
  producible. Fails closed, but after approval; there is no attach-time check.
- **`packages/jobs/src/mailbox-send.ts` comment inaccuracy:** it describes the SQL
  constraint as the coarse net and the code check as the precise one. For
  `%2f`/`%5c` that is reversed — migration `0040` is what closes those. Also
  `mailbox-send.test.ts` asserts `org-1/a%2fb.pdf` is a legitimate key while
  `0040` forbids it; correcting the code to match that test would reopen the case.
