# Sub-project A: The Quality Oracle

**Date:** 2026-10-15
**Status:** Design — awaiting review
**Scope:** Build the first trustworthy automated quality signal for HomeownerHub.

---

## Why this exists

HomeownerHub is reported as unstable, specifically in end-to-end flows
("opening a ticket, get notification on issues"). At the same time:

- `pnpm test:unit` → **1674 tests, 99 files, all passing**
- `pnpm typecheck` → **11/11 packages clean**

Both signals are green and neither is informative. The 99 test files are
almost entirely pure functions (`format-datetime`, `normalize-address`,
`palette`, `audience`). Measured gaps:

| Surface | Count | Automated coverage |
|---|---|---|
| Pages (`apps/hoa`) | 115 | 0 |
| API routes | 27 | 0 |
| Inngest jobs | 16 | 2 job bodies |
| Browser E2E | 1 spec file | **never executed** |
| Error tracking | — | **none installed** |

There is no `playwright.config.*` anywhere in the repo, no `test:e2e`
script, and no CI job for either. `apps/hoa/e2e/inbox.spec.ts` has never
run. Playwright is a dependency only to serve `scrape-state-law.ts`.

CI (`.github/workflows/ci.yml`) runs `typecheck` and `build` and nothing
else. The 1674 tests gate nothing.

**The decisive constraint: there are no users.** Production will never
reveal a bug, because nothing exercises it. Two tickets exist, created
`2026-05-26` and `2026-07-12`; the notification feature shipped
`2026-08-30` (`9429f01`), followed by a fix to code that "could never
have worked" (`89925c8`). **That flow has never executed, in any
environment, ever.** Stability cannot be observed here — it has to be
manufactured by driving flows synthetically.

This sub-project builds that driver. It ships no user-visible feature.
Everything else in the program (the 24/7 loop, chaos/scale testing,
autonomous approvals) is machinery for acting on a signal, and is
worthless — actively harmful — until the signal is real.

---

## Verified findings this design responds to

Each was confirmed by direct inspection, with evidence.

### F1 — Two Inngest cron jobs have never run (live bug)

`recurringJeJob` and `plaidSyncJob` are exported from
`packages/jobs/src/index.ts:4-5` but absent from the `functions: [...]`
array in `apps/hoa/src/app/api/inngest/route.ts:42-57`. Inngest only
knows about functions a `serve()` handler advertises, so neither cron
exists on the platform.

Consequence: nightly recurring journal entries have never posted, and
Plaid bank sync has never run. All four `inngest.send()` event names
*do* resolve to registered listeners, so the defect is confined to the
cron direction.

### F2 — Cross-tenant privilege escalation via `org_members`

`migrations/0001_auth_fixes.sql:57-60`:

```sql
CREATE POLICY "auth_can_self_insert_org_members"
ON public.org_members
FOR INSERT
WITH CHECK (auth.uid() = user_id);
```

Constrains `user_id` only — not `org_id`, not `role`. Never tightened in
any later migration (grep across all 93 files). Because nearly every
policy reads `organization_id = ANY(public.auth_org_ids())`, and
`auth_org_ids()` is defined as the caller's `org_members` rows
(`migrations/0000_schema.sql:36-43`), a single INSERT naming a victim
org with `role: 'admin'` opens every tenant-scoped table in the schema.

### F3 — Storage buckets have no tenant scoping

`migrations/0003_storage_policies.sql` is the only file in the repo that
touches `storage.objects`. All six policies are shaped:

```sql
CREATE POLICY "auth_can_read_hoa_documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'hoa-documents');
```

The sole predicate is bucket identity, never org prefix. Any
authenticated user of any org can read — and, via the equally unscoped
INSERT policies, write — any other tenant's governing documents,
violation photos, and eviction filings. Isolation rests on nobody
guessing a `{org_id}/{filename}` path. The file's own comment defers
this to a "Phase 2" that never happened.

**Calibration:** F2 and F3 are currently unexploited — there are no real
tenants. They are latent, not active. They are also unconditionally
blocking for onboarding a second real HOA, and cheaper to fix now than
after customer data exists.

### F4 — Migration 0053 IS applied; three code comments say otherwise

Probed with a valid control (`definitely_not_a_table` → `PGRST205 Could
not find the table`):

```
notifications          OK rows=0
push_subscriptions     OK rows=0
tickets                OK rows=1
definitely_not_a_table ERR PGRST205
```

