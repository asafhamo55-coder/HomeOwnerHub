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
| `shots`       | no       | Screens to attach from CI's UI shots. See "Screenshots from CI" below. |

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
  customer's. Usually you don't need this: CI attaches screenshots for you
  (next section). At most 6 images are attached in total, committed ones
  first. `render.ts` resizes each to at most 1200px wide and re-encodes it
  as JPEG under 250 KB, but commit images that are already compressed to
  keep the repo small.

### Screenshots from CI (`shots:`)

Screenshots can't be taken locally (there is no local database), so the
email takes them from `.github/workflows/ui-shots.yml`, which captures every
route in `scripts/ui-shots-list.ts` on each push to `claude/quality-oracle`,
from seeded demo data on a throwaway CI Supabase. Its `ui-shots-<sha>`
artifact holds `<shot name>--<width>-<theme>.png` for 375 and 1440 wide,
light and dark.

To choose the screens, list routes in the front matter. `caption` is
optional; without it the caption is made from the route
("Accounting › Payment plans").

```yaml
---
title: Payment plans fixed
shots:
  - route: /accounting/payment-plans
    caption: Choosing the charges a plan replaces
  - route: /approvals?type=bill     # the query string is part of the match
  - /dues                           # a bare route works too
---
```

- A route matches a shot in `scripts/ui-shots-list.ts` with the same path
  and query string, in the HOA app. When several match, the plain one wins
  (no dialog, other org, viewport crop and so on). A dynamic route matches
  a fixture: `/properties/[id]/edit` or `/properties/:propertyId/edit` both
  find `properties-edit`. A route with no shot is skipped; to make one
  available, add it to `scripts/ui-shots-list.ts`.
- The email uses the **1440 light** file, or **375 light** if the shot has
  no 1440 light variant. Full-page captures are cropped to the top 2400px.
- **No `shots:` list** (or no note at all): up to 3 HOA pages changed in
  the deploy are attached automatically. Each changed
  `apps/hoa/src/app/**/page.tsx` maps to its route (route groups dropped),
  and a dynamic route is used only if ui-shots has a fixture for it.
  The `(dev)` gallery is never picked.
- If screenshots were wanted but none could be found, the email says
  "Screenshots unavailable for this deploy." It is never held back for them.

**Which run.** `scripts/release-notes/fetch-shots.ts` looks for the UI
shots run of the deployed SHA. Failing that, it uses the nearest of up to
20 ancestors (`git rev-list` order) from which **only docs changed** up to
the deployed SHA: every path is under `docs/` or is a top-level `.md` file.
So a docs-only deploy commit on top of the tested one still gets that
commit's shots, and a commit whose screens may differ from production is
never used. A run still in progress is waited for, up to 25 minutes; after
that it falls back to the next eligible commit with a finished run. A run
that failed (for example on overflow) still uploads its shots and is used;
one whose artifact expired (14 days) or never uploaded is skipped.

Shots only ever come from CI's synthetic demo data, and the email still
goes only to `RELEASE_NOTES_TO`.

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
4. downloads the CI screenshots for the deploy (see "Screenshots from CI";
   needs `actions: read`, which the workflow's `GITHUB_TOKEN` has).
5. renders, uploads the preview HTML as a run artifact, sends through
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
