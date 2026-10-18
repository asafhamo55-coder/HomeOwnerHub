# Release notes

Every HOA production deploy sends the owner a branded release-note email.
The content comes from the notes in this folder. If a deploy has no note,
the email is built from its commit subjects instead.

## Writing a note

1. Copy `_template.md` to `YYYY-MM-DD-HHMM-<slug>.md`, using the planned
   deploy time in America/New_York and a short kebab-case slug. Example:
   `2026-10-17-1555-approvals-search-books.md`.
2. Fill in the sections. Write for a non-technical HOA-software owner: what
   someone can now do, not what code changed. Leave out ticket ids, file
   names and anything that could identify a real customer.
3. Commit the note **in the change you are about to deploy**. The note
   doesn't need to know its own SHA, because it can't: a note is committed
   inside the commit it describes.

### Frontmatter

| key           | required | meaning |
|---------------|----------|---------|
| `title`       | yes      | Plain-language headline. It becomes the email subject. |
| `deployed_at` | no       | ISO 8601 with offset, e.g. `2026-10-17T15:55:00-04:00`. CI passes the real deploy time, which takes precedence. |
| `sha`         | no       | For your information only. It is used for one thing: finding a note written *after* its deploy (see "Late notes"). |

The email footer always shows the SHA that was actually deployed, taken from
the workflow, never from the note.

### `whats_new`: the in-app "What's new" feed (optional)

The note itself is for the owner. Changes that boards or residents should
hear about **inside the app** go in a `whats_new:` list in the frontmatter.
`pnpm guide:build` collects them into the app's What's new page and the
unread dot on the sidebar version link (BL-070, user-guide spec §6.5).

```yaml
---
title: Edit scanned bills before approving
whats_new:
  - title: Edit a scanned bill before you approve it
    body: Fix the vendor, amount or due date the AI read from a bill, right in Approvals.
    roles: [admin, board]          # who sees it: admin | board | resident
    article: approvals-queue       # optional: the guide article for "Learn how"
    label: improvement             # new | improvement | fix
---
```

Rules, checked by `pnpm guide:build` (and so by CI):

- **No block, no entries.** That is the default. Refactors, migrations and
  internal changes stay out of the feed simply by not having a block.
- `title` is at most 100 characters; `body` is 1 to 3 plain sentences and at
  most 280 characters.
- No links in `title` or `body`. Link a guide article with `article:`; it
  must be an existing article id.
- `roles` is required, so a resident-facing change is a deliberate choice.
- Only top-level frontmatter keys are read by the email, so an entry's
  `title:` never replaces the note's own.
- If the note's `title` contains `: `, quote it. The block is parsed as YAML,
  and an unquoted colon fails the build.
- After adding or editing a block, run `pnpm guide:build` and commit
  `apps/hoa/src/generated/guide.ts` with the note, or CI's
  "Guide is up to date" step fails.

An entry's id is `<note file stem>#<n>`, so do not reorder or delete entries
once they have shipped: the unread dot compares the newest id.

### Sections

Use `## ` headings, spelled exactly as below. Any other heading is ignored.

- **Summary**: 2 to 4 plain sentences.
- **What's new**: grouped by area with `### Area` sub-headings, one
  user-facing bullet per change.
- **Fixes**
- **Under the hood**: short.
- **Needs your action** (optional): shown as a highlighted callout near the top.
- **Screenshots** (optional): `![caption](assets/<note-file-stem>/<name>.jpg)`,
  relative to this folder. Use demo or seed data only, never a real
  customer's. At most 6 are attached. `render.ts` resizes each to at most
  1200px wide and re-encodes it as JPEG, but commit images that are already
  compressed to keep the repo small.

Supported Markdown: `### ` sub-headings, `-` bullets, paragraphs,
`**bold**`, `*italic*`, `` `code` `` and `[links](https://...)`. Everything
else is escaped and shows up as text.

## How a deploy finds its notes

`.github/workflows/release-notes.yml` runs on Vercel's `deployment_status`
events and handles only the **HOA production** one: state `success`,
creator `vercel[bot]`, and an environment named `Production – home-owner-hub-hoa`.
The pm and eviction events are skipped. Then it:

1. waits, for up to 15 minutes, until `https://www.homeownerledger.com/api/health`
   reports the deployed SHA. If a newer deploy has already replaced it, it
   stops and leaves the email to that deploy.
2. picks the **previous SHA**: the newest earlier HOA production deploy that
   was already notified, or failing that the newest earlier one.
3. collects the note files **added** in `previous..deployed`
   (`git diff --diff-filter=A`). If there are several, they are combined
   into one email in filename order. If there are none, it uses a note whose
   `sha` frontmatter matches the deploy (a late note). If there is no such
   note either, it builds one from commit subjects: `feat` goes to What's
   new (grouped by scope), `fix` to Fixes, and everything else is counted
   under Under the hood.
4. renders, uploads the preview HTML as a run artifact, sends through
   Resend, and marks the SHA with a `release-notes/email` commit status.

**Dedupe:** a SHA that already has a successful `release-notes/email`
status is never emailed again. Runs for the same SHA are serialised by a
concurrency group, and Resend also gets an `Idempotency-Key` of
`release-notes-<sha>`.

### Late notes and re-sends

If a note is written after its deploy, set `sha:` in its frontmatter, commit
it to the production branch, then run **Actions → Release notes → Run
workflow** with that `sha`. Tick `force` if an email (for example a
commit-subject fallback) already went out for it.

## Running it locally

```bash
# Preview: writes HTML and sends nothing. Needs no secrets.
pnpm exec tsx scripts/release-notes/send.ts --sha c56061f --prev bb1418e --dry-run --out /tmp/rn.html

# The same HTML plus the JSON payload the workflow sends.
pnpm exec tsx scripts/release-notes/render.ts --sha c56061f --prev bb1418e --out /tmp/rn.html --json /tmp/rn.json
```

A real send needs `RESEND_API_KEY`, `RELEASE_NOTES_TO` (comma-separated) and
`RELEASE_NOTES_FROM` (falls back to `EMAIL_FROM`). If any is missing, the
script refuses and exits with code 2. **Recipients come only from
`RELEASE_NOTES_TO`.** A note, a payload or a command-line flag cannot add or
change one. This is an internal owner notification, so it does not go
through the resident outbound guard.