Both tables exist in production. Three comments claim they do not:
`apps/hoa/src/lib/notifications.ts:94-97`,
`apps/hoa/src/lib/push-subscriptions.ts:15`,
`packages/jobs/src/web-push.ts:84`. All three are stale and actively
mislead.

Consequence: the `as never` casts on those two tables are removable, and
the target assertion ("ticket created ⇒ notification row") is **not**
blocked. `database.types.ts` lacks both tables only because types were
last generated before 0053 landed — textbook `CLAUDE.md` §3.

### F5 — The test runner can silently write to production

`packages/db/src/client.ts:5`:

```ts
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
export function createAdminClient() {
  return createClient<Database>(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, …)
}
```

Module-scope, no fallback. The 22 harnesses resolve
`NEXT_PUBLIC_SUPABASE_URL || SUPABASE_URL`; `createAdminClient` resolves
only the former. A run pointed at a local stack via `SUPABASE_URL` alone
writes test data locally while every `createAdminClient` consumer —
Inngest job bodies, `ai_runs` audit rows from `packages/ai/src/workflow.ts:272`
— writes to **production**. Module-scope capture also means a
`beforeAll` env override is too late.

### F6 — `migrations/` is not a replayable sequence

93 files: 65 numbered, 5 `verify-*`, 23 unnumbered one-offs including
`delete-madison-park-closed-threads-force.sql`,
`diagnose-inbox-duplicates.sql`, `fix-madison-park-lease-cap.sql`.
Eight duplicate numeric prefixes: `0005, 0010, 0019, 0021, 0034, 0038,
0039, 0040`. Filename sort is therefore not a total order. There is no
`supabase/config.toml`, no `supabase/migrations/`, and no ledger table.

Two schema prerequisites exist nowhere in `migrations/`: the three
storage buckets (`0003` writes policies against buckets it never
creates) and the 7 global community templates
(`migrations/seed-community-templates.sql`, 119 KB).

### F7 — 22 orphaned integration harnesses already exist

`scripts/test-*.ts` — `test-accounting`, `test-ar`, `test-bank-rec`,
`test-inbox-rls`, and 18 more. They hit real Postgres, print pass/fail,
and exit 0/1. `vitest.config.ts:7-10` documents this as the intended
design: *"PURE modules only — no Supabase… Anything that needs real
Postgres belongs in scripts/test-*.ts."* That decision was correct.

They run against **production**, one at a time, by hand. CI has never
executed one. This design adopts and upgrades them rather than inventing
a parallel suite.

Convertibility, assessed per file:

| Bucket | Count | Blocker |
|---|---|---|
| Port as-is | 6 | only `process.exit` removal + connection string |
| Needs fixture factory | 13 | `loadFixture` *finds* an org instead of creating one |
| Hard | 3 | `test-bank-rec` (LLM + leaks), `test-reply-embeddings` (global-emptiness asserts), `test-reply-backfill` (passes vacuously on empty DB) |

Known defects in the harnesses themselves, to fix during the port:
- `test-bank-rec.ts:559-599` deletes **every** `ai_workflow_id='W18'`
  journal entry in the association, not just its own; leaks `ai_runs`
  rows and one orphaned assessment per run.
- `test-je-actions.ts:495-500` deletes `payment_plans` matched only on
  `(organization_id, total_amount=300, installment_count=3)`.
- `test-comms.ts:71-74` and `test-documents.ts:55-63` `process.exit(0)`
  — reporting **pass** — when a table is missing.
- `test-property-resolve.ts:103` prints `resident.email` into output:
  live PII in logs, the only harness that does so.
- `test-documents.ts:60` instructs applying
  `migrations/0010_hoa_document_versions.sql`; that file does not exist
  (the migration is `0016_`).

### F8 — RLS: 93/93 tables enabled, but the existing proof is narrow

Every table created in `migrations/` has `ENABLE ROW LEVEL SECURITY`;
the set difference is empty both ways. No table uses `FORCE ROW LEVEL
SECURITY`, so a raw `psql` connection as `postgres` bypasses all
policies — meaning **any isolation assertion made over a superuser or
service-role connection is vacuous.**

`scripts/test-inbox-rls.ts` is structurally correct and is the template:
service-role seeds and cleans; a genuinely signed-in user client
asserts; positive proof precedes negative proof; a query *error* is
recorded as `skip` and forces exit 1 rather than counting as denial. Its
limits: production-only, one role (`board`), three tables, and
**SELECT-only** — which is exactly why it cannot see F2, an INSERT.

