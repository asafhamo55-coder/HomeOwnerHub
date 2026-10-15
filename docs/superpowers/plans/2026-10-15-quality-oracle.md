# Quality Oracle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the first trustworthy automated quality signal for HomeownerHub — an integration suite running against a local ephemeral Supabase stack, gating CI, proving the flows that are currently unverified.

**Architecture:** A version-pinned local Supabase stack (`supabase start`) seeded by an explicit ordered migration manifest. A second vitest project (`tests/integration/**`) with a hard loopback interlock so a run can never write to production. A fixture factory that mints orgs, accounting scaffolding, and genuinely signed-in users. Tests then prove three things that are broken or unverified today: two cross-tenant security holes, two unregistered cron jobs, and the ticket→notification flow.

**Tech Stack:** pnpm workspaces, vitest 2.1.9, Supabase CLI 2.95.4, Docker, Postgres 17.6, GoTrue 2.189.0, PostgREST 14.5, Inngest 3.54.2, TypeScript 5.

**Spec:** `docs/superpowers/specs/2026-10-15-quality-oracle-design.md`

## Global Constraints

- Local stack versions must match production exactly: postgres `17.6.1.113`, gotrue `v2.189.0`, rest `v14.5`, storage `v1.58.17` (source: `supabase/.temp/`).
- **Service-role seeds and cleans. User clients assert.** No isolation assertion may be made through a service-role client — it has `BYPASSRLS` and the assertion would be vacuous.
- Integration tests must abort the whole run if the resolved Supabase URL is not loopback.
- All six Supabase env names must be set together: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_ANON_KEY`. Setting a subset routes `createAdminClient()` to production (`packages/db/src/client.ts:5`).
- `AI_API_KEY=local` in every test run — this short-circuits the only LLM call path (`packages/workflows/src/W18-bank-reconciliation/index.ts:225-226`).
- Test output is ids and counts only. Never email addresses, subjects, or message bodies.
- Generated test emails use `@example.test`. Passwords are random and never logged.
- Trusted verification commands only: `pnpm typecheck`, `rtk pnpm -r typecheck`, `pnpm test:unit`. **Never** `rtk pnpm typecheck` (runs `tsc --help`, always "passes"). **Never** read `pnpm lint` output (has never worked in this repo).
- `pnpm test:unit` must stay hermetic and fast (~4s, no Supabase). Integration tests go in a separate vitest project, never widen the root `include` globs.

---

### Task 1: Local stack + ordered migration manifest

**Files:**
- Create: `supabase/config.toml`
- Create: `tests/integration/schema/manifest.ts`
- Create: `scripts/local-db-reset.ts`
- Modify: `package.json` (add `db:local:reset` script)

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `MIGRATION_MANIFEST: string[]` from `tests/integration/schema/manifest.ts` — ordered migration filenames relative to `migrations/`. A `pnpm db:local:reset` script that leaves a schema-complete local stack running.

- [ ] **Step 1: Initialize the Supabase project config**

Run: `supabase init`

Then edit `supabase/config.toml` to pin versions matching production. Set at minimum:

```toml
project_id = "homeownerhub-local"

[api]
enabled = true
port = 54321
schemas = ["public", "storage", "graphql_public"]

[db]
port = 54322
major_version = 17

[auth]
enabled = true
site_url = "http://127.0.0.1:3000"
# Tests mint users via the GoTrue admin API with email_confirm: true,
# so no mail flow is needed — but leave signup on, because
# mintUser() calls signInWithPassword against this instance.
enable_signup = true

[auth.email]
enable_confirmations = false

[storage]
enabled = true
```

- [ ] **Step 2: Write the migration manifest**

`migrations/` holds 93 `.sql` files: 65 numbered migrations, 5 `verify-*`, and 23 unnumbered one-offs including `delete-madison-park-closed-threads-force.sql` and `diagnose-inbox-duplicates.sql`. Running the directory blind would execute a force-delete. Eight numeric prefixes also collide, so filename sort is not a total order.

Five are genuine same-number collisions (`0019`, `0021`, `0038`, `0039`, `0040`); the rest (`0005a/b`, `0010b`, `0034a/b/c`) are suffixed variants that sort naturally after their base. For the five, each pair touches unrelated tables, so alphabetical order within the number is safe and is recorded here as a deliberate decision rather than an accident of `ls`.

Create `tests/integration/schema/manifest.ts`:

```ts
/**
 * The ordered list of migrations that constitute the schema.
 *
 * This file exists because `migrations/` is NOT a replayable sequence:
 * it mixes 65 real migrations with 5 `verify-*` assertion scripts and 23
 * unnumbered one-offs (`delete-madison-park-closed-threads-force.sql`,
 * `diagnose-inbox-duplicates.sql`, `fix-madison-park-lease-cap.sql`,
 * seeds). Replaying the directory would run a force-delete.
 *
 * Eight numeric prefixes also collide, so sorting filenames is not a
 * total order. Five are true same-number pairs — 0019, 0021, 0038, 0039,
 * 0040 — and each pair touches unrelated tables, so alphabetical order
 * within a number is safe. That is a decision, not a default; if a future
 * pair is order-dependent, fix it HERE, not by renaming files.
 *
 * Adding a migration? Append it. The replay is what CI trusts.
 */
export const MIGRATION_MANIFEST: string[] = [
  '0000_schema.sql',
  '0001_auth_fixes.sql',
  '0002_wizard_drafts.sql',
  '0003_storage_policies.sql',
  '0004_v1_schema_phase2a.sql',
  '0005_units_backfill.sql',
  '0005a_search_rpc.sql',
  '0005b_embedding_dim_swap.sql',
  '0006_accounting.sql',
  '0007_vendors.sql',
  '0008_association_compliance_settings.sql',
  '0009_vendor_onboarding_invitations.sql',
  '0010_state_statutes.sql',
  '0010b_search_state_statute_chunks_v2.sql',
  '0011_state_law_updates.sql',
  '0012_rbac_roles.sql',
  '0013_resident_submissions.sql',
  '0014_bids_parsed_pdf_text.sql',
  '0015_plaid_items.sql',
  '0016_hoa_document_versions.sql',
  '0017_leases_and_property_360.sql',
  '0018_communications.sql',
  '0019_meeting_action_items.sql',
  '0019_platform_admin.sql',
  '0020_recurring_events.sql',
  '0021_event_notify_config.sql',
  '0021_search_rpc_loosen.sql',
  '0022_soft_delete.sql',
  '0023_fix_section_sign_encoding.sql',
  '0024_tickets.sql',
  '0025_archive_tenant.sql',
  '0026_submission_threads.sql',
  '0027_submission_attachments.sql',
  '0028_property_bridge_backfill.sql',
  '0029_inbox.sql',
  '0030_inbox_message_uniq_scope.sql',
  '0031_inbox_attachment_uniq.sql',
  '0032_mailbox_backfill_watchdog.sql',
  '0033_inbox_sender_alias_uniq.sql',
  '0034_inbox_reply_embeddings.sql',
  '0034a_reset_backfill_for_sent_mail.sql',
  '0034b_search_reply_embeddings.sql',
  '0034c_reply_embeddings_skip_marker.sql',
  '0035_inbox_drafts.sql',
  '0036_ai_runs_board_only.sql',
  '0037_inbox_vendor_assignment.sql',
  '0038_dashboard_daily_snapshots.sql',
  '0038_inbox_outbound_recipients.sql',
  '0039_inbox_draft_attachments.sql',
  '0039_property_list_view.sql',
  '0040_inbox_draft_attachment_path_scope.sql',
  '0040_property_list_view_board_predicate.sql',
  '0041_property_residents_write_gate.sql',
  '0042_inbox_vendor_request.sql',
  '0043_inbox_gmail_state.sql',
  '0044_community_templates.sql',
  '0045_property_list_view_review_fixes.sql',
  '0046_property_list_attention_split.sql',
  '0047_collections.sql',
  '0048_inbox_org_scoped_identity.sql',
  '0049_mailbox_reconcile_error.sql',
  '0050_communication_rendered_subject.sql',
  '0051_property_list_waiting_list.sql',
  '0052_announcements_last_viewed.sql',
  '0053_ticket_notifications.sql',
]

/**
 * Storage buckets. `migrations/0003_storage_policies.sql` writes policies
 * against these three buckets but never creates them — they were
 * provisioned out of band in production, so replay must create them or
 * every storage test fails on a missing bucket.
 */
export const STORAGE_BUCKETS = ['hoa-photos', 'hoa-documents', 'eviction-docs'] as const

/**
 * Seeds that are schema prerequisites rather than per-test fixtures.
 * The 7 global community templates (organization_id IS NULL) are asserted
 * on by scripts/test-community-templates.ts.
 */
