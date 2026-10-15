# State of play — 2026-10-15

Read this first in a fresh session. It is a pointer file, not a record: the
records are the specs, the parking lot, `CLAUDE.md`, and the git log.

## Where things stand

Production branch `claude/phase1-homeownerhub-setup-MILNu` is at the same commit
as `claude/quality-oracle`. All three apps serve it (verify via `/api/health`,
which returns the deployed SHA). CI runs `typecheck`, `typecheck:integration`,
`build`, `test:unit`, and `test:integration` — both suites gate merges now.

- Unit suite: 1674 tests / 99 files
- Integration suite: 39 tests / 9 files, against a local ephemeral Supabase
  (`supabase start` then `pnpm db:local:reset`, 69 migrations)
- `pnpm typecheck:integration` compiles `tests/integration/` — it previously
  was not compiled by anything

## Applied to production

`0054`–`0057` are all applied (2026-10-15). **An earlier version of this file
claimed `0054`/`0055` were applied when they were not** — that verification ran
against a database that was not the one the apps use; the apply of `0056`
failed on the missing `0055` helper and exposed it. See `docs/DEPLOY.md` for
the correction, what was actually verified, and the open question of which
project the first check hit.

`0058` and `0059` (sub-project C) were applied by Asaf on 2026-10-15 in one
`DO` block. **The post-apply policy listing was not captured** — run the STEP 3
query from the apply script and record its output here before treating them as
verified (the `0054`/`0055` episode is why).

**Not yet live in production:** the app code for sub-project C and Sentry
(`bdadecd`) is on `claude/quality-oracle` but the prod-branch push is blocked
by the session's permission classifier; Asaf pushes it manually.

## Decisions that are the owner's, not an agent's

- **Decided and built 2026-10-15 (sub-project D):** W18 Step A now *proposes*;
  board/admin approval in `/accounting/bank/queue` posts it exactly once. Spec:
  `docs/specs/2026-10-15-approval-layer.md`. Migration `0060` applied to
  production 2026-10-15; code live since deploy `7aeaa66` (all three apps
  verified via `/api/health`).
- **Open, found by D:** accounting tables (journal entries, payments,
  assessments, bank transactions) are writable by any org member including
  residents. **Fixed:** `0061` applied and verified in production 2026-10-15
  (72 policies, `org_access` gone, no-double-post index present).

## Open work, in the order I would take it

1. **Sub-project C** — the two items in `docs/parking-lot.md` dated 2026-10-15:
   any same-org member can grant themselves `admin` in their own org (RLS checks
   `org_id` only); and `storage.objects` has no DELETE/UPDATE policy, so every
   `.storage.remove()` through a user-scoped client has always failed silently.
   **Done:** code `e674580`, migrations applied 2026-10-15 (verification
   output pending).
2. **Production observability** — **wired (`bdadecd`), inert until a DSN is
   set.** Sentry in all four apps + one Inngest middleware for all 16 jobs.
   Owner's manual steps are in `docs/OBSERVABILITY.md`.
3. **B** (24/7 autonomous loop), **D** (approval layer), **E** (enterprise UI/UX
   across 115 pages), **F** (law → bylaw pipeline). D built and merged; E audit merged, phase 1 on `claude/ux-phase1`;
   B and F specs merged (`docs/specs/`). F phase 0 (FL Ch. 720 ingestion)
   merged; `0062` applied and verified 2026-10-15; first refresh run pending
   after deploy.

## The recurring lesson from this work

Five separate times, a green signal in this repo proved nothing because the
check could not see the failure: rtk's `tsc` output filter, grant verification
run as superuser, `tests/integration/` compiled by no tsconfig, a storage
bucket that existed in production but not in the local stack, and a "verified
in production" migration check run against the wrong database. Before trusting a
check, ask what it would report if the thing it checks were switched off.