Also noted, intra-tenant rather than cross-tenant: `notifications`,
`push_subscriptions`, and `hoa_dues` are gated on organization alone
with no `user_id = auth.uid()`, so any resident can read every other
resident's notifications, push endpoints, and dues balances within their
own HOA. `wizard_drafts` gets this right and is the model.

Unverified, needs a live catalog query: `public.property_bridge_gaps`
(`migrations/0028_property_bridge_backfill.sql:118-137`) appears to lack
`WITH (security_invoker = on)`, unlike every other view in the repo. If
`authenticated` holds SELECT on it, it is a cross-tenant leak. **Not
confirmed — do not report as fact.**

---

## Design

### §1 Foundation — local ephemeral Supabase

`supabase start`, version-pinned to match production from
`supabase/.temp/`: postgres `17.6.1.113`, gotrue `v2.189.0`, rest
`v14.5`, storage `v1.58.17`.

Full stack, not bare Postgres. The reason is not preference:
`migrations/0000_schema.sql` contains **zero GRANT statements**. All
privileges for `anon` / `authenticated` / `service_role` come from
Supabase's built-in default privileges on schema `public`. On bare
Postgres those roles do not exist, so every query 403s and **every
negative isolation assertion passes vacuously** — the precise failure
this design exists to prevent. Bare Postgres would not merely miss RLS
bugs; it would fake the all-clear.

Production is never a test target. Fixtures are synthetic; no prod row
is ever copied into the repo or into a log.

### §2 Runner and the production interlock

A second vitest project, `vitest.integration.config.ts`, matching
`tests/integration/**`. Separate from the root config so `pnpm test:unit`
remains a hermetic ~4s suite.

A global setup module, imported before anything else, must:

1. Set **all six** Supabase env names — `NEXT_PUBLIC_SUPABASE_URL`,
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_ANON_KEY` — to local
   values. Setting a subset is the F5 footgun.
2. **Abort the entire run** if the resolved URL is not loopback. This
   interlock is the only barrier between a 24/7 loop and production
   writes. It is a hard process exit, not a warning.
3. Set `AI_API_KEY=local`, which short-circuits the only LLM call path
   (`packages/workflows/src/W18-bank-reconciliation/index.ts:225-226`).
4. Block outbound network to non-loopback hosts.

Per-test isolation by truncation between cases, not transaction
rollback — PostgREST and GoTrue hold their own connections, so a
test-held transaction cannot wrap them.

### §3 Deterministic schema provisioning

Because of F6, schema construction is explicit, not inferred:

- **An ordered manifest file** naming exactly which migration files
  constitute the schema, in applied order. Checked into the repo.
  Resolves the eight duplicate prefixes by decision rather than by sort,
  and excludes all `verify-*`, `diagnose-*`, `delete-*`, `fix-*`, and
  `seed-*` one-offs.
- A replay script applying the manifest to the local stack. Its first
  run doubles as the first-ever verification that the migrations apply
  cleanly from empty.
- Post-replay provisioning for the two things migrations never create:
  the three storage buckets (`hoa-photos`, `hoa-documents`,
  `eviction-docs`) and the 7 global community templates.

Divergence risk, stated plainly: the manifest reproduces what the
migrations *say*, which F4 proves is not identical to what production
*is*. Local-vs-prod drift is therefore possible, and detecting it needs
a direct Postgres connection to prod (currently unavailable —
`POSTGRES_PASSWORD` is empty). This is an accepted limitation of A, and
the reason a hosted pre-deploy pass may later be worth adding. It does
not block anything here.

### §4 Fixture factory

Three composable builders cover 19 of the 22 harnesses:

- `makeOrg()` → `orgs` + `associations`. The cascade root; sufficient
  alone for `test-bids`, `test-rfp-bid-submit`,
  `test-vendor-onboard-submit`.
- `makeAccounting(assoc)` → 2 funds, the 25-row default chart of
  accounts, one open fiscal period. **Highest-leverage fixture — eight
  harnesses block on it.** Extracted from `scripts/seed-accounting.ts`,
  which is already idempotent and already factored this way. Extract,
  do not reimplement.
- `mintUser(org, role)` → GoTrue `auth.admin.createUser({ email_confirm:
  true })`, defensive `profiles` upsert (because `org_members.user_id`
  FKs to `profiles(id)` and the `handle_new_user` trigger may be off),
  `org_members` insert with the post-`0012` role vocabulary, then a
  **fresh client performing a real `signInWithPassword`**.

The returned client is user-scoped and RLS-enforcing. The invariant,
which no test may violate:

> **Service-role seeds and cleans. User clients assert.**

Rationale (F8): the service-role JWT maps to a Postgres role with
`BYPASSRLS`. An isolation assertion made through it passes whether the
policy is correct, wrong, or absent.

Generated emails use a reserved non-routable domain. Passwords are
random and never logged. Harness output is ids and counts only — never
addresses, subjects, or bodies.

### §5 Test sequence

**1. The two security holes, as failing tests first.**
F2: a `board` user in org A attempts `org_members` insert into org B with
`role: 'admin'` — must error, currently succeeds.
F3: a resident of org B downloads `{orgA.id}/…` from `hoa-documents` —
must error, currently succeeds.
Red, then fix, then permanently guarded.

**2. `ticket/created` ⇒ a row in `notifications`.** The reported bug.
Refactor `ticketNotificationsJob` to the thin-shell pattern the repo
already uses (`runMailboxSend`, `runMailboxReplyEmbeddings`): the
Inngest wrapper unwraps the event and calls an exported
`runTicketNotifications(db, step, logger, payload)`. Assert the row
against real Postgres with a filter-aware double, so deleting the dedupe
predicate fails the test. Note `inngest@3.54.2` ships no test helper and
`@inngest/test` is not installed; `InngestFunction#createExecution` is
`protected`. Extraction is the right seam.