export const SCHEMA_SEEDS: string[] = ['seed-community-templates.sql']
```

- [ ] **Step 3: Write the replay script**

Create `scripts/local-db-reset.ts`:

```ts
/**
 * scripts/local-db-reset.ts
 *
 * Rebuilds the LOCAL Supabase database from the migration manifest.
 *
 * Refuses to run against anything but loopback. This script drops the
 * public schema; pointing it at production would be unrecoverable.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MIGRATION_MANIFEST, SCHEMA_SEEDS, STORAGE_BUCKETS } from '../tests/integration/schema/manifest'

const REPO_ROOT = resolve(__dirname, '..')
const LOCAL_DB = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

function assertLoopback(conn: string): void {
  if (!/@(127\.0\.0\.1|localhost|\[::1\]):/.test(conn)) {
    throw new Error(`local-db-reset: refusing to run against non-loopback: ${conn.replace(/:[^:@]*@/, ':***@')}`)
  }
}

function psql(sql: string): void {
  execFileSync('psql', [LOCAL_DB, '-v', 'ON_ERROR_STOP=1', '-q', '-c', sql], { stdio: ['ignore', 'ignore', 'inherit'] })
}

function psqlFile(path: string): void {
  execFileSync('psql', [LOCAL_DB, '-v', 'ON_ERROR_STOP=1', '-q', '-f', path], { stdio: ['ignore', 'ignore', 'inherit'] })
}

function main(): void {
  assertLoopback(LOCAL_DB)

  // Drop and recreate public so replay starts from genuinely empty. This
  // is the first time these migrations have ever been applied from
  // scratch; a failure here is a real finding, not a script bug.
  psql('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;')
  psql('GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;')

  let applied = 0
  for (const name of MIGRATION_MANIFEST) {
    const path = resolve(REPO_ROOT, 'migrations', name)
    readFileSync(path) // fail loudly if the manifest names a missing file
    try {
      psqlFile(path)
    } catch {
      throw new Error(`local-db-reset: migration FAILED at ${name} (after ${applied} applied)`)
    }
    applied += 1
  }
  console.log(`[local-db-reset] applied ${applied}/${MIGRATION_MANIFEST.length} migrations`)

  for (const bucket of STORAGE_BUCKETS) {
    psql(`INSERT INTO storage.buckets (id, name, public) VALUES ('${bucket}', '${bucket}', false) ON CONFLICT (id) DO NOTHING;`)
  }
  console.log(`[local-db-reset] ensured ${STORAGE_BUCKETS.length} storage buckets`)

  for (const seed of SCHEMA_SEEDS) {
    psqlFile(resolve(REPO_ROOT, 'migrations', seed))
  }
  console.log(`[local-db-reset] applied ${SCHEMA_SEEDS.length} schema seed(s)`)
}

main()
```

- [ ] **Step 4: Wire the script**

Add to root `package.json` scripts:

```json
"db:local:reset": "tsx scripts/local-db-reset.ts"
```

- [ ] **Step 5: Start the stack and run the replay — this is the real test**

Run:
```bash
supabase start
pnpm db:local:reset
```

Expected on success: `applied 65/65 migrations`, then buckets, then seeds.

**If a migration fails, that is a genuine finding — the migrations have never been applied from empty before.** Do NOT edit the historical migration file to make it pass. Record the failing filename and the Postgres error, stop, and report it. A migration that cannot replay is information about production drift.

- [ ] **Step 6: Verify the schema landed**

Run:
```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "select count(*) from information_schema.tables where table_schema='public';"
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "select count(*) from pg_policies where schemaname='public';"
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "select id from storage.buckets order by id;"
```
Expected: ~90+ tables, a non-zero policy count, and exactly the three buckets `eviction-docs`, `hoa-documents`, `hoa-photos`.

- [ ] **Step 7: Commit**

```bash
rtk git add supabase/config.toml tests/integration/schema/manifest.ts scripts/local-db-reset.ts package.json
rtk git commit -m "test(oracle): replay the schema into a local stack from an explicit manifest

migrations/ is not a replayable sequence — 65 real migrations mixed with
5 verify-* scripts and 23 one-offs including a force-delete, plus eight
colliding numeric prefixes so filename sort is not a total order. The
manifest names what the schema is and in what order, and resolves the
five true collisions by decision rather than by ls.

0003_storage_policies.sql writes policies against three buckets it never
creates, so replay creates them too."
```

---

### Task 2: The loopback interlock and integration test runner

**Files:**
- Create: `tests/integration/setup/env.ts`
- Create: `tests/integration/setup/env.test.ts`
- Create: `vitest.integration.config.ts`
- Modify: `package.json` (add `test:integration`)

**Interfaces:**
- Consumes: a running local stack from Task 1
- Produces: `assertLoopbackOrDie(url: string): void` and `LOCAL_SUPABASE_URL`, `LOCAL_ANON_KEY`, `LOCAL_SERVICE_KEY` constants from `tests/integration/setup/env.ts`. A `pnpm test:integration` command.

- [ ] **Step 1: Write the failing test for the interlock**

The interlock is the only barrier between a 24/7 loop and production writes, so it gets a test of its own.

Create `tests/integration/setup/env.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { assertLoopbackOrDie } from './env'

describe('assertLoopbackOrDie', () => {
  it('accepts loopback hosts', () => {
    expect(() => assertLoopbackOrDie('http://127.0.0.1:54321')).not.toThrow()
    expect(() => assertLoopbackOrDie('http://localhost:54321')).not.toThrow()
  })

  it('rejects the production project', () => {
    expect(() => assertLoopbackOrDie('https://xwdjsxfskvreguyvryhc.supabase.co')).toThrow(/loopback/i)
  })

  it('rejects any non-loopback host', () => {
    expect(() => assertLoopbackOrDie('https://example.com')).toThrow(/loopback/i)
  })

  // A hostname that merely CONTAINS "localhost" is not loopback.
  it('rejects hosts that only look like loopback', () => {
    expect(() => assertLoopbackOrDie('https://localhost.evil.com')).toThrow(/loopback/i)
    expect(() => assertLoopbackOrDie('https://127.0.0.1.evil.com')).toThrow(/loopback/i)
  })

  it('rejects an empty or malformed url', () => {
    expect(() => assertLoopbackOrDie('')).toThrow()
    expect(() => assertLoopbackOrDie('not-a-url')).toThrow()
  })
})
```

- [ ] **Step 2: Run it and verify it fails**

Run: `pnpm exec vitest run tests/integration/setup/env.test.ts`
Expected: FAIL — cannot resolve `./env`.

- [ ] **Step 3: Implement the interlock**

Create `tests/integration/setup/env.ts`:

```ts
/**
 * Integration-test environment. Imported for side effects by
 * vitest.integration.config.ts BEFORE any application module loads.
 *
 * Why this file is load-bearing: packages/db/src/client.ts:5 reads
 *
 *   export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
 *
 * at MODULE SCOPE with no fallback, and createAdminClient() uses it. The
 * 22 scripts/test-*.ts harnesses resolve NEXT_PUBLIC_SUPABASE_URL ||
 * SUPABASE_URL. So a run configured with SUPABASE_URL alone writes test
 * rows locally while every createAdminClient consumer — Inngest job
 * bodies, ai_runs audit rows from packages/ai/src/workflow.ts:272 —
 * writes to PRODUCTION. Setting a subset of these names is the bug.
 *
 * Module-scope capture also means a beforeAll() override is too late.
 * This must run at import time.
 */

/** Default local stack values. `supabase start` prints these; they are the
 *  CLI's fixed demo keys, identical on every machine, and are not secrets. */
export const LOCAL_SUPABASE_URL = process.env.LOCAL_SUPABASE_URL ?? 'http://127.0.0.1:54321'
export const LOCAL_ANON_KEY =
  process.env.LOCAL_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
export const LOCAL_SERVICE_KEY =
  process.env.LOCAL_SUPABASE_SERVICE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
export const LOCAL_DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])

/**
 * Hard-stops the process unless `url` points at loopback. Throws rather
 * than warns: a warning in a 24/7 loop is a warning nobody reads.
 */
export function assertLoopbackOrDie(url: string): void {
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    throw new Error(`integration tests: SUPABASE_URL is not a valid URL: ${JSON.stringify(url)}`)
  }
  // Exact match only. A substring test would accept localhost.evil.com.
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(
      `integration tests: refusing to run against non-loopback host ${JSON.stringify(host)}. ` +
        `These tests truncate tables and create users. Start the local stack with \`supabase start\`.`,
    )
  }
}

/** Sets ALL SIX Supabase names together, then enforces the interlock. */
export function installLocalEnv(): void {
  assertLoopbackOrDie(LOCAL_SUPABASE_URL)

  process.env.NEXT_PUBLIC_SUPABASE_URL = LOCAL_SUPABASE_URL
  process.env.SUPABASE_URL = LOCAL_SUPABASE_URL
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = LOCAL_ANON_KEY
  process.env.SUPABASE_ANON_KEY = LOCAL_ANON_KEY
  process.env.SUPABASE_SERVICE_ROLE_KEY = LOCAL_SERVICE_KEY
  process.env.SUPABASE_SECRET_KEY = LOCAL_SERVICE_KEY

  // Short-circuits the only LLM call path in the test surface
  // (packages/workflows/src/W18-bank-reconciliation/index.ts:225-226).
  process.env.AI_API_KEY = 'local'

  // Belt and braces: re-read what the app will actually resolve.
  assertLoopbackOrDie(process.env.NEXT_PUBLIC_SUPABASE_URL)
  assertLoopbackOrDie(process.env.SUPABASE_URL)
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `pnpm exec vitest run tests/integration/setup/env.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Create the integration vitest project**

Create `vitest.integration.config.ts`:

```ts
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

// Integration suite. DELIBERATELY separate from vitest.config.ts, which
// is pure-module-only and must stay a ~4s hermetic run. Do not merge
// these: widening the root include globs is how the fast suite dies.
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    // Loaded before any test file, and therefore before any application
    // module captures process.env at import scope.
    setupFiles: ['tests/integration/setup/global.ts'],
    environment: 'node',
    // These tests share one database. Parallel files would interleave
    // truncation with other files' fixtures.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    clearMocks: true,
    passWithNoTests: false,
  },
  resolve: {
    alias: { '@': path.resolve(rootDir, 'apps/hoa/src') },
  },
})
```

Create `tests/integration/setup/global.ts`:

```ts
// Runs before every integration test file. Order matters: env first,
// because application modules capture process.env at import scope.
import { installLocalEnv } from './env'