**3. A wiring-contract test.** Every `inngest.send()` event name has a
registered listener, and every job exported from `packages/jobs` appears
in the `serve()` array. **Fails today on F1.** One test, permanent
immunity to a whole class of silent async failure.

**4. Port the 6 ready harnesses**, then the 13 factory-dependent ones,
then the 3 hard ones — fixing the F7 defects as each is touched.

**5. A thin browser layer, last.** `playwright.config.ts` (none exists)
plus 6–10 journeys over critical paths, against the local stack, with
auth via a seeded `storageState`. Not 115 pages. Written only once
layers 1–4 are trusted — browser tests built on an unproven foundation
become a flaky suite everyone learns to ignore, which is worse than
none.

### §6 Make typecheck load-bearing

`.from('notifications' as never)` means `tsc` cannot check a single
column name in the most-broken flow. Two tables are provably missing
from `database.types.ts` (F4); 37 others are cast for reasons that may
be stale.

- Regenerate types with `supabase gen types` against the **local**
  stack. This avoids the `CLAUDE.md` §3 trap entirely: local schema is
  the manifest, so generation cannot silently revert an unapplied
  migration.
- Remove `as never` casts one at a time, keeping only those that still
  fail `rtk pnpm -r typecheck`. Table-level presence is not proof a cast
  is removable — a column may still be missing, and `.from()` returning
  `never` untypes the whole chain.
- Delete the three stale 0053 comments.

### §7 CI that blocks

`.github/workflows/ci.yml` gains a job running the unit suite and the
integration suite against a stack started in the runner. Until then,
every test written here gates nothing.

Trusted commands only, per `CLAUDE.md`: `pnpm typecheck`,
`rtk pnpm -r typecheck`, `pnpm test:unit`. Never `rtk pnpm typecheck`
(runs `tsc --help`) and never `pnpm lint` (has never worked).

---

## Out of scope

Deliberately excluded; each gets its own spec:

| | Sub-project |
|---|---|
| B | 24/7 autonomous dev loop |
| C | Security / chaos / scale / exploratory testing |
| D | Approval + notification layer |
| E | Enterprise UI/UX across 115 pages |
| F | Law → bylaw amendment pipeline |

Production observability (no error tracking exists anywhere in the repo)
is a prerequisite for B, not A: a self-healing loop can only repair what
it can detect. Noted here so it is not lost.

---

## Success criteria

1. `supabase start` + replay produces a schema-complete local stack from
   empty, repeatably.
2. The integration suite aborts hard if pointed anywhere but loopback.
3. F2 and F3 each have a test that fails before the fix and passes after.
4. "Resident opens a ticket ⇒ the board gets a notification row" is
   asserted against real Postgres and runs in CI.
5. The wiring-contract test fails on F1, then passes once both jobs are
   registered.
6. At least the 6 port-as-is harnesses run unattended under vitest.
7. `rtk pnpm -r typecheck` passes with the `notifications` and
   `push_subscriptions` casts deleted.
8. CI fails a PR when any of the above breaks.

Criterion 8 is the one that matters. The others are how it becomes true.