installLocalEnv()
```

- [ ] **Step 6: Wire the command**

Add to root `package.json` scripts:

```json
"test:integration": "vitest run --config vitest.integration.config.ts"
```

- [ ] **Step 7: Prove the interlock actually stops a bad run**

Run: `LOCAL_SUPABASE_URL=https://xwdjsxfskvreguyvryhc.supabase.co pnpm test:integration`
Expected: the run aborts with "refusing to run against non-loopback host". **No test executes.**

Then run: `pnpm test:integration`
Expected: PASS.

- [ ] **Step 8: Verify the fast suite is untouched**

Run: `pnpm test:unit`
Expected: 1674 tests pass, ~4s. The integration tests must NOT appear in this run.

- [ ] **Step 9: Commit**

```bash
rtk git add tests/integration/setup/ vitest.integration.config.ts package.json
rtk git commit -m "test(oracle): refuse to run integration tests against anything but loopback

packages/db/src/client.ts:5 reads NEXT_PUBLIC_SUPABASE_URL at module
scope with no fallback, while the 22 harnesses resolve
NEXT_PUBLIC_SUPABASE_URL || SUPABASE_URL. Configure a run with
SUPABASE_URL alone and test rows land locally while every
createAdminClient consumer writes to production.

So the setup sets all six names together and hard-exits on a
non-loopback host. Exact hostname match, not substring — otherwise
localhost.evil.com passes."
```

---

### Task 3: Fixture factory

**Files:**
- Create: `tests/integration/fixtures/factory.ts`
- Create: `tests/integration/fixtures/factory.test.ts`
- Create: `tests/integration/fixtures/truncate.ts`

**Interfaces:**
- Consumes: `LOCAL_SUPABASE_URL`, `LOCAL_ANON_KEY`, `LOCAL_SERVICE_KEY` from `tests/integration/setup/env.ts`
- Produces:
  - `adminDb(): SupabaseClient<Database>` — service-role, seeds and cleans only
  - `makeOrg(): Promise<OrgFixture>` where `OrgFixture = { orgId: string; associationId: string }`
  - `makeAccounting(f: OrgFixture): Promise<AccountingRefs>` where `AccountingRefs = { fundIds: { OPERATING: string; RESERVE: string }; accountIds: Record<string, string>; fiscalPeriodId: string }`
  - `makeUnit(f: OrgFixture): Promise<string>` (returns unit id)
  - `mintUser(f: OrgFixture, role: 'admin' | 'board' | 'resident'): Promise<TestUser>` where `TestUser = { id: string; email: string; client: SupabaseClient<Database> }`
  - `truncateAll(): Promise<void>` — from `tests/integration/fixtures/truncate.ts`, not `factory.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/fixtures/factory.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { adminDb, makeAccounting, makeOrg, makeUnit, mintUser } from './factory'
import { truncateAll } from './truncate'

describe('fixture factory', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('makeOrg creates an hoa org with an association', async () => {
    const f = await makeOrg()
    expect(f.orgId).toMatch(/^[0-9a-f-]{36}$/)
    expect(f.associationId).toMatch(/^[0-9a-f-]{36}$/)

    const { data } = await adminDb().from('orgs').select('id, hub_type').eq('id', f.orgId).single()
    expect(data?.hub_type).toBe('hoa')
  })

  it('makeOrg produces isolated orgs on repeat calls', async () => {
    const a = await makeOrg()
    const b = await makeOrg()
    expect(a.orgId).not.toBe(b.orgId)
  })

  it('makeAccounting creates both funds, the full COA, and an open period', async () => {
    const f = await makeOrg()
    const refs = await makeAccounting(f)

    expect(Object.keys(refs.fundIds).sort()).toEqual(['OPERATING', 'RESERVE'])
    // The 25-row DEFAULT_COA from scripts/seed-accounting.ts.
    expect(Object.keys(refs.accountIds).length).toBe(25)
    // Accounts the accounting harnesses specifically require.
    for (const n of ['1010', '1020', '1100', '2010', '3000', '4000', '4100']) {
      expect(refs.accountIds[n], `account ${n} missing`).toBeTruthy()
    }
    // At least one expense account (5xxx) — test-ap and test-reports-close need it.
    expect(Object.keys(refs.accountIds).some((n) => n.startsWith('5'))).toBe(true)

    const { data } = await adminDb()
      .from('fiscal_periods').select('status').eq('id', refs.fiscalPeriodId).single()
    expect(data?.status).toBe('open')
  })

  it('mintUser returns a client whose auth.uid() is populated', async () => {
    const f = await makeOrg()
    const user = await mintUser(f, 'board')

    const { data } = await user.client.auth.getUser()
    expect(data.user?.id).toBe(user.id)
  })

  it('mintUser client is RLS-scoped to its own org', async () => {
    const orgA = await makeOrg()
    const orgB = await makeOrg()
    const boardA = await mintUser(orgA, 'board')

    // Positive proof FIRST. Without it, a broken deny-all policy would
    // satisfy the negative below and the test would prove nothing.
    const mine = await boardA.client.from('orgs').select('id').eq('id', orgA.orgId)
    expect(mine.error).toBeNull()
    expect(mine.data).toHaveLength(1)

    const theirs = await boardA.client.from('orgs').select('id').eq('id', orgB.orgId)
    expect(theirs.error).toBeNull()
    expect(theirs.data).toHaveLength(0)
  })

  it('makeUnit attaches a unit to the association', async () => {
    const f = await makeOrg()
    const unitId = await makeUnit(f)
    const { data } = await adminDb()
      .from('units').select('association_id').eq('id', unitId).single()
    expect(data?.association_id).toBe(f.associationId)
  })
})
```

- [ ] **Step 2: Run it and verify it fails**

Run: `pnpm test:integration -t 'fixture factory'`
Expected: FAIL — cannot resolve `./factory`.

- [ ] **Step 3: Implement truncation**

Create `tests/integration/fixtures/truncate.ts`:

```ts
/**
 * Between-test reset.
 *
 * Truncation, not transaction rollback: PostgREST and GoTrue hold their
 * own connections, so a transaction held open by the test process cannot
 * wrap what they do.
 *
 * `orgs` is the cascade root for tenant data, and auth.users is cleared
 * separately because org_members.user_id FKs to profiles(id), which FKs
 * to auth.users.
 */
import { execFileSync } from 'node:child_process'
import { LOCAL_DB_URL, assertLoopbackOrDie } from '../setup/env'

export async function truncateAll(): Promise<void> {
  assertLoopbackOrDie(LOCAL_DB_URL.replace(/^postgresql/, 'http'))

  // Global templates (organization_id IS NULL) are schema seeds, not
  // fixtures — preserve them. Everything tenant-scoped goes.
  const sql = `
    TRUNCATE TABLE public.orgs CASCADE;
    DELETE FROM public.communication_templates WHERE organization_id IS NOT NULL;
    DELETE FROM auth.users;
    DELETE FROM storage.objects;
  `
  execFileSync('psql', [LOCAL_DB_URL, '-v', 'ON_ERROR_STOP=1', '-q', '-c', sql], {
    stdio: ['ignore', 'ignore', 'inherit'],
  })
}
```

- [ ] **Step 4: Implement the factory**

Create `tests/integration/fixtures/factory.ts`:

```ts
/**
 * Fixture factory for integration tests.
 *
 * THE INVARIANT: service-role seeds and cleans; user clients assert.
 *
 * The service-role JWT maps to a Postgres role with BYPASSRLS, so an
 * isolation assertion made through adminDb() passes whether the policy is
 * correct, wrong, or absent. Only a client holding a real user JWT puts
 * auth.uid() in scope and makes a policy load-bearing. No table in this
 * schema uses FORCE ROW LEVEL SECURITY, so a raw psql superuser
 * connection bypasses policies too.
 *
 * Shaped after scripts/test-inbox-rls.ts, which already does this
 * correctly against production. makeAccounting mirrors
 * scripts/seed-accounting.ts's DEFAULT_COA; the two must stay in step.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/db/src/database.types'
import { LOCAL_ANON_KEY, LOCAL_SERVICE_KEY, LOCAL_SUPABASE_URL } from '../setup/env'

export type Db = SupabaseClient<Database>

export interface OrgFixture {
  orgId: string
  associationId: string
}

export interface AccountingRefs {
  fundIds: { OPERATING: string; RESERVE: string }
  accountIds: Record<string, string>
  fiscalPeriodId: string
}

export interface TestUser {
  id: string
  email: string
  /** RLS-enforcing. Assertions run against THIS, never adminDb(). */
  client: Db
}

const noPersist = { auth: { autoRefreshToken: false, persistSession: false } } as const

export function adminDb(): Db {
  return createClient<Database>(LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, noPersist)
}

export async function makeOrg(): Promise<OrgFixture> {
  const db = adminDb()
  const suffix = randomUUID().slice(0, 8)

  const { data: org, error: orgErr } = await db
    .from('orgs')
    .insert({ name: `Test HOA ${suffix}`, hub_type: 'hoa' })
    .select('id')
    .single()
  if (orgErr || !org) throw new Error(`makeOrg: orgs insert failed: ${orgErr?.message}`)

  const { data: assoc, error: assocErr } = await db
    .from('associations')
    .insert({ organization_id: org.id, name: `Test Association ${suffix}` })
    .select('id')
    .single()
  if (assocErr || !assoc) throw new Error(`makeOrg: associations insert failed: ${assocErr?.message}`)

  return { orgId: org.id, associationId: assoc.id }
}

/** Mirrors DEFAULT_COA in scripts/seed-accounting.ts (25 rows). */
const DEFAULT_COA: { number: string; name: string; type: string; fund: 'OPERATING' | 'RESERVE' | null }[] = [
  { number: '1010', name: 'Cash — Operating', type: 'asset', fund: 'OPERATING' },
  { number: '1020', name: 'Cash — Reserve', type: 'asset', fund: 'RESERVE' },
  { number: '1100', name: 'Accounts Receivable', type: 'asset', fund: null },
  { number: '1110', name: 'Allowance for Doubtful Accounts', type: 'asset', fund: null },
  { number: '1200', name: 'Prepaid Expenses', type: 'asset', fund: 'OPERATING' },
  { number: '2010', name: 'Accounts Payable', type: 'liability', fund: null },
  { number: '2100', name: 'Prepaid Assessments', type: 'liability', fund: 'OPERATING' },
  { number: '2200', name: 'Accrued Expenses', type: 'liability', fund: 'OPERATING' },
  { number: '3000', name: 'Fund Balance — Operating', type: 'equity', fund: 'OPERATING' },
  { number: '3010', name: 'Fund Balance — Reserve', type: 'equity', fund: 'RESERVE' },
  { number: '4000', name: 'Assessment Income', type: 'income', fund: 'OPERATING' },
  { number: '4010', name: 'Special Assessment Income', type: 'income', fund: 'OPERATING' },
  { number: '4100', name: 'Late Fee Income', type: 'income', fund: 'OPERATING' },
  { number: '4110', name: 'Fine Income', type: 'income', fund: 'OPERATING' },
  { number: '4200', name: 'Interest Income', type: 'income', fund: 'RESERVE' },
  { number: '4900', name: 'Other Income', type: 'income', fund: 'OPERATING' },
  { number: '5000', name: 'Landscaping', type: 'expense', fund: 'OPERATING' },
  { number: '5010', name: 'Utilities', type: 'expense', fund: 'OPERATING' },
  { number: '5020', name: 'Insurance', type: 'expense', fund: 'OPERATING' },
  { number: '5030', name: 'Management Fees', type: 'expense', fund: 'OPERATING' },
  { number: '5040', name: 'Repairs & Maintenance', type: 'expense', fund: 'OPERATING' },
  { number: '5050', name: 'Professional Fees (Legal/Accounting)', type: 'expense', fund: 'OPERATING' },
  { number: '5060', name: 'Office & Admin', type: 'expense', fund: 'OPERATING' },
  { number: '5100', name: 'Reserve Expenditures', type: 'expense', fund: 'RESERVE' },
  { number: '5900', name: 'Bank Fees', type: 'expense', fund: 'OPERATING' },
]

export async function makeAccounting(f: OrgFixture): Promise<AccountingRefs> {
  const db = adminDb()

  const { data: funds, error: fundErr } = await db
    .from('funds')
    .insert([
      { organization_id: f.orgId, association_id: f.associationId, code: 'OPERATING', name: 'Operating Fund', fund_type: 'operating' },
      { organization_id: f.orgId, association_id: f.associationId, code: 'RESERVE', name: 'Reserve Fund', fund_type: 'reserve' },
    ])
    .select('id, code')
  if (fundErr || !funds) throw new Error(`makeAccounting: funds insert failed: ${fundErr?.message}`)

  const fundIds = { OPERATING: '', RESERVE: '' }
  for (const row of funds) fundIds[row.code as 'OPERATING' | 'RESERVE'] = row.id

  const { data: accounts, error: coaErr } = await db
    .from('chart_of_accounts')
    .insert(
      DEFAULT_COA.map((a) => ({
        organization_id: f.orgId,
        association_id: f.associationId,
        account_number: a.number,
        account_name: a.name,
        account_type: a.type,
        fund_id: a.fund ? fundIds[a.fund] : null,
      })),
    )
    .select('id, account_number')
  if (coaErr || !accounts) throw new Error(`makeAccounting: chart_of_accounts insert failed: ${coaErr?.message}`)

  const accountIds: Record<string, string> = {}
  for (const row of accounts) accountIds[row.account_number] = row.id

  const year = new Date().getFullYear()
  const { data: period, error: periodErr } = await db
    .from('fiscal_periods')
    .insert({
      organization_id: f.orgId,
      association_id: f.associationId,
      start_date: `${year}-01-01`,
      end_date: `${year}-12-31`,
      status: 'open',
    })
    .select('id')
    .single()
  if (periodErr || !period) throw new Error(`makeAccounting: fiscal_periods insert failed: ${periodErr?.message}`)

  return { fundIds, accountIds, fiscalPeriodId: period.id }
}

export async function makeUnit(f: OrgFixture): Promise<string> {
  const db = adminDb()
  const suffix = randomUUID().slice(0, 8)
  const { data, error } = await db
    .from('units')
    .insert({
      organization_id: f.orgId,
      association_id: f.associationId,
      address_line1: `${suffix} Test Lane`,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`makeUnit: units insert failed: ${error?.message}`)
  return data.id
}

/**
 * Mints a real, signed-in user. Uses the GoTrue admin API rather than
 * inserting into auth.users directly: GoTrue's schema is versioned
 * (v2.189.0 here) and hand-building encrypted_password / identities
 * yields a user that cannot sign in, for no benefit.
 */
export async function mintUser(
  f: OrgFixture,
  role: 'admin' | 'board' | 'resident',
): Promise<TestUser> {
  const db = adminDb()
  // Reserved TLD — can never route to a real inbox.
  const email = `u-${randomUUID()}@example.test`
  const password = randomBytes(24).toString('base64url') // never logged

  const { data: created, error: createErr } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createErr || !created.user) throw new Error(`mintUser: createUser failed: ${createErr?.message}`)
  const id = created.user.id

  // handle_new_user() (migrations/0001_auth_fixes.sql:43-46) should have
  // created this. Insert defensively: org_members.user_id FKs to
  // profiles(id), and a disabled trigger turns that into a confusing
  // foreign-key error three lines later.
  const { data: profile } = await db.from('profiles').select('id').eq('id', id).maybeSingle()
  if (!profile) {
    const { error } = await db.from('profiles').insert({ id, email })
    if (error) throw new Error(`mintUser: profiles insert failed: ${error.message}`)
  }

  // Post-0012 vocabulary. 0000_schema.sql:221 still shows the legacy
  // CHECK ('owner','admin','member','viewer'); 0012_rbac_roles.sql
  // migrates it to ('admin','board','resident').
  const { error: memberErr } = await db
    .from('org_members')
    .insert({ org_id: f.orgId, user_id: id, role })
  if (memberErr) throw new Error(`mintUser: org_members insert failed: ${memberErr.message}`)

  // A FRESH client per user. Sharing one would leak sessions between
  // fixtures and silently make a later assertion run as the wrong user.
  const client = createClient<Database>(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, noPersist)
  const { data: session, error: signInErr } = await client.auth.signInWithPassword({ email, password })
  if (signInErr || !session.session) throw new Error(`mintUser: signIn failed: ${signInErr?.message}`)

  return { id, email, client }
}
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `pnpm test:integration -t 'fixture factory'`
Expected: PASS, 6 tests.

If `makeOrg` fails on a column that does not exist, read the actual schema rather than guessing:
`psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "\d public.orgs"`

- [ ] **Step 6: Typecheck**

Run: `rtk pnpm -r typecheck`
Expected: no errors. If `database.types.ts` lacks a table used here, note it for Task 7 — do not add an `as never` cast to paper over it.

- [ ] **Step 7: Commit**

```bash
rtk git add tests/integration/fixtures/
rtk git commit -m "test(oracle): fixture factory that mints genuinely signed-in users

Service-role seeds and cleans; user clients assert. The service-role JWT
carries BYPASSRLS, so an isolation assertion made through it passes
whether the policy is right, wrong, or missing — and no table here uses
FORCE ROW LEVEL SECURITY, so a psql superuser bypasses policies too.
Only a real user JWT puts auth.uid() in scope.

Shaped after scripts/test-inbox-rls.ts, which already gets this right.
makeAccounting mirrors seed-accounting.ts's 25-row DEFAULT_COA — eight
of the 22 harnesses block on that fixture."
```

---

### Task 4: Wiring-contract test, and register the two dead cron jobs

**Files:**
- Create: `tests/integration/contracts/inngest-wiring.test.ts`
- Modify: `apps/hoa/src/app/api/inngest/route.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (this test reads source, not the DB)
- Produces: nothing consumed later

- [ ] **Step 1: Write the failing test**

`recurringJeJob` and `plaidSyncJob` are exported from `packages/jobs/src/index.ts:4-5` but absent from the `serve()` array at `apps/hoa/src/app/api/inngest/route.ts:42-57`. Inngest only knows about functions a `serve()` handler advertises, so neither cron exists on the platform: nightly recurring journal entries and 4-hourly Plaid sync have never run.

Create `tests/integration/contracts/inngest-wiring.test.ts`:

```ts
/**
 * The wiring contract.
 *
 * Two failure modes have each shipped to production here:
 *   - a job defined and exported but never registered in serve(), so its
 *     cron silently does not exist (recurringJeJob, plaidSyncJob)
 *   - an inngest.send() event name with no registered listener
 *
 * Both are invisible at runtime: no error, no log, just nothing
 * happening. This test reads the source so it cannot be fooled by a
 * mock, and it is cheap enough to run forever.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = resolve(__dirname, '../../..')

function read(rel: string): string {
  return readFileSync(resolve(REPO_ROOT, rel), 'utf8')
}

/** Jobs re-exported from packages/jobs — the public job surface. */
function exportedJobNames(): string[] {
  const src = read('packages/jobs/src/index.ts')
  return [...src.matchAll(/export\s*\{\s*(\w+Job)\s*\}/g)].map((m) => m[1]).sort()
}

/** Jobs listed in the serve() functions array. */
function registeredJobNames(): string[] {
  const src = read('apps/hoa/src/app/api/inngest/route.ts')
  const block = src.match(/functions:\s*\[([\s\S]*?)\]/)
  if (!block) throw new Error('inngest route: could not find the functions: [...] array')
  return [...block[1].matchAll(/(\w+Job)/g)].map((m) => m[1]).sort()
}

/** Every inngest.send({ name: '...' }) across the repo. */
function sentEventNames(): string[] {
  const out = execFileSync(
    'grep',
    ['-rhoE', "name:\\s*'[a-z]+/[a-z.]+'", '--include=*.ts', '--include=*.tsx', 'apps', 'packages'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  )
  const names = [...out.matchAll(/'([a-z]+\/[a-z.]+)'/g)].map((m) => m[1])
  return [...new Set(names)].sort()
}

/** Every { event: '...' } trigger in packages/jobs. */
function listenedEventNames(): string[] {
  const out = execFileSync(
    'grep',
    ['-rhoE', "event:\\s*'[a-z]+/[a-z.]+'", '--include=*.ts', 'packages/jobs/src'],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  )
  const names = [...out.matchAll(/'([a-z]+\/[a-z.]+)'/g)].map((m) => m[1])
  return [...new Set(names)].sort()
}

describe('inngest wiring contract', () => {
  it('every exported job is registered in serve()', () => {
    const exported = exportedJobNames()
    const registered = registeredJobNames()
    expect(exported.length).toBeGreaterThan(0)
    const unregistered = exported.filter((j) => !registered.includes(j))
    expect(
      unregistered,
      `exported but never registered — their crons do not exist on the platform: ${unregistered.join(', ')}`,
    ).toEqual([])
  })

  it('every sent event has a registered listener', () => {
    const sent = sentEventNames()
    const listened = listenedEventNames()
    expect(sent.length).toBeGreaterThan(0)
    const orphaned = sent.filter((e) => !listened.includes(e))
    expect(orphaned, `sent with no listener: ${orphaned.join(', ')}`).toEqual([])
  })
})
```

- [ ] **Step 2: Run it and watch the first test fail**

Run: `pnpm test:integration -t 'inngest wiring'`
Expected: the first test FAILS naming `plaidSyncJob, recurringJeJob`. The second PASSES (all four event names already resolve).

**Do not proceed until you have seen that exact failure.** It is the proof the test can detect the bug.

- [ ] **Step 3: Register both jobs**

In `apps/hoa/src/app/api/inngest/route.ts`, add both to the imports from `@homeowner-portal/jobs` and to the `functions: [...]` array. Also fix the indentation of the existing `mailboxReconcileJob` and `ticketNotificationsJob` entries, which are misaligned by two spaces, and the stale comment at line 19 that says "All five crons mount in the HOA app for Phase 1" — there are now sixteen functions.

The array becomes:

```ts
  functions: [
    dailyDigestJob,
    hoaLateFeeJob,
    pmLateFeeJob,
    evictionReminderJob,
    wizardDraftRemindersJob,
    stateLawRefreshJob,
    mailboxSyncJob,
    mailboxWatchdogJob,
    mailboxBackfillJob,
    mailboxReconcileJob,
    mailboxAttachmentsJob,
    mailboxReplyEmbeddingsJob,
    mailboxSendJob,
    ticketNotificationsJob,
    recurringJeJob,
    plaidSyncJob,
  ],
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `pnpm test:integration -t 'inngest wiring'`
Expected: PASS, 2 tests.

- [ ] **Step 5: Typecheck and build**

Run: `rtk pnpm -r typecheck && rtk pnpm build`
Expected: both clean. The build matters — this file is a Next route and a bad import breaks the deploy.

- [ ] **Step 6: Commit**

```bash
rtk git add tests/integration/contracts/ apps/hoa/src/app/api/inngest/route.ts
rtk git commit -m "fix(jobs): register recurringJeJob and plaidSyncJob — their crons never existed

Both were exported from packages/jobs/src/index.ts and absent from the
serve() functions array. Inngest only knows about functions a serve()
handler advertises during registration, so nightly recurring journal
entries and 4-hourly Plaid sync have never run in production. No error,
no log — the crons simply did not exist.

Adds a contract test that reads the source and fails when an exported
job is unregistered or a sent event has no listener. It fails on this
bug before the fix, which is the only reason to trust it."
```

---

### Task 5: F2 — close the cross-tenant privilege escalation

**Files:**
- Create: `tests/integration/security/org-membership.test.ts`
- Create: `migrations/0054_org_members_insert_scope.sql`
- Modify: `tests/integration/schema/manifest.ts` (append `0054`)

**Interfaces:**
- Consumes: `makeOrg`, `mintUser` from `tests/integration/fixtures/factory.ts`; `truncateAll` from `tests/integration/fixtures/truncate.ts`
- Produces: nothing consumed later

- [ ] **Step 1: Write the failing test**

`migrations/0001_auth_fixes.sql:57-60` creates:

```sql
CREATE POLICY "auth_can_self_insert_org_members"
ON public.org_members FOR INSERT
WITH CHECK (auth.uid() = user_id);
```

It constrains `user_id` and nothing else — not `org_id`, not `role`. Because nearly every policy reads `organization_id = ANY(public.auth_org_ids())` and `auth_org_ids()` is the caller's `org_members` rows, one INSERT naming a victim org with `role: 'admin'` opens every tenant-scoped table.

Create `tests/integration/security/org-membership.test.ts`:

```ts
/**
 * F2: cross-tenant privilege escalation via org_members.
 *
 * scripts/test-inbox-rls.ts could never have caught this: every
 * assertion in it is a SELECT, and this is an INSERT.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { makeOrg, mintUser } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

describe('org_members INSERT scope', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('a member of one org cannot add themselves to another org', async () => {
    const orgA = await makeOrg()
    const orgB = await makeOrg()
    const boardA = await mintUser(orgA, 'board')

    const { error } = await boardA.client
      .from('org_members')
      .insert({ org_id: orgB.orgId, user_id: boardA.id, role: 'admin' })

    expect(error, 'a user joined a foreign org — RLS did not stop it').not.toBeNull()
  })

  it('and therefore cannot read the other org data', async () => {
    const orgA = await makeOrg()
    const orgB = await makeOrg()
    const boardA = await mintUser(orgA, 'board')

    await boardA.client
      .from('org_members')
      .insert({ org_id: orgB.orgId, user_id: boardA.id, role: 'admin' })

    // Positive proof first: the client can see its OWN org, so a zero
    // count below means the policy denied, not that everything is broken.
    const own = await boardA.client.from('orgs').select('id').eq('id', orgA.orgId)
    expect(own.data).toHaveLength(1)

    const foreign = await boardA.client.from('orgs').select('id').eq('id', orgB.orgId)
    expect(foreign.data ?? []).toHaveLength(0)
  })

  it('a member can still be added to their own org by a service-role caller', async () => {
    // Guards against over-correction: the founder/invite flow uses
    // service-role and must keep working.
    const orgA = await makeOrg()
    const user = await mintUser(orgA, 'resident')
    expect(user.id).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test:integration -t 'org_members INSERT scope'`
Expected: the first two tests FAIL — the insert succeeds and the foreign org becomes readable. **This is the vulnerability reproducing. Do not proceed until you have seen it.**

- [ ] **Step 3: Write the migration**

The policy is vestigial: the comment at `0001_auth_fixes.sql:11-16` says the founder flow uses service-role and these policies are a fallback. Service-role bypasses RLS, so dropping the self-insert policy entirely cannot break that flow.

Create `migrations/0054_org_members_insert_scope.sql`:

```sql
-- 0054_org_members_insert_scope.sql
--
-- Closes a cross-tenant privilege escalation.
--
-- 0001_auth_fixes.sql created:
--
--   CREATE POLICY "auth_can_self_insert_org_members"
--   ON public.org_members FOR INSERT
--   WITH CHECK (auth.uid() = user_id);
--
-- which constrains user_id and nothing else — not org_id, not role.
-- Since almost every policy in this schema reads
-- `organization_id = ANY(public.auth_org_ids())`, and auth_org_ids() is
-- defined as the caller's own org_members rows, any authenticated user
-- who learned another org's UUID could run
--
--   insert into org_members (org_id, user_id, role)
--   values ('<victim-org>', auth.uid(), 'admin');
--
-- and open every tenant-scoped table in the database.
--
-- Dropped rather than tightened. 0001's own header says the founder flow
-- uses the service-role key and these policies are only a fallback;
-- service-role bypasses RLS, so removing this costs nothing real.
-- Membership is granted by service-role paths (founder bootstrap, invite
-- acceptance), never by a client asserting it into existence.
--
-- auth_can_insert_orgs is tightened in the same spirit: creating an org
-- is still allowed for any signed-in user (the founder flow), but it was
-- WITH CHECK (auth.uid() IS NOT NULL), which is what FOR INSERT TO
-- authenticated already means. Left as-is deliberately: narrowing org
-- creation is a product decision, not a security fix, and conflating the
-- two in one migration makes both harder to review.

DROP POLICY IF EXISTS "auth_can_self_insert_org_members" ON public.org_members;
```

- [ ] **Step 4: Append to the manifest**

In `tests/integration/schema/manifest.ts`, add `'0054_org_members_insert_scope.sql',` as the last entry of `MIGRATION_MANIFEST`.

- [ ] **Step 5: Replay and re-run**

Run:
```bash
pnpm db:local:reset
pnpm test:integration -t 'org_members INSERT scope'
```
Expected: `applied 66/66 migrations`, then PASS, 3 tests.

- [ ] **Step 6: Run the whole integration suite**

Run: `pnpm test:integration`
Expected: all pass. Dropping a policy can break an unrelated test that depended on the hole; if something fails, read it rather than reverting.

- [ ] **Step 7: Commit**

```bash
rtk git add tests/integration/security/org-membership.test.ts migrations/0054_org_members_insert_scope.sql tests/integration/schema/manifest.ts
rtk git commit -m "fix(rls): any authenticated user could join any org as admin

0001_auth_fixes.sql's org_members INSERT policy checked auth.uid() =
user_id and nothing else — not org_id, not role. Since nearly every
policy reads organization_id = ANY(auth_org_ids()), and auth_org_ids()
is the caller's own membership rows, one insert naming a victim org with
role 'admin' opened every tenant-scoped table: dues, ledgers, bank
reconciliation, inbox, governing documents.

Dropped rather than tightened — 0001's own header says the founder flow
uses service-role and these policies are a fallback, and service-role
bypasses RLS.

scripts/test-inbox-rls.ts could not have caught this: every assertion in
it is a SELECT and this is an INSERT. Test added, reproduced the
escalation first."
```

---

### Task 6: F3 — scope storage buckets to the owning tenant

**Files:**
- Create: `tests/integration/security/storage-isolation.test.ts`
- Create: `migrations/0055_storage_org_prefix_scope.sql`
- Modify: `tests/integration/schema/manifest.ts` (append `0055`)

**Interfaces:**
- Consumes: `adminDb`, `makeOrg`, `mintUser` from the factory; `truncateAll`
- Produces: nothing consumed later

- [ ] **Step 1: Write the failing test**

`migrations/0003_storage_policies.sql` is the only file touching `storage.objects`. All six policies gate on `bucket_id` alone, never on org prefix, so any authenticated user of any org can read and write any other tenant's objects. Paths follow `{org_id}/{filename}` by convention — obscurity, not access control.

Create `tests/integration/security/storage-isolation.test.ts`:

```ts
/**
 * F3: storage buckets are not tenant-scoped.
 *
 * 0003_storage_policies.sql gates on bucket_id and nothing else. The
 * {org_id}/{filename} convention is the only thing separating tenants,
 * which is obscurity rather than access control.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { makeOrg, mintUser } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

describe('storage tenant isolation', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('a resident of one org cannot read another org objects', async () => {
    const orgA = await makeOrg()
    const orgB = await makeOrg()
    const boardA = await mintUser(orgA, 'board')
    const residentB = await mintUser(orgB, 'resident')

    const pathA = `${orgA.orgId}/governing-doc.txt`
    const up = await boardA.client.storage
      .from('hoa-documents')
      .upload(pathA, new Blob(['board A private content']), { upsert: true })
    // Positive proof: the owning org CAN write. Without this, the
    // negative below could pass because uploads are broken entirely.
    expect(up.error, 'owning org could not upload — fixture is broken').toBeNull()

    const leak = await residentB.client.storage.from('hoa-documents').download(pathA)
    expect(leak.error, 'cross-tenant storage read succeeded').not.toBeNull()
  })

  it('a resident of one org cannot write into another org prefix', async () => {
    const orgA = await makeOrg()
    const orgB = await makeOrg()
    const residentB = await mintUser(orgB, 'resident')

    const planted = await residentB.client.storage
      .from('hoa-documents')
      .upload(`${orgA.orgId}/planted.txt`, new Blob(['not mine']), { upsert: true })

    expect(planted.error, 'cross-tenant storage write succeeded').not.toBeNull()
  })

  it('the owning org can still read its own objects', async () => {
    const orgA = await makeOrg()
    const boardA = await mintUser(orgA, 'board')
    const path = `${orgA.orgId}/own-doc.txt`

    await boardA.client.storage
      .from('hoa-documents')
      .upload(path, new Blob(['mine']), { upsert: true })

    const got = await boardA.client.storage.from('hoa-documents').download(path)
    expect(got.error).toBeNull()
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm test:integration -t 'storage tenant isolation'`
Expected: the first two tests FAIL — the cross-tenant read and write both succeed. **That is the leak reproducing.**

- [ ] **Step 3: Write the migration**

Create `migrations/0055_storage_org_prefix_scope.sql`:

```sql
-- 0055_storage_org_prefix_scope.sql
--
-- Scopes the three storage buckets to the owning tenant.
--
-- 0003_storage_policies.sql is the only file in this repo that touches
-- storage.objects, and all six of its policies look like:
--
--   CREATE POLICY "auth_can_read_hoa_documents"
--   ON storage.objects FOR SELECT TO authenticated
--   USING (bucket_id = 'hoa-documents');
--
-- The sole predicate is which bucket, never which org. Any authenticated
-- user of any HOA could read — and, via the equally unscoped INSERT
-- policies, write — every other HOA's governing documents, violation
-- photos, and eviction filings. Isolation rested on nobody guessing a
-- path. 0003's own comment defers this to a "Phase 2" that never came.
--
-- Every object path in this codebase begins with the org id, so the fix
-- is to require that the first path segment is an org the caller belongs
-- to. storage.foldername(name) returns the path segments as an array;
-- [1] is the first.
--
-- public.auth_org_ids() (migrations/0000_schema.sql:36-43) returns the
-- caller's org ids and is already the predicate used by nearly every
-- table policy, so this makes storage consistent with the rest of the
-- schema rather than inventing a new rule.

-- Drop the unscoped policies.
DROP POLICY IF EXISTS "auth_can_read_hoa_photos"      ON storage.objects;
DROP POLICY IF EXISTS "auth_can_insert_hoa_photos"    ON storage.objects;
DROP POLICY IF EXISTS "auth_can_read_hoa_documents"   ON storage.objects;
DROP POLICY IF EXISTS "auth_can_insert_hoa_documents" ON storage.objects;
DROP POLICY IF EXISTS "auth_can_read_eviction_docs"   ON storage.objects;
DROP POLICY IF EXISTS "auth_can_insert_eviction_docs" ON storage.objects;

-- Recreate them org-scoped. One pair per bucket, matching the original
-- structure so a reader can diff 0003 against this file directly.

CREATE POLICY "org_can_read_hoa_photos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'hoa-photos'
  AND (storage.foldername(name))[1]::uuid = ANY (public.auth_org_ids())
);

CREATE POLICY "org_can_insert_hoa_photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'hoa-photos'
  AND (storage.foldername(name))[1]::uuid = ANY (public.auth_org_ids())
);

CREATE POLICY "org_can_read_hoa_documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'hoa-documents'
  AND (storage.foldername(name))[1]::uuid = ANY (public.auth_org_ids())
);

CREATE POLICY "org_can_insert_hoa_documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'hoa-documents'
  AND (storage.foldername(name))[1]::uuid = ANY (public.auth_org_ids())
);

CREATE POLICY "org_can_read_eviction_docs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'eviction-docs'
  AND (storage.foldername(name))[1]::uuid = ANY (public.auth_org_ids())
);

CREATE POLICY "org_can_insert_eviction_docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'eviction-docs'
  AND (storage.foldername(name))[1]::uuid = ANY (public.auth_org_ids())
);
```

**A caveat the implementer must handle, not ignore:** `(storage.foldername(name))[1]::uuid` raises `invalid input syntax for type uuid` if an object's first path segment is not a UUID, and in Postgres a policy predicate that raises aborts the query rather than denying it. Before committing, check whether any existing path violates the convention:

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "select bucket_id, (storage.foldername(name))[1] as prefix from storage.objects limit 20;"
```

If non-UUID prefixes are possible, replace the cast with a guarded form in all six policies:

```sql
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND (storage.foldername(name))[1]::uuid = ANY (public.auth_org_ids())
```

Postgres does not guarantee `AND` evaluation order, so if the suite shows cast errors, use a `CASE` expression or a `SECURITY INVOKER` helper function instead. Report which form you shipped.

- [ ] **Step 4: Append to the manifest**

In `tests/integration/schema/manifest.ts`, append `'0055_storage_org_prefix_scope.sql',`.

- [ ] **Step 5: Replay and re-run**

Run:
```bash
pnpm db:local:reset
pnpm test:integration -t 'storage tenant isolation'
```
Expected: `applied 67/67 migrations`, then PASS, 3 tests. The third test is the one that catches an over-tight policy.

- [ ] **Step 6: Full suite**

Run: `pnpm test:integration`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
rtk git add tests/integration/security/storage-isolation.test.ts migrations/0055_storage_org_prefix_scope.sql tests/integration/schema/manifest.ts
rtk git commit -m "fix(storage): scope buckets to the owning org

0003_storage_policies.sql gated all six policies on bucket_id alone and
never on org prefix, so any authenticated user of any HOA could read —
and, via the equally unscoped INSERT policies, write — every other HOA's
governing documents, violation photos, and eviction filings. Isolation
rested entirely on nobody guessing a {org_id}/{filename} path.

Now requires the first path segment to be an org the caller belongs to,
using the same public.auth_org_ids() predicate the table policies
already use.

Tests reproduce both the cross-tenant read and the cross-tenant write
before the fix, and a third test proves the owning org can still reach
its own objects."
```

---

### Task 7: The ticket → notification flow, proven against real Postgres

**Files:**
- Modify: `packages/jobs/src/ticket-notifications.ts:110-219`
- Create: `tests/integration/flows/ticket-notifications.test.ts`
- Modify: `apps/hoa/src/lib/notifications.ts:94-97` (stale comment)
- Modify: `apps/hoa/src/lib/push-subscriptions.ts:15` (stale comment)
- Modify: `packages/jobs/src/web-push.ts:84` (stale comment)

**Interfaces:**
- Consumes: `adminDb`, `makeOrg`, `makeUnit`, `mintUser` from the factory; `truncateAll`
- Produces: `runTicketNotifications(db, step, logger, payload)` exported from `packages/jobs/src/ticket-notifications.ts`, with:
  - `TicketNotificationsStep = { run(id: string, fn: () => Promise<unknown>): Promise<unknown> }`
  - `TicketNotificationsLogger = { warn(message: string): void }`
  - `payload: { ticketId: string; organizationId: string }`
  - returns `Promise<{ notified: number; pushed?: number }>`

- [ ] **Step 1: Write the failing test**

This is the flow originally reported as broken. It has never executed in any environment: both production tickets predate the feature by months.

Create `tests/integration/flows/ticket-notifications.test.ts`:

```ts
/**
 * "Resident opens a ticket, the board gets notified."
 *
 * This flow has never run anywhere. It shipped in 9429f01, got a fix in
 * 89925c8 ("the dedupe upsert could never have worked"), and no ticket
 * has been created since. These are its first executions.
 *
 * Asserted against real Postgres because the bug that shipped was an
 * ON CONFLICT / partial-index interaction — something no mock reproduces.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { runTicketNotifications, type TicketNotificationsStep } from '../../../packages/jobs/src/ticket-notifications'
import { adminDb, makeOrg, makeUnit, mintUser } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

/** Steps execute inline, exactly once. The real executor re-runs code
 *  OUTSIDE a step on every step boundary and replays memoized results;
 *  this fake does not model that. Replay semantics stay out of scope
 *  here — see the comment at mailbox-send.ts:294-315. */
function inlineStep(): TicketNotificationsStep {
  return { run: async (_id, fn) => fn() }
}

function collectingLogger(): { warn(m: string): void; warnings: string[] } {
  const warnings: string[] = []
  return { warn: (m: string) => { warnings.push(m) }, warnings }
}

async function seedTicket(orgId: string, unitId: string, submittedBy: string): Promise<string> {
  const { data, error } = await adminDb()
    .from('tickets')
    .insert({
      organization_id: orgId,
      unit_id: unitId,
      submitted_by: submittedBy,
      category: 'maintenance',
      subject: 'Leaking water heater',
      description: 'Water pooling in the garage.',
      status: 'open',
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`seedTicket failed: ${error?.message}`)
  return data.id
}

describe('ticket/created → notifications', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('writes one notification row per board member', async () => {
    const org = await makeOrg()
    const unitId = await makeUnit(org)
    const board1 = await mintUser(org, 'board')
    const board2 = await mintUser(org, 'admin')
    const resident = await mintUser(org, 'resident')
    const ticketId = await seedTicket(org.orgId, unitId, resident.id)

    const logger = collectingLogger()
    const result = await runTicketNotifications(adminDb(), inlineStep(), logger, {
      ticketId,
      organizationId: org.orgId,
    })

    const { data: rows } = await adminDb()
      .from('notifications')
      .select('user_id, kind, entity_id, entity_type, title')
      .eq('entity_id', ticketId)

    // The row is the deliverable. A return value of { notified: 2 } with
    // zero rows written is the exact failure mode that shipped before.
    expect(rows ?? []).toHaveLength(2)
    expect(new Set((rows ?? []).map((r) => r.user_id))).toEqual(new Set([board1.id, board2.id]))
    expect(rows?.[0]?.kind).toBe('ticket.created')
    expect(rows?.[0]?.entity_type).toBe('ticket')
    expect(result.notified).toBe(2)
    expect(logger.warnings, `job logged warnings: ${logger.warnings.join(' | ')}`).toEqual([])
  })

  it('does not notify the resident who opened the ticket', async () => {
    const org = await makeOrg()
    const unitId = await makeUnit(org)
    await mintUser(org, 'board')
    const resident = await mintUser(org, 'resident')
    const ticketId = await seedTicket(org.orgId, unitId, resident.id)

    await runTicketNotifications(adminDb(), inlineStep(), collectingLogger(), {
      ticketId,
      organizationId: org.orgId,
    })

    const { data: rows } = await adminDb()
      .from('notifications').select('user_id').eq('entity_id', ticketId)
    expect((rows ?? []).map((r) => r.user_id)).not.toContain(resident.id)
  })

  // The regression that shipped as 89925c8. A retry must not duplicate.
  it('is idempotent across retries', async () => {
    const org = await makeOrg()
    const unitId = await makeUnit(org)
    await mintUser(org, 'board')
    const resident = await mintUser(org, 'resident')
    const ticketId = await seedTicket(org.orgId, unitId, resident.id)

    const logger = collectingLogger()
    const payload = { ticketId, organizationId: org.orgId }
    await runTicketNotifications(adminDb(), inlineStep(), logger, payload)
    await runTicketNotifications(adminDb(), inlineStep(), logger, payload)

    const { data: rows } = await adminDb()
      .from('notifications').select('user_id').eq('entity_id', ticketId)
    expect(rows ?? [], 'a retry duplicated the notification rows').toHaveLength(1)
    expect(logger.warnings).toEqual([])
  })

  it('returns notified: 0 and writes nothing when the ticket is missing', async () => {
    const org = await makeOrg()
    await mintUser(org, 'board')

    const result = await runTicketNotifications(adminDb(), inlineStep(), collectingLogger(), {
      ticketId: '00000000-0000-0000-0000-000000000000',
      organizationId: org.orgId,
    })

    expect(result.notified).toBe(0)
    const { data: rows } = await adminDb().from('notifications').select('user_id')
    expect(rows ?? []).toHaveLength(0)
  })

  it('writes nothing when the org has no board members', async () => {
    const org = await makeOrg()
    const unitId = await makeUnit(org)
    const resident = await mintUser(org, 'resident')
    const ticketId = await seedTicket(org.orgId, unitId, resident.id)

    const result = await runTicketNotifications(adminDb(), inlineStep(), collectingLogger(), {
      ticketId,
      organizationId: org.orgId,
    })

    expect(result.notified).toBe(0)
    const { data: rows } = await adminDb().from('notifications').select('user_id')
    expect(rows ?? []).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run it and verify it fails**

Run: `pnpm test:integration -t 'ticket/created'`
Expected: FAIL — `runTicketNotifications` is not exported.

- [ ] **Step 3: Extract the job body**

Refactor `packages/jobs/src/ticket-notifications.ts:110-219` to the thin-shell pattern this repo already uses (`runMailboxSend` at `mailbox-send.ts:577-587`, `runMailboxReplyEmbeddings` at `mailbox-reply-embeddings.ts:239-246`). The Inngest wrapper unwraps the event and calls an exported function; everything testable lives in that function.

`inngest@3.54.2` ships no test helper, `@inngest/test` is not installed, and `InngestFunction#createExecution` is `protected` — extraction is the right seam, not a workaround.

Replace the `inngest.createFunction(...)` block with:

```ts
/**
 * The step surface this job needs. Deliberately NON-generic: Inngest's
 * real `step.run` returns Jsonify<Awaited<T>>, which is not assignable
 * back to an arbitrary T, so a generic signature fails structural typing
 * against the real step object. See the same finding at
 * mailbox-send.ts:27-32, where it was tried and abandoned.
 */
export interface TicketNotificationsStep {
  run(id: string, fn: () => Promise<unknown>): Promise<unknown>
}

export interface TicketNotificationsLogger {
  warn(message: string): void
}

export interface TicketNotificationsPayload {
  ticketId: string
  organizationId: string
}

/**
 * Notify the board that a resident opened a ticket.
 *
 * Exported so it can be driven against a real database. The Inngest
 * wrapper below is a thin shell: it unwraps the event and supplies the
 * admin client, and holds no logic worth testing.
 */
export async function runTicketNotifications(
  db: ReturnType<typeof createAdminClient>,
  step: TicketNotificationsStep,
  logger: TicketNotificationsLogger,
  payload: TicketNotificationsPayload,
): Promise<{ notified: number; pushed?: number }> {
  const { ticketId, organizationId } = payload

  const ticket = (await step.run('load-ticket', async () => {
    const { data } = await db
      .from('tickets')
      .select('id, subject, category, unit_id, submitted_by, organization_id')
      .eq('id', ticketId)
      .maybeSingle()
    return data
  })) as {
    id: string
    subject: string
    category: string | null
    unit_id: string | null
    submitted_by: string | null
    organization_id: string
  } | null

  if (!ticket) {
    logger.warn(`ticket-notifications: ticket ${ticketId} not found`)
    return { notified: 0 }
  }

  const recipients = (await step.run('resolve-recipients', async () => {
    const { data } = await db
      .from('org_members')
      .select('user_id, role')
      .eq('org_id', organizationId)
    return boardRecipients((data ?? []) as OrgMemberRow[], ticket.submitted_by)
  })) as string[]
  if (recipients.length === 0) return { notified: 0 }

  const unitLabel = (await step.run('resolve-unit', async () => {
    if (!ticket.unit_id) return null
    const { data } = await db
      .from('units')
      .select('label, address_line1')
      .eq('id', ticket.unit_id)
      .maybeSingle()
    const row = data as { label: string | null; address_line1: string | null } | null
    return row?.label ?? row?.address_line1 ?? null
  })) as string | null

  const content = buildTicketNotification({
    id: ticket.id,
    subject: ticket.subject,
    category: ticket.category,
    unitLabel,
  })

  // The durable record, written before any push is attempted, so a
  // provider outage costs the OS banner and nothing else.
  await step.run('write-notifications', async () => {
    // Dedupe by reading first rather than ON CONFLICT. The unique index
    // guarding this is PARTIAL (`WHERE entity_id IS NOT NULL`), and
    // Postgres infers a partial index for ON CONFLICT only if the
    // statement repeats that predicate — which PostgREST cannot emit. An
    // upsert here fails outright with "no unique or exclusion constraint
    // matching the ON CONFLICT specification".
    const { data: existing } = await db
      .from('notifications')
      .select('user_id')
      .eq('kind', 'ticket.created')
      .eq('entity_id', ticket.id)
    const already = new Set(((existing ?? []) as { user_id: string }[]).map((r) => r.user_id))
    const fresh = recipients.filter((userId) => !already.has(userId))
    if (fresh.length === 0) return

    const { error } = await db.from('notifications').insert(
      fresh.map((userId) => ({
        organization_id: organizationId,
        user_id: userId,
        kind: 'ticket.created',
        title: content.title,
        body: content.body,
        link: content.link,
        entity_type: 'ticket',
        entity_id: ticket.id,
      })),
    )
    // 23505 means a concurrent retry inserted the same rows between the
    // read and the write — the desired end state either way.
    if (error && error.code !== '23505') {
      logger.warn(`ticket-notifications: notifications insert: ${error.message}`)
    }
  })

  const pushed = (await step.run('send-push', async () => {
    const { sendPushToUsers } = await import('./web-push')
    return sendPushToUsers(db, organizationId, recipients, content, logger)
  })) as number

  return { notified: recipients.length, pushed }
}

/**
 * Fan-out. Fire-and-forget from the caller's perspective: the event is
 * sent by createResidentTicket and nothing downstream can fail the insert.
 */
export const ticketNotificationsJob = inngest.createFunction(
  { id: 'ticket-notifications', name: 'Notify the board of a new ticket' },
  { event: 'ticket/created' },
  async ({ event, logger, step }) => {
    const { ticketId, organizationId } = event.data as TicketNotificationsPayload
    return runTicketNotifications(createAdminClient(), step, logger, {
      ticketId,
      organizationId,
    })
  },
)
```

Note the `as never` casts on `tickets`, `units`, and `notifications` are dropped here. Migration 0053 **is** applied in production and both tables exist, so once types are regenerated these resolve properly. If `rtk pnpm -r typecheck` fails on `notifications`, regenerate types first:

```bash
supabase gen types typescript --local > packages/db/src/database.types.ts
```

Generating against `--local` is deliberate: local schema is the manifest, so generation cannot silently revert an unapplied migration the way a prod-targeted regen can (CLAUDE.md §3).

- [ ] **Step 4: Run the tests and verify they pass**

Run: `pnpm test:integration -t 'ticket/created'`
Expected: PASS, 5 tests.

The idempotency test is the one to watch — it is the regression from `89925c8`.

- [ ] **Step 5: Fix the three stale comments**

All three claim migration 0053 is unapplied. It is applied: `notifications` and `push_subscriptions` both exist in production, verified against a `PGRST205` control. Update:

- `apps/hoa/src/lib/notifications.ts:94-97`
- `apps/hoa/src/lib/push-subscriptions.ts:15`
- `packages/jobs/src/web-push.ts:84`

Replace each claim that the migration has not been applied with a note that 0053 is applied and the cast (if any remains) is pending a types regeneration. Do not leave a comment asserting something false.

- [ ] **Step 6: Verify nothing else broke**

Run:
```bash
rtk pnpm -r typecheck
pnpm test:unit
pnpm test:integration
rtk pnpm build
```
Expected: all clean. `pnpm test:unit` must still show 1674 passing — the three pure helpers in `ticket-notifications.test.ts` are untouched by this refactor.

- [ ] **Step 7: Commit**

```bash
rtk git add packages/jobs/src/ticket-notifications.ts tests/integration/flows/ apps/hoa/src/lib/notifications.ts apps/hoa/src/lib/push-subscriptions.ts packages/jobs/src/web-push.ts packages/db/src/database.types.ts
rtk git commit -m "test(notifications): prove ticket/created writes notification rows

This flow had never executed anywhere. It shipped in 9429f01, got a fix
in 89925c8 for a dedupe upsert that could never have worked, and no
ticket has been created since — both production tickets predate the
feature by months. The 18 existing tests cover three pure helpers and
none of the five step bodies, including the one that writes the row.

Extracts runTicketNotifications on the runMailboxSend pattern already
used here, then asserts the rows against real Postgres: one per board
member, never the submitter, idempotent across retries. The ON CONFLICT
/ partial-index interaction that broke before is not reproducible with a
mock.

Also drops the as never casts on tickets/units/notifications and fixes
three comments claiming 0053 is unapplied — it is applied; both tables
exist in production."
```

---

### Task 8: Make CI run the tests

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `pnpm test:unit`, `pnpm test:integration`, `pnpm db:local:reset` from earlier tasks
- Produces: nothing consumed later

- [ ] **Step 1: Add a test job**

`ci.yml` currently runs `typecheck` and `build` and nothing else, so 1674 unit tests and everything built above gate nothing. Add a job that runs both suites. The Supabase CLI brings its own Postgres container, so no `services:` block is needed.

Add to `.github/workflows/ci.yml` after the existing `verify` job:

```yaml
  test:
    name: Test (unit + integration)
    runs-on: ubuntu-latest
    timeout-minutes: 25

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10.33.0

      - name: Setup Node 22
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Unit tests
        run: pnpm test:unit

      - name: Install Supabase CLI
        uses: supabase/setup-cli@v1
        with:
          version: 2.95.4

      # Starts Postgres 17 + GoTrue + PostgREST + Storage in Docker.
      # The integration suite refuses to run against anything but
      # loopback, so a misconfigured runner fails loudly rather than
      # writing to production.
      - name: Start Supabase
        run: supabase start

      - name: Replay schema from the manifest
        run: pnpm db:local:reset

      - name: Integration tests
        run: pnpm test:integration
```

- [ ] **Step 2: Verify the workflow parses**

Run: `rtk gh workflow view ci.yml 2>/dev/null || python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('yaml ok')"`
Expected: `yaml ok` (or the workflow view rendering without error).

- [ ] **Step 3: Commit**

```bash
rtk git add .github/workflows/ci.yml
rtk git commit -m "ci: actually run the tests

CI ran typecheck and build and nothing else, so 1674 unit tests gated
nothing — a PR could go green with every test failing. Adds a job
running the unit suite and the integration suite against a Supabase
stack started in the runner.

The integration suite's loopback interlock means a misconfigured runner
fails loudly instead of writing to production."
```

- [ ] **Step 4: Push and confirm CI goes green**

```bash
rtk git push
rtk gh pr checks
```
Expected: both `verify` and `test` jobs pass. If `test` fails in CI but passed locally, read the log — do not disable the job.

---

## What this plan deliberately does not cover

Each needs its own plan, and none blocks the above:

- **Porting the 22 `scripts/test-*.ts` harnesses.** 6 port with only a connection-string change; 13 need the fixture factory this plan builds; 3 are hard (`test-bank-rec` leaks `ai_runs` and deletes every `W18` journal entry in the association, `test-reply-embeddings` asserts on global table emptiness, `test-reply-backfill` passes vacuously on an empty DB). Also pending: `test-comms.ts:71-74` and `test-documents.ts:55-63` exit 0 reporting **pass** when a table is missing, and `test-property-resolve.ts:103` prints a resident's email address into its output.
- **Full `as never` cast removal.** 39 tables, ~280 call sites. Two are provably removable (done in Task 7); the other 37 need a per-call-site column-level check, since `.from()` returning `never` untypes the whole chain.
- **The browser layer.** `playwright.config.ts` does not exist. 6–10 journeys, after layers 1–4 are trusted.
- **`property_bridge_gaps`** (`migrations/0028_property_bridge_backfill.sql:118-137`) appears to lack `WITH (security_invoker = on)`, unlike every other view in the repo, which would make it bypass RLS. **Unverified** — needs a live catalog query against production, which needs a Postgres connection string that is currently unavailable (`POSTGRES_PASSWORD` is empty). Do not report it as a finding until checked.
- **Intra-tenant over-exposure.** `notifications`, `push_subscriptions`, and `hoa_dues` are gated on organization alone with no `user_id = auth.uid()`, so any resident can read every other resident's notifications, push endpoints, and dues balances within their own HOA. `wizard_drafts` is the model for the fix. Lower severity than F2/F3 — not a tenancy break — but real.
- **Production observability.** No error tracking exists anywhere in the repo. This is a prerequisite for sub-project B, not for A: a self-healing loop can only repair what it can detect.

## Deployment note

Tasks 5 and 6 add migrations `0054` and `0055`. The local stack applies them via `pnpm db:local:reset`, and CI replays them from the manifest — but **applying them to production requires database access this session does not have.** `POSTGRES_PASSWORD` and every connection URL in `apps/hoa/.env.local` are empty (Vercel writes Sensitive vars as empty placeholders). Code deploys fine without them; the two RLS fixes are not live in production until the SQL is applied there. Flag this explicitly when reporting completion rather than implying the holes are closed everywhere.
