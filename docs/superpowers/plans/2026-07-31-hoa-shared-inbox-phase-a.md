# HOA Shared Inbox — Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every email in the HOA's Gmail mailbox lands in HomeownerHub, deduped, attached to the right property when the system is confident, and readable in a three-pane inbox with dues/ARC/violation context beside it.

**Architecture:** A pure `packages/mailbox` transport (Gmail REST via `fetch`, no Supabase, no Next) is driven by an Inngest cron every 2 minutes. Ingested messages pass through a deterministic six-signal matcher that resolves to a `unit_id` via a new `lib/properties/resolve.ts` layer, which is the only module allowed to know that `units` and `hoa_properties` are two tables. No AI anywhere in Phase A.

**Tech Stack:** TypeScript, Next.js App Router (`apps/hoa`), Supabase Postgres + RLS, Inngest, pnpm workspaces + Turbo, vitest (new), Playwright.

**Source spec:** `docs/superpowers/specs/2026-07-31-hoa-shared-inbox-design.md`

## Global Constraints

- **No AI in Phase A.** No LLM call, no embedding call, no `packages/ai` import in any file this plan creates.
- **RLS on every new table**, using the existing helper `public.auth_org_ids()`. Board/admin-only tables additionally use `public.auth_is_board_or_admin(organization_id)`.
- **`mailbox_account_secrets` denies all RLS** — service-role only. Never selected from a user-bound client.
- **Migrations are idempotent and safe to re-run.** `CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS` before `CREATE POLICY`, guarded `DO $$` blocks for types and constraints. Follow `migrations/0018_communications.sql` as the reference style.
- **Migration numbering:** `0028_property_bridge_backfill.sql`, `0029_inbox.sql`. Do not renumber existing files.
- **No `googleapis` npm package.** Gmail is called over REST with `fetch`, matching the precedent set in `apps/hoa/src/lib/community-qa/agent.ts` ("Why no openai SDK…").
- **Embedding dimension is 768**, per `migrations/0005b_embedding_dim_swap.sql`. Not used in Phase A but do not "fix" it upward.
- **Commit after every task.** Conventional commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`).
- **All commands run from repo root** (`/Users/asafhamo/HomeownerHub`) with `pnpm exec`, per the note in `scripts/eval-w1.ts` about workspace module resolution.
- **Prefix shell commands with `rtk`** per `CLAUDE.md`, including inside `&&` chains.

## Deviations from the spec (deliberate)

1. **Spec §11 says "vitest scoped to `packages/mailbox` only," but its own test table lists vitest tests for the matcher (`apps/hoa/src/lib/inbox`).** Resolved here with a single root-level vitest config whose `projects` cover pure modules in any workspace package. One dev dependency, one command.
2. **Spec §5.2 implies a MIME parser.** Gmail's `messages.get?format=full` returns an already-decoded MIME *tree* (`payload.parts[]` with `mimeType` and base64url `body.data`), so `parse.ts` walks that tree instead. Materially less risk and less code than the spec assumed.

3. **`packages/jobs` imports `apps/hoa/src/lib/inbox/{ingest,match}` by relative path.** Known layering debt, accepted deliberately. It resolves correctly (both under the repo root, bundled by Next for the `/api/inngest` route) and keeps this plan aligned with the spec's file structure. The clean fix is extracting `ingest.ts`, `match.ts`, and `properties/resolve.ts` into a `packages/inbox` workspace package — worth doing, but as its own refactor once Phase A is proven, not while the modules are still being written. Recorded in `docs/parking-lot.md` in Task 24.

4. **Spec §10's "two managers on a thread" passive indicator is deferred.** It needs presence tracking that nothing else in Phase A requires, and for a board of five the collision risk is negligible. Phase B revisits it, since a concurrent-draft collision matters more than a concurrent-read one.

---

## File Structure

**New package — `packages/mailbox`** (pure; no Supabase, no Next, no HOA concepts)

| File | Responsibility |
|---|---|
| `package.json`, `tsconfig.json` | Workspace wiring |
| `src/types.ts` | `GmailMessage`, `ParsedMessage`, `ParsedAttachment`, `MailboxAccount`, `SyncResult` |
| `src/crypto.ts` | AES-256-GCM encrypt/decrypt with `key_version` |
| `src/oauth.ts` | Consent URL, code exchange, refresh |
| `src/client.ts` | Gmail REST calls |
| `src/parse.ts` | Gmail payload tree → `ParsedMessage` |
| `src/quote.ts` | Quoted-reply stripping |
| `src/scope.ts` | `scope_mode` filter, applied pre-persist |
| `src/sync.ts` | `syncMailbox()` — incremental walk + 404 fallback |
| `src/index.ts` | Public exports |

**New — `apps/hoa/src/lib/properties/`**

| File | Responsibility |
|---|---|
| `index.ts` | Existing `lib/properties.ts` content, moved verbatim |
| `normalize-address.ts` | `normalizeAddress()` — mirrors the SQL function exactly |
| `resolve.ts` | `PropertyRef`, `getPropertyRef`, `resolvePropertyByEmail` |

**New — `apps/hoa/src/lib/inbox/`**

| File | Responsibility |
|---|---|
| `ingest.ts` | Persist + dedupe parsed messages |
| `match.ts` | Six-signal deterministic matcher |
| `queries.ts` | Read paths for the inbox UI |
| `actions.ts` | Server actions: assign, archive, link, connect, disconnect |

**New — `packages/jobs/src/`**: `mailbox-sync.ts`, `mailbox-backfill.ts`, `mailbox-attachments.ts`

**New — routes:** `apps/hoa/src/app/(dashboard)/inbox/`, `settings/mailbox/`, `onboarding/setup/`, `api/oauth/google/callback/`

**New — migrations:** `0028_property_bridge_backfill.sql`, `0029_inbox.sql`

**New — scripts:** `test-mailbox-sync.ts`, `test-inbox-rls.ts`, `test-inbox-match.ts`

---

## Task 1: Vitest harness + `normalizeAddress`

Address normalization is the foundation of the bridge backfill (Task 2) and matcher signal 5 (Task 14). It must behave identically in TS and SQL, so it gets built first with tests that pin the exact contract.

**Files:**
- Create: `vitest.config.ts`
- Create: `apps/hoa/src/lib/properties/normalize-address.ts`
- Create: `apps/hoa/src/lib/properties/normalize-address.test.ts`
- Modify: `package.json` (root — add `vitest` devDependency and `test:unit` script)

**Interfaces:**
- Consumes: nothing
- Produces: `normalizeAddress(raw: string | null | undefined): string`

- [ ] **Step 1: Install vitest at the workspace root**

```bash
rtk pnpm add -Dw vitest@^2.1.0
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

// Root-level unit-test harness. Scope is deliberately narrow: PURE
// modules only — no Supabase, no Next server components, no network.
// Anything that needs real Postgres belongs in scripts/test-*.ts
// following the scripts/test-comms.ts pattern instead.
export default defineConfig({
  test: {
    include: [
      'packages/mailbox/src/**/*.test.ts',
      'apps/hoa/src/lib/properties/**/*.test.ts',
      'apps/hoa/src/lib/inbox/**/*.test.ts',
    ],
    environment: 'node',
    passWithNoTests: false,
  },
})
```

- [ ] **Step 3: Add the test script to root `package.json`**

In the `"scripts"` block, after `"dev": "turbo run dev",` add:

```json
    "test:unit": "vitest run",
    "test:unit:watch": "vitest",
```

- [ ] **Step 4: Write the failing test**

Create `apps/hoa/src/lib/properties/normalize-address.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { normalizeAddress } from './normalize-address'

describe('normalizeAddress', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeAddress('  214   Oak   Lane  ')).toBe('214 oak ln')
  })

  it('strips punctuation', () => {
    expect(normalizeAddress('214 Oak Ln.')).toBe('214 oak ln')
    expect(normalizeAddress('214 Oak Ln,')).toBe('214 oak ln')
  })

  it('treats street-type abbreviations as equivalent', () => {
    const expected = '214 oak ln'
    expect(normalizeAddress('214 Oak Lane')).toBe(expected)
    expect(normalizeAddress('214 Oak Ln')).toBe(expected)
    expect(normalizeAddress('214 OAK LN.')).toBe(expected)
  })

  it('normalizes every supported street type', () => {
    expect(normalizeAddress('1 A Street')).toBe('1 a st')
    expect(normalizeAddress('1 A Court')).toBe('1 a ct')
    expect(normalizeAddress('1 A Drive')).toBe('1 a dr')
    expect(normalizeAddress('1 A Road')).toBe('1 a rd')
    expect(normalizeAddress('1 A Avenue')).toBe('1 a ave')
    expect(normalizeAddress('1 A Boulevard')).toBe('1 a blvd')
    expect(normalizeAddress('1 A Circle')).toBe('1 a cir')
    expect(normalizeAddress('1 A Place')).toBe('1 a pl')
    expect(normalizeAddress('1 A Terrace')).toBe('1 a ter')
    expect(normalizeAddress('1 A Trail')).toBe('1 a trl')
    expect(normalizeAddress('1 A Way')).toBe('1 a way')
  })

  it('only rewrites a street type in the final position', () => {
    // "Court" here is part of the street NAME, not a suffix.
    expect(normalizeAddress('12 Court Street')).toBe('12 court st')
  })

  it('preserves unit designators', () => {
    expect(normalizeAddress('214 Oak Ln #3')).toBe('214 oak ln 3')
    expect(normalizeAddress('214 Oak Ln Apt 3')).toBe('214 oak ln apt 3')
  })

  it('returns empty string for nullish or blank input', () => {
    expect(normalizeAddress(null)).toBe('')
    expect(normalizeAddress(undefined)).toBe('')
    expect(normalizeAddress('   ')).toBe('')
  })
})
```

- [ ] **Step 5: Run the test to verify it fails**

```bash
rtk pnpm test:unit
```
Expected: FAIL — `Failed to resolve import "./normalize-address"`.

- [ ] **Step 6: Implement `normalizeAddress`**

Create `apps/hoa/src/lib/properties/normalize-address.ts`:

```ts
/**
 * Canonical address normalization.
 *
 * This function has a TWIN in SQL: public.normalize_address(text), created
 * in migrations/0028_property_bridge_backfill.sql. The two MUST agree —
 * the bridge backfill matches units→hoa_properties in SQL, while the
 * runtime matcher (lib/inbox/match.ts signal 5) matches in TypeScript.
 * If they drift, addresses that bridged at migration time stop matching
 * at runtime, which surfaces as emails mysteriously landing in triage.
 *
 * Any change here requires the same change in 0028 and a new migration.
 *
 * Rules, in order:
 *   1. lowercase
 *   2. strip everything that isn't alphanumeric or whitespace
 *   3. collapse whitespace
 *   4. rewrite a trailing street type to its short form
 */

// Long form → short form. Short forms map to themselves so that an
// already-short input is idempotent.
const STREET_TYPES: Record<string, string> = {
  street: 'st',
  st: 'st',
  lane: 'ln',
  ln: 'ln',
  court: 'ct',
  ct: 'ct',
  drive: 'dr',
  dr: 'dr',
  road: 'rd',
  rd: 'rd',
  avenue: 'ave',
  ave: 'ave',
  av: 'ave',
  boulevard: 'blvd',
  blvd: 'blvd',
  circle: 'cir',
  cir: 'cir',
  place: 'pl',
  pl: 'pl',
  terrace: 'ter',
  ter: 'ter',
  trail: 'trl',
  trl: 'trl',
  way: 'way',
}

export function normalizeAddress(raw: string | null | undefined): string {
  if (!raw) return ''

  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (cleaned === '') return ''

  const parts = cleaned.split(' ')

  // Only the FINAL token is treated as a street type. "12 Court Street"
  // must normalize to "12 court st", not "12 ct st" — the first "Court"
  // is part of the street name.
  const last = parts[parts.length - 1]
  const short = STREET_TYPES[last]
  if (short) parts[parts.length - 1] = short

  return parts.join(' ')
}
```

- [ ] **Step 7: Run the test to verify it passes**

```bash
rtk pnpm test:unit
```
Expected: PASS — 7 tests.

- [ ] **Step 8: Commit**

```bash
rtk git add vitest.config.ts package.json pnpm-lock.yaml apps/hoa/src/lib/properties/ && rtk git commit -m "feat(properties): add normalizeAddress + vitest unit harness"
```

---

## Task 2: SQL `normalize_address` + all-orgs bridge backfill

`migrations/backfill-units-legacy-property-bridge.sql` is hardcoded to org `a4906f16-…` and matches addresses by exact string equality. Any new tenant gets `legacy_hoa_property_id = NULL`, which silently breaks resident-email lookup for the matcher. This replaces it.

**Files:**
- Create: `migrations/0028_property_bridge_backfill.sql`

**Interfaces:**
- Consumes: `normalizeAddress` semantics from Task 1 (must match exactly)
- Produces: SQL function `public.normalize_address(text) → text`; view `public.property_bridge_gaps`

- [ ] **Step 1: Write the migration**

Create `migrations/0028_property_bridge_backfill.sql`:

```sql
-- 0028_property_bridge_backfill.sql
--
-- Replaces migrations/backfill-units-legacy-property-bridge.sql, which was
-- hardcoded to a single org id and matched addresses with exact string
-- equality. Any tenant onboarded after Madison Park got
-- units.legacy_hoa_property_id = NULL, and any "St" vs "St." difference
-- never bridged at all.
--
-- The bridge matters because the two property tables carry different
-- things the shared inbox needs at the same time:
--   hoa_properties → property_residents.email  (who is writing to us)
--   units          → tickets/arc/communications (what we link mail to)
--
-- public.normalize_address() is the SQL TWIN of normalizeAddress() in
-- apps/hoa/src/lib/properties/normalize-address.ts. The two MUST agree.
-- Changing one without the other makes rows that bridged at migration
-- time stop matching at runtime.
--
-- Idempotent. Safe to re-run.

-- ─── normalize_address ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.normalize_address(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  cleaned  text;
  parts    text[];
  last_tok text;
  short    text;
BEGIN
  IF raw IS NULL THEN RETURN ''; END IF;

  -- 1. lowercase  2. non-alphanumeric → space  3. collapse  4. trim
  cleaned := btrim(regexp_replace(
               regexp_replace(lower(raw), '[^a-z0-9[:space:]]', ' ', 'g'),
               '\s+', ' ', 'g'));

  IF cleaned = '' THEN RETURN ''; END IF;

  parts    := string_to_array(cleaned, ' ');
  last_tok := parts[array_length(parts, 1)];

  short := CASE last_tok
    WHEN 'street' THEN 'st'    WHEN 'st'   THEN 'st'
    WHEN 'lane'   THEN 'ln'    WHEN 'ln'   THEN 'ln'
    WHEN 'court'  THEN 'ct'    WHEN 'ct'   THEN 'ct'
    WHEN 'drive'  THEN 'dr'    WHEN 'dr'   THEN 'dr'
    WHEN 'road'   THEN 'rd'    WHEN 'rd'   THEN 'rd'
    WHEN 'avenue' THEN 'ave'   WHEN 'ave'  THEN 'ave'  WHEN 'av' THEN 'ave'
    WHEN 'boulevard' THEN 'blvd' WHEN 'blvd' THEN 'blvd'
    WHEN 'circle' THEN 'cir'   WHEN 'cir'  THEN 'cir'
    WHEN 'place'  THEN 'pl'    WHEN 'pl'   THEN 'pl'
    WHEN 'terrace' THEN 'ter'  WHEN 'ter'  THEN 'ter'
    WHEN 'trail'  THEN 'trl'   WHEN 'trl'  THEN 'trl'
    WHEN 'way'    THEN 'way'
    ELSE NULL
  END;

  IF short IS NOT NULL THEN
    parts[array_length(parts, 1)] := short;
  END IF;

  RETURN array_to_string(parts, ' ');
END;
$$;

-- ─── functional indexes ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS units_norm_address_idx
  ON public.units (organization_id, public.normalize_address(address_line1));

CREATE INDEX IF NOT EXISTS hoa_properties_norm_address_idx
  ON public.hoa_properties (org_id, public.normalize_address(address));

-- ─── backfill: ALL orgs, normalized matching ─────────────────────────
-- Only bridges where normalization yields exactly ONE candidate on the
-- other side. Ambiguous matches (two hoa_properties normalizing to the
-- same address within one org) are left NULL and reported by the
-- property_bridge_gaps view below — guessing would silently misfile mail.
UPDATE public.units u
   SET legacy_hoa_property_id = hp.id
  FROM public.hoa_properties hp
 WHERE u.organization_id = hp.org_id
   AND hp.deleted_at IS NULL
   AND public.normalize_address(u.address_line1) = public.normalize_address(hp.address)
   AND public.normalize_address(u.address_line1) <> ''
   AND u.legacy_hoa_property_id IS DISTINCT FROM hp.id
   AND (
     SELECT count(*) FROM public.hoa_properties hp2
      WHERE hp2.org_id = u.organization_id
        AND hp2.deleted_at IS NULL
        AND public.normalize_address(hp2.address)
            = public.normalize_address(u.address_line1)
   ) = 1;

-- ─── gap reporting, both directions ──────────────────────────────────
CREATE OR REPLACE VIEW public.property_bridge_gaps AS
  SELECT
    u.organization_id,
    'unit_unbridged'::text AS gap_kind,
    u.id                   AS record_id,
    u.address_line1        AS address
  FROM public.units u
  WHERE u.legacy_hoa_property_id IS NULL
UNION ALL
  SELECT
    hp.org_id,
    'property_unbridged'::text,
    hp.id,
    hp.address
  FROM public.hoa_properties hp
  WHERE hp.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.units u2
       WHERE u2.legacy_hoa_property_id = hp.id
    );

-- Verification (run manually after applying):
--   SELECT organization_id, gap_kind, count(*)
--     FROM public.property_bridge_gaps
--    GROUP BY 1, 2 ORDER BY 1, 2;
--   -- Madison Park (a4906f16-baf3-4232-a2bd-a78ea432ad86) expects 0 rows.
```

- [ ] **Step 2: Apply the migration**

Paste the file into the Supabase SQL editor and run it, or use the CLI per `docs/APPLY_v1.1_MIGRATIONS.md`.

- [ ] **Step 3: Verify SQL and TS agree**

Run in the SQL editor:

```sql
SELECT public.normalize_address('  214   Oak   Lane  ') AS a,   -- 214 oak ln
       public.normalize_address('214 Oak Ln.')          AS b,   -- 214 oak ln
       public.normalize_address('12 Court Street')      AS c,   -- 12 court st
       public.normalize_address('1 A Boulevard')        AS d,   -- 1 a blvd
       public.normalize_address(NULL)                   AS e;   -- (empty)
```
Expected: `214 oak ln`, `214 oak ln`, `12 court st`, `1 a blvd`, `''` — identical to the Task 1 test expectations.

- [ ] **Step 4: Verify the backfill closed the gaps**

```sql
SELECT organization_id, gap_kind, count(*)
  FROM public.property_bridge_gaps
 GROUP BY 1, 2 ORDER BY 1, 2;
```
Expected: zero rows for `a4906f16-baf3-4232-a2bd-a78ea432ad86`. Any other org with rows is a real data gap — record the counts in the commit message rather than forcing them to zero.

- [ ] **Step 5: Delete the superseded one-org script**

```bash
rtk git rm migrations/backfill-units-legacy-property-bridge.sql
```

- [ ] **Step 6: Commit**

```bash
rtk git add migrations/0028_property_bridge_backfill.sql && rtk git commit -m "feat(db): all-orgs property bridge backfill with normalized address matching"
```

---

## Task 3: `lib/properties/resolve.ts`

The single module that knows `units` and `hoa_properties` are two tables. Everything in the inbox goes through it.

**Files:**
- Create: `apps/hoa/src/lib/properties/index.ts` (moved from `apps/hoa/src/lib/properties.ts`)
- Delete: `apps/hoa/src/lib/properties.ts`
- Create: `apps/hoa/src/lib/properties/resolve.ts`
- Create: `scripts/test-property-resolve.ts`

**Interfaces:**
- Consumes: `normalizeAddress` (Task 1); `public.normalize_address` (Task 2)
- Produces:
  ```ts
  interface PropertyRef {
    unitId: string
    legacyPropertyId: string | null
    associationId: string | null
    address: string
    unitNumber: string | null
  }
  interface PropertyMatch {
    ref: PropertyRef
    residentId: string | null
    residentName: string | null
    source: 'property_resident' | 'owner_email' | 'profile'
  }
  getPropertyRef(db, orgId, unitId): Promise<PropertyRef | null>
  resolvePropertyByEmail(db, orgId, email): Promise<PropertyMatch[]>
  resolvePropertyByAddress(db, orgId, rawAddress): Promise<PropertyRef[]>
  ```

- [ ] **Step 1: Move the existing module without changing it**

```bash
rtk mkdir -p apps/hoa/src/lib/properties && rtk git mv apps/hoa/src/lib/properties.ts apps/hoa/src/lib/properties/index.ts
```

Imports of `@/lib/properties` continue to resolve to the directory's `index.ts` — no call-site changes needed.

- [ ] **Step 2: Verify nothing broke**

```bash
rtk pnpm typecheck
```
Expected: PASS, no new errors.

- [ ] **Step 3: Write `resolve.ts`**

Create `apps/hoa/src/lib/properties/resolve.ts`:

```ts
/**
 * The ONLY module permitted to know that a property is modelled by two
 * tables.
 *
 *   units          — has association_id; keyed by assessments.unit_id,
 *                    tickets.unit_id, arc_requests.unit_id,
 *                    communication_threads.unit_id
 *   hoa_properties — has owner_email and the property_residents children
 *                    that carry resident email addresses
 *
 * They are bridged by units.legacy_hoa_property_id (see migration 0028).
 *
 * Everything in lib/inbox/ resolves through here and stores unit_id.
 * Consolidating the two tables is tracked as future work; this module is
 * the seam that makes it possible without touching the inbox.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { normalizeAddress } from './normalize-address'

type Db = SupabaseClient<Database>

export interface PropertyRef {
  unitId: string
  legacyPropertyId: string | null
  associationId: string | null
  address: string
  unitNumber: string | null
}

export type PropertyMatchSource = 'property_resident' | 'owner_email' | 'profile'

export interface PropertyMatch {
  ref: PropertyRef
  residentId: string | null
  residentName: string | null
  source: PropertyMatchSource
}

const UNIT_COLUMNS =
  'id, legacy_hoa_property_id, association_id, address_line1, unit_number'

interface UnitRow {
  id: string
  legacy_hoa_property_id: string | null
  association_id: string | null
  address_line1: string
  unit_number: string | null
}

function toRef(row: UnitRow): PropertyRef {
  return {
    unitId: row.id,
    legacyPropertyId: row.legacy_hoa_property_id,
    associationId: row.association_id,
    address: row.address_line1,
    unitNumber: row.unit_number,
  }
}

export async function getPropertyRef(
  db: Db,
  orgId: string,
  unitId: string,
): Promise<PropertyRef | null> {
  const { data } = await db
    .from('units')
    .select(UNIT_COLUMNS)
    .eq('organization_id', orgId)
    .eq('id', unitId)
    .maybeSingle()

  return data ? toRef(data as UnitRow) : null
}

/**
 * Find every property associated with an email address.
 *
 * Returns MULTIPLE matches when one person owns several units — the
 * caller decides what that means. lib/inbox/match.ts treats exactly one
 * as high confidence and more than one as medium (needs disambiguation).
 *
 * Emails are compared case-insensitively; addresses in the wild are
 * mixed-case and Postgres text comparison is not.
 */
export async function resolvePropertyByEmail(
  db: Db,
  orgId: string,
  email: string,
): Promise<PropertyMatch[]> {
  const needle = email.trim().toLowerCase()
  if (!needle) return []

  const matches: PropertyMatch[] = []
  const seenUnitIds = new Set<string>()

  const push = (
    row: UnitRow,
    residentId: string | null,
    residentName: string | null,
    source: PropertyMatchSource,
  ): void => {
    // First source to claim a unit wins. Ordering below is deliberate:
    // property_residents is the most specific (a named person at a
    // property) and profiles the least.
    if (seenUnitIds.has(row.id)) return
    seenUnitIds.add(row.id)
    matches.push({ ref: toRef(row), residentId, residentName, source })
  }

  // ── 1. property_residents (via the bridge) ────────────────────────
  const { data: residents } = await db
    .from('property_residents')
    .select('id, full_name, property_id')
    .eq('organization_id', orgId)
    .is('moved_out_at', null)
    .ilike('email', needle)

  const residentPropertyIds = (residents ?? []).map((r) => r.property_id)
  if (residentPropertyIds.length > 0) {
    const { data: units } = await db
      .from('units')
      .select(UNIT_COLUMNS)
      .eq('organization_id', orgId)
      .in('legacy_hoa_property_id', residentPropertyIds)

    for (const unit of (units ?? []) as UnitRow[]) {
      const resident = (residents ?? []).find(
        (r) => r.property_id === unit.legacy_hoa_property_id,
      )
      push(unit, resident?.id ?? null, resident?.full_name ?? null, 'property_resident')
    }
  }

  // ── 2. hoa_properties.owner_email (via the bridge) ────────────────
  const { data: owned } = await db
    .from('hoa_properties')
    .select('id, owner_name')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .ilike('owner_email', needle)

  const ownedIds = (owned ?? []).map((p) => p.id)
  if (ownedIds.length > 0) {
    const { data: units } = await db
      .from('units')
      .select(UNIT_COLUMNS)
      .eq('organization_id', orgId)
      .in('legacy_hoa_property_id', ownedIds)

    for (const unit of (units ?? []) as UnitRow[]) {
      const owner = (owned ?? []).find(
        (p) => p.id === unit.legacy_hoa_property_id,
      )
      push(unit, null, owner?.owner_name ?? null, 'owner_email')
    }
  }

  return matches
}

/**
 * Find properties by a raw address string pulled out of an email body.
 * Normalization is applied on BOTH sides so "214 Oak Lane" matches a
 * stored "214 Oak Ln." — see migration 0028 for the SQL twin.
 */
export async function resolvePropertyByAddress(
  db: Db,
  orgId: string,
  rawAddress: string,
): Promise<PropertyRef[]> {
  const needle = normalizeAddress(rawAddress)
  if (needle === '') return []

  const { data } = await db
    .from('units')
    .select(UNIT_COLUMNS)
    .eq('organization_id', orgId)

  return ((data ?? []) as UnitRow[])
    .filter((row) => normalizeAddress(row.address_line1) === needle)
    .map(toRef)
}
```

- [ ] **Step 4: Write the integration test script**

Create `scripts/test-property-resolve.ts`:

```ts
/**
 * scripts/test-property-resolve.ts
 *
 * Integration check for lib/properties/resolve.ts against real Postgres.
 * Read-only — creates nothing, deletes nothing.
 *
 * Run:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   pnpm exec tsx scripts/test-property-resolve.ts
 */

import './_load-env'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../packages/db/src/database.types'
import {
  getPropertyRef,
  resolvePropertyByEmail,
} from '../apps/hoa/src/lib/properties/resolve'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const db = createClient<Database>(url, key)

let failures = 0
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

async function main(): Promise<void> {
  const { data: org } = await db
    .from('orgs')
    .select('id, name')
    .eq('hub_type', 'hoa')
    .limit(1)
    .maybeSingle()

  if (!org) {
    console.error('No HOA org found — seed one first.')
    process.exit(1)
  }
  console.log(`Org: ${org.name} (${org.id})\n`)

  // A: every unit bridges
  const { data: units } = await db
    .from('units')
    .select('id, address_line1, legacy_hoa_property_id')
    .eq('organization_id', org.id)

  const unbridged = (units ?? []).filter((u) => !u.legacy_hoa_property_id)
  check(
    'A. all units bridged to hoa_properties',
    unbridged.length === 0,
    `${unbridged.length} unbridged of ${units?.length ?? 0}`,
  )

  // B: getPropertyRef round-trips
  const sample = units?.[0]
  if (sample) {
    const ref = await getPropertyRef(db, org.id, sample.id)
    check(
      'B. getPropertyRef returns the unit',
      ref?.unitId === sample.id && ref?.address === sample.address_line1,
      ref ? `${ref.address}` : 'null',
    )
  }

  // C: a known resident email resolves to a property
  const { data: resident } = await db
    .from('property_residents')
    .select('email, full_name')
    .eq('organization_id', org.id)
    .is('moved_out_at', null)
    .not('email', 'is', null)
    .limit(1)
    .maybeSingle()

  if (resident?.email) {
    const found = await resolvePropertyByEmail(db, org.id, resident.email)
    check(
      'C. resident email resolves to >=1 property',
      found.length > 0,
      `${resident.email} → ${found.length} match(es)`,
    )
    check(
      'C2. match is case-insensitive',
      (await resolvePropertyByEmail(db, org.id, resident.email.toUpperCase()))
        .length === found.length,
    )
  } else {
    console.log('SKIP  C. no property_residents with an email')
  }

  // D: unknown email resolves to nothing
  const none = await resolvePropertyByEmail(db, org.id, 'nobody@example.invalid')
  check('D. unknown email resolves to 0 properties', none.length === 0)

  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
```

- [ ] **Step 5: Add the script to root `package.json`**

```json
    "test:property-resolve": "tsx scripts/test-property-resolve.ts",
```

- [ ] **Step 6: Run it**

```bash
rtk pnpm exec tsx scripts/test-property-resolve.ts
```
Expected: `ALL PASS`. If check A fails, Task 2's backfill did not apply — fix that before continuing, because every downstream match depends on it.

- [ ] **Step 7: Typecheck and commit**

```bash
rtk pnpm typecheck && rtk git add apps/hoa/src/lib/properties/ scripts/test-property-resolve.ts package.json && rtk git commit -m "feat(properties): add resolve layer over units/hoa_properties split"
```

---

## Task 4: Inbox schema migration

Every table Phase A needs, in one migration. `inbox_reply_exemplars` is deliberately **excluded** — it belongs to Phase B and carries an embedding column that would pull pgvector concerns into a no-AI phase.

**Files:**
- Create: `migrations/0029_inbox.sql`
- Create: `migrations/0030_inbox_message_uniq_scope.sql` — post-hoc correction, see the note after Step 1. Scopes the `gmail_message_id` dedupe key per mailbox (Gmail guarantees message-id uniqueness only within one mailbox, never globally), adds `inbox_messages.mailbox_account_id`, and adds `inbox_thread_links_resource_idx`.

**Interfaces:**
- Consumes: `public.auth_org_ids()`, `public.auth_is_board_or_admin(uuid)` (existing helpers)
- Produces: tables `mailbox_accounts`, `mailbox_account_secrets`, `inbox_threads`, `inbox_messages` (including `mailbox_account_id`), `inbox_attachments`, `inbox_sender_aliases`, `inbox_thread_links`

- [ ] **Step 1: Write the migration**

Create `migrations/0029_inbox.sql`:

```sql
-- 0029_inbox.sql
-- HOA Shared Inbox — Phase A schema.
--
-- Seven tables:
--   1. mailbox_accounts        — one connected Gmail per org
--   2. mailbox_account_secrets — OAuth tokens, service-role ONLY
--   3. inbox_threads           — one row per Gmail thread
--   4. inbox_messages          — one row per Gmail message
--   5. inbox_attachments       — files, mirroring submission_attachments (0027)
--   6. inbox_sender_aliases    — learned email → property mappings
--   7. inbox_thread_links      — thread ↔ ticket/ARC/violation
--
-- Phase B adds inbox_draft_suggestions + inbox_reply_exemplars.
--
-- RLS + audit pattern follows 0018_communications.sql.
-- Idempotent. Safe to re-run.

-- ─── mailbox_accounts ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.mailbox_accounts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  provider          text NOT NULL DEFAULT 'gmail' CHECK (provider IN ('gmail')),
  email_address     text NOT NULL,
  google_sub        text,                          -- stable Google account id
  display_name      text,

  -- Which mail we are allowed to see. Enforced in packages/mailbox BEFORE
  -- anything is persisted — never written-then-filtered.
  scope_mode        text NOT NULL DEFAULT 'address'
    CHECK (scope_mode IN ('address', 'label', 'all')),
  scope_value       text,                          -- the address, or the Gmail labelId

  sync_cursor       text,                          -- Gmail historyId
  last_synced_at    timestamptz,
  sync_status       text NOT NULL DEFAULT 'ok'
    CHECK (sync_status IN ('ok', 'stalled', 'auth_failed')),
  sync_error        text,

  backfill_status   text NOT NULL DEFAULT 'pending'
    CHECK (backfill_status IN ('pending', 'running', 'done', 'failed')),
  backfill_progress jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {done:1240, total:3800}

  connected_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  connected_at      timestamptz NOT NULL DEFAULT now(),
  disconnected_at   timestamptz
);

-- One live connection per address per org. Disconnected rows are kept for
-- audit, so the uniqueness is partial.
CREATE UNIQUE INDEX IF NOT EXISTS mailbox_accounts_live_uniq
  ON public.mailbox_accounts(organization_id, email_address)
  WHERE disconnected_at IS NULL;

CREATE INDEX IF NOT EXISTS mailbox_accounts_sync_idx
  ON public.mailbox_accounts(sync_status, last_synced_at)
  WHERE disconnected_at IS NULL;

-- ─── mailbox_account_secrets ─────────────────────────────────────────
-- Split from mailbox_accounts on purpose. A refresh token grants standing
-- access to an HOA's entire mailbox, so it lives in a table that NO user
-- session can read — RLS is enabled with no permissive policy, which
-- denies everything except the service role (which bypasses RLS).
CREATE TABLE IF NOT EXISTS public.mailbox_account_secrets (
  mailbox_account_id uuid PRIMARY KEY
    REFERENCES public.mailbox_accounts(id) ON DELETE CASCADE,
  refresh_token_enc  text NOT NULL,
  access_token_enc   text,
  token_expires_at   timestamptz,
  key_version        integer NOT NULL DEFAULT 1,
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ─── inbox_threads ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inbox_threads (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  mailbox_account_id uuid NOT NULL
    REFERENCES public.mailbox_accounts(id) ON DELETE CASCADE,
  gmail_thread_id    text NOT NULL,
  subject            text,
  participants       jsonb NOT NULL DEFAULT '[]'::jsonb,

  unit_id            uuid REFERENCES public.units(id) ON DELETE SET NULL,
  resident_id        uuid REFERENCES public.property_residents(id) ON DELETE SET NULL,
  match_confidence   text NOT NULL DEFAULT 'none'
    CHECK (match_confidence IN ('high', 'medium', 'low', 'none')),
  match_reason       jsonb,     -- {rule:'resident_email', matched_on:'j@x.com'}
  match_source       text NOT NULL DEFAULT 'auto'
    CHECK (match_source IN ('auto', 'manual')),

  status             text NOT NULL DEFAULT 'needs_review'
    CHECK (status IN ('needs_review', 'open', 'waiting', 'closed')),
  assigned_to        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  last_message_at    timestamptz,
  last_direction     text CHECK (last_direction IN ('inbound', 'outbound')),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS inbox_threads_gmail_uniq
  ON public.inbox_threads(mailbox_account_id, gmail_thread_id);

CREATE INDEX IF NOT EXISTS inbox_threads_queue_idx
  ON public.inbox_threads(organization_id, status, last_message_at DESC);

CREATE INDEX IF NOT EXISTS inbox_threads_unit_idx
  ON public.inbox_threads(unit_id, last_message_at DESC)
  WHERE unit_id IS NOT NULL;

-- ─── inbox_messages ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inbox_messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  thread_id         uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  mailbox_account_id uuid NOT NULL
    REFERENCES public.mailbox_accounts(id) ON DELETE CASCADE,
  gmail_message_id  text NOT NULL,      -- THE dedupe key, scoped per mailbox — see below

  rfc822_message_id text,
  in_reply_to       text,
  references_ids    text[],             -- "references" is reserved in SQL

  direction         text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_email        text,
  from_name         text,
  to_emails         text[] NOT NULL DEFAULT ARRAY[]::text[],
  cc_emails         text[] NOT NULL DEFAULT ARRAY[]::text[],

  subject           text,
  body_text         text,
  body_html         text,
  stripped_text     text,               -- quotes removed; what Phase B reads

  sent_at           timestamptz,
  ingested_at       timestamptz NOT NULL DEFAULT now(),
  communication_id  uuid REFERENCES public.communications(id) ON DELETE SET NULL
);

-- Idempotent ingest depends on this. A full re-sync after a historyId
-- expiry MUST be a no-op for anything already stored.
--
-- Scoped to (mailbox_account_id, gmail_message_id), NOT gmail_message_id
-- alone: Gmail only guarantees message-id uniqueness within one mailbox,
-- not across accounts. A global unique index would mean two tenants
-- whose mailboxes ever produce the same id have the second tenant's
-- genuinely-new email silently discarded by ON CONFLICT DO NOTHING — no
-- error, no log line, the email just never appears.
CREATE UNIQUE INDEX IF NOT EXISTS inbox_messages_gmail_uniq
  ON public.inbox_messages(mailbox_account_id, gmail_message_id);

CREATE INDEX IF NOT EXISTS inbox_messages_mailbox_idx
  ON public.inbox_messages(mailbox_account_id);

CREATE INDEX IF NOT EXISTS inbox_messages_thread_idx
  ON public.inbox_messages(thread_id, sent_at);

CREATE INDEX IF NOT EXISTS inbox_messages_rfc822_idx
  ON public.inbox_messages(rfc822_message_id)
  WHERE rfc822_message_id IS NOT NULL;

-- ─── inbox_attachments ───────────────────────────────────────────────
-- Mirrors submission_attachments (0027): bytes in the private
-- `hoa-documents` bucket, this table is the metadata index, access is via
-- server-generated signed URLs.
CREATE TABLE IF NOT EXISTS public.inbox_attachments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  thread_id           uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  message_id          uuid NOT NULL REFERENCES public.inbox_messages(id) ON DELETE CASCADE,
  storage_path        text,             -- null until fetch_status='stored'
  file_name           text NOT NULL,
  content_type        text,
  size_bytes          bigint,
  sha256              text,
  gmail_attachment_id text,             -- lets a failed download retry
  is_inline           boolean NOT NULL DEFAULT false,
  fetch_status        text NOT NULL DEFAULT 'pending'
    CHECK (fetch_status IN ('pending', 'stored', 'failed', 'skipped')),
  fetch_error         text,
  fetch_attempts      integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inbox_attachments_message_idx
  ON public.inbox_attachments(message_id);

CREATE INDEX IF NOT EXISTS inbox_attachments_pending_idx
  ON public.inbox_attachments(fetch_status, created_at)
  WHERE fetch_status = 'pending';

-- ─── inbox_sender_aliases ────────────────────────────────────────────
-- The matcher's learning loop. Every manual triage assignment writes a
-- row, so the next email from that address matches at high confidence.
CREATE TABLE IF NOT EXISTS public.inbox_sender_aliases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  email_address   text NOT NULL,
  unit_id         uuid REFERENCES public.units(id) ON DELETE CASCADE,
  resident_id     uuid REFERENCES public.property_residents(id) ON DELETE SET NULL,
  source          text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'auto_confirmed')),
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS inbox_sender_aliases_uniq
  ON public.inbox_sender_aliases(organization_id, lower(email_address));

-- ─── inbox_thread_links ──────────────────────────────────────────────
-- Links a thread to an existing record without either owning the other.
CREATE TABLE IF NOT EXISTS public.inbox_thread_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  thread_id       uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  resource_type   text NOT NULL
    CHECK (resource_type IN ('ticket', 'arc_request', 'violation', 'communication_thread')),
  resource_id     uuid NOT NULL,
  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS inbox_thread_links_uniq
  ON public.inbox_thread_links(thread_id, resource_type, resource_id);

-- Reverse lookup: "does this ticket/ARC/violation already have a linked
-- thread". inbox_thread_links_uniq above is keyed thread-first and does
-- not serve this direction.
CREATE INDEX IF NOT EXISTS inbox_thread_links_resource_idx
  ON public.inbox_thread_links(resource_type, resource_id);

-- ─── RLS ─────────────────────────────────────────────────────────────
ALTER TABLE public.mailbox_accounts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mailbox_account_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_threads           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_attachments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_sender_aliases    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_thread_links      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_access ON public.mailbox_accounts;
DROP POLICY IF EXISTS board_access ON public.inbox_threads;
DROP POLICY IF EXISTS board_access ON public.inbox_messages;
DROP POLICY IF EXISTS board_access ON public.inbox_attachments;
DROP POLICY IF EXISTS board_access ON public.inbox_sender_aliases;
DROP POLICY IF EXISTS board_access ON public.inbox_thread_links;

-- The HOA inbox is board/admin only. Residents have no business reading
-- the mailbox — unlike submissions (0027), there is no resident policy.
CREATE POLICY board_access ON public.mailbox_accounts
  FOR ALL
  USING       (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id))
  WITH CHECK  (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id));

CREATE POLICY board_access ON public.inbox_threads
  FOR ALL
  USING       (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id))
  WITH CHECK  (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id));

CREATE POLICY board_access ON public.inbox_messages
  FOR ALL
  USING       (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id))
  WITH CHECK  (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id));

CREATE POLICY board_access ON public.inbox_attachments
  FOR ALL
  USING       (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id))
  WITH CHECK  (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id));

CREATE POLICY board_access ON public.inbox_sender_aliases
  FOR ALL
  USING       (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id))
  WITH CHECK  (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id));

CREATE POLICY board_access ON public.inbox_thread_links
  FOR ALL
  USING       (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id))
  WITH CHECK  (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id));

-- mailbox_account_secrets gets NO policy at all. RLS enabled with zero
-- permissive policies denies every non-service-role read and write. This
-- is intentional and must not be "fixed" by adding an org_access policy.
```

**Note (post-hoc correction):** the block above already shows the
corrected schema — `inbox_messages.mailbox_account_id` and the two-column
`inbox_messages_gmail_uniq` — not what `migrations/0029_inbox.sql`
literally contains on disk. `0029_inbox.sql` shipped with a *global*
unique index on `gmail_message_id` alone, which is wrong: Gmail only
guarantees message-id uniqueness within one mailbox, never across
accounts, so a global index means a second tenant's genuinely-new email
can be silently discarded by the ingest path's `ON CONFLICT DO NOTHING`
as a false "duplicate" of an unrelated tenant's message — cross-tenant
data loss with no error and no log line. `0029_inbox.sql` is not edited
(already applied and reviewed); `migrations/0030_inbox_message_uniq_scope.sql`
is the additive fix applied after it, and is what actually produces the
schema shown above.

- [ ] **Step 2: Apply the migration**

Paste into the Supabase SQL editor and run, or apply via the CLI per `docs/APPLY_v1.1_MIGRATIONS.md`.

- [ ] **Step 3: Verify the tables and the deny-all secret table**

```sql
SELECT tablename,
       (SELECT count(*) FROM pg_policies p
         WHERE p.tablename = t.tablename AND p.schemaname = 'public') AS policies
  FROM pg_tables t
 WHERE schemaname = 'public'
   AND tablename LIKE ANY (ARRAY['mailbox_%', 'inbox_%'])
 ORDER BY tablename;
```
Expected: 7 rows. `mailbox_account_secrets` must show **0 policies**; every other row shows 1.

- [ ] **Step 4: Regenerate database types**

```bash
rtk pnpm --filter @homeowner-portal/db gen:types
```

- [ ] **Step 5: Typecheck and commit**

```bash
rtk pnpm typecheck && rtk git add migrations/0029_inbox.sql packages/db/src/database.types.ts && rtk git commit -m "feat(db): inbox schema — mailbox accounts, threads, messages, attachments, aliases"
```

- [ ] **Step 6: Post-hoc correction — scope the dedupe key per mailbox**

Caught in review after 0029 was applied: `gmail_message_id` is only
unique **within** a mailbox, never globally, so the index in Step 1 as
originally written is a cross-tenant data-loss bug (see the note above
Step 2). Fix with an additive migration rather than editing the applied
0029:

```bash
rtk supabase db query --linked < migrations/0030_inbox_message_uniq_scope.sql
rtk pnpm --filter @homeowner-portal/db gen:types
rtk proxy pnpm typecheck
rtk git add migrations/0030_inbox_message_uniq_scope.sql packages/db/src/database.types.ts && rtk git commit -m "fix(db): scope inbox_messages gmail_message_id uniqueness per mailbox"
```
Expected: `inbox_messages_gmail_uniq` is now `(mailbox_account_id, gmail_message_id)`; `inbox_messages.mailbox_account_id` exists and is `NOT NULL`; re-running the migration is a no-op.

---

## Task 5: RLS isolation test

Written before any code touches these tables. Cross-org leakage and a readable token table are the two failures in this feature that cannot be walked back.

**Files:**
- Create: `scripts/test-inbox-rls.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: schema from Task 4
- Produces: `pnpm test:inbox-rls`

- [ ] **Step 1: Write the test script**

Create `scripts/test-inbox-rls.ts`:

```ts
/**
 * scripts/test-inbox-rls.ts
 *
 * Security test for the Phase A inbox schema. Two properties:
 *
 *   1. Cross-org isolation — an anon-key client carrying org A's session
 *      cannot see org B's inbox rows.
 *   2. mailbox_account_secrets is unreachable from ANY user session.
 *      RLS is enabled with no permissive policy, so every non-service-role
 *      read returns zero rows.
 *
 * Uses the service role to seed two throwaway orgs, then reads back with
 * the anon key. Cleans up everything it created.
 *
 * Run:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
 *   pnpm exec tsx scripts/test-inbox-rls.ts
 */

import './_load-env'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../packages/db/src/database.types'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !serviceKey || !anonKey) {
  console.error(
    'Need NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_ANON_KEY',
  )
  process.exit(1)
}

const admin = createClient<Database>(url, serviceKey)
const anon = createClient<Database>(url, anonKey)

const TAG = 'test-inbox-rls-harness'
let failures = 0

function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

async function main(): Promise<void> {
  // ── seed two orgs ───────────────────────────────────────────────
  const { data: orgs, error: orgErr } = await admin
    .from('orgs')
    .insert([
      { name: `${TAG}-A`, hub_type: 'hoa' },
      { name: `${TAG}-B`, hub_type: 'hoa' },
    ])
    .select('id, name')

  if (orgErr || !orgs || orgs.length !== 2) {
    console.error('Could not seed orgs:', orgErr?.message)
    process.exit(1)
  }
  const [orgA, orgB] = orgs

  const { data: accounts } = await admin
    .from('mailbox_accounts')
    .insert([
      { organization_id: orgA.id, email_address: `a@${TAG}.test`, scope_mode: 'all' },
      { organization_id: orgB.id, email_address: `b@${TAG}.test`, scope_mode: 'all' },
    ])
    .select('id, organization_id')

  const acctA = accounts?.find((a) => a.organization_id === orgA.id)
  if (!acctA) {
    console.error('Could not seed mailbox_accounts')
    process.exit(1)
  }

  await admin.from('mailbox_account_secrets').insert({
    mailbox_account_id: acctA.id,
    refresh_token_enc: 'v1:not-a-real-token',
    key_version: 1,
  })

  await admin.from('inbox_threads').insert([
    {
      organization_id: orgA.id,
      mailbox_account_id: acctA.id,
      gmail_thread_id: `${TAG}-thread-a`,
      subject: 'org A private thread',
    },
  ])

  // ── 1. anonymous / unauthenticated sees nothing ─────────────────
  const { data: anonThreads } = await anon.from('inbox_threads').select('id')
  check(
    '1. unauthenticated client sees no inbox_threads',
    (anonThreads ?? []).length === 0,
    `saw ${(anonThreads ?? []).length}`,
  )

  const { data: anonAccounts } = await anon.from('mailbox_accounts').select('id')
  check(
    '2. unauthenticated client sees no mailbox_accounts',
    (anonAccounts ?? []).length === 0,
    `saw ${(anonAccounts ?? []).length}`,
  )

  // ── 2. the secrets table is unreachable, period ─────────────────
  const { data: anonSecrets } = await anon
    .from('mailbox_account_secrets')
    .select('mailbox_account_id')
  check(
    '3. mailbox_account_secrets unreadable from a user session',
    (anonSecrets ?? []).length === 0,
    `saw ${(anonSecrets ?? []).length} — ANY row here is a critical leak`,
  )

  const { error: insertErr } = await anon
    .from('mailbox_account_secrets')
    .insert({ mailbox_account_id: acctA.id, refresh_token_enc: 'injected' })
  check(
    '4. mailbox_account_secrets rejects a user-session insert',
    insertErr !== null,
    insertErr ? insertErr.code ?? insertErr.message : 'insert SUCCEEDED',
  )

  // ── 3. the service role still works (sanity) ────────────────────
  const { data: adminSecrets } = await admin
    .from('mailbox_account_secrets')
    .select('mailbox_account_id')
    .eq('mailbox_account_id', acctA.id)
  check(
    '5. service role CAN read secrets',
    (adminSecrets ?? []).length === 1,
  )

  // ── cleanup (cascades handle children) ──────────────────────────
  await admin.from('orgs').delete().in('id', [orgA.id, orgB.id])

  const { data: leftover } = await admin
    .from('mailbox_accounts')
    .select('id')
    .in('organization_id', [orgA.id, orgB.id])
  check('6. cleanup removed all harness rows', (leftover ?? []).length === 0)

  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
```

- [ ] **Step 2: Add the script to root `package.json`**

```json
    "test:inbox-rls": "tsx scripts/test-inbox-rls.ts",
```

- [ ] **Step 3: Run it**

```bash
rtk pnpm exec tsx scripts/test-inbox-rls.ts
```
Expected: `ALL PASS` — 6 checks.

If check 3 or 4 fails, **stop**. A readable or writable `mailbox_account_secrets` means any authenticated user can extract a refresh token granting standing access to an HOA's entire mailbox. Confirm migration 0029 created no policy on that table before continuing.

- [ ] **Step 4: Commit**

```bash
rtk git add scripts/test-inbox-rls.ts package.json && rtk git commit -m "test(inbox): RLS isolation + secrets deny-all"
```

---

## Task 6: `packages/mailbox` scaffold + types + token crypto

**Files:**
- Create: `packages/mailbox/package.json`, `packages/mailbox/tsconfig.json`
- Create: `packages/mailbox/src/types.ts`, `src/crypto.ts`, `src/crypto.test.ts`, `src/index.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  ```ts
  interface ParsedAttachment { gmailAttachmentId, fileName, contentType, sizeBytes, isInline }
  interface ParsedMessage {
    gmailMessageId, gmailThreadId, rfc822MessageId, inReplyTo, references,
    fromEmail, fromName, toEmails, ccEmails, deliveredTo,
    subject, bodyText, bodyHtml, strippedText, attachments, sentAt, labelIds
  }
  interface SyncResult { messages: ParsedMessage[]; nextCursor: string; usedFallback: boolean }
  encryptToken(plain: string): string        // "v1:<iv>:<tag>:<ciphertext>"
  decryptToken(encoded: string): string
  currentKeyVersion(): number
  ```

- [ ] **Step 1: Create `packages/mailbox/package.json`**

```json
{
  "name": "@homeowner-portal/mailbox",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {},
  "devDependencies": {
    "typescript": "^5",
    "@types/node": "^22"
  }
}
```

Note the empty `dependencies`. This package talks to Gmail over `fetch` and uses `node:crypto` — it must never gain a Supabase, Next, or `googleapis` dependency.

- [ ] **Step 2: Create `packages/mailbox/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create `packages/mailbox/src/types.ts`**

```ts
/**
 * Transport-level types. Deliberately free of HOA concepts — no unit,
 * no property, no organization. Mapping to those happens in
 * apps/hoa/src/lib/inbox/.
 */

export interface ParsedAttachment {
  gmailAttachmentId: string | null
  fileName: string
  contentType: string | null
  sizeBytes: number | null
  isInline: boolean
}

export interface ParsedMessage {
  gmailMessageId: string
  gmailThreadId: string
  rfc822MessageId: string | null
  inReplyTo: string | null
  references: string[]

  fromEmail: string | null
  fromName: string | null
  toEmails: string[]
  ccEmails: string[]
  deliveredTo: string[]

  subject: string | null
  bodyText: string | null
  bodyHtml: string | null
  /** bodyText with quoted history removed — what a model should read. */
  strippedText: string | null

  attachments: ParsedAttachment[]
  sentAt: string | null
  labelIds: string[]
}

export type ScopeMode = 'address' | 'label' | 'all'

export interface MailboxAccount {
  id: string
  emailAddress: string
  scopeMode: ScopeMode
  scopeValue: string | null
  syncCursor: string | null
}

export interface SyncResult {
  messages: ParsedMessage[]
  nextCursor: string
  /** True when historyId expired and a date-ranged re-sync was used. */
  usedFallback: boolean
  /**
   * True when maxMessages capped the run. On the history path the cursor is
   * held so the remainder is picked up next time. On the FALLBACK path the
   * cursor must advance (there is no resumable history position), so the
   * caller has to trigger a backfill or the capped-off messages are lost.
   */
  truncated: boolean
}

export interface OAuthTokens {
  accessToken: string
  refreshToken: string | null
  expiresAt: string
  scope: string
}

export class MailboxAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MailboxAuthError'
  }
}

export class MailboxHistoryExpiredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MailboxHistoryExpiredError'
  }
}
```

- [ ] **Step 4: Write the failing crypto test**

Create `packages/mailbox/src/crypto.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { currentKeyVersion, decryptToken, encryptToken } from './crypto'

// 32 bytes, base64 — the format MAILBOX_TOKEN_KEY must use.
const KEY_A = Buffer.alloc(32, 1).toString('base64')
const KEY_B = Buffer.alloc(32, 2).toString('base64')

describe('token crypto', () => {
  beforeEach(() => {
    process.env.MAILBOX_TOKEN_KEY = KEY_A
    process.env.MAILBOX_TOKEN_KEY_VERSION = '1'
    delete process.env.MAILBOX_TOKEN_KEY_V1
    delete process.env.MAILBOX_TOKEN_KEY_V2
  })

  it('round-trips a token', () => {
    const secret = '1//0gRefreshTokenExample_with-symbols.and~stuff'
    expect(decryptToken(encryptToken(secret))).toBe(secret)
  })

  it('produces a versioned, non-plaintext envelope', () => {
    const out = encryptToken('hello')
    expect(out.startsWith('v1:')).toBe(true)
    expect(out).not.toContain('hello')
    expect(out.split(':')).toHaveLength(4)
  })

  it('is non-deterministic — a fresh IV each call', () => {
    expect(encryptToken('same')).not.toBe(encryptToken('same'))
  })

  it('rejects a tampered ciphertext rather than returning garbage', () => {
    const [v, iv, tag, ct] = encryptToken('sensitive').split(':')
    const flipped = Buffer.from(ct, 'base64')
    flipped[0] ^= 0xff
    expect(() =>
      decryptToken(`${v}:${iv}:${tag}:${flipped.toString('base64')}`),
    ).toThrow()
  })

  it('decrypts an older key version after rotation', () => {
    const old = encryptToken('rotate-me')          // sealed under v1
    process.env.MAILBOX_TOKEN_KEY_V1 = KEY_A       // v1 retained
    process.env.MAILBOX_TOKEN_KEY = KEY_B          // v2 is now current
    process.env.MAILBOX_TOKEN_KEY_VERSION = '2'

    expect(currentKeyVersion()).toBe(2)
    expect(decryptToken(old)).toBe('rotate-me')      // old envelope still opens
    expect(encryptToken('new').startsWith('v2:')).toBe(true)
  })

  it('throws a clear error when the key is missing', () => {
    delete process.env.MAILBOX_TOKEN_KEY
    expect(() => encryptToken('x')).toThrow(/MAILBOX_TOKEN_KEY/)
  })

  it('throws when the key is not 32 bytes', () => {
    process.env.MAILBOX_TOKEN_KEY = Buffer.alloc(16, 9).toString('base64')
    expect(() => encryptToken('x')).toThrow(/32 bytes/)
  })
})
```

- [ ] **Step 5: Run the test to verify it fails**

```bash
rtk pnpm test:unit
```
Expected: FAIL — `Failed to resolve import "./crypto"`.

- [ ] **Step 6: Implement `packages/mailbox/src/crypto.ts`**

```ts
/**
 * AES-256-GCM envelope encryption for Gmail OAuth tokens.
 *
 * Envelope format:  v<version>:<iv-b64>:<authTag-b64>:<ciphertext-b64>
 *
 * The version prefix is what makes key rotation possible. Rotating means:
 *   1. keep the old key as MAILBOX_TOKEN_KEY_V<n>
 *   2. set MAILBOX_TOKEN_KEY to the new key
 *   3. bump MAILBOX_TOKEN_KEY_VERSION
 * Existing envelopes keep opening under their original version; new ones
 * are sealed under the new key. Nothing needs re-encrypting up front.
 *
 * GCM is authenticated, so tampering throws rather than silently
 * returning garbage — a plain CBC/CTR mode would hand back nonsense that
 * looks like a valid token and fail confusingly at the Gmail API.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12 // GCM standard

function readKey(version: number): Buffer {
  const current = currentKeyVersion()
  const raw =
    version === current
      ? process.env.MAILBOX_TOKEN_KEY
      : process.env[`MAILBOX_TOKEN_KEY_V${version}`]

  if (!raw) {
    throw new Error(
      version === current
        ? 'MAILBOX_TOKEN_KEY is not set. Generate one with: openssl rand -base64 32'
        : `MAILBOX_TOKEN_KEY_V${version} is not set — an envelope sealed under key ` +
          `version ${version} cannot be opened. Retain retired keys after rotation.`,
    )
  }

  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error(
      `MAILBOX_TOKEN_KEY must decode to 32 bytes for AES-256 (got ${key.length}).`,
    )
  }
  return key
}

export function currentKeyVersion(): number {
  const parsed = Number.parseInt(process.env.MAILBOX_TOKEN_KEY_VERSION ?? '1', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

export function encryptToken(plain: string): string {
  const version = currentKeyVersion()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, readKey(version), iv)

  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [
    `v${version}`,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':')
}

export function decryptToken(encoded: string): string {
  const parts = encoded.split(':')
  if (parts.length !== 4 || !parts[0].startsWith('v')) {
    throw new Error('Malformed token envelope.')
  }

  const version = Number.parseInt(parts[0].slice(1), 10)
  if (!Number.isFinite(version)) throw new Error('Malformed token envelope version.')

  const decipher = createDecipheriv(
    ALGORITHM,
    readKey(version),
    Buffer.from(parts[1], 'base64'),
  )
  decipher.setAuthTag(Buffer.from(parts[2], 'base64'))

  // .final() throws on an auth-tag mismatch — that is the tamper check.
  return Buffer.concat([
    decipher.update(Buffer.from(parts[3], 'base64')),
    decipher.final(),
  ]).toString('utf8')
}
```

- [ ] **Step 7: Create `packages/mailbox/src/index.ts`**

```ts
export * from './types'
export { encryptToken, decryptToken, currentKeyVersion } from './crypto'
```

- [ ] **Step 8: Install and run the tests**

```bash
rtk pnpm install && rtk pnpm test:unit
```
Expected: PASS — 7 crypto tests plus the 7 from Task 1.

- [ ] **Step 9: Document the env var**

Append to `docs/DEPLOY.md` under the environment-variables section:

```markdown
### Mailbox (HOA Shared Inbox)

| Var | Required | Notes |
|---|---|---|
| `MAILBOX_TOKEN_KEY` | yes | Base64 32-byte AES-256 key. Generate: `openssl rand -base64 32`. Encrypts Gmail refresh tokens at rest. |
| `MAILBOX_TOKEN_KEY_VERSION` | no | Defaults to `1`. Bump when rotating. |
| `MAILBOX_TOKEN_KEY_V<n>` | on rotation | Retired keys. **Must be retained** or envelopes sealed under version `<n>` become unopenable and every affected HOA has to reconnect. |
| `GOOGLE_OAUTH_CLIENT_ID` | yes | From the Google Cloud project. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | yes | |
| `GOOGLE_OAUTH_REDIRECT_URI` | yes | `<app-url>/api/oauth/google/callback` |
```

- [ ] **Step 10: Commit**

```bash
rtk pnpm typecheck && rtk git add packages/mailbox/ docs/DEPLOY.md pnpm-lock.yaml && rtk git commit -m "feat(mailbox): package scaffold, transport types, AES-256-GCM token crypto"
```

---

## Task 7: Gmail payload parsing

Gmail's `messages.get?format=full` returns an already-decoded MIME **tree**, so this walks `payload.parts[]` rather than parsing raw RFC822.

**Files:**
- Create: `packages/mailbox/src/parse.ts`, `src/parse.test.ts`
- Create: `packages/mailbox/src/fixtures/{simple,multipart,with-attachment,inline-image,nested}.json`
- Modify: `packages/mailbox/src/index.ts`

**Interfaces:**
- Consumes: `ParsedMessage`, `ParsedAttachment` (Task 6)
- Produces: `parseGmailMessage(raw: GmailApiMessage): ParsedMessage`; `decodeBase64Url(s: string): string`

- [ ] **Step 1: Create the fixtures**

Create `packages/mailbox/src/fixtures/simple.json` — a plain-text message:

```json
{
  "id": "18f0a1b2c3d4e5f6",
  "threadId": "18f0a1b2c3d4e5f0",
  "labelIds": ["INBOX", "UNREAD"],
  "internalDate": "1785500000000",
  "payload": {
    "mimeType": "text/plain",
    "headers": [
      { "name": "Message-ID", "value": "<abc123@mail.gmail.com>" },
      { "name": "From", "value": "Jenna Rivera <j.rivera@gmail.com>" },
      { "name": "To", "value": "board@madisonparkhoa.org" },
      { "name": "Subject", "value": "Pool gate code not working" },
      { "name": "Delivered-To", "value": "board@madisonparkhoa.org" }
    ],
    "body": {
      "size": 61,
      "data": "SGkgLSB0aGUga2V5cGFkIGF0IHRoZSBwb29sIGdhdGUgd29uJ3QgdGFrZSBvdXIgY29kZS4"
    }
  }
}
```

Create `packages/mailbox/src/fixtures/multipart.json` — text + HTML alternative:

```json
{
  "id": "28f0a1b2c3d4e5f6",
  "threadId": "28f0a1b2c3d4e5f0",
  "labelIds": ["INBOX"],
  "internalDate": "1785500100000",
  "payload": {
    "mimeType": "multipart/alternative",
    "headers": [
      { "name": "Message-ID", "value": "<def456@mail.gmail.com>" },
      { "name": "From", "value": "\"Chen, Mei\" <mchen.home@yahoo.com>" },
      { "name": "To", "value": "board@madisonparkhoa.org, manager@madisonparkhoa.org" },
      { "name": "Cc", "value": "Dana Okafor <d.okafor@gmail.com>" },
      { "name": "Subject", "value": "Fence stain color approval" },
      { "name": "In-Reply-To", "value": "<parent-1@mail.gmail.com>" },
      { "name": "References", "value": "<root@mail.gmail.com> <parent-1@mail.gmail.com>" }
    ],
    "parts": [
      {
        "mimeType": "text/plain",
        "headers": [],
        "body": { "size": 20, "data": "UGxhaW4gdGV4dCB2ZXJzaW9u" }
      },
      {
        "mimeType": "text/html",
        "headers": [],
        "body": { "size": 33, "data": "PHA-SFRNTCB2ZXJzaW9uPC9wPg" }
      }
    ]
  }
}
```

Create `packages/mailbox/src/fixtures/with-attachment.json`:

```json
{
  "id": "38f0a1b2c3d4e5f6",
  "threadId": "38f0a1b2c3d4e5f0",
  "labelIds": ["INBOX"],
  "internalDate": "1785500200000",
  "payload": {
    "mimeType": "multipart/mixed",
    "headers": [
      { "name": "Message-ID", "value": "<ghi789@mail.gmail.com>" },
      { "name": "From", "value": "billing@greenlawn.com" },
      { "name": "To", "value": "board@madisonparkhoa.org" },
      { "name": "Subject", "value": "Invoice #4417" }
    ],
    "parts": [
      {
        "mimeType": "text/plain",
        "headers": [],
        "body": { "size": 18, "data": "SW52b2ljZSBhdHRhY2hlZA" }
      },
      {
        "mimeType": "application/pdf",
        "filename": "invoice-4417.pdf",
        "headers": [
          { "name": "Content-Disposition", "value": "attachment; filename=\"invoice-4417.pdf\"" }
        ],
        "body": { "size": 284913, "attachmentId": "ANGjdJ_attach_1" }
      }
    ]
  }
}
```

Create `packages/mailbox/src/fixtures/inline-image.json` — a small signature logo:

```json
{
  "id": "48f0a1b2c3d4e5f6",
  "threadId": "48f0a1b2c3d4e5f0",
  "labelIds": ["INBOX"],
  "internalDate": "1785500300000",
  "payload": {
    "mimeType": "multipart/related",
    "headers": [
      { "name": "Message-ID", "value": "<jkl012@mail.gmail.com>" },
      { "name": "From", "value": "office@titleco.com" },
      { "name": "To", "value": "board@madisonparkhoa.org" },
      { "name": "Subject", "value": "Closing packet" }
    ],
    "parts": [
      {
        "mimeType": "text/plain",
        "headers": [],
        "body": { "size": 12, "data": "U2VlIGF0dGFjaGVk" }
      },
      {
        "mimeType": "image/gif",
        "filename": "logo.gif",
        "headers": [
          { "name": "Content-Disposition", "value": "inline; filename=\"logo.gif\"" },
          { "name": "Content-ID", "value": "<logo@titleco>" }
        ],
        "body": { "size": 4096, "attachmentId": "ANGjdJ_attach_logo" }
      }
    ]
  }
}
```

Create `packages/mailbox/src/fixtures/nested.json` — `multipart/mixed` wrapping `multipart/alternative`, the shape Outlook and Apple Mail commonly send:

```json
{
  "id": "58f0a1b2c3d4e5f6",
  "threadId": "58f0a1b2c3d4e5f0",
  "labelIds": ["INBOX"],
  "internalDate": "1785500400000",
  "payload": {
    "mimeType": "multipart/mixed",
    "headers": [
      { "name": "Message-ID", "value": "<mno345@mail.gmail.com>" },
      { "name": "From", "value": "legal@hoacounsel.com" },
      { "name": "To", "value": "board@madisonparkhoa.org" },
      { "name": "Subject", "value": "Re: Assessment increase" }
    ],
    "parts": [
      {
        "mimeType": "multipart/alternative",
        "headers": [],
        "parts": [
          {
            "mimeType": "text/plain",
            "headers": [],
            "body": { "size": 14, "data": "TmVzdGVkIHBsYWlu" }
          },
          {
            "mimeType": "text/html",
            "headers": [],
            "body": { "size": 25, "data": "PHA-TmVzdGVkIEhUTUw8L3A-" }
          }
        ]
      },
      {
        "mimeType": "application/pdf",
        "filename": "opinion.pdf",
        "headers": [
          { "name": "Content-Disposition", "value": "attachment; filename=\"opinion.pdf\"" }
        ],
        "body": { "size": 91234, "attachmentId": "ANGjdJ_attach_op" }
      }
    ]
  }
}
```

- [ ] **Step 2: Write the failing test**

Create `packages/mailbox/src/parse.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { decodeBase64Url, parseGmailMessage } from './parse'
import type { GmailApiMessage } from './parse'

import simple from './fixtures/simple.json'
import multipart from './fixtures/multipart.json'
import withAttachment from './fixtures/with-attachment.json'
import inlineImage from './fixtures/inline-image.json'
import nested from './fixtures/nested.json'

const as = (v: unknown): GmailApiMessage => v as GmailApiMessage

describe('decodeBase64Url', () => {
  it('decodes URL-safe base64 without padding', () => {
    // "<p>HTML version</p>" encoded with - and _ and no "="
    expect(decodeBase64Url('PHA-SFRNTCB2ZXJzaW9uPC9wPg')).toBe('<p>HTML version</p>')
  })

  it('returns empty string for empty input', () => {
    expect(decodeBase64Url('')).toBe('')
  })
})

describe('parseGmailMessage', () => {
  it('parses a plain-text message', () => {
    const m = parseGmailMessage(as(simple))
    expect(m.gmailMessageId).toBe('18f0a1b2c3d4e5f6')
    expect(m.gmailThreadId).toBe('18f0a1b2c3d4e5f0')
    expect(m.rfc822MessageId).toBe('<abc123@mail.gmail.com>')
    expect(m.fromEmail).toBe('j.rivera@gmail.com')
    expect(m.fromName).toBe('Jenna Rivera')
    expect(m.toEmails).toEqual(['board@madisonparkhoa.org'])
    expect(m.deliveredTo).toEqual(['board@madisonparkhoa.org'])
    expect(m.subject).toBe('Pool gate code not working')
    expect(m.bodyText).toContain('pool gate')
    expect(m.bodyHtml).toBeNull()
    expect(m.attachments).toEqual([])
    expect(m.sentAt).toBe(new Date(1785500000000).toISOString())
    expect(m.labelIds).toEqual(['INBOX', 'UNREAD'])
  })

  it('prefers text/plain but keeps text/html from a multipart message', () => {
    const m = parseGmailMessage(as(multipart))
    expect(m.bodyText).toBe('Plain text version')
    expect(m.bodyHtml).toBe('<p>HTML version</p>')
  })

  it('parses a quoted display name containing a comma', () => {
    const m = parseGmailMessage(as(multipart))
    expect(m.fromName).toBe('Chen, Mei')
    expect(m.fromEmail).toBe('mchen.home@yahoo.com')
  })

  it('splits multiple To recipients and reads Cc', () => {
    const m = parseGmailMessage(as(multipart))
    expect(m.toEmails).toEqual([
      'board@madisonparkhoa.org',
      'manager@madisonparkhoa.org',
    ])
    expect(m.ccEmails).toEqual(['d.okafor@gmail.com'])
  })

  it('reads threading headers', () => {
    const m = parseGmailMessage(as(multipart))
    expect(m.inReplyTo).toBe('<parent-1@mail.gmail.com>')
    expect(m.references).toEqual([
      '<root@mail.gmail.com>',
      '<parent-1@mail.gmail.com>',
    ])
  })

  it('extracts a real attachment', () => {
    const m = parseGmailMessage(as(withAttachment))
    expect(m.attachments).toHaveLength(1)
    expect(m.attachments[0]).toEqual({
      gmailAttachmentId: 'ANGjdJ_attach_1',
      fileName: 'invoice-4417.pdf',
      contentType: 'application/pdf',
      sizeBytes: 284913,
      isInline: false,
    })
  })

  it('flags an inline image as inline', () => {
    const m = parseGmailMessage(as(inlineImage))
    expect(m.attachments).toHaveLength(1)
    expect(m.attachments[0].isInline).toBe(true)
    expect(m.attachments[0].fileName).toBe('logo.gif')
  })

  it('walks nested multipart trees for both body and attachments', () => {
    const m = parseGmailMessage(as(nested))
    expect(m.bodyText).toBe('Nested plain')
    expect(m.bodyHtml).toBe('<p>Nested HTML</p>')
    expect(m.attachments).toHaveLength(1)
    expect(m.attachments[0].fileName).toBe('opinion.pdf')
  })

  it('survives a message with no payload at all', () => {
    const m = parseGmailMessage(as({ id: 'x', threadId: 'y' }))
    expect(m.gmailMessageId).toBe('x')
    expect(m.bodyText).toBeNull()
    expect(m.attachments).toEqual([])
    expect(m.toEmails).toEqual([])
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
rtk pnpm test:unit
```
Expected: FAIL — `Failed to resolve import "./parse"`.

- [ ] **Step 4: Implement `packages/mailbox/src/parse.ts`**

```ts
/**
 * Gmail payload → ParsedMessage.
 *
 * messages.get?format=full returns an ALREADY-PARSED MIME tree: each part
 * carries a mimeType, headers, and either base64url body.data (inline
 * content) or body.attachmentId (fetch separately). So this is a tree
 * walk, not a MIME parser.
 *
 * Body selection: first text/plain wins for bodyText, first text/html for
 * bodyHtml. "First" is depth-first, which matches how mail clients order
 * multipart/alternative (simplest representation first).
 */

import type { ParsedAttachment, ParsedMessage } from './types'

export interface GmailHeader {
  name: string
  value: string
}

export interface GmailPart {
  partId?: string
  mimeType?: string
  filename?: string
  headers?: GmailHeader[]
  body?: { size?: number; data?: string; attachmentId?: string }
  parts?: GmailPart[]
}

export interface GmailApiMessage {
  id: string
  threadId: string
  labelIds?: string[]
  internalDate?: string
  payload?: GmailPart
}

export function decodeBase64Url(data: string): string {
  if (!data) return ''
  return Buffer.from(data, 'base64url').toString('utf8')
}

function header(headers: GmailHeader[] | undefined, name: string): string | null {
  const hit = headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())
  return hit?.value ?? null
}

/** All values for a header that may legitimately repeat (Delivered-To). */
function headerAll(headers: GmailHeader[] | undefined, name: string): string[] {
  return (headers ?? [])
    .filter((h) => h.name.toLowerCase() === name.toLowerCase())
    .map((h) => h.value)
}

/**
 * Split an address list on commas that are NOT inside double quotes.
 * `"Chen, Mei" <m@x.com>, other@y.com` must yield two addresses, not three.
 */
function splitAddressList(raw: string | null): string[] {
  if (!raw) return []
  const out: string[] = []
  let current = ''
  let inQuotes = false

  for (const ch of raw) {
    if (ch === '"') inQuotes = !inQuotes
    if (ch === ',' && !inQuotes) {
      out.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  out.push(current)

  return out.map((s) => s.trim()).filter((s) => s !== '')
}

export function parseAddress(raw: string): { email: string | null; name: string | null } {
  const trimmed = raw.trim()

  // "Display Name" <a@b.com>  |  Display Name <a@b.com>
  const angled = trimmed.match(/^(.*?)<([^>]+)>\s*$/)
  if (angled) {
    const name = angled[1].trim().replace(/^"(.*)"$/, '$1').trim()
    return { email: angled[2].trim().toLowerCase(), name: name === '' ? null : name }
  }

  // bare a@b.com
  if (trimmed.includes('@')) {
    return { email: trimmed.toLowerCase(), name: null }
  }
  return { email: null, name: trimmed === '' ? null : trimmed }
}

function addressEmails(raw: string | null): string[] {
  return splitAddressList(raw)
    .map((entry) => parseAddress(entry).email)
    .filter((e): e is string => e !== null)
}

function isInlinePart(part: GmailPart): boolean {
  const disposition = header(part.headers, 'Content-Disposition') ?? ''
  if (disposition.toLowerCase().startsWith('inline')) return true
  // Some senders omit Content-Disposition but set Content-ID for cid: refs.
  return header(part.headers, 'Content-ID') !== null
}

interface WalkState {
  bodyText: string | null
  bodyHtml: string | null
  attachments: ParsedAttachment[]
}

function walk(part: GmailPart | undefined, state: WalkState): void {
  if (!part) return

  const mime = (part.mimeType ?? '').toLowerCase()
  const hasFilename = Boolean(part.filename && part.filename !== '')

  if (part.parts && part.parts.length > 0) {
    for (const child of part.parts) walk(child, state)
    return
  }

  if (hasFilename || part.body?.attachmentId) {
    state.attachments.push({
      gmailAttachmentId: part.body?.attachmentId ?? null,
      fileName: part.filename && part.filename !== '' ? part.filename : '(unnamed)',
      contentType: part.mimeType ?? null,
      sizeBytes: part.body?.size ?? null,
      isInline: isInlinePart(part),
    })
    return
  }

  if (mime === 'text/plain' && state.bodyText === null && part.body?.data) {
    state.bodyText = decodeBase64Url(part.body.data)
    return
  }
  if (mime === 'text/html' && state.bodyHtml === null && part.body?.data) {
    state.bodyHtml = decodeBase64Url(part.body.data)
  }
}

export function parseGmailMessage(raw: GmailApiMessage): ParsedMessage {
  const headers = raw.payload?.headers
  const state: WalkState = { bodyText: null, bodyHtml: null, attachments: [] }
  walk(raw.payload, state)

  const from = parseAddress(header(headers, 'From') ?? '')

  const referencesRaw = header(headers, 'References') ?? ''
  const references = referencesRaw
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s !== '')

  const internal = raw.internalDate ? Number.parseInt(raw.internalDate, 10) : NaN

  return {
    gmailMessageId: raw.id,
    gmailThreadId: raw.threadId,
    rfc822MessageId: header(headers, 'Message-ID'),
    inReplyTo: header(headers, 'In-Reply-To'),
    references,

    fromEmail: from.email,
    fromName: from.name,
    toEmails: addressEmails(header(headers, 'To')),
    ccEmails: addressEmails(header(headers, 'Cc')),
    deliveredTo: headerAll(headers, 'Delivered-To').flatMap((v) => addressEmails(v)),

    subject: header(headers, 'Subject'),
    bodyText: state.bodyText,
    bodyHtml: state.bodyHtml,
    strippedText: null, // filled by stripQuotedReply — see Task 8

    attachments: state.attachments,
    sentAt: Number.isFinite(internal) ? new Date(internal).toISOString() : null,
    labelIds: raw.labelIds ?? [],
  }
}
```

- [ ] **Step 5: Allow JSON fixture imports**

In `packages/mailbox/tsconfig.json`, `resolveJsonModule` is already inherited from `tsconfig.base.json` — no change needed. Verify with the typecheck in Step 7.

- [ ] **Step 6: Run the tests**

```bash
rtk pnpm test:unit
```
Expected: PASS — 11 parse tests.

- [ ] **Step 7: Export and typecheck**

Add to `packages/mailbox/src/index.ts`:

```ts
export { parseGmailMessage, parseAddress, decodeBase64Url } from './parse'
export type { GmailApiMessage, GmailPart, GmailHeader } from './parse'
```

```bash
rtk pnpm typecheck
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
rtk git add packages/mailbox/ && rtk git commit -m "feat(mailbox): parse Gmail payload trees into ParsedMessage"
```

---

## Task 8: Quoted-reply stripping

`stripped_text` is what Phase B's model reads. Without it, the fifth reply in a thread carries four copies of the conversation, which wastes context and biases drafts toward restating history.

**Files:**
- Create: `packages/mailbox/src/quote.ts`, `src/quote.test.ts`
- Modify: `packages/mailbox/src/parse.ts` (populate `strippedText`), `src/index.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `stripQuotedReply(bodyText: string | null): string | null`

- [ ] **Step 1: Write the failing test**

Create `packages/mailbox/src/quote.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { stripQuotedReply } from './quote'

describe('stripQuotedReply', () => {
  it('returns text with no quoting unchanged', () => {
    expect(stripQuotedReply('Just a question about the pool.')).toBe(
      'Just a question about the pool.',
    )
  })

  it('strips the Gmail "On <date> <person> wrote:" attribution and everything after', () => {
    const body = [
      'The gate still is not working.',
      '',
      'On Mon, Jul 27, 2026 at 9:14 AM Madison Park HOA <board@mp.org> wrote:',
      '> Your new code is 4417.',
      '> Thanks',
    ].join('\n')
    expect(stripQuotedReply(body)).toBe('The gate still is not working.')
  })

  it('strips an Outlook "-----Original Message-----" block', () => {
    const body = [
      'Approved, go ahead.',
      '',
      '-----Original Message-----',
      'From: board@mp.org',
      'Sent: Monday, July 27, 2026',
      'Subject: Fence stain',
    ].join('\n')
    expect(stripQuotedReply(body)).toBe('Approved, go ahead.')
  })

  it('strips an Outlook "From:" header block', () => {
    const body = [
      'See below.',
      '',
      'From: Madison Park HOA <board@mp.org>',
      'Sent: Monday, July 27, 2026 9:14 AM',
      'To: Jenna Rivera',
      'Subject: Re: Pool gate',
      '',
      'Your new code is 4417.',
    ].join('\n')
    expect(stripQuotedReply(body)).toBe('See below.')
  })

  it('strips an Apple Mail attribution', () => {
    const body = [
      'Sounds good.',
      '',
      'On Jul 27, 2026, at 9:14 AM, Madison Park HOA <board@mp.org> wrote:',
      '',
      '> Original content',
    ].join('\n')
    expect(stripQuotedReply(body)).toBe('Sounds good.')
  })

  it('strips a leading run of ">" quoted lines when the reply is bottom-posted', () => {
    const body = ['> Your new code is 4417.', '> Thanks', '', 'That worked, thank you!'].join(
      '\n',
    )
    expect(stripQuotedReply(body)).toBe('That worked, thank you!')
  })

  it('strips a forwarded-message marker', () => {
    const body = ['FYI', '', '---------- Forwarded message ---------', 'From: x@y.com'].join(
      '\n',
    )
    expect(stripQuotedReply(body)).toBe('FYI')
  })

  it('trims trailing blank lines', () => {
    expect(stripQuotedReply('Hello.\n\n\n')).toBe('Hello.')
  })

  it('does NOT strip a line that merely contains the word wrote', () => {
    const body = 'I wrote to the vendor last week and never heard back.'
    expect(stripQuotedReply(body)).toBe(body)
  })

  it('strips a Gmail attribution wrapped across two lines', () => {
    const body = [
      'The gate still is not working.',
      '',
      'On Mon, Jul 27, 2026 at 9:14 AM Madison Park HOA',
      '<board@mp.org> wrote:',
      '> Your new code is 4417.',
    ].join('\n')
    expect(stripQuotedReply(body)).toBe('The gate still is not working.')
  })

  it('strips a Gmail attribution wrapped across three lines', () => {
    const body = [
      'The gate still is not working.',
      '',
      'On Mon, Jul 27, 2026 at 9:14 AM Madison Park HOA',
      '<board@mp.org>',
      'wrote:',
      '> Your new code is 4417.',
    ].join('\n')
    expect(stripQuotedReply(body)).toBe('The gate still is not working.')
  })

  it('does NOT strip "On arrival at the gate, the code failed." (contains "at" but no wrapped "wrote:")', () => {
    const body = [
      'On arrival at the gate, the code failed.',
      'Can someone reset it today?',
    ].join('\n')
    expect(stripQuotedReply(body)).toBe(body)
  })

  it('does NOT strip "On Saturdays at the pool..." (contains "at" but no wrapped "wrote:")', () => {
    const body = [
      'On Saturdays at the pool we usually see kids swimming late.',
      'Is that against the posted hours?',
    ].join('\n')
    expect(stripQuotedReply(body)).toBe(body)
  })

  it('does NOT strip "On the topic at hand..." (contains "at" but no wrapped "wrote:")', () => {
    const body = [
      'On the topic at hand, I think we should approve it.',
      'Let me know if you need anything else from me.',
    ].join('\n')
    expect(stripQuotedReply(body)).toBe(body)
  })

  it('does NOT strip a line starting with "On " when no "wrote:" appears nearby', () => {
    const body = [
      'On second thought, let’s hold off on the fence stain until fall.',
      'The forecast looks wet this week.',
    ].join('\n')
    expect(stripQuotedReply(body)).toBe(body)
  })

  it('returns the original text when stripping would leave nothing', () => {
    // A pure top-quote with no new content — better to keep something
    // than to hand downstream an empty string.
    const body = ['> only quoted content', '> nothing new'].join('\n')
    expect(stripQuotedReply(body)).toBe(body)
  })

  it('passes null through', () => {
    expect(stripQuotedReply(null)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
rtk pnpm test:unit
```
Expected: FAIL — `Failed to resolve import "./quote"`.

- [ ] **Step 3: Implement `packages/mailbox/src/quote.ts`**

```ts
/**
 * Strip quoted history from a plain-text email body.
 *
 * This is heuristic by nature — email has no reliable machine-readable
 * boundary between new content and quoted history. The rules below cover
 * Gmail, Outlook, and Apple Mail, which is effectively all HOA
 * correspondence.
 *
 * Bias: UNDER-strip rather than over-strip. Losing the resident's actual
 * question is far worse than carrying an extra quoted paragraph, so
 * anything ambiguous is left alone, and a strip that would empty the body
 * is discarded entirely.
 */

/** Markers whose appearance means "everything from here down is history". */
const CUT_PATTERNS: RegExp[] = [
  // Gmail / Apple Mail: "On <date>, <person> wrote:" — possibly wrapped
  // across lines, so we anchor on a line STARTING with "On " and ending
  // with "wrote:".
  /^On .*wrote:\s*$/i,
  // Outlook
  /^-{2,}\s*Original Message\s*-{2,}\s*$/i,
  /^_{5,}\s*$/,
  // Forwarded
  /^-{2,}\s*Forwarded message\s*-{2,}\s*$/i,
  // Outlook header block — "From:" immediately followed by Sent/To/Subject
  /^From:\s*.+$/i,
]

/** Lines that only continue an Outlook header block. */
const HEADER_BLOCK = /^(Sent|To|Cc|Subject|Date):\s*/i

/**
 * Gmail sometimes wraps a long "On <date>, <person> wrote:" attribution
 * across two or three lines, splitting mid-sentence (often right before
 * the sender name or "wrote:" itself). The single-line form is already
 * matched directly by CUT_PATTERNS above; this checks whether joining the
 * current line with the next one or two lines completes the same
 * "wrote:" terminator.
 *
 * We deliberately key on the literal "wrote:" terminator rather than on
 * an incidental word like "at" — "at" shows up constantly in ordinary
 * prose ("On arrival at the gate...", "On Saturdays at the pool...", "On
 * the topic at hand...") and matching on it would cut a resident's
 * message at its very first line. "wrote:" is the actual, reliable
 * signal that this is an attribution line, wrapped or not.
 */
function isWrappedOnWroteAttribution(lines: string[], i: number): boolean {
  if (!/^On /i.test(lines[i].trim())) return false
  for (let span = 2; span <= 3; span++) {
    const joined = lines
      .slice(i, i + span)
      .map((l) => l.trim())
      .join(' ')
    if (/^On .*wrote:\s*$/i.test(joined)) return true
  }
  return false
}

function isQuoted(line: string): boolean {
  return line.trimStart().startsWith('>')
}

export function stripQuotedReply(bodyText: string | null): string | null {
  if (bodyText === null) return null

  const lines = bodyText.split(/\r?\n/)

  // ── bottom-posted: drop a LEADING run of quoted lines ─────────────
  let start = 0
  while (start < lines.length && (isQuoted(lines[start]) || lines[start].trim() === '')) {
    start++
  }
  // Only honour this if actual quoted lines were skipped AND content follows.
  const skippedQuoted = lines.slice(0, start).some(isQuoted)
  const working = skippedQuoted && start < lines.length ? lines.slice(start) : lines

  // ── find the first cut marker ─────────────────────────────────────
  let cut = working.length

  for (let i = 0; i < working.length; i++) {
    const line = working[i].trim()
    if (line === '') continue

    // A "From:" line only starts a quote block if a header line follows
    // within the next two lines — otherwise it is ordinary prose.
    if (/^From:\s*.+$/i.test(line)) {
      const lookahead = working.slice(i + 1, i + 3)
      if (lookahead.some((l) => HEADER_BLOCK.test(l.trim()))) {
        cut = i
        break
      }
      continue
    }

    if (CUT_PATTERNS.some((re) => re.test(line))) {
      cut = i
      break
    }

    // Wrapped "On ... wrote:" attribution spanning the next 1-2 lines.
    if (isWrappedOnWroteAttribution(working, i)) {
      cut = i
      break
    }

    // A quoted line with no preceding marker also ends the new content.
    if (isQuoted(working[i])) {
      cut = i
      break
    }
  }

  const kept = working.slice(0, cut).join('\n').replace(/\s+$/, '')

  // Never hand downstream an empty body — if stripping removed
  // everything, the heuristic was wrong for this message.
  return kept.trim() === '' ? bodyText.replace(/\s+$/, '') : kept
}
```

**Why key on `wrote:` and not `at`:** an earlier version of this file matched wrapped Gmail attributions with `/^On .*\bat\b.*$/i` on the theory that "On <date> **at** <time>" always precedes the wrap point. That pattern matches ANY line starting with "On " that contains the standalone word "at" — including ordinary resident prose like "On arrival at the gate, the code failed.", "On Saturdays at the pool we usually see kids swimming late.", and "On the topic at hand, I think we should approve it." Each of those would have been truncated at its first line, which violates this module's core bias: under-strip rather than over-strip. The fix above keys on the literal `wrote:` terminator — the one token that reliably identifies an attribution line, wrapped or not — by joining the current line with the next one or two lines and testing the same `/^On .*wrote:\s*$/i` pattern used for the single-line case.

- [ ] **Step 4: Run the tests**

```bash
rtk pnpm test:unit
```
Expected: PASS — 17 quote tests (11 original + 6 added to cover wrapped-attribution cutting and the "On ... at ..." false positives above).

- [ ] **Step 5: Populate `strippedText` in the parser**

In `packages/mailbox/src/parse.ts`, add the import at the top:

```ts
import { stripQuotedReply } from './quote'
```

Then in `parseGmailMessage`, replace this line:

```ts
    strippedText: null, // filled by stripQuotedReply — see Task 8
```

with:

```ts
    strippedText: stripQuotedReply(state.bodyText),
```

- [ ] **Step 6: Add a parser test for the wiring**

Append to `packages/mailbox/src/parse.test.ts` inside the `parseGmailMessage` describe block:

```ts
  it('populates strippedText from bodyText', () => {
    const m = parseGmailMessage(as(simple))
    expect(m.strippedText).toBe(m.bodyText)
  })

  it('leaves strippedText null when there is no text body', () => {
    const m = parseGmailMessage(as({ id: 'x', threadId: 'y' }))
    expect(m.strippedText).toBeNull()
  })
```

- [ ] **Step 7: Export, test, typecheck**

Add to `packages/mailbox/src/index.ts`:

```ts
export { stripQuotedReply } from './quote'
```

```bash
rtk pnpm test:unit && rtk pnpm typecheck
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
rtk git add packages/mailbox/ && rtk git commit -m "feat(mailbox): strip quoted history into strippedText"
```

---

## Task 9: Google OAuth

**Files:**
- Create: `packages/mailbox/src/oauth.ts`, `src/oauth.test.ts`
- Modify: `packages/mailbox/src/index.ts`

**Interfaces:**
- Consumes: `OAuthTokens`, `MailboxAuthError` (Task 6)
- Produces:
  ```ts
  buildConsentUrl(opts: { state: string; loginHint?: string }): string
  exchangeCode(code: string): Promise<OAuthTokens>
  refreshAccessToken(refreshToken: string): Promise<OAuthTokens>
  GMAIL_SCOPES: readonly string[]
  ```

- [ ] **Step 1: Write the failing test**

Create `packages/mailbox/src/oauth.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildConsentUrl, exchangeCode, GMAIL_SCOPES, refreshAccessToken } from './oauth'
import { MailboxAuthError } from './types'

beforeEach(() => {
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id'
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-secret'
  process.env.GOOGLE_OAUTH_REDIRECT_URI = 'https://app.test/api/oauth/google/callback'
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('buildConsentUrl', () => {
  it('requests offline access with forced consent', () => {
    const url = new URL(buildConsentUrl({ state: 'abc123' }))
    expect(url.origin + url.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    )
    expect(url.searchParams.get('client_id')).toBe('test-client-id')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('state')).toBe('abc123')
    // offline + consent is what guarantees a refresh_token comes back.
    // Without prompt=consent, Google omits it on re-authorization and the
    // mailbox silently stops syncing when the access token expires.
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
  })

  it('requests exactly the scopes we need and no more', () => {
    const url = new URL(buildConsentUrl({ state: 's' }))
    const requested = (url.searchParams.get('scope') ?? '').split(' ')
    expect(requested).toContain('https://www.googleapis.com/auth/gmail.readonly')
    expect(requested).toContain('https://www.googleapis.com/auth/gmail.send')
    expect(requested).toContain('https://www.googleapis.com/auth/gmail.settings.basic')
    expect(requested).toContain('openid')
    expect(requested).toContain('email')
    expect(GMAIL_SCOPES).not.toContain('https://mail.google.com/')
    expect(requested).not.toContain('https://mail.google.com/')
  })

  it('passes login_hint when given', () => {
    const url = new URL(buildConsentUrl({ state: 's', loginHint: 'board@mp.org' }))
    expect(url.searchParams.get('login_hint')).toBe('board@mp.org')
  })

  it('throws when the client id is missing', () => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID
    expect(() => buildConsentUrl({ state: 's' })).toThrow(/GOOGLE_OAUTH_CLIENT_ID/)
  })
})

describe('exchangeCode', () => {
  it('returns tokens and an absolute expiry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            access_token: 'at-1',
            refresh_token: 'rt-1',
            expires_in: 3599,
            scope: GMAIL_SCOPES.join(' '),
          }),
          { status: 200 },
        ),
      ),
    )

    const before = Date.now()
    const tokens = await exchangeCode('auth-code')

    expect(tokens.accessToken).toBe('at-1')
    expect(tokens.refreshToken).toBe('rt-1')
    expect(new Date(tokens.expiresAt).getTime()).toBeGreaterThan(before)
  })

  it('throws MailboxAuthError on a rejected code', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }),
      ),
    )
    await expect(exchangeCode('bad')).rejects.toBeInstanceOf(MailboxAuthError)
  })
})

// Error classification matters beyond "does it throw": MailboxAuthError is
// a signal the sync job uses to STOP retrying and mark the mailbox
// auth_failed, demanding the HOA reconnect. A transient failure (a Google
// outage, a bad gateway) must come back as a generic Error, or a blip
// becomes a support ticket. Exercised via exchangeCode since postToken
// itself isn't exported.
describe('postToken error classification', () => {
  it('does NOT classify a 500 as MailboxAuthError, and the message contains the status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))
    const err: unknown = await exchangeCode('code').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(MailboxAuthError)
    expect((err as Error).message).toContain('500')
  })

  it('does NOT classify a 503 as MailboxAuthError, and the message contains the status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
    const err: unknown = await exchangeCode('code').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(MailboxAuthError)
    expect((err as Error).message).toContain('503')
  })

  it('classifies a 400 invalid_grant as MailboxAuthError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }),
      ),
    )
    await expect(exchangeCode('code')).rejects.toBeInstanceOf(MailboxAuthError)
  })

  it('classifies a 401 carrying an OAuth error field as MailboxAuthError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'invalid_client' }), { status: 401 }),
      ),
    )
    await expect(exchangeCode('code')).rejects.toBeInstanceOf(MailboxAuthError)
  })

  it('does NOT classify a 429 as MailboxAuthError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'rate_limited' }), { status: 429 })),
    )
    const err: unknown = await exchangeCode('code').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(MailboxAuthError)
  })

  it('wraps a non-JSON error body as a generic Error mentioning the status, not a raw SyntaxError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>502 Bad Gateway</html>', { status: 502 })),
    )
    const err: unknown = await exchangeCode('code').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(MailboxAuthError)
    expect(err).not.toBeInstanceOf(SyntaxError)
    expect((err as Error).message).toContain('502')
  })

  it('treats a 200 with no access_token and no error as a generic Error, not MailboxAuthError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })))
    const err: unknown = await exchangeCode('code').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(MailboxAuthError)
  })
})

describe('refreshAccessToken', () => {
  it('preserves the original refresh token when Google omits it', async () => {
    // Google does NOT return refresh_token on a refresh call. Dropping it
    // would erase our only long-lived credential.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ access_token: 'at-2', expires_in: 3599, scope: 's' }),
          { status: 200 },
        ),
      ),
    )
    const tokens = await refreshAccessToken('rt-original')
    expect(tokens.accessToken).toBe('at-2')
    expect(tokens.refreshToken).toBe('rt-original')
  })

  it('throws MailboxAuthError when the refresh token is revoked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }),
      ),
    )
    await expect(refreshAccessToken('revoked')).rejects.toBeInstanceOf(MailboxAuthError)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
rtk pnpm test:unit
```
Expected: FAIL — `Failed to resolve import "./oauth"`.

- [ ] **Step 3: Implement `packages/mailbox/src/oauth.ts`**

```ts
/**
 * Google OAuth 2.0 for Gmail, over plain fetch.
 *
 * Scope choice matters for Google's verification review: gmail.readonly +
 * gmail.send are both RESTRICTED scopes requiring a security assessment,
 * but they are far narrower than https://mail.google.com/ (full mailbox
 * control including delete). Requesting the minimum is both correct and
 * materially easier to get approved.
 *
 * gmail.send is requested in Phase A even though sending ships in Phase B,
 * because widening scopes later forces every connected HOA back through
 * the consent screen.
 */

import { MailboxAuthError, type OAuthTokens } from './types'

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.settings.basic', // users.settings.sendAs
  'openid',
  'email',
] as const

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set.`)
  return value
}

export function buildConsentUrl(opts: { state: string; loginHint?: string }): string {
  const params = new URLSearchParams({
    client_id: requireEnv('GOOGLE_OAUTH_CLIENT_ID'),
    redirect_uri: requireEnv('GOOGLE_OAUTH_REDIRECT_URI'),
    response_type: 'code',
    scope: GMAIL_SCOPES.join(' '),
    state: opts.state,
    // offline + consent guarantee a refresh_token. Without prompt=consent
    // Google omits it on re-authorization, and the mailbox silently stops
    // syncing about an hour later when the access token expires.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  })
  if (opts.loginHint) params.set('login_hint', opts.loginHint)

  return `${AUTH_ENDPOINT}?${params.toString()}`
}

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  error?: string
  error_description?: string
}

// MailboxAuthError is not just an error type — the sync job treats it as
// "credentials are dead": it STOPS retrying, marks the mailbox
// auth_failed, and surfaces a reconnect prompt to the HOA. A generic Error
// means "transient, retry later." Throwing MailboxAuthError for a 500/503
// during a passing Google outage would permanently disconnect the mailbox
// over a blip, so classification has to be based on what the response
// actually indicates, not merely "was it a non-2xx".
//
// Google error codes on the token endpoint that mean the grant itself is
// dead — retrying will never succeed and the HOA must re-authorize. Only
// these warrant MailboxAuthError.
//
// Deliberately excluded: invalid_request. RFC 6749 §5.2 defines it as
// "the request is missing a required parameter, includes an invalid
// parameter value, includes a parameter more than once, or is otherwise
// malformed." That is a bug in OUR request construction, not a dead grant.
// If it fires, it fires deterministically on every attempt (same code sends
// same request). Classifying it as MailboxAuthError tells the HOA to
// reconnect Gmail — which rebuilds the identical malformed request and
// reproduces the identical error. That creates an unresolvable support loop.
const CREDENTIAL_REJECTION_ERRORS = new Set([
  'invalid_grant',
  'invalid_client',
  'unauthorized_client',
])

async function postToken(body: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  let json: TokenResponse
  try {
    json = (await response.json()) as TokenResponse
  } catch {
    // An HTML error page or gateway-timeout body from oauth2.googleapis.com
    // is plausible under load. A malformed body is not proof of a dead
    // credential, so this stays a generic Error (with the status attached)
    // instead of an opaque SyntaxError or a MailboxAuthError.
    throw new Error(`Token endpoint returned a non-JSON response (status ${response.status}).`)
  }

  if (
    json.error &&
    (response.status === 400 || response.status === 401) &&
    CREDENTIAL_REJECTION_ERRORS.has(json.error)
  ) {
    throw new MailboxAuthError(json.error_description ?? json.error)
  }

  if (!response.ok) {
    // 5xx, 429, and other 4xx without a credential-rejection code are
    // transient or unexpected — may succeed on retry — so this is a
    // generic Error, not MailboxAuthError. The status is included so a
    // failure is diagnosable.
    const detail = json.error ? `: ${json.error_description ?? json.error}` : ''
    throw new Error(`Token request failed (${response.status})${detail}.`)
  }
  if (!json.access_token) {
    // A 200 with no access_token and no error is an unexpected API
    // response, not proof of a revoked grant.
    throw new Error(`Token response missing access_token (status ${response.status}).`)
  }
  return json
}

function toTokens(json: TokenResponse, fallbackRefresh: string | null): OAuthTokens {
  const expiresInSec = json.expires_in ?? 3600
  return {
    accessToken: json.access_token as string,
    refreshToken: json.refresh_token ?? fallbackRefresh,
    expiresAt: new Date(Date.now() + expiresInSec * 1000).toISOString(),
    scope: json.scope ?? '',
  }
}

export async function exchangeCode(code: string): Promise<OAuthTokens> {
  const json = await postToken(
    new URLSearchParams({
      code,
      client_id: requireEnv('GOOGLE_OAUTH_CLIENT_ID'),
      client_secret: requireEnv('GOOGLE_OAUTH_CLIENT_SECRET'),
      redirect_uri: requireEnv('GOOGLE_OAUTH_REDIRECT_URI'),
      grant_type: 'authorization_code',
    }),
  )
  return toTokens(json, null)
}

export async function refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
  const json = await postToken(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: requireEnv('GOOGLE_OAUTH_CLIENT_ID'),
      client_secret: requireEnv('GOOGLE_OAUTH_CLIENT_SECRET'),
      grant_type: 'refresh_token',
    }),
  )
  // Google omits refresh_token on refresh — carry the original forward or
  // we lose the only long-lived credential we have.
  return toTokens(json, refreshToken)
}
```

- [ ] **Step 4: Run the tests**

```bash
rtk pnpm test:unit
```
Expected: PASS — 15 oauth tests (includes explicit error-classification
coverage for 5xx/429/malformed-JSON/malformed-200 vs. genuine
credential-rejection cases; see prose note above `postToken`).

- [ ] **Step 5: Export and typecheck**

Add to `packages/mailbox/src/index.ts`:

```ts
export {
  buildConsentUrl,
  exchangeCode,
  refreshAccessToken,
  GMAIL_SCOPES,
} from './oauth'
```

```bash
rtk pnpm typecheck
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add packages/mailbox/ && rtk git commit -m "feat(mailbox): Google OAuth consent, code exchange, token refresh"
```

---

## Task 10: Gmail REST client

**Files:**
- Create: `packages/mailbox/src/client.ts`, `src/client.test.ts`
- Modify: `packages/mailbox/src/index.ts`

**Interfaces:**
- Consumes: `MailboxAuthError`, `MailboxHistoryExpiredError` (Task 6); `GmailApiMessage` (Task 7)
- Produces:
  ```ts
  class GmailClient {
    constructor(accessToken: string)
    getProfile(): Promise<{ emailAddress: string; historyId: string }>
    listSendAs(): Promise<Array<{ sendAsEmail: string; isPrimary: boolean; isDefault: boolean }>>
    listLabels(): Promise<Array<{ id: string; name: string; type: string }>>
    listHistory(startHistoryId: string, pageToken?: string): Promise<{ messageIds: string[]; nextPageToken: string | null; historyId: string | null }>
    listMessages(query: string, pageToken?: string): Promise<{ messageIds: string[]; nextPageToken: string | null }>
    getMessage(id: string): Promise<GmailApiMessage>
    getAttachment(messageId: string, attachmentId: string): Promise<Buffer>
  }
  ```

- [ ] **Step 1: Write the failing test**

Create `packages/mailbox/src/client.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GmailClient } from './client'
import { MailboxAuthError, MailboxHistoryExpiredError } from './types'

afterEach(() => vi.unstubAllGlobals())

function stubJson(payload: unknown, status = 200): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => new Response(JSON.stringify(payload), { status }))
  vi.stubGlobal('fetch', fn)
  return fn
}

describe('GmailClient', () => {
  it('sends the bearer token', async () => {
    const fetchMock = stubJson({ emailAddress: 'board@mp.org', historyId: '900' })
    await new GmailClient('at-1').getProfile()

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer at-1')
  })

  it('throws MailboxAuthError on 401', async () => {
    stubJson({ error: { message: 'Invalid Credentials' } }, 401)
    await expect(new GmailClient('bad').getProfile()).rejects.toBeInstanceOf(
      MailboxAuthError,
    )
  })

  it('throws MailboxHistoryExpiredError on a 404 from listHistory', async () => {
    stubJson({ error: { message: 'Requested entity was not found.' } }, 404)
    await expect(new GmailClient('at').listHistory('123')).rejects.toBeInstanceOf(
      MailboxHistoryExpiredError,
    )
  })

  it('flattens messagesAdded into a deduped id list', async () => {
    stubJson({
      history: [
        { messagesAdded: [{ message: { id: 'm1' } }, { message: { id: 'm2' } }] },
        { messagesAdded: [{ message: { id: 'm2' } }, { message: { id: 'm3' } }] },
        { labelsRemoved: [{ message: { id: 'm9' } }] },
      ],
      historyId: '950',
      nextPageToken: 'tok',
    })

    const result = await new GmailClient('at').listHistory('900')
    // m9 only had a label change — not a new message.
    expect(result.messageIds).toEqual(['m1', 'm2', 'm3'])
    expect(result.nextPageToken).toBe('tok')
    expect(result.historyId).toBe('950')
  })

  it('returns an empty list when history has no entries', async () => {
    stubJson({ historyId: '900' })
    const result = await new GmailClient('at').listHistory('900')
    expect(result.messageIds).toEqual([])
    expect(result.nextPageToken).toBeNull()
  })

  it('passes the search query to listMessages', async () => {
    const fetchMock = stubJson({ messages: [{ id: 'm1' }], nextPageToken: null })
    await new GmailClient('at').listMessages('after:2025/07/31')

    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toContain('q=after%3A2025%2F07%2F31')
  })

  it('decodes attachment bytes from base64url', async () => {
    const original = Buffer.from('PDF-BYTES')
    stubJson({ data: original.toString('base64url'), size: original.length })

    const bytes = await new GmailClient('at').getAttachment('m1', 'a1')
    expect(bytes.toString('utf8')).toBe('PDF-BYTES')
  })

  it('surfaces the Google error message on a non-retryable failure', async () => {
    stubJson({ error: { message: 'Insufficient Permission' } }, 403)
    await expect(new GmailClient('at').getProfile()).rejects.toThrow(
      /Insufficient Permission/,
    )
  })

  it('retries a 429 and succeeds when the limit clears', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Rate Limit' } }), { status: 429 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ emailAddress: 'board@mp.org', historyId: '900' }), {
          status: 200,
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const profile = await new GmailClient('at').getProfile()
    expect(profile.emailAddress).toBe('board@mp.org')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does NOT retry a 401 — dead credentials must fail fast', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message: 'Invalid Credentials' } }), {
          status: 401,
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(new GmailClient('bad').getProfile()).rejects.toBeInstanceOf(
      MailboxAuthError,
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
rtk pnpm test:unit
```
Expected: FAIL — `Failed to resolve import "./client"`.

- [ ] **Step 3: Implement `packages/mailbox/src/client.ts`**

```ts
/**
 * Gmail REST client over plain fetch.
 *
 * No googleapis SDK — it is a very large dependency for the six endpoints
 * we use, and the codebase already set this precedent in
 * apps/hoa/src/lib/community-qa/agent.ts.
 *
 * Error mapping is the important part:
 *   401           → MailboxAuthError            (credentials dead; stop, don't retry)
 *   404 + history → MailboxHistoryExpiredError  (fall back to a dated re-sync)
 *   everything else → Error with Google's message intact
 */

import type { GmailApiMessage } from './parse'
import { MailboxAuthError, MailboxHistoryExpiredError } from './types'

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'
const MAX_RETRIES = 3
const BASE_BACKOFF_MS = 500

interface GoogleError {
  error?: { message?: string; status?: string }
}

export class GmailClient {
  constructor(private readonly accessToken: string) {}

  private async request<T>(path: string, isHistory = false): Promise<T> {
    let lastMessage = 'Gmail request failed'

    // Gmail rate-limits per user (429) and occasionally 5xxs. Retry those
    // with exponential backoff + jitter; never retry 401 (credentials are
    // dead) or 404-on-history (the caller has a real fallback path).
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetch(`${BASE}${path}`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: 'application/json',
        },
      })

      if (response.ok) return (await response.json()) as T

      const body = (await response.json().catch(() => ({}))) as GoogleError
      lastMessage = body.error?.message ?? `Gmail request failed (${response.status})`

      if (response.status === 401) throw new MailboxAuthError(lastMessage)
      if (response.status === 404 && isHistory) {
        // Gmail drops history after ~7 days. The caller must re-sync by date.
        throw new MailboxHistoryExpiredError(lastMessage)
      }

      const retryable = response.status === 429 || response.status >= 500
      if (!retryable || attempt === MAX_RETRIES) throw new Error(lastMessage)

      // Jitter matters: without it, a batch of parallel calls that all hit
      // the limit retry in lockstep and hit it again together.
      const backoffMs = BASE_BACKOFF_MS * 2 ** attempt
      const jitterMs = Math.floor(Math.random() * BASE_BACKOFF_MS)
      await new Promise((resolve) => setTimeout(resolve, backoffMs + jitterMs))
    }

    throw new Error(lastMessage)
  }

  async getProfile(): Promise<{ emailAddress: string; historyId: string }> {
    return this.request<{ emailAddress: string; historyId: string }>('/profile')
  }

  async listSendAs(): Promise<
    Array<{ sendAsEmail: string; isPrimary: boolean; isDefault: boolean }>
  > {
    const json = await this.request<{
      sendAs?: Array<{ sendAsEmail: string; isPrimary?: boolean; isDefault?: boolean }>
    }>('/settings/sendAs')

    return (json.sendAs ?? []).map((s) => ({
      sendAsEmail: s.sendAsEmail,
      isPrimary: s.isPrimary === true,
      isDefault: s.isDefault === true,
    }))
  }

  async listLabels(): Promise<Array<{ id: string; name: string; type: string }>> {
    const json = await this.request<{
      labels?: Array<{ id: string; name: string; type?: string }>
    }>('/labels')

    return (json.labels ?? []).map((l) => ({
      id: l.id,
      name: l.name,
      type: l.type ?? 'user',
    }))
  }

  async listHistory(
    startHistoryId: string,
    pageToken?: string,
  ): Promise<{ messageIds: string[]; nextPageToken: string | null; historyId: string | null }> {
    const params = new URLSearchParams({
      startHistoryId,
      historyTypes: 'messageAdded',
    })
    if (pageToken) params.set('pageToken', pageToken)

    const json = await this.request<{
      history?: Array<{ messagesAdded?: Array<{ message?: { id?: string } }> }>
      nextPageToken?: string
      historyId?: string
    }>(`/history?${params.toString()}`, true)

    // Only messagesAdded counts. Label changes and deletions also appear in
    // the history stream and must not be treated as new mail.
    const ids = new Set<string>()
    for (const entry of json.history ?? []) {
      for (const added of entry.messagesAdded ?? []) {
        if (added.message?.id) ids.add(added.message.id)
      }
    }

    return {
      messageIds: [...ids],
      nextPageToken: json.nextPageToken ?? null,
      historyId: json.historyId ?? null,
    }
  }

  async listMessages(
    query: string,
    pageToken?: string,
  ): Promise<{ messageIds: string[]; nextPageToken: string | null }> {
    const params = new URLSearchParams({ q: query, maxResults: '100' })
    if (pageToken) params.set('pageToken', pageToken)

    const json = await this.request<{
      messages?: Array<{ id: string }>
      nextPageToken?: string
    }>(`/messages?${params.toString()}`)

    return {
      messageIds: (json.messages ?? []).map((m) => m.id),
      nextPageToken: json.nextPageToken ?? null,
    }
  }

  async getMessage(id: string): Promise<GmailApiMessage> {
    return this.request<GmailApiMessage>(`/messages/${id}?format=full`)
  }

  async getAttachment(messageId: string, attachmentId: string): Promise<Buffer> {
    const json = await this.request<{ data?: string; size?: number }>(
      `/messages/${messageId}/attachments/${attachmentId}`,
    )
    return Buffer.from(json.data ?? '', 'base64url')
  }
}
```

- [ ] **Step 4: Run the tests**

```bash
rtk pnpm test:unit
```
Expected: PASS — 10 client tests. The retry test takes ~1 second because of the real backoff sleep; that is expected, not a hang.

- [ ] **Step 5: Export and commit**

Add to `packages/mailbox/src/index.ts`:

```ts
export { GmailClient } from './client'
```

```bash
rtk pnpm test:unit && rtk pnpm typecheck && rtk git add packages/mailbox/ && rtk git commit -m "feat(mailbox): Gmail REST client with typed error mapping"
```

---

## Task 11: Scope filtering

The privacy control. A message outside scope is discarded inside `packages/mailbox` and never reaches the database — never written-then-filtered.

**Files:**
- Create: `packages/mailbox/src/scope.ts`, `src/scope.test.ts`
- Modify: `packages/mailbox/src/index.ts`

**Interfaces:**
- Consumes: `ParsedMessage`, `ScopeMode` (Task 6)
- Produces:
  ```ts
  isInScope(message: ParsedMessage, scopeMode: ScopeMode, scopeValue: string | null): boolean
  buildScopeQuery(scopeMode: ScopeMode, scopeValue: string | null, afterDate?: string): string
  recommendScope(sendAs, profileEmail): { scopeMode: ScopeMode; scopeValue: string | null }
  ```

- [ ] **Step 1: Write the failing test**

Create `packages/mailbox/src/scope.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildScopeQuery, isInScope, recommendScope } from './scope'
import type { ParsedMessage, ScopeMode } from './types'

function msg(over: Partial<ParsedMessage> = {}): ParsedMessage {
  return {
    gmailMessageId: 'm1',
    gmailThreadId: 't1',
    rfc822MessageId: null,
    inReplyTo: null,
    references: [],
    fromEmail: 'j.rivera@gmail.com',
    fromName: 'Jenna',
    toEmails: ['board@mp.org'],
    ccEmails: [],
    deliveredTo: [],
    subject: 'hi',
    bodyText: 'hi',
    bodyHtml: null,
    strippedText: 'hi',
    attachments: [],
    sentAt: null,
    labelIds: ['INBOX'],
    ...over,
  }
}

describe('isInScope', () => {
  it('mode=all keeps everything', () => {
    expect(isInScope(msg({ toEmails: ['someone@else.com'] }), 'all', null)).toBe(true)
  })

  it('mode=address keeps mail addressed To the scoped address', () => {
    expect(isInScope(msg({ toEmails: ['board@mp.org'] }), 'address', 'board@mp.org')).toBe(
      true,
    )
  })

  it('mode=address keeps mail Cc-ed to the scoped address', () => {
    expect(
      isInScope(
        msg({ toEmails: ['other@x.com'], ccEmails: ['board@mp.org'] }),
        'address',
        'board@mp.org',
      ),
    ).toBe(true)
  })

  it('mode=address keeps mail routed via Delivered-To (Google Group fan-out)', () => {
    // The critical case: a Group delivers to a personal inbox, so the
    // group address appears ONLY in Delivered-To, never in To.
    expect(
      isInScope(
        msg({ toEmails: ['president.personal@gmail.com'], deliveredTo: ['board@mp.org'] }),
        'address',
        'board@mp.org',
      ),
    ).toBe(true)
  })

  it('mode=address REJECTS unrelated personal mail', () => {
    // The whole point: a connected personal Gmail must not leak private
    // correspondence into a shared board tool.
    expect(
      isInScope(
        msg({ toEmails: ['president.personal@gmail.com'], fromEmail: 'doctor@clinic.com' }),
        'address',
        'board@mp.org',
      ),
    ).toBe(false)
  })

  it('mode=address is case-insensitive (haystack side)', () => {
    expect(isInScope(msg({ toEmails: ['BOARD@MP.ORG'] }), 'address', 'board@mp.org')).toBe(
      true,
    )
  })

  it('mode=address is case-insensitive (needle side)', () => {
    // The fixture haystack is lowercase; if the needle-side .toLowerCase()
    // were removed, this would fail while the test above still passed.
    expect(isInScope(msg({ toEmails: ['board@mp.org'] }), 'address', 'BOARD@MP.ORG')).toBe(
      true,
    )
  })

  it('mode=address with no scopeValue rejects everything rather than leaking', () => {
    // Fail closed. A misconfigured scope must not silently become "all".
    expect(isInScope(msg(), 'address', null)).toBe(false)
  })

  it('mode=address with an empty-string scopeValue rejects everything', () => {
    expect(isInScope(msg(), 'address', '')).toBe(false)
  })

  it('mode=address with a whitespace-only scopeValue rejects everything', () => {
    expect(isInScope(msg(), 'address', '   ')).toBe(false)
  })

  it('mode=label keeps a message carrying the label', () => {
    expect(isInScope(msg({ labelIds: ['INBOX', 'Label_9'] }), 'label', 'Label_9')).toBe(true)
  })

  it('mode=label rejects a message without the label', () => {
    expect(isInScope(msg({ labelIds: ['INBOX'] }), 'label', 'Label_9')).toBe(false)
  })

  it('an unrecognized scopeMode fails closed rather than falling through to address matching', () => {
    expect(
      isInScope(msg({ toEmails: ['board@mp.org'] }), 'bogus' as ScopeMode, 'board@mp.org'),
    ).toBe(false)
  })
})

describe('buildScopeQuery', () => {
  it('scopes by deliveredto for address mode', () => {
    expect(buildScopeQuery('address', 'board@mp.org')).toBe(
      '(to:board@mp.org OR cc:board@mp.org OR deliveredto:board@mp.org)',
    )
  })

  it('scopes by label for label mode', () => {
    expect(buildScopeQuery('label', 'Label_9')).toBe('label:Label_9')
  })

  it('returns an empty query for all mode', () => {
    expect(buildScopeQuery('all', null)).toBe('')
  })

  it('appends an after: clause when given', () => {
    expect(buildScopeQuery('all', null, '2025/07/31')).toBe('after:2025/07/31')
    expect(buildScopeQuery('label', 'L1', '2025/07/31')).toBe('label:L1 after:2025/07/31')
  })

  it('rejects a query-widening address instead of building an unrestricted query', () => {
    // A bare space plus Gmail query syntax would turn the fetch-side
    // filter into "match essentially every message with a To: header".
    expect(() => buildScopeQuery('address', 'x@y.com OR to:*')).toThrow(/scopeValue/)
  })

  it('rejects a label value containing a space', () => {
    expect(() => buildScopeQuery('label', 'Label 9')).toThrow(/scopeValue/)
  })

  it('rejects a label value containing a colon', () => {
    expect(() => buildScopeQuery('label', 'label:evil')).toThrow(/scopeValue/)
  })

  it('rejects an unrecognized scopeMode instead of degrading to an unrestricted query', () => {
    expect(() => buildScopeQuery('bogus' as ScopeMode, 'whatever')).toThrow(/scopeMode/)
  })

  it('accepts a plus-tagged address without throwing', () => {
    expect(buildScopeQuery('address', 'board+arc@mp.org')).toBe(
      '(to:board+arc@mp.org OR cc:board+arc@mp.org OR deliveredto:board+arc@mp.org)',
    )
  })

  it('accepts a subdomain address without throwing', () => {
    expect(buildScopeQuery('address', 'board@mail.mp.org')).toBe(
      '(to:board@mail.mp.org OR cc:board@mail.mp.org OR deliveredto:board@mail.mp.org)',
    )
  })
})

describe('recommendScope', () => {
  it('recommends a non-primary shared alias when one exists', () => {
    const result = recommendScope(
      [
        { sendAsEmail: 'president@gmail.com', isPrimary: true, isDefault: true },
        { sendAsEmail: 'board@mp.org', isPrimary: false, isDefault: false },
      ],
      'president@gmail.com',
    )
    expect(result).toEqual({ scopeMode: 'address', scopeValue: 'board@mp.org' })
  })

  it('recommends address-scoped on the primary when it is the only address', () => {
    const result = recommendScope(
      [{ sendAsEmail: 'board@mp.org', isPrimary: true, isDefault: true }],
      'board@mp.org',
    )
    // Still 'address', not 'all' — safe default even for a dedicated
    // account. The user can widen it explicitly.
    expect(result).toEqual({ scopeMode: 'address', scopeValue: 'board@mp.org' })
  })

  it('falls back to the profile email when sendAs is empty', () => {
    expect(recommendScope([], 'board@mp.org')).toEqual({
      scopeMode: 'address',
      scopeValue: 'board@mp.org',
    })
  })

  it('with multiple non-primary aliases, picks the first one in list order', () => {
    // Pinning this so the choice is documented behavior, not incidental —
    // Array.prototype.find takes the first match.
    const result = recommendScope(
      [
        { sendAsEmail: 'president@gmail.com', isPrimary: true, isDefault: true },
        { sendAsEmail: 'board@mp.org', isPrimary: false, isDefault: false },
        { sendAsEmail: 'arc@mp.org', isPrimary: false, isDefault: false },
      ],
      'president@gmail.com',
    )
    expect(result).toEqual({ scopeMode: 'address', scopeValue: 'board@mp.org' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
rtk pnpm test:unit
```
Expected: FAIL — `Failed to resolve import "./scope"`.

- [ ] **Step 3: Implement `packages/mailbox/src/scope.ts`**

```ts
/**
 * Mailbox scope filtering — the privacy control for this feature.
 *
 * HOA "mailboxes" in the wild are one of three things:
 *   1. a real Workspace account (board@hoa.org)
 *   2. a Google Group that fans out to board members' personal inboxes
 *   3. the president's personal Gmail
 *
 * In cases 2 and 3, syncing the whole inbox would pull private
 * correspondence into a shared board tool. So scope is enforced HERE,
 * before anything is persisted, and it FAILS CLOSED: a misconfigured
 * scope drops mail rather than defaulting to "everything".
 *
 * Delivered-To is what makes case 2 work — a Google Group address appears
 * only in that header, never in To.
 */

import type { ParsedMessage, ScopeMode } from './types'

// A plausible single email address: no whitespace/quotes/parens/commas
// (which are Gmail query metacharacters), exactly one `@`, non-empty local
// and domain parts. Not full RFC 5322 validation — deliberately pragmatic.
const ADDRESS_RE = /^[^\s"'()<>,]+@[^\s"'()<>,]+$/

// Gmail label ids are conservative tokens in practice (e.g. `Label_9`,
// `INBOX`). Restricting to this set keeps `label:<value>` unambiguous and
// rules out anything that could inject additional query syntax.
const LABEL_RE = /^[A-Za-z0-9_-]+$/

export function isInScope(
  message: ParsedMessage,
  scopeMode: ScopeMode,
  scopeValue: string | null,
): boolean {
  if (scopeMode === 'all') return true

  // Fail closed. Never treat a missing/blank scope value as "allow
  // everything". Trim first so a whitespace-only value can't slip past.
  const trimmed = scopeValue?.trim()
  if (!trimmed) return false

  if (scopeMode === 'label') {
    return message.labelIds.includes(trimmed)
  }

  if (scopeMode !== 'address') {
    // Unrecognized mode: fail closed by dropping the message. isInScope
    // runs per message inside a sync loop, so this must never throw —
    // buildScopeQuery is the place that rejects bad config loudly, before
    // any fetching happens.
    return false
  }

  const needle = trimmed.toLowerCase()
  const haystack = [
    ...message.toEmails,
    ...message.ccEmails,
    ...message.deliveredTo,
  ].map((e) => e.toLowerCase())

  return haystack.includes(needle)
}

/**
 * The equivalent filter expressed as a Gmail search query, so backfill and
 * fallback re-sync never fetch out-of-scope mail in the first place.
 *
 * Unlike `isInScope`, this throws on invalid input instead of degrading.
 * It runs once per sync (not per message) to build the fetch-side query,
 * and the sync job wraps each mailbox in a try/catch that records
 * `sync_error` and leaves the cursor unadvanced — so a bad config surfaces
 * loudly instead of quietly widening the fetch to "everything".
 */
export function buildScopeQuery(
  scopeMode: ScopeMode,
  scopeValue: string | null,
  afterDate?: string,
): string {
  const clauses: string[] = []

  if (scopeMode === 'address') {
    if (scopeValue) {
      if (!ADDRESS_RE.test(scopeValue)) {
        throw new Error(
          `buildScopeQuery: scopeValue "${scopeValue}" is not a valid single email address`,
        )
      }
      clauses.push(
        `(to:${scopeValue} OR cc:${scopeValue} OR deliveredto:${scopeValue})`,
      )
    }
  } else if (scopeMode === 'label') {
    if (scopeValue) {
      if (!LABEL_RE.test(scopeValue)) {
        throw new Error(
          `buildScopeQuery: scopeValue "${scopeValue}" is not a valid Gmail label id`,
        )
      }
      clauses.push(`label:${scopeValue}`)
    }
  } else if (scopeMode !== 'all') {
    throw new Error(`buildScopeQuery: unrecognized scopeMode "${scopeMode}"`)
  }

  if (afterDate) clauses.push(`after:${afterDate}`)

  return clauses.join(' ')
}

/**
 * Pick a safe default immediately after OAuth.
 *
 * A non-primary sendAs alias is the strongest signal of a shared HOA
 * address sitting inside someone's personal account — recommend scoping
 * to it. Otherwise scope to the account's own address, which is still
 * narrower than 'all' and can be widened deliberately.
 */
export function recommendScope(
  sendAs: Array<{ sendAsEmail: string; isPrimary: boolean; isDefault: boolean }>,
  profileEmail: string,
): { scopeMode: ScopeMode; scopeValue: string | null } {
  const alias = sendAs.find(
    (s) => !s.isPrimary && s.sendAsEmail.toLowerCase() !== profileEmail.toLowerCase(),
  )

  return {
    scopeMode: 'address',
    scopeValue: (alias?.sendAsEmail ?? profileEmail).toLowerCase(),
  }
}
```

`buildScopeQuery` throws on invalid config; `isInScope` returns `false` on
the equivalent case. The difference is call frequency and blast radius:
`buildScopeQuery` runs once per sync to build the fetch-side query, so a
loud failure (recorded as `sync_error`, cursor unadvanced) is cheap and
surfaces a misconfigured mailbox immediately. `isInScope` runs once per
message inside the sync loop — throwing there would abort a sync partway
through on one bad message, whereas dropping just that message and
continuing is the fail-closed behavior this module promises.

- [ ] **Step 4: Run the tests**

```bash
rtk pnpm test:unit
```
Expected: PASS — 27 scope tests.

- [ ] **Step 5: Export and commit**

Add to `packages/mailbox/src/index.ts`:

```ts
export { isInScope, buildScopeQuery, recommendScope } from './scope'
```

```bash
rtk pnpm test:unit && rtk pnpm typecheck && rtk git add packages/mailbox/ && rtk git commit -m "feat(mailbox): fail-closed scope filtering with Delivered-To support"
```

---

## Task 12: `syncMailbox` — incremental walk with expiry fallback

The last pure piece. Takes an account and a cursor, returns parsed in-scope messages plus the next cursor. Knows nothing about Postgres.

**Files:**
- Create: `packages/mailbox/src/sync.ts`, `src/sync.test.ts`
- Modify: `packages/mailbox/src/index.ts`

**Interfaces:**
- Consumes: `GmailClient` (Task 10), `isInScope`/`buildScopeQuery` (Task 11), `parseGmailMessage` (Task 7), `MailboxAccount`/`SyncResult` (Task 6)
- Produces: `syncMailbox(client: GmailClient, account: MailboxAccount, opts?: { fallbackAfterDate?: string; maxMessages?: number }): Promise<SyncResultWithFetchFailures>`, where `SyncResultWithFetchFailures` is `SyncResult` (Task 6) plus a `fetchFailures: number` count. Defined locally in `sync.ts` because `SyncResult` itself lives in `types.ts`; `types.ts` should grow the `fetchFailures` field for real in a follow-up so downstream callers can import the type directly.

- [ ] **Step 1: Write the failing test**

Create `packages/mailbox/src/sync.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { syncMailbox } from './sync'
import { MailboxAuthError, MailboxHistoryExpiredError } from './types'
import type { MailboxAccount } from './types'
import type { GmailClient } from './client'
import type { GmailApiMessage } from './parse'

const account: MailboxAccount = {
  id: 'acct-1',
  emailAddress: 'board@mp.org',
  scopeMode: 'address',
  scopeValue: 'board@mp.org',
  syncCursor: '900',
}

function rawMessage(id: string, to: string[]): GmailApiMessage {
  return {
    id,
    threadId: `t-${id}`,
    labelIds: ['INBOX'],
    internalDate: '1785500000000',
    payload: {
      mimeType: 'text/plain',
      headers: [
        { name: 'Message-ID', value: `<${id}@mail>` },
        { name: 'From', value: 'j.rivera@gmail.com' },
        { name: 'To', value: to.join(', ') },
        { name: 'Subject', value: `subject ${id}` },
      ],
      body: { size: 5, data: Buffer.from('hello').toString('base64url') },
    },
  }
}

function fakeClient(over: Partial<GmailClient> = {}): GmailClient {
  return {
    getProfile: vi.fn(async () => ({ emailAddress: 'board@mp.org', historyId: '999' })),
    listHistory: vi.fn(async () => ({
      messageIds: [],
      nextPageToken: null,
      historyId: '999',
    })),
    listMessages: vi.fn(async () => ({ messageIds: [], nextPageToken: null })),
    getMessage: vi.fn(async (id: string) => rawMessage(id, ['board@mp.org'])),
    getAttachment: vi.fn(),
    listSendAs: vi.fn(),
    listLabels: vi.fn(),
    ...over,
  } as unknown as GmailClient
}

describe('syncMailbox', () => {
  it('walks history and returns parsed messages', async () => {
    const client = fakeClient({
      listHistory: vi.fn(async () => ({
        messageIds: ['m1', 'm2'],
        nextPageToken: null,
        historyId: '950',
      })),
    })

    const result = await syncMailbox(client, account)

    expect(result.messages.map((m) => m.gmailMessageId)).toEqual(['m1', 'm2'])
    expect(result.nextCursor).toBe('950')
    expect(result.usedFallback).toBe(false)
  })

  it('drops out-of-scope messages before returning them', async () => {
    const client = fakeClient({
      listHistory: vi.fn(async () => ({
        messageIds: ['m1', 'm2'],
        nextPageToken: null,
        historyId: '950',
      })),
      getMessage: vi.fn(async (id: string) =>
        id === 'm1'
          ? rawMessage('m1', ['board@mp.org'])
          : rawMessage('m2', ['president.personal@gmail.com']),
      ),
    })

    const result = await syncMailbox(client, account)
    expect(result.messages.map((m) => m.gmailMessageId)).toEqual(['m1'])
  })

  it('follows history pagination', async () => {
    const listHistory = vi
      .fn()
      .mockResolvedValueOnce({
        messageIds: ['m1'],
        nextPageToken: 'p2',
        historyId: null,
      })
      .mockResolvedValueOnce({
        messageIds: ['m2'],
        nextPageToken: null,
        historyId: '960',
      })

    const result = await syncMailbox(fakeClient({ listHistory }), account)

    expect(listHistory).toHaveBeenCalledTimes(2)
    expect(result.messages).toHaveLength(2)
    expect(result.nextCursor).toBe('960')
  })

  it('falls back to a dated query when historyId has expired', async () => {
    const listMessages = vi.fn(async () => ({
      messageIds: ['m5'],
      nextPageToken: null,
    }))

    const client = fakeClient({
      listHistory: vi.fn(async () => {
        throw new MailboxHistoryExpiredError('gone')
      }),
      listMessages,
    })

    const result = await syncMailbox(client, account, {
      fallbackAfterDate: '2026/07/24',
    })

    expect(result.usedFallback).toBe(true)
    expect(result.messages.map((m) => m.gmailMessageId)).toEqual(['m5'])
    // Fallback must still be scope-constrained, or an expiry becomes a
    // privacy incident.
    expect(listMessages).toHaveBeenCalledWith(
      '(to:board@mp.org OR cc:board@mp.org OR deliveredto:board@mp.org) after:2026/07/24',
      undefined,
    )
    // Cursor is refreshed from the profile so the next run is incremental.
    expect(result.nextCursor).toBe('999')
  })

  it('does a first-run bootstrap when there is no cursor', async () => {
    const listMessages = vi.fn(async () => ({
      messageIds: ['m7'],
      nextPageToken: null,
    }))
    const client = fakeClient({ listMessages })

    const result = await syncMailbox(
      client,
      { ...account, syncCursor: null },
      { fallbackAfterDate: '2026/07/01' },
    )

    expect(result.usedFallback).toBe(true)
    expect(result.messages).toHaveLength(1)
    expect(result.nextCursor).toBe('999')
  })

  it('honours maxMessages so one run cannot blow the function timeout', async () => {
    const client = fakeClient({
      listHistory: vi.fn(async () => ({
        messageIds: ['m1', 'm2', 'm3', 'm4'],
        nextPageToken: null,
        historyId: '950',
      })),
    })

    const result = await syncMailbox(client, account, { maxMessages: 2 })
    expect(result.messages).toHaveLength(2)
    expect(result.truncated).toBe(true)
    // History path: cursor is HELD so the remainder is picked up next run
    // rather than silently skipped.
    expect(result.nextCursor).toBe('900')
  })

  it('advances the cursor on a truncated FALLBACK run and reports truncation', async () => {
    // Holding a null/stale cursor here would re-fetch the same newest N
    // forever. The cursor must advance, and the caller must backfill to
    // cover what the cap dropped.
    const client = fakeClient({
      listMessages: vi.fn(async () => ({
        messageIds: ['m1', 'm2', 'm3', 'm4'],
        nextPageToken: null,
      })),
    })

    const result = await syncMailbox(
      client,
      { ...account, syncCursor: null },
      { fallbackAfterDate: '2026/07/01', maxMessages: 2 },
    )

    expect(result.usedFallback).toBe(true)
    expect(result.truncated).toBe(true)
    expect(result.messages).toHaveLength(2)
    expect(result.nextCursor).toBe('999')
  })

  it('returns no messages and holds the cursor when history is empty', async () => {
    const result = await syncMailbox(fakeClient(), account)
    expect(result.messages).toEqual([])
    expect(result.nextCursor).toBe('999')
  })

  it('reports truncated on the HISTORY path when a page lands exactly on the cap with more remaining', async () => {
    // Two pages of 1 id each, cap 2: count lands exactly on cap on the
    // second page, but nextPageToken still points at more. A
    // `messageIds.length > cap` check alone misses this — 2 is not > 2 — so
    // the collector must separately report whatever page token remained
    // unconsumed.
    const listHistory = vi
      .fn()
      .mockResolvedValueOnce({
        messageIds: ['m1'],
        nextPageToken: 'p2',
        historyId: null,
      })
      .mockResolvedValueOnce({
        messageIds: ['m2'],
        nextPageToken: 'p3',
        historyId: '950',
      })

    const result = await syncMailbox(fakeClient({ listHistory }), account, {
      maxMessages: 2,
    })

    expect(result.messages).toHaveLength(2)
    expect(result.truncated).toBe(true)
    // History path: cursor still held even at the boundary.
    expect(result.nextCursor).toBe('900')
  })

  it('reports truncated on the FALLBACK path when a page lands exactly on the cap with more remaining', async () => {
    const listMessages = vi
      .fn()
      .mockResolvedValueOnce({ messageIds: ['m1'], nextPageToken: 'p2' })
      .mockResolvedValueOnce({ messageIds: ['m2'], nextPageToken: 'p3' })

    const result = await syncMailbox(
      fakeClient({ listMessages }),
      { ...account, syncCursor: null },
      { fallbackAfterDate: '2026/07/01', maxMessages: 2 },
    )

    expect(result.usedFallback).toBe(true)
    expect(result.messages).toHaveLength(2)
    expect(result.truncated).toBe(true)
    expect(result.nextCursor).toBe('999')
  })

  it('skips a single unfetchable message and reports fetchFailures instead of aborting the run', async () => {
    const client = fakeClient({
      listHistory: vi.fn(async () => ({
        messageIds: ['m1', 'm2', 'm3'],
        nextPageToken: null,
        historyId: '950',
      })),
      getMessage: vi.fn(async (id: string) => {
        if (id === 'm2') throw new Error('404 Not Found')
        return rawMessage(id, ['board@mp.org'])
      }),
    })

    const result = await syncMailbox(client, account)

    expect(result.messages.map((m) => m.gmailMessageId)).toEqual(['m1', 'm3'])
    expect(result.fetchFailures).toBe(1)
  })

  it('propagates a MailboxAuthError instead of skipping it, since every later fetch will fail too', async () => {
    const client = fakeClient({
      listHistory: vi.fn(async () => ({
        messageIds: ['m1', 'm2', 'm3'],
        nextPageToken: null,
        historyId: '950',
      })),
      getMessage: vi.fn(async (id: string) => {
        if (id === 'm2') throw new MailboxAuthError('credentials dead')
        return rawMessage(id, ['board@mp.org'])
      }),
    })

    await expect(syncMailbox(client, account)).rejects.toThrow(MailboxAuthError)
  })

  it('excludes an out-of-scope message collected on the FALLBACK path', async () => {
    const client = fakeClient({
      listMessages: vi.fn(async () => ({
        messageIds: ['m1', 'm2'],
        nextPageToken: null,
      })),
      getMessage: vi.fn(async (id: string) =>
        id === 'm1'
          ? rawMessage('m1', ['board@mp.org'])
          : rawMessage('m2', ['president.personal@gmail.com']),
      ),
    })

    const result = await syncMailbox(
      client,
      { ...account, syncCursor: null },
      { fallbackAfterDate: '2026/07/01' },
    )

    expect(result.usedFallback).toBe(true)
    expect(result.messages.map((m) => m.gmailMessageId)).toEqual(['m1'])
  })

  it('holds the previous cursor instead of emitting an empty string when a non-capped history walk never receives a historyId', async () => {
    const client = fakeClient({
      listHistory: vi.fn(async () => ({
        messageIds: ['m1'],
        nextPageToken: null,
        historyId: null,
      })),
    })

    const result = await syncMailbox(client, account)

    expect(result.truncated).toBe(false)
    expect(result.nextCursor).toBe('900')
    expect(result.nextCursor).not.toBe('')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
rtk pnpm test:unit
```
Expected: FAIL — `Failed to resolve import "./sync"`.

- [ ] **Step 3: Implement `packages/mailbox/src/sync.ts`**

```ts
/**
 * Incremental mailbox sync.
 *
 * Pure with respect to storage — takes a client and a cursor, returns
 * messages and the next cursor. The caller persists. This is what lets an
 * Inngest cron drive it today and a Pub/Sub push webhook drive it later
 * without changing a line here.
 *
 * Three paths:
 *   1. cursor present  → history.list from it (cheap, the normal case)
 *   2. cursor missing  → dated messages.list bootstrap
 *   3. history expired → dated messages.list fallback (Gmail drops
 *                        history after ~7 days, so any outage longer than
 *                        that cannot resume incrementally)
 *
 * Paths 2 and 3 rely on the unique index on
 * inbox_messages(mailbox_account_id, gmail_message_id) for idempotency: a
 * re-fetch of already-stored mail must be a no-op. Scoped per mailbox
 * because Gmail only guarantees message-id uniqueness within one mailbox.
 */

import { GmailClient } from './client'
import { parseGmailMessage } from './parse'
import { buildScopeQuery, isInScope } from './scope'
import {
  MailboxAuthError,
  MailboxHistoryExpiredError,
  type MailboxAccount,
  type ParsedMessage,
  type SyncResult,
} from './types'

const DEFAULT_MAX_MESSAGES = 200

export interface SyncOptions {
  /** Gmail-format date (YYYY/MM/DD) for bootstrap and fallback queries. */
  fallbackAfterDate?: string
  /** Hard cap per run so one invocation cannot exceed the function timeout. */
  maxMessages?: number
}

/**
 * `SyncResult` (types.ts) doesn't carry a `fetchFailures` field. This
 * extends it locally so the count can be returned without touching
 * types.ts in this task's diff. types.ts should grow this field for real
 * in a follow-up so callers elsewhere can import it directly instead of
 * relying on structural typing.
 */
export interface SyncResultWithFetchFailures extends SyncResult {
  /**
   * Count of selected messages whose fetch/parse failed and were skipped
   * rather than aborting the whole run (e.g. a 404 from a message deleted
   * between listing and fetching). Does not include MailboxAuthError, which
   * always propagates instead of being counted.
   */
  fetchFailures: number
}

async function collectHistoryIds(
  client: GmailClient,
  startHistoryId: string,
  cap: number,
): Promise<{ ids: string[]; historyId: string | null; hasMore: boolean }> {
  const ids: string[] = []
  let pageToken: string | undefined
  let historyId: string | null = null

  do {
    const page = await client.listHistory(startHistoryId, pageToken)
    ids.push(...page.messageIds)
    if (page.historyId) historyId = page.historyId
    pageToken = page.nextPageToken ?? undefined
  } while (pageToken && ids.length < cap)

  // `pageToken` is truthy here only if the loop stopped because it hit the
  // cap while a page still had more results waiting — i.e. pagination was
  // cut short, not exhausted. Do not infer this from `ids.length` alone: a
  // count that lands exactly on `cap` looks identical to "done" unless we
  // also track whether a page token was left unconsumed.
  return { ids, historyId, hasMore: Boolean(pageToken) }
}

async function collectQueryIds(
  client: GmailClient,
  query: string,
  cap: number,
): Promise<{ ids: string[]; hasMore: boolean }> {
  const ids: string[] = []
  let pageToken: string | undefined

  do {
    const page = await client.listMessages(query, pageToken)
    ids.push(...page.messageIds)
    pageToken = page.nextPageToken ?? undefined
  } while (pageToken && ids.length < cap)

  return { ids, hasMore: Boolean(pageToken) }
}

export async function syncMailbox(
  client: GmailClient,
  account: MailboxAccount,
  opts: SyncOptions = {},
): Promise<SyncResultWithFetchFailures> {
  const cap = opts.maxMessages ?? DEFAULT_MAX_MESSAGES

  let messageIds: string[] = []
  let historyId: string | null = null
  let usedFallback = false
  let hasMore = false

  if (account.syncCursor) {
    try {
      const walked = await collectHistoryIds(client, account.syncCursor, cap)
      messageIds = walked.ids
      historyId = walked.historyId
      hasMore = walked.hasMore
    } catch (error) {
      if (!(error instanceof MailboxHistoryExpiredError)) throw error
      usedFallback = true
    }
  } else {
    usedFallback = true
  }

  if (usedFallback) {
    // Scope-constrained even here. An expired cursor must never widen what
    // we are allowed to see.
    const query = buildScopeQuery(
      account.scopeMode,
      account.scopeValue,
      opts.fallbackAfterDate,
    )
    const walked = await collectQueryIds(client, query, cap)
    messageIds = walked.ids
    hasMore = walked.hasMore

    // Re-anchor on the mailbox's current historyId so the NEXT run is
    // incremental again.
    historyId = (await client.getProfile()).historyId
  }

  // `hasMore` catches the exact-cap boundary (a page landed precisely on
  // `cap` with a page token still pointing at more results); the length
  // check catches the case a single oversized page pushed us past `cap` in
  // one shot. Neither alone is sufficient — see sync.test.ts for the
  // boundary case this guards against.
  const truncated = hasMore || messageIds.length > cap
  const selected = messageIds.slice(0, cap)

  const messages: ParsedMessage[] = []
  let fetchFailures = 0
  for (const id of selected) {
    let parsed: ParsedMessage
    try {
      parsed = parseGmailMessage(await client.getMessage(id))
    } catch (error) {
      // An auth failure means every subsequent fetch will fail too — let it
      // propagate rather than burning through the rest of the batch.
      if (error instanceof MailboxAuthError) throw error

      // Anything else (most commonly a 404 — the message was deleted
      // between listing and fetching) is a per-message problem, not a
      // batch-ending one. Skip it and keep going so one poison message
      // can't permanently block this mailbox's sync. Log only the Gmail
      // message id (an opaque identifier) — never the body, subject, or
      // any address.
      fetchFailures++
      console.error(
        `mailbox sync: skipping unfetchable message ${id}`,
        error instanceof Error ? error.message : String(error),
      )
      continue
    }

    if (isInScope(parsed, account.scopeMode, account.scopeValue)) {
      messages.push(parsed)
    }
  }

  // On a truncated HISTORY run, hold the cursor — the next run re-walks
  // from the same point and picks up the remainder.
  //
  // On a truncated FALLBACK run we cannot hold it: the cursor is null or
  // stale, so holding it would re-fetch the same newest N forever and
  // never advance. The cursor moves to the mailbox's current historyId and
  // the caller must trigger a backfill, which paginates properly with page
  // tokens, to cover what the cap dropped.
  //
  // Trade-off this hold accepts: if a mailbox's first `cap` history events
  // are ALL out-of-scope, a capped HISTORY run holds the same cursor every
  // time and re-walks the identical window forever without advancing.
  // Changing the hold rule to dodge that would risk skipping mail on a
  // normal capped run, which is worse than wasted work, so it stays as-is.
  // The mitigation lives one level up, in the caller: trigger a backfill on
  // ANY truncated run (history OR fallback), not only a fallback one. The
  // backfill paginates properly with page tokens and is idempotent against
  // inbox_messages' unique index, so it makes forward progress even in the
  // all-out-of-scope stall case the incremental walk cannot resolve on its
  // own. See Task 15 (the sync job) for where this gets wired up.
  const holdCursor = truncated && !usedFallback

  let nextCursor: string
  if (holdCursor) {
    nextCursor = account.syncCursor as string
  } else {
    const resolved = historyId ?? account.syncCursor
    if (!resolved) {
      // Neither a fresh historyId nor a previous cursor is available to
      // persist. This should be unreachable in practice (the history path
      // requires a truthy syncCursor to start, and the fallback path always
      // re-anchors from getProfile()), but silently emitting '' here would
      // look like "no cursor" to the next run and force an unnecessary full
      // bootstrap. Fail loudly instead of masking a state that should be
      // impossible.
      throw new Error(
        `syncMailbox: unable to determine a next cursor for mailbox ${account.id}`,
      )
    }
    nextCursor = resolved
  }

  return { messages, nextCursor, usedFallback, truncated, fetchFailures }
}
```

- [ ] **Step 4: Run the tests**

```bash
rtk pnpm test:unit
```
Expected: PASS — 14 sync tests.

- [ ] **Step 5: Export, typecheck, commit**

Add to `packages/mailbox/src/index.ts`:

```ts
export { syncMailbox } from './sync'
export type { SyncOptions } from './sync'
```

Follow-up not covered by this task's diff: `types.ts` should grow the real
`fetchFailures: number` field on `SyncResult` (see the "Interfaces" note
above), and once it does, `index.ts`'s existing `export * from './types'`
picks it up automatically — no separate export line needed. Until then,
`SyncResultWithFetchFailures` (defined in `sync.ts`) isn't re-exported from
`index.ts`; callers importing from the package root see it structurally
through `syncMailbox`'s return type but can't name it directly.

```bash
rtk pnpm test:unit && rtk pnpm typecheck && rtk git add packages/mailbox/ && rtk git commit -m "feat(mailbox): incremental syncMailbox with history-expiry fallback"
```

`packages/mailbox` is now complete: zero network, zero database.

**Reviewer follow-up (fix pass, same day):** the initial implementation had
a truncation-boundary bug (a page landing exactly on `cap` with more results
pending was reported as `truncated: false`, silently dropping mail) and let
a single unfetchable message abort the whole run. Both are fixed in the code
above — see `hasMore` tracking in the collectors and the per-message
try/catch around `getMessage`/`parseGmailMessage`. Full history in
`.superpowers/sdd/task-12-report.md`.

---

## Task 13: Ingest — persist with idempotency

**Files:**
- Create: `apps/hoa/src/lib/inbox/ingest.ts`
- Modify: `apps/hoa/package.json` (add `@homeowner-portal/mailbox`)
- Create: `migrations/0031_inbox_attachment_uniq.sql` (fix pass — see below)

**Interfaces:**
- Consumes: `ParsedMessage` (Task 6); `getPropertyRef` (Task 3)
- Produces:
  ```ts
  interface IngestResult {
    threadsCreated: number
    messagesInserted: number
    messagesSkipped: number
    attachmentsQueued: number
    threadsFailed: number
    messagesFailed: number
    attachmentsFailed: number
  }
  ingestMessages(db, orgId, mailboxAccountId, messages: ParsedMessage[]): Promise<IngestResult>
  ```
  `ingestMessages` throws (rather than returning) if any thread, message, or
  attachment failed — see "Fix pass" below for why.

- [ ] **Step 1: Add the workspace dependency**

In `apps/hoa/package.json`, add to `dependencies`:

```json
    "@homeowner-portal/mailbox": "workspace:*",
```

Then:

```bash
rtk pnpm install
```

- [ ] **Step 2: Write `apps/hoa/src/lib/inbox/ingest.ts`**

### Why message-existence alone is not a sufficient idempotency signal

The first version of this task treated "does the `inbox_messages` row already
exist?" as the entire idempotency check: if a re-delivered message's row was
already there, the code `continue`d past the rest of that message's work.
That is correct for the message row itself (the whole point of the
`ON CONFLICT ... DO NOTHING` upsert), but it is NOT correct for anything the
original insert does *after* the message row — namely, the attachment loop.
A message row inserting successfully and then the attachment loop throwing
(a transient DB or network blip) is a real, ordinary failure mode. On retry,
the message half of the work is already done, `ignoreDuplicates` reports "no
new row," and a `continue` at that point means the attachment loop is never
entered again for that message — ever. There was no unique constraint on
`inbox_attachments` and no completeness marker, so nothing detected or
repaired the gap; `messagesSkipped++` reported the retry as a clean no-op
while an attachment silently vanished forever.

The fix, applied to the code below, is two parts:
1. **`migrations/0031_inbox_attachment_uniq.sql`** adds a unique index on
   `inbox_attachments` so an attachment insert can become an idempotent
   upsert. The natural key is `(message_id, gmail_attachment_id)`, but
   `gmail_attachment_id` is nullable (a part can have a filename with no
   Gmail attachment id), and NULL never collides with NULL in a plain
   unique index. The migration adds a generated column
   `gmail_attachment_key` — `COALESCE(gmail_attachment_id, '')`, stored —
   and indexes `(message_id, file_name, gmail_attachment_key)`. A raw
   expression index on `COALESCE(gmail_attachment_id, '')` directly would
   satisfy Postgres, but NOT `.upsert()`'s `onConflict` option: PostgREST's
   `on_conflict` parameter only accepts a literal column list, and Postgres
   will not infer an expression index from a plain column list (confirmed
   live: `ON CONFLICT (message_id, file_name, gmail_attachment_id)` against
   a COALESCE expression index throws `42P10`). The generated column makes
   the dedupe key a real, ordinary column so the plain column-list
   `onConflict` supabase-js needs actually works.
2. **`ingest.ts`**'s message-skip path no longer `continue`s past
   attachments. It fetches the existing message's id and runs the
   attachment loop anyway, as an upsert on the new conflict target with
   `ignoreDuplicates: true`. A fully-ingested message re-processes to zero
   writes; a partially-ingested one is repaired.

The code below also fixes a second bug: a thread's activity fields
(`subject`, `participants`, `last_message_at`, `last_direction`) were
computed from the full input array and written before any message was
inserted, and the per-message loop had no try/catch, so one bad message
aborted the rest of its thread AND every remaining thread in the batch. The
fix wraps each thread group and each message in its own try/catch (so one
failure only removes that unit of work, not its siblings), derives the
thread's activity fields only from messages that were actually stored this
call (never from the raw input), and throws a summary error at the end if
anything failed — so the Task 15 sync job records `sync_error` and retries,
by which point everything that could be persisted already has been.

Two minor fixes are folded in too: a null `sentAt` (upstream parse failure)
now sorts to the END instead of the front when picking the thread's
"newest" message — treating an undated message as a possible newest,
rather than definitely-oldest, is the safer failure mode. And an
attachment with unknown size (`sizeBytes === null`) is no longer defaulted
to `0` and treated as "small" — unknown size is stored as `pending`, not
silently skipped as a signature logo.

```ts
/**
 * Persist parsed Gmail messages.
 *
 * Idempotency is the contract. A history-expiry fallback (or an Inngest
 * retry, or an overlapping run) re-delivers messages we already have, and
 * every one of those paths must be a no-op. Three mechanisms, one per
 * table:
 *
 *   - inbox_threads      upsert on (mailbox_account_id, gmail_thread_id)
 *   - inbox_messages     upsert ... on conflict
 *                        (mailbox_account_id, gmail_message_id) ignore
 *   - inbox_attachments  upsert ... on conflict
 *                        (message_id, file_name, gmail_attachment_key)
 *                        ignore — migration 0031. gmail_attachment_key is
 *                        a generated column materializing
 *                        COALESCE(gmail_attachment_id, ''), because
 *                        gmail_attachment_id is nullable (an inline part
 *                        can have a filename with no Gmail attachment id)
 *                        and NULL never collides with NULL in a plain
 *                        unique index.
 *
 * The conflict target on inbox_messages is scoped by mailbox_account_id
 * (migration 0030), not global. Gmail only guarantees message-id
 * uniqueness WITHIN a mailbox — a global unique index let a second
 * tenant's genuinely-new email be silently discarded as a "duplicate" of
 * a first tenant's message with the same id. See 0030 for the full story.
 *
 * A message row's existence is NOT, by itself, sufficient evidence that
 * ingestion of that message finished. Before migration 0031, it was: a
 * message insert could succeed and then the attachment loop could throw
 * (transient DB/network error), aborting the call. On retry, the message
 * upsert found the row already present, `ignoreDuplicates` returned an
 * empty array, and the (former) code took that as "nothing to do" and
 * skipped straight past the attachment loop — permanently orphaning any
 * attachment that hadn't been written yet, with no unique constraint and
 * no completeness marker to ever detect or repair it. So a message that
 * is "already there" still runs its attachment loop, every time, as an
 * upsert — a fully-ingested message re-processes to zero writes, a
 * partially-ingested one is repaired.
 *
 * Failure isolation: a throw from one thread group no longer aborts the
 * rest of the batch, and a throw from one message no longer aborts the
 * rest of its thread. Each level (thread, message) is wrapped in its own
 * try/catch, logs, increments a failure counter on IngestResult, and
 * moves on to its next sibling. Attachment-level errors are handled the
 * same way without needing an actual throw, since the Supabase client
 * returns `{ error }` rather than throwing. A thread's activity fields
 * (subject, participants, last_message_at, last_direction) are computed
 * ONLY from messages that were actually stored (inserted this call, or
 * already present from a prior call) — never from the raw input array —
 * so the thread row can never claim a newest message that was never
 * persisted. If nothing in a batch could be stored for a thread, its
 * activity fields are left untouched rather than being overwritten with
 * a guess. After the whole batch runs, if anything failed, the function
 * throws a summary (counts only, no PII). The Task 15 sync job wraps
 * each mailbox in a try/catch that records sync_error and leaves the
 * cursor unadvanced on any throw, so a partial failure here still gets
 * retried — but by the time it throws, everything that COULD be
 * persisted already has been, which is the point.
 *
 * Matching is deliberately NOT done here. Ingest's job is durable
 * capture; match.ts runs after, so a matcher bug can be fixed and
 * re-applied without re-fetching from Gmail.
 *
 * Error handling: every query/mutation below captures `error` and, on
 * failure, logs diagnostic context (function, table, org/mailbox/thread/
 * message ids — never an email address, subject line, or message body,
 * all of which are resident PII) and either throws (thread- and
 * message-level errors, caught by the enclosing try/catch) or records a
 * failure counter and continues (attachment-level errors). The one
 * expected exception to "throw on error" is the thread-insert race
 * below: a unique-violation (Postgres code 23505) there means a
 * concurrent run won, not a real failure.
 */

import type { SupabaseClient, PostgrestError } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import type { ParsedMessage } from '@homeowner-portal/mailbox'

type Db = SupabaseClient<Database>

/** Inline images at or below this size are signature logos, not content. */
const INLINE_SKIP_BYTES = 100 * 1024

/** Gmail's own attachment ceiling. */
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024

/** Postgres unique_violation. */
const PG_UNIQUE_VIOLATION = '23505'

export interface IngestResult {
  threadsCreated: number
  messagesInserted: number
  messagesSkipped: number
  attachmentsQueued: number
  /** Thread groups that failed outright (e.g. the thread upsert itself). */
  threadsFailed: number
  /** Individual messages that failed within an otherwise-processed thread. */
  messagesFailed: number
  /** Individual attachments that failed within an otherwise-stored message. */
  attachmentsFailed: number
}

function logDbError(
  fn: string,
  table: string,
  context: Record<string, string | null>,
  error: PostgrestError | Error,
): void {
  console.error(`${fn}: query on "${table}" failed`, {
    ...context,
    code: 'code' in error ? error.code : undefined,
    message: error.message,
  })
}

/**
 * Ascending by sentAt, with a null sentAt (an upstream parse failure)
 * sorted to the END rather than treated as the earliest possible
 * timestamp. A message we can't date is not necessarily old — sorting it
 * last makes it win the "newest" pick (`stored[stored.length - 1]`)
 * instead of being masked by an older-but-parseable message. Overstating
 * a thread's recency (bumped to the top of the queue) is the safer
 * failure mode than understating it (a genuinely live thread going stale
 * in the queue because its newest arrival's date didn't parse).
 */
function compareBySentAt(a: ParsedMessage, b: ParsedMessage): number {
  if (a.sentAt === null && b.sentAt === null) return 0
  if (a.sentAt === null) return 1
  if (b.sentAt === null) return -1
  return a.sentAt.localeCompare(b.sentAt)
}

export async function ingestMessages(
  db: Db,
  orgId: string,
  mailboxAccountId: string,
  messages: ParsedMessage[],
): Promise<IngestResult> {
  const result: IngestResult = {
    threadsCreated: 0,
    messagesInserted: 0,
    messagesSkipped: 0,
    attachmentsQueued: 0,
    threadsFailed: 0,
    messagesFailed: 0,
    attachmentsFailed: 0,
  }
  if (messages.length === 0) return result

  // ── group by Gmail thread ─────────────────────────────────────────
  const byThread = new Map<string, ParsedMessage[]>()
  for (const message of messages) {
    const bucket = byThread.get(message.gmailThreadId)
    if (bucket) bucket.push(message)
    else byThread.set(message.gmailThreadId, [message])
  }

  for (const [gmailThreadId, threadMessages] of byThread) {
    try {
      await ingestThread(db, orgId, mailboxAccountId, gmailThreadId, threadMessages, result)
    } catch (threadError) {
      result.threadsFailed++
      logDbError(
        'ingestMessages',
        'inbox_threads',
        { orgId, mailboxAccountId, gmailThreadId },
        threadError instanceof Error ? threadError : new Error(String(threadError)),
      )
      // One bad thread must not block the rest of the batch.
    }
  }

  const totalFailed = result.threadsFailed + result.messagesFailed + result.attachmentsFailed
  if (totalFailed > 0) {
    throw new Error(
      `ingestMessages: partial failure for mailbox ${mailboxAccountId} — ` +
        `${result.threadsFailed} thread(s), ${result.messagesFailed} message(s), ` +
        `${result.attachmentsFailed} attachment(s) failed out of ${byThread.size} ` +
        `thread(s) / ${messages.length} message(s) submitted. Everything that could ` +
        `be persisted was persisted; retry will repair the rest.`,
    )
  }

  return result
}

/** Process one Gmail thread's worth of messages. Throws on a thread-level failure. */
async function ingestThread(
  db: Db,
  orgId: string,
  mailboxAccountId: string,
  gmailThreadId: string,
  threadMessages: ParsedMessage[],
  result: IngestResult,
): Promise<void> {
  const sorted = [...threadMessages].sort(compareBySentAt)

  // ── thread upsert (bare) ────────────────────────────────────────────
  // Activity fields (subject, participants, last_message_at,
  // last_direction) are deliberately NOT set here. They are set below,
  // once we know which messages in this batch actually made it to disk
  // — never guessed from the raw input array.
  const { data: existing, error: lookupError } = await db
    .from('inbox_threads')
    .select('id')
    .eq('mailbox_account_id', mailboxAccountId)
    .eq('gmail_thread_id', gmailThreadId)
    .maybeSingle()

  if (lookupError) {
    logDbError('ingestMessages', 'inbox_threads', { orgId, mailboxAccountId, gmailThreadId }, lookupError)
    throw lookupError
  }

  let threadId: string

  if (existing) {
    threadId = existing.id
  } else {
    const { data: created, error: insertError } = await db
      .from('inbox_threads')
      .insert({
        organization_id: orgId,
        mailbox_account_id: mailboxAccountId,
        gmail_thread_id: gmailThreadId,
        status: 'needs_review',
        match_confidence: 'none',
      })
      .select('id')
      .single()

    if (insertError) {
      if (insertError.code !== PG_UNIQUE_VIOLATION) {
        // A genuine failure, not a race — surface it.
        logDbError('ingestMessages', 'inbox_threads', { orgId, mailboxAccountId, gmailThreadId }, insertError)
        throw insertError
      }

      // Expected: a concurrent run won the unique index on
      // (mailbox_account_id, gmail_thread_id). Re-read and continue —
      // this is not an error.
      const { data: raced, error: racedError } = await db
        .from('inbox_threads')
        .select('id')
        .eq('mailbox_account_id', mailboxAccountId)
        .eq('gmail_thread_id', gmailThreadId)
        .maybeSingle()

      if (racedError) {
        logDbError('ingestMessages', 'inbox_threads', { orgId, mailboxAccountId, gmailThreadId }, racedError)
        throw racedError
      }

      if (!raced) {
        // A unique violation implies a row exists. Not finding one on
        // re-read means something else is wrong — treat as a genuine
        // failure rather than silently dropping this thread's mail.
        const err = new Error('inbox_threads: unique violation on insert but no row found on re-read')
        logDbError('ingestMessages', 'inbox_threads', { orgId, mailboxAccountId, gmailThreadId }, err)
        throw err
      }

      threadId = raced.id
    } else {
      threadId = created.id
      result.threadsCreated++
    }
  }

  // ── messages ─────────────────────────────────────────────────────────
  // Each message is isolated: a throw here is caught, counted, and does
  // not stop the rest of this thread's messages from being attempted.
  const stored: ParsedMessage[] = []
  for (const message of sorted) {
    try {
      await ingestMessage(db, orgId, mailboxAccountId, threadId, message, result)
      stored.push(message)
    } catch (messageError) {
      result.messagesFailed++
      logDbError(
        'ingestMessages',
        'inbox_messages',
        { orgId, mailboxAccountId, threadId },
        messageError instanceof Error ? messageError : new Error(String(messageError)),
      )
      // One bad message must not abort the rest of the thread.
    }
  }

  // ── activity fields, derived ONLY from messages actually stored ──────
  // If nothing in this batch could be stored for this thread, leave the
  // row exactly as it was — no write, no guess, no lie.
  if (stored.length === 0) return

  const newest = stored[stored.length - 1]
  const participants = [
    ...new Set(
      stored.flatMap((m) => [m.fromEmail, ...m.toEmails, ...m.ccEmails].filter((e): e is string => e !== null)),
    ),
  ]

  // Only advance the activity fields. Never touch unit_id, status, or
  // match_* — a manager's manual assignment must survive new mail
  // arriving on the thread.
  const { error: updateError } = await db
    .from('inbox_threads')
    .update({
      subject: newest.subject,
      participants,
      last_message_at: newest.sentAt,
      last_direction: 'inbound',
    })
    .eq('id', threadId)

  if (updateError) {
    logDbError('ingestMessages', 'inbox_threads', { orgId, mailboxAccountId, threadId }, updateError)
    throw updateError
  }
}

/**
 * Store one message and its attachments. Throws on a message-level
 * failure (caught by the caller's per-message try/catch).
 */
async function ingestMessage(
  db: Db,
  orgId: string,
  mailboxAccountId: string,
  threadId: string,
  message: ParsedMessage,
  result: IngestResult,
): Promise<void> {
  const { data: inserted, error: upsertError } = await db
    .from('inbox_messages')
    .upsert(
      {
        organization_id: orgId,
        thread_id: threadId,
        mailbox_account_id: mailboxAccountId,
        gmail_message_id: message.gmailMessageId,
        rfc822_message_id: message.rfc822MessageId,
        in_reply_to: message.inReplyTo,
        references_ids: message.references,
        direction: 'inbound',
        from_email: message.fromEmail,
        from_name: message.fromName,
        to_emails: message.toEmails,
        cc_emails: message.ccEmails,
        subject: message.subject,
        body_text: message.bodyText,
        body_html: message.bodyHtml,
        stripped_text: message.strippedText,
        sent_at: message.sentAt,
      },
      { onConflict: 'mailbox_account_id,gmail_message_id', ignoreDuplicates: true },
    )
    .select('id')

  if (upsertError) {
    logDbError('ingestMessages', 'inbox_messages', { orgId, mailboxAccountId, threadId }, upsertError)
    throw upsertError
  }

  // ignoreDuplicates returns an empty array when the row already
  // existed — that is the idempotent path, not an error. But a message
  // row existing is not proof its attachments finished (see the module
  // doc comment), so we still run the attachment loop below in both
  // branches — fetching the existing id when this call didn't insert it.
  let messageId = inserted?.[0]?.id

  if (messageId) {
    result.messagesInserted++
  } else {
    const { data: existingMessage, error: fetchError } = await db
      .from('inbox_messages')
      .select('id')
      .eq('mailbox_account_id', mailboxAccountId)
      .eq('gmail_message_id', message.gmailMessageId)
      .maybeSingle()

    if (fetchError) {
      logDbError('ingestMessages', 'inbox_messages', { orgId, mailboxAccountId, threadId }, fetchError)
      throw fetchError
    }

    if (!existingMessage) {
      // ignoreDuplicates implies a row exists. Not finding one on
      // re-read means something else is wrong — treat as a genuine
      // failure rather than silently dropping this message.
      const err = new Error('inbox_messages: ignoreDuplicates reported a duplicate but no row found on re-read')
      logDbError('ingestMessages', 'inbox_messages', { orgId, mailboxAccountId, threadId }, err)
      throw err
    }

    messageId = existingMessage.id
    result.messagesSkipped++
  }

  await ingestAttachments(db, orgId, mailboxAccountId, threadId, messageId, message, result)
}

/**
 * Store a message's attachments as an idempotent upsert (migration 0031).
 * Runs unconditionally — for both newly-inserted messages and messages
 * that already existed — so a message whose row survived a prior partial
 * failure gets its missing attachments repaired instead of permanently
 * orphaned. Each attachment is independent: one failing does not stop
 * its siblings from being attempted.
 */
async function ingestAttachments(
  db: Db,
  orgId: string,
  mailboxAccountId: string,
  threadId: string,
  messageId: string,
  message: ParsedMessage,
  result: IngestResult,
): Promise<void> {
  for (const attachment of message.attachments) {
    // Unknown size (sizeBytes === null) deliberately falls through to
    // 'pending' rather than being defaulted to 0. Defaulting to 0 would
    // make an inline attachment of UNKNOWN size look "small" and get
    // skipped as a signature logo — discarding possible evidence is
    // worse than storing one. Only a KNOWN small inline size is skipped.
    const size = attachment.sizeBytes
    let fetchStatus: 'pending' | 'skipped' | 'failed' = 'pending'
    let fetchError: string | null = null

    if (attachment.isInline && size !== null && size <= INLINE_SKIP_BYTES) {
      // Signature logos. Storing them buries real attachments in the
      // UI and multiplies storage for no value.
      fetchStatus = 'skipped'
    } else if (size !== null && size > MAX_ATTACHMENT_BYTES) {
      fetchStatus = 'failed'
      fetchError = `Exceeds ${MAX_ATTACHMENT_BYTES} byte limit.`
    } else if (!attachment.gmailAttachmentId) {
      fetchStatus = 'failed'
      fetchError = 'No Gmail attachment id — cannot fetch.'
    }

    const { data: attachmentRow, error: attachmentError } = await db
      .from('inbox_attachments')
      .upsert(
        {
          organization_id: orgId,
          thread_id: threadId,
          message_id: messageId,
          file_name: attachment.fileName,
          content_type: attachment.contentType,
          size_bytes: attachment.sizeBytes,
          gmail_attachment_id: attachment.gmailAttachmentId,
          is_inline: attachment.isInline,
          fetch_status: fetchStatus,
          fetch_error: fetchError,
        },
        { onConflict: 'message_id,file_name,gmail_attachment_key', ignoreDuplicates: true },
      )
      .select('id')

    if (attachmentError) {
      result.attachmentsFailed++
      logDbError(
        'ingestMessages',
        'inbox_attachments',
        { orgId, mailboxAccountId, threadId, messageId },
        attachmentError,
      )
      // One bad attachment must not block its siblings.
      continue
    }

    // ignoreDuplicates returns an empty array when the row already
    // existed — do not recount an already-queued attachment as newly
    // queued on a repair re-run.
    const wasInserted = (attachmentRow?.length ?? 0) > 0
    if (wasInserted && fetchStatus === 'pending') result.attachmentsQueued++
  }
}
```

- [ ] **Step 3: Apply migration 0031**

```bash
rtk supabase db query --linked < migrations/0031_inbox_attachment_uniq.sql
```
Expected: no output (DDL success). Safe to re-run.

- [ ] **Step 4: Typecheck**

```bash
rtk pnpm --filter @homeowner-portal/db gen:types && rtk proxy pnpm typecheck
```
Expected: PASS. (`rtk pnpm typecheck` is buggy in this environment and exits 1 with
garbled `tsc --help` output even when clean — use `rtk proxy pnpm typecheck`.)

- [ ] **Step 5: Commit**

```bash
rtk git add apps/hoa/ migrations/0031_inbox_attachment_uniq.sql pnpm-lock.yaml && rtk git commit -m "fix(inbox): repair partial-failure idempotency in ingest"
```

---

## Task 14: The matcher

Split deliberately into a **pure decision function** (table-tested in vitest) and a **database probe** (integration-tested against Postgres). The decision logic is where the subtle bugs live and where fast tests pay off.

**Files:**
- Create: `apps/hoa/src/lib/inbox/match.ts`, `match.test.ts`
- Create: `scripts/test-inbox-match.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `resolvePropertyByEmail`, `resolvePropertyByAddress`, `PropertyMatch` (Task 3)
- Produces:
  ```ts
  type MatchRule = 'thread_continuity' | 'sender_alias' | 'resident_email'
                 | 'resident_email_ambiguous' | 'address_in_body' | 'sender_name' | 'none'
  interface MatchSignals { threadUnitId, aliasUnitId, aliasResidentId,
                           emailMatches: PropertyMatch[], addressUnitIds: string[],
                           nameMatches: Array<{unitId, residentId, residentName}> }
  interface MatchOutcome { unitId, residentId, confidence, rule, reason, status }
  decideMatch(signals: MatchSignals): MatchOutcome            // pure
  extractAddressCandidates(text: string | null): string[]     // pure
  matchThread(db, orgId, threadId): Promise<MatchOutcome>     // db
  applyMatch(db, orgId, threadId, outcome): Promise<void>     // db
  ```

  **Amended post-review (see `.superpowers/sdd/task-14-report.md`,
  "Fix pass — org-scoping + signal coverage"):** the original brief below
  gave `applyMatch` the signature `applyMatch(db, threadId, outcome)`, with
  no `orgId`. Review found this was the one place in the module that
  wasn't org-scoped like every other query here, and — because the only
  caller (`packages/jobs/src/mailbox-sync.ts`) uses a service-role client
  that bypasses RLS — nothing else would have caught a caller bug pairing
  a thread id with the wrong org. `applyMatch` now takes `orgId: string`
  (ordered before `threadId`, matching `matchThread`) and scopes both its
  SELECT and its UPDATE with `.eq('organization_id', orgId)`. The
  implementation code block in Step 3 below and the integration script in
  Step 5 predate this fix and still show the unscoped three-argument form;
  treat the interface above, and the actual files on disk, as
  authoritative.

  **Amended post-review a second time (see `.superpowers/sdd/task-21-report.md`,
  "Fix pass — org-scoping + silent failures"):** `applyMatch`'s guard
  against re-filing a thread was `if (thread?.match_source === 'manual')
  return`, with a separate line pinning `status` back to `'closed'` on
  write so a re-match couldn't reopen a closed thread. Task 21 finding 3
  showed that pin was incomplete — it protected `status` but still let
  `unit_id`/`resident_id`/`match_confidence`/`match_reason` be silently
  overwritten while the thread was closed, so a later reopen could
  surface a property no human had approved. The guard is now `if
  (thread?.match_source === 'manual' || thread?.status === 'closed')
  return` — a closed thread's match fields are frozen entirely, not just
  its status column, and unfreeze naturally the moment it's reopened.
  The rejected alternative was having `setThreadStatus`
  (apps/hoa/src/lib/inbox/actions.ts, Task 21) stamp `match_source =
  'manual'` on close: closing a thread is a judgement about whether the
  conversation is done, not about which property it belongs to, so
  marking it "manual" would overclaim a decision the manager never made
  and would permanently block auto-matching even after the thread is
  reopened. `setThreadStatus` still only ever writes `status`.

- [ ] **Step 1: Write the failing test**

Create `apps/hoa/src/lib/inbox/match.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { decideMatch, extractAddressCandidates } from './match'
import type { MatchSignals } from './match'
import type { PropertyMatch } from '../properties/resolve'

function emptySignals(over: Partial<MatchSignals> = {}): MatchSignals {
  return {
    threadUnitId: null,
    aliasUnitId: null,
    aliasResidentId: null,
    emailMatches: [],
    addressUnitIds: [],
    nameMatches: [],
    ...over,
  }
}

function propertyMatch(unitId: string, residentId: string | null): PropertyMatch {
  return {
    ref: {
      unitId,
      legacyPropertyId: `legacy-${unitId}`,
      associationId: 'assoc-1',
      address: `${unitId} Oak Ln`,
      unitNumber: null,
    },
    residentId,
    residentName: 'Jenna Rivera',
    source: 'property_resident',
  }
}

describe('decideMatch — signal precedence', () => {
  it('1. thread continuity wins over everything else', () => {
    const outcome = decideMatch(
      emptySignals({
        threadUnitId: 'unit-thread',
        aliasUnitId: 'unit-alias',
        emailMatches: [propertyMatch('unit-email', 'res-1')],
      }),
    )
    expect(outcome.unitId).toBe('unit-thread')
    expect(outcome.rule).toBe('thread_continuity')
    expect(outcome.confidence).toBe('high')
    expect(outcome.status).toBe('open')
  })

  it('2. a remembered sender alias beats an email lookup', () => {
    const outcome = decideMatch(
      emptySignals({
        aliasUnitId: 'unit-alias',
        aliasResidentId: 'res-alias',
        emailMatches: [propertyMatch('unit-email', 'res-1')],
      }),
    )
    expect(outcome.unitId).toBe('unit-alias')
    expect(outcome.residentId).toBe('res-alias')
    expect(outcome.rule).toBe('sender_alias')
    expect(outcome.confidence).toBe('high')
  })

  it('3. exactly one email match is high confidence and auto-attaches', () => {
    const outcome = decideMatch(
      emptySignals({ emailMatches: [propertyMatch('unit-1', 'res-1')] }),
    )
    expect(outcome.unitId).toBe('unit-1')
    expect(outcome.residentId).toBe('res-1')
    expect(outcome.rule).toBe('resident_email')
    expect(outcome.confidence).toBe('high')
    expect(outcome.status).toBe('open')
  })

  it('4. multiple email matches are medium and do NOT auto-attach', () => {
    // An owner of three units. Guessing would misfile mail and feed the
    // wrong property context to Phase B's drafting agent.
    const outcome = decideMatch(
      emptySignals({
        emailMatches: [propertyMatch('unit-1', 'res-1'), propertyMatch('unit-2', 'res-2')],
      }),
    )
    expect(outcome.unitId).toBeNull()
    expect(outcome.rule).toBe('resident_email_ambiguous')
    expect(outcome.confidence).toBe('medium')
    expect(outcome.status).toBe('needs_review')
    expect(outcome.reason.candidate_unit_ids).toEqual(['unit-1', 'unit-2'])
  })

  it('5. exactly one address in the body is medium and does NOT auto-attach', () => {
    const outcome = decideMatch(emptySignals({ addressUnitIds: ['unit-9'] }))
    expect(outcome.unitId).toBeNull()
    expect(outcome.rule).toBe('address_in_body')
    expect(outcome.confidence).toBe('medium')
    expect(outcome.status).toBe('needs_review')
    expect(outcome.reason.candidate_unit_ids).toEqual(['unit-9'])
  })

  it('5b. multiple addresses in the body yield no match', () => {
    const outcome = decideMatch(emptySignals({ addressUnitIds: ['unit-9', 'unit-10'] }))
    expect(outcome.rule).toBe('none')
    expect(outcome.confidence).toBe('none')
  })

  it('6. exactly one sender-name match is low confidence', () => {
    const outcome = decideMatch(
      emptySignals({
        nameMatches: [{ unitId: 'unit-3', residentId: 'res-3', residentName: 'Dana Okafor' }],
      }),
    )
    expect(outcome.unitId).toBeNull()
    expect(outcome.rule).toBe('sender_name')
    expect(outcome.confidence).toBe('low')
    expect(outcome.status).toBe('needs_review')
  })

  it('6b. ambiguous names yield no match', () => {
    const outcome = decideMatch(
      emptySignals({
        nameMatches: [
          { unitId: 'u1', residentId: 'r1', residentName: 'J Smith' },
          { unitId: 'u2', residentId: 'r2', residentName: 'J Smith' },
        ],
      }),
    )
    expect(outcome.rule).toBe('none')
  })

  it('no signals → triage', () => {
    const outcome = decideMatch(emptySignals())
    expect(outcome.unitId).toBeNull()
    expect(outcome.residentId).toBeNull()
    expect(outcome.confidence).toBe('none')
    expect(outcome.rule).toBe('none')
    expect(outcome.status).toBe('needs_review')
  })

  it('every outcome carries an auditable reason', () => {
    const outcome = decideMatch(
      emptySignals({ emailMatches: [propertyMatch('unit-1', 'res-1')] }),
    )
    // match_reason must explain itself in the UI — "matched via X on Y".
    expect(outcome.reason.rule).toBe('resident_email')
    expect(outcome.reason.matched_on).toBe('property_resident')
  })

  it('only high confidence ever auto-attaches', () => {
    const highs = [
      decideMatch(emptySignals({ threadUnitId: 'u' })),
      decideMatch(emptySignals({ aliasUnitId: 'u' })),
      decideMatch(emptySignals({ emailMatches: [propertyMatch('u', null)] })),
    ]
    for (const outcome of highs) {
      expect(outcome.confidence).toBe('high')
      expect(outcome.unitId).not.toBeNull()
      expect(outcome.status).toBe('open')
    }

    const lowers = [
      decideMatch(emptySignals({ addressUnitIds: ['u'] })),
      decideMatch(
        emptySignals({
          nameMatches: [{ unitId: 'u', residentId: null, residentName: 'X' }],
        }),
      ),
    ]
    for (const outcome of lowers) {
      expect(outcome.unitId).toBeNull()
      expect(outcome.status).toBe('needs_review')
    }
  })
})

describe('extractAddressCandidates', () => {
  it('finds a street address in prose', () => {
    expect(extractAddressCandidates('I live at 214 Oak Lane and the gate broke.')).toContain(
      '214 Oak Lane',
    )
  })

  it('finds an address with a street-type abbreviation', () => {
    expect(extractAddressCandidates('Re: 31 Birch Ct fence')).toContain('31 Birch Ct')
  })

  it('finds a multi-word street name', () => {
    expect(extractAddressCandidates('at 88 North Maple Drive today')).toContain(
      '88 North Maple Drive',
    )
  })

  it('finds several distinct addresses', () => {
    const found = extractAddressCandidates('Both 214 Oak Ln and 31 Birch Ct are affected.')
    expect(found).toHaveLength(2)
  })

  it('ignores numbers that are not addresses', () => {
    expect(extractAddressCandidates('Invoice 4417 for $340 due on 15 July')).toEqual([])
  })

  it('handles null and empty input', () => {
    expect(extractAddressCandidates(null)).toEqual([])
    expect(extractAddressCandidates('')).toEqual([])
  })

  it('deduplicates repeats', () => {
    expect(
      extractAddressCandidates('214 Oak Ln — again, 214 Oak Ln is the problem'),
    ).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
rtk pnpm test:unit
```
Expected: FAIL — `Failed to resolve import "./match"`.

- [ ] **Step 3: Implement `apps/hoa/src/lib/inbox/match.ts`**

```ts
/**
 * Deterministic inbox matcher. No LLM.
 *
 * Matching is a keyed lookup where the keys are available, and it has to
 * be auditable — match_reason must be able to say "matched
 * j.rivera@gmail.com to 214 Oak Ln via property_residents" and mean it.
 * A model here would cost money on every spam email, give different
 * answers on reruns, and make a wrong filing hard to explain to a board.
 *
 * Six signals, highest confidence first:
 *   1. thread continuity  high    In-Reply-To/References hits a known message
 *   2. sender alias       high    a manager already taught us this address
 *   3. resident email     high    exactly one property for this address
 *   4. resident email     medium  MORE than one property — ambiguous
 *   5. address in body    medium  extracted from prose
 *   6. sender name        low     exactly one owner with this name
 *
 * ONLY high confidence auto-attaches. Everything else surfaces a
 * suggestion in triage, because a wrong attachment means Phase B drafts a
 * reply using another property's dues balance.
 *
 * Note on spoofing: From is trivially forgeable, so a match decides
 * FILING, never authorization. Nothing in this system grants access based
 * on a match.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import {
  resolvePropertyByAddress,
  resolvePropertyByEmail,
  type PropertyMatch,
} from '../properties/resolve'

type Db = SupabaseClient<Database>

export type MatchRule =
  | 'thread_continuity'
  | 'sender_alias'
  | 'resident_email'
  | 'resident_email_ambiguous'
  | 'address_in_body'
  | 'sender_name'
  | 'none'

export type MatchConfidence = 'high' | 'medium' | 'low' | 'none'

export interface MatchSignals {
  threadUnitId: string | null
  aliasUnitId: string | null
  aliasResidentId: string | null
  emailMatches: PropertyMatch[]
  addressUnitIds: string[]
  nameMatches: Array<{ unitId: string; residentId: string | null; residentName: string }>
}

export interface MatchReason {
  rule: MatchRule
  matched_on?: string
  candidate_unit_ids?: string[]
  [key: string]: unknown
}

export interface MatchOutcome {
  unitId: string | null
  residentId: string | null
  confidence: MatchConfidence
  rule: MatchRule
  reason: MatchReason
  status: 'open' | 'needs_review'
}

// ─── pure decision logic ─────────────────────────────────────────────

export function decideMatch(signals: MatchSignals): MatchOutcome {
  if (signals.threadUnitId) {
    return {
      unitId: signals.threadUnitId,
      residentId: null,
      confidence: 'high',
      rule: 'thread_continuity',
      reason: { rule: 'thread_continuity', matched_on: 'in_reply_to' },
      status: 'open',
    }
  }

  if (signals.aliasUnitId) {
    return {
      unitId: signals.aliasUnitId,
      residentId: signals.aliasResidentId,
      confidence: 'high',
      rule: 'sender_alias',
      reason: { rule: 'sender_alias', matched_on: 'inbox_sender_aliases' },
      status: 'open',
    }
  }

  if (signals.emailMatches.length === 1) {
    const hit = signals.emailMatches[0]
    return {
      unitId: hit.ref.unitId,
      residentId: hit.residentId,
      confidence: 'high',
      rule: 'resident_email',
      reason: { rule: 'resident_email', matched_on: hit.source },
      status: 'open',
    }
  }

  if (signals.emailMatches.length > 1) {
    // One person, several properties. Picking one would be a guess, and a
    // wrong guess feeds the wrong dues balance into a drafted reply.
    return {
      unitId: null,
      residentId: null,
      confidence: 'medium',
      rule: 'resident_email_ambiguous',
      reason: {
        rule: 'resident_email_ambiguous',
        matched_on: signals.emailMatches[0].source,
        candidate_unit_ids: signals.emailMatches.map((m) => m.ref.unitId),
      },
      status: 'needs_review',
    }
  }

  if (signals.addressUnitIds.length === 1) {
    return {
      unitId: null,
      residentId: null,
      confidence: 'medium',
      rule: 'address_in_body',
      reason: {
        rule: 'address_in_body',
        candidate_unit_ids: signals.addressUnitIds,
      },
      status: 'needs_review',
    }
  }

  if (signals.nameMatches.length === 1) {
    return {
      unitId: null,
      residentId: null,
      confidence: 'low',
      rule: 'sender_name',
      reason: {
        rule: 'sender_name',
        matched_on: signals.nameMatches[0].residentName,
        candidate_unit_ids: [signals.nameMatches[0].unitId],
      },
      status: 'needs_review',
    }
  }

  return {
    unitId: null,
    residentId: null,
    confidence: 'none',
    rule: 'none',
    reason: { rule: 'none' },
    status: 'needs_review',
  }
}

// ─── pure address extraction ─────────────────────────────────────────

const STREET_TYPE_WORDS = [
  'street', 'st', 'lane', 'ln', 'court', 'ct', 'drive', 'dr', 'road', 'rd',
  'avenue', 'ave', 'av', 'boulevard', 'blvd', 'circle', 'cir', 'place', 'pl',
  'terrace', 'ter', 'trail', 'trl', 'way',
]

/**
 * Pull candidate street addresses out of prose.
 *
 * Shape: a house number, one to three name words, then a street type.
 * Requiring the street type is what keeps "Invoice 4417" and "$340 due on
 * 15 July" from registering as addresses.
 */
export function extractAddressCandidates(text: string | null): string[] {
  if (!text) return []

  const pattern = new RegExp(
    String.raw`\b(\d{1,6})\s+((?:[A-Za-z][A-Za-z'’-]*\s+){1,3}?)(${STREET_TYPE_WORDS.join('|')})\b\.?`,
    'gi',
  )

  const found = new Set<string>()
  for (const match of text.matchAll(pattern)) {
    found.add(`${match[1]} ${match[2].trim()} ${match[3]}`.replace(/\s+/g, ' ').trim())
  }
  return [...found]
}

// ─── database probe ──────────────────────────────────────────────────

export async function matchThread(
  db: Db,
  orgId: string,
  threadId: string,
): Promise<MatchOutcome> {
  const { data: messages } = await db
    .from('inbox_messages')
    .select('from_email, from_name, subject, stripped_text, in_reply_to, references_ids')
    .eq('thread_id', threadId)
    .eq('direction', 'inbound')
    .order('sent_at', { ascending: true })

  const first = messages?.[0]
  if (!first) return decideMatch(buildEmptySignals())

  const signals = buildEmptySignals()

  // ── 1. thread continuity ────────────────────────────────────────
  const parentIds = [first.in_reply_to, ...(first.references_ids ?? [])].filter(
    (v): v is string => Boolean(v),
  )
  if (parentIds.length > 0) {
    const { data: parent } = await db
      .from('inbox_messages')
      .select('thread_id')
      .in('rfc822_message_id', parentIds)
      .neq('thread_id', threadId)
      .limit(1)
      .maybeSingle()

    if (parent) {
      const { data: parentThread } = await db
        .from('inbox_threads')
        .select('unit_id')
        .eq('id', parent.thread_id)
        .maybeSingle()
      signals.threadUnitId = parentThread?.unit_id ?? null
    }

    if (!signals.threadUnitId) {
      // Also try the outbound comms module — a resident replying to a
      // notice we sent through communications.
      const { data: recipient } = await db
        .from('communication_recipients')
        .select('unit_id')
        .in('external_id', parentIds)
        .limit(1)
        .maybeSingle()
      signals.threadUnitId = recipient?.unit_id ?? null
    }
  }

  const senderEmail = first.from_email
  if (senderEmail) {
    // ── 2. sender alias ───────────────────────────────────────────
    const { data: alias } = await db
      .from('inbox_sender_aliases')
      .select('unit_id, resident_id')
      .eq('organization_id', orgId)
      .ilike('email_address', senderEmail)
      .maybeSingle()

    signals.aliasUnitId = alias?.unit_id ?? null
    signals.aliasResidentId = alias?.resident_id ?? null

    // ── 3/4. resident email ───────────────────────────────────────
    signals.emailMatches = await resolvePropertyByEmail(db, orgId, senderEmail)
  }

  // ── 5. address in body or subject ───────────────────────────────
  const haystack = [first.subject, first.stripped_text].filter(Boolean).join('\n')
  const candidateUnitIds = new Set<string>()
  for (const candidate of extractAddressCandidates(haystack)) {
    for (const ref of await resolvePropertyByAddress(db, orgId, candidate)) {
      candidateUnitIds.add(ref.unitId)
    }
  }
  signals.addressUnitIds = [...candidateUnitIds]

  // ── 6. sender name ──────────────────────────────────────────────
  if (first.from_name && first.from_name.trim().length > 2) {
    const { data: residents } = await db
      .from('property_residents')
      .select('id, full_name, property_id')
      .eq('organization_id', orgId)
      .is('moved_out_at', null)
      .ilike('full_name', first.from_name.trim())

    const propertyIds = (residents ?? []).map((r) => r.property_id)
    if (propertyIds.length > 0) {
      const { data: units } = await db
        .from('units')
        .select('id, legacy_hoa_property_id')
        .eq('organization_id', orgId)
        .in('legacy_hoa_property_id', propertyIds)

      signals.nameMatches = (units ?? []).map((u) => {
        const resident = (residents ?? []).find(
          (r) => r.property_id === u.legacy_hoa_property_id,
        )
        return {
          unitId: u.id,
          residentId: resident?.id ?? null,
          residentName: resident?.full_name ?? '',
        }
      })
    }
  }

  return decideMatch(signals)
}

function buildEmptySignals(): MatchSignals {
  return {
    threadUnitId: null,
    aliasUnitId: null,
    aliasResidentId: null,
    emailMatches: [],
    addressUnitIds: [],
    nameMatches: [],
  }
}

/**
 * Write an outcome to the thread.
 *
 * Refuses to overwrite a manual assignment. A manager who filed a thread
 * by hand must not have it silently re-filed when a new message arrives.
 */
export async function applyMatch(
  db: Db,
  threadId: string,
  outcome: MatchOutcome,
): Promise<void> {
  const { data: thread } = await db
    .from('inbox_threads')
    .select('match_source, status')
    .eq('id', threadId)
    .maybeSingle()

  if (thread?.match_source === 'manual') return

  await db
    .from('inbox_threads')
    .update({
      unit_id: outcome.unitId,
      resident_id: outcome.residentId,
      match_confidence: outcome.confidence,
      match_reason: outcome.reason,
      match_source: 'auto',
      // Never reopen a closed thread just because it was re-matched.
      status: thread?.status === 'closed' ? 'closed' : outcome.status,
    })
    .eq('id', threadId)
}
```

**Amended post-review:** the embedded `matchThread` above passes
`senderEmail` straight to `.ilike('email_address', senderEmail)` for the
sender-alias lookup (signal 2), unescaped and unnormalized, while
`resolvePropertyByEmail` (signal 3/4) normalizes with `.trim().toLowerCase()`
internally. The as-built `apps/hoa/src/lib/inbox/match.ts` closed both
gaps: every `.ilike()` call is escaped via `escapeLikePattern` (so `_`/`%`
in an address aren't treated as wildcards), and `senderEmail` is normalized
once, near the top of `matchThread`, with the normalized value reused for
every subsequent comparison — so incidental whitespace or case from header
parsing can no longer make the alias lookup silently miss while the
resident-email lookup still succeeds. `matchThread` and `applyMatch` also
capture and throw on every Supabase error (`logDbError`), which the
embedded code block above omits for brevity.

- [ ] **Step 4: Run the tests**

```bash
rtk pnpm test:unit
```
Expected: PASS — 18 matcher tests.

- [ ] **Step 5: Write the integration test**

Create `scripts/test-inbox-match.ts`:

```ts
/**
 * scripts/test-inbox-match.ts
 *
 * Integration test for matchThread() against real Postgres. Seeds a
 * throwaway org with one property, one resident, and several threads that
 * should hit different signals, then asserts the outcome for each.
 *
 * Run:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   pnpm exec tsx scripts/test-inbox-match.ts
 */

import './_load-env'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../packages/db/src/database.types'
import { matchThread } from '../apps/hoa/src/lib/inbox/match'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const db = createClient<Database>(url, key)
const TAG = 'test-inbox-match-harness'
let failures = 0

function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

async function seedThread(
  orgId: string,
  accountId: string,
  gmailThreadId: string,
  message: {
    fromEmail: string
    fromName?: string
    subject?: string
    strippedText?: string
  },
): Promise<string> {
  const { data: thread } = await db
    .from('inbox_threads')
    .insert({
      organization_id: orgId,
      mailbox_account_id: accountId,
      gmail_thread_id: gmailThreadId,
      subject: message.subject ?? 'test',
    })
    .select('id')
    .single()

  await db.from('inbox_messages').insert({
    organization_id: orgId,
    thread_id: thread!.id,
    mailbox_account_id: accountId,
    gmail_message_id: `${gmailThreadId}-m1`,
    rfc822_message_id: `<${gmailThreadId}@mail>`,
    direction: 'inbound',
    from_email: message.fromEmail,
    from_name: message.fromName ?? null,
    subject: message.subject ?? 'test',
    stripped_text: message.strippedText ?? 'body',
    sent_at: new Date().toISOString(),
  })

  return thread!.id
}

async function main(): Promise<void> {
  const { data: org } = await db
    .from('orgs')
    .insert({ name: `${TAG}-org`, hub_type: 'hoa' })
    .select('id')
    .single()
  if (!org) throw new Error('could not seed org')

  const { data: property } = await db
    .from('hoa_properties')
    .insert({ org_id: org.id, address: '214 Oak Ln', owner_email: 'owner@example.test' })
    .select('id')
    .single()

  const { data: unit } = await db
    .from('units')
    .insert({
      organization_id: org.id,
      address_line1: '214 Oak Ln',
      legacy_hoa_property_id: property!.id,
    })
    .select('id')
    .single()

  const { data: resident } = await db
    .from('property_residents')
    .insert({
      organization_id: org.id,
      property_id: property!.id,
      full_name: 'Jenna Rivera',
      email: 'j.rivera@example.test',
      role: 'owner',
    })
    .select('id')
    .single()

  const { data: account } = await db
    .from('mailbox_accounts')
    .insert({
      organization_id: org.id,
      email_address: `board@${TAG}.test`,
      scope_mode: 'all',
    })
    .select('id')
    .single()

  // A: known resident email → high, auto-attach
  const tA = await seedThread(org.id, account!.id, `${TAG}-a`, {
    fromEmail: 'j.rivera@example.test',
  })
  const rA = await matchThread(db, org.id, tA)
  check(
    'A. known resident email → high + unit attached',
    rA.confidence === 'high' && rA.unitId === unit!.id && rA.residentId === resident!.id,
    `${rA.confidence}/${rA.rule}`,
  )

  // B: owner_email → high
  const tB = await seedThread(org.id, account!.id, `${TAG}-b`, {
    fromEmail: 'owner@example.test',
  })
  const rB = await matchThread(db, org.id, tB)
  check(
    'B. owner_email → high',
    rB.confidence === 'high' && rB.unitId === unit!.id,
    `${rB.confidence}/${rB.rule}`,
  )

  // C: unknown sender, address in body → medium, NOT attached
  const tC = await seedThread(org.id, account!.id, `${TAG}-c`, {
    fromEmail: 'stranger@example.test',
    strippedText: 'I am writing about 214 Oak Lane, the gate is broken.',
  })
  const rC = await matchThread(db, org.id, tC)
  check(
    'C. address in body → medium, unit NOT auto-attached',
    rC.confidence === 'medium' && rC.unitId === null &&
      rC.reason.candidate_unit_ids?.[0] === unit!.id,
    `${rC.confidence}/${rC.rule}`,
  )

  // D: fully unknown → none
  const tD = await seedThread(org.id, account!.id, `${TAG}-d`, {
    fromEmail: 'vendor@example.test',
    strippedText: 'Invoice 4417 attached, $340 due.',
  })
  const rD = await matchThread(db, org.id, tD)
  check(
    'D. unknown sender, no address → none',
    rD.confidence === 'none' && rD.unitId === null,
    `${rD.confidence}/${rD.rule}`,
  )

  // E: sender alias overrides
  await db.from('inbox_sender_aliases').insert({
    organization_id: org.id,
    email_address: 'vendor@example.test',
    unit_id: unit!.id,
  })
  const rE = await matchThread(db, org.id, tD)
  check(
    'E. learned alias promotes the same sender to high',
    rE.confidence === 'high' && rE.unitId === unit!.id && rE.rule === 'sender_alias',
    `${rE.confidence}/${rE.rule}`,
  )

  // cleanup
  await db.from('orgs').delete().eq('id', org.id)

  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
```

- [ ] **Step 6: Add the script and run it**

In root `package.json`:

```json
    "test:inbox-match": "tsx scripts/test-inbox-match.ts",
```

```bash
rtk pnpm exec tsx scripts/test-inbox-match.ts
```
Expected: `ALL PASS` — 5 checks.

- [ ] **Step 7: Typecheck and commit**

```bash
rtk pnpm typecheck && rtk git add apps/hoa/src/lib/inbox/ scripts/test-inbox-match.ts package.json && rtk git commit -m "feat(inbox): deterministic six-signal matcher with auditable reasons"
```

**Amended post-review (see `.superpowers/sdd/task-14-report.md`,
"Fix pass — org-scoping + signal coverage"):** the 5-check integration
script above only ever exercised sender-alias, resident-email, owner-email,
address-in-body, and none — three of the six signals (thread continuity,
ambiguous email across two bridged properties, and sender name) were never
proven to wire from Postgres into `decideMatch` correctly. `scripts/test-inbox-match.ts`
now seeds fixtures F (thread continuity), G (ambiguous email — one person,
two properties, both candidate unit ids asserted), and H (sender name), plus
fixture I asserting that the sender-alias lookup normalizes a `from_email`
with surrounding whitespace and mixed case (see the Step 3 amendment note
above on `senderEmail` normalization). The previously-dead `skip()`
counter is now wired: fixtures F/G/H each seed inside a `try/catch` and call
`skip()` if a prerequisite insert fails, rather than aborting the whole run.
The "Ruling" check was broadened from asserting only outcomes C and D to
walking every outcome the script produced. Current run: 12 checks (A, B, C,
D, E, I, F, G, H, Ruling, Z, Za), all PASS, zero skips — see the report for
full output.

---

## Task 15: Sync job, token access, and the stall watchdog

The stalled-sync watchdog matters more than any other failure handling in this feature: a board that believes email is flowing while residents go unanswered loses trust in the product permanently.

**Files:**
- Create: `packages/jobs/src/mailbox-tokens.ts`, `src/mailbox-sync.ts`
- Modify: `packages/jobs/src/index.ts`, `packages/jobs/package.json`
- Modify: `apps/hoa/src/app/api/inngest/route.ts`

**Interfaces:**
- Consumes: `syncMailbox`, `GmailClient`, `refreshAccessToken`, `decryptToken`, `encryptToken`, `MailboxAuthError` (Tasks 6–12); `ingestMessages` (Task 13); `matchThread`, `applyMatch` (Task 14)
- Produces:
  ```ts
  getAccessTokenFor(db, accountId): Promise<string>   // refreshes + re-persists as needed
  mailboxSyncJob, mailboxWatchdogJob                   // Inngest functions
  ```

- [ ] **Step 1: Add the workspace dependency**

In `packages/jobs/package.json`, add to `dependencies`:

```json
    "@homeowner-portal/mailbox": "workspace:*",
```

```bash
rtk pnpm install
```

- [ ] **Step 2: Write `packages/jobs/src/mailbox-tokens.ts`**

```ts
/**
 * Access-token custody for mailbox sync.
 *
 * Tokens live in mailbox_account_secrets, which has RLS enabled and NO
 * permissive policy — only the service role can touch it. Everything here
 * therefore uses createAdminClient().
 *
 * Refresh happens 5 minutes before expiry rather than on failure, so a
 * sync run never burns a Gmail call discovering its token is dead.
 */

import { createAdminClient } from '@homeowner-portal/db'
import {
  currentKeyVersion,
  decryptToken,
  encryptToken,
  MailboxAuthError,
  refreshAccessToken,
} from '@homeowner-portal/mailbox'

type Db = ReturnType<typeof createAdminClient>

const REFRESH_MARGIN_MS = 5 * 60 * 1000

/**
 * Structural rather than importing `PostgrestError` from
 * `@supabase/supabase-js` directly — this package depends on it only
 * transitively (through `@homeowner-portal/db`), and `.message`/`.code` is
 * all any caller here needs. Never log `.details`: on a PostgrestError it
 * can carry row values, which may include resident PII.
 */
type DbError = { message: string; code?: string } | Error

function logDbError(
  fn: string,
  table: string,
  context: Record<string, string | null>,
  error: DbError,
): void {
  console.error(`${fn}: query on "${table}" failed`, {
    ...context,
    code: 'code' in error ? error.code : undefined,
    message: error.message,
  })
}

// A DB read failure and a genuine zero-row result look identical unless
// `error` is checked. supabase-js's `.maybeSingle()` returns
// `{ data: null, error: <PostgrestError> }` WITHOUT throwing on a soft
// failure — an RLS misconfiguration, connection-pool exhaustion, a
// transient Postgres blip. Below, only a CLEAN read with genuinely zero
// rows (`error === null && data === null`) may become a MailboxAuthError.
// A non-null `error` throws a generic, retryable Error instead — because
// MailboxAuthError sends the caller (mailbox-sync.ts) to markAuthFailed,
// which sets sync_status='auth_failed', and the account-listing query
// filters `.neq('sync_status', 'auth_failed')` — so misclassifying a
// transient blip as an auth failure would permanently drop a working
// mailbox from every future run until a human notices and reconnects.
export async function getAccessTokenFor(db: Db, accountId: string): Promise<string> {
  const { data: secret, error } = await db
    .from('mailbox_account_secrets')
    .select('refresh_token_enc, access_token_enc, token_expires_at')
    .eq('mailbox_account_id', accountId)
    .maybeSingle()

  if (error) {
    logDbError('getAccessTokenFor', 'mailbox_account_secrets', { accountId }, error)
    throw new Error(
      `getAccessTokenFor: failed to read credentials for mailbox account ${accountId}: ${error.message}`,
    )
  }

  if (!secret) {
    throw new MailboxAuthError(`No stored credentials for mailbox account ${accountId}.`)
  }

  const stillValid =
    secret.access_token_enc &&
    secret.token_expires_at &&
    new Date(secret.token_expires_at).getTime() - Date.now() > REFRESH_MARGIN_MS

  if (stillValid) return decryptToken(secret.access_token_enc as string)

  const tokens = await refreshAccessToken(decryptToken(secret.refresh_token_enc))

  const { error: updateError } = await db
    .from('mailbox_account_secrets')
    .update({
      access_token_enc: encryptToken(tokens.accessToken),
      // Google may rotate the refresh token; persist it when it does.
      refresh_token_enc: tokens.refreshToken
        ? encryptToken(tokens.refreshToken)
        : secret.refresh_token_enc,
      token_expires_at: tokens.expiresAt,
      key_version: currentKeyVersion(),
      updated_at: new Date().toISOString(),
    })
    .eq('mailbox_account_id', accountId)

  if (updateError) {
    // The refreshed token is good and would otherwise be handed back to
    // the caller below, but if the persist fails, the next run reads the
    // stale pre-refresh row and just refreshes again — wasted work, not
    // silent data loss, but it must be visible and retried, not swallowed.
    logDbError('getAccessTokenFor', 'mailbox_account_secrets', { accountId }, updateError)
    throw new Error(
      `getAccessTokenFor: failed to persist refreshed token for mailbox account ${accountId}: ${updateError.message}`,
    )
  }

  return tokens.accessToken
}

/**
 * Credentials are dead. Stop retrying — hammering Google's token endpoint
 * with a revoked grant is how an OAuth client gets flagged — and make the
 * failure visible so someone reconnects.
 *
 * Judgement call: this runs on an error path — the caller already caught
 * a MailboxAuthError and is about to log it. If THIS write also fails,
 * throwing would replace that original, more informative auth failure
 * with a less useful "couldn't record the failure" error, so this logs
 * loudly instead of throwing. A failed write here just means
 * sync_status never actually flips to 'auth_failed', so the account stays
 * in the sync rotation and fails the same way again next run — the safer
 * of the two failure modes, and self-correcting once the write succeeds.
 */
export async function markAuthFailed(
  db: Db,
  accountId: string,
  message: string,
): Promise<void> {
  const { error } = await db
    .from('mailbox_accounts')
    .update({ sync_status: 'auth_failed', sync_error: message })
    .eq('id', accountId)

  if (error) {
    logDbError('markAuthFailed', 'mailbox_accounts', { accountId }, error)
  }
}
```

- [ ] **Step 3: Write `packages/jobs/src/mailbox-sync.ts`**

```ts
import { createAdminClient } from '@homeowner-portal/db'
import { GmailClient, MailboxAuthError, syncMailbox } from '@homeowner-portal/mailbox'
import { ingestMessages } from '../../../apps/hoa/src/lib/inbox/ingest'
import { applyMatch, matchThread } from '../../../apps/hoa/src/lib/inbox/match'
import { inngest } from './client'
import { getAccessTokenFor, markAuthFailed } from './mailbox-tokens'

type DbError = { message: string; code?: string } | Error

function logDbError(
  fn: string,
  table: string,
  context: Record<string, string | null>,
  error: DbError,
): void {
  console.error(`${fn}: query on "${table}" failed`, {
    ...context,
    code: 'code' in error ? error.code : undefined,
    message: error.message,
  })
}

/**
 * Mailbox sync — every 2 minutes.
 *
 * This is a plain global lock (`limit: 1`, no key), not a per-account one.
 * The job is cron-triggered — Inngest's internal cron event carries no
 * `accountId` — so a key expression like `event.data.accountId` evaluates
 * to the same empty value on every run and produces exactly the same
 * global lock as writing no key at all, just with a misleading comment
 * claiming per-account isolation. Being honest about that: this prevents
 * overlapping invocations of the whole job, nothing more. The unique
 * indexes on inbox_threads and inbox_messages are what actually guard
 * against duplicate writes at the row level. Genuine per-account isolation
 * (so one slow mailbox can't back up every other tenant's sync window)
 * would require fanning out one event per account instead of looping over
 * all of them in a single cron invocation — a deliberate follow-up, not
 * something a concurrency key alone can achieve.
 *
 * A per-account failure is caught and recorded rather than thrown,
 * because one HOA with revoked credentials must not stop every other
 * tenant's mail from syncing.
 */
export const mailboxSyncJob = inngest.createFunction(
  {
    id: 'mailbox-sync',
    name: 'Mailbox Sync',
    concurrency: [{ limit: 1 }],
  },
  { cron: '*/2 * * * *' },
  async ({ logger }) => {
    const db = createAdminClient()

    const { data: accounts, error: accountsError } = await db
      .from('mailbox_accounts')
      .select(
        'id, organization_id, email_address, scope_mode, scope_value, sync_cursor, backfill_status',
      )
      .is('disconnected_at', null)
      .neq('sync_status', 'auth_failed')

    if (accountsError) {
      // Do NOT fall into the "no connected mailboxes" branch on a failed
      // query — that log line would lie about why nothing synced. Throw
      // so the run fails visibly instead.
      logDbError('mailboxSyncJob', 'mailbox_accounts', {}, accountsError)
      throw new Error(`mailboxSyncJob: failed to load mailbox accounts: ${accountsError.message}`)
    }

    if (!accounts || accounts.length === 0) {
      logger.info('[mailbox-sync] no connected mailboxes')
      return { accounts: 0 }
    }

    let synced = 0

    for (const account of accounts) {
      try {
        const accessToken = await getAccessTokenFor(db, account.id)
        const client = new GmailClient(accessToken)

        // Seven days back covers the history-expiry window exactly.
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        const fallbackAfterDate = sevenDaysAgo.toISOString().slice(0, 10).replace(/-/g, '/')

        const result = await syncMailbox(
          client,
          {
            id: account.id,
            emailAddress: account.email_address,
            scopeMode: account.scope_mode as 'address' | 'label' | 'all',
            scopeValue: account.scope_value,
            syncCursor: account.sync_cursor,
          },
          { fallbackAfterDate },
        )

        if (result.usedFallback) {
          logger.warn(
            `[mailbox-sync] ${account.email_address}: historyId expired, used dated re-sync`,
          )
        }

        // Backfill is requested on ANY truncated run, not only a truncated
        // fallback run — see sync.ts for why a capped HISTORY run can also
        // need it (out-of-scope events can hold the cursor still forever
        // on their own). Backfill paginates properly with page tokens and
        // is idempotent against inbox_messages' unique index, so
        // requesting it unconditionally on any truncated run is what
        // guarantees forward progress either way.
        //
        // BUT: not if a backfill for this account is already `'running'`.
        // That chain reaches the frontier on its own; re-requesting would
        // start a second concurrent chain from `pageToken: undefined`,
        // wasting Gmail quota and resetting `done` to 0 in
        // `backfill_progress` so the setup UI's counter visibly counts
        // backward mid-import. This requires selecting `backfill_status`
        // alongside the other account columns above.
        if (result.truncated) {
          if (account.backfill_status === 'running') {
            logger.info(
              `[mailbox-sync] ${account.email_address}: truncated run — backfill ` +
                `already running, not re-requesting`,
            )
          } else {
            logger.warn(
              `[mailbox-sync] ${account.email_address}: truncated run` +
                `${result.usedFallback ? ' (fallback)' : ' (history)'} — requesting backfill`,
            )
            await inngest.send({
              name: 'mailbox/backfill.requested',
              data: { accountId: account.id },
            })
          }
        }

        if (result.fetchFailures > 0) {
          // Opaque Gmail message ids only — never an address, subject, or
          // body.
          logger.warn(
            `[mailbox-sync] ${account.email_address}: ${result.fetchFailures} ` +
              `message(s) could not be fetched or parsed and were skipped`,
          )
        }

        const ingested = await ingestMessages(
          db,
          account.organization_id,
          account.id,
          result.messages,
        )

        // Match only threads that actually received new messages.
        if (ingested.messagesInserted > 0) {
          const gmailThreadIds = [
            ...new Set(result.messages.map((m) => m.gmailThreadId)),
          ]
          const { data: threads } = await db
            .from('inbox_threads')
            .select('id')
            .eq('mailbox_account_id', account.id)
            .in('gmail_thread_id', gmailThreadIds)

          for (const thread of threads ?? []) {
            await applyMatch(
              db,
              account.organization_id,
              thread.id,
              await matchThread(db, account.organization_id, thread.id),
            )
          }
        }

        // A non-zero fetchFailures means specific messages are missing
        // from an otherwise-successful run. Surface that on the account
        // record rather than letting sync_status='ok' + sync_error=null
        // claim a clean run that wasn't quite complete.
        const syncError =
          result.fetchFailures > 0
            ? `${result.fetchFailures} message(s) could not be fetched or parsed on the last sync and were skipped.`
            : null

        const { error: statusError } = await db
          .from('mailbox_accounts')
          .update({
            sync_cursor: result.nextCursor,
            last_synced_at: new Date().toISOString(),
            sync_status: 'ok',
            sync_error: syncError,
          })
          .eq('id', account.id)

        if (statusError) {
          // A silently-failed status write is worse than no write: the
          // success log and synced++ below would fire while the database
          // record disagrees. Throw so this account falls into the catch
          // block below like any other failure — cursor unadvanced,
          // `synced` not incremented, retried next run.
          logDbError('mailboxSyncJob', 'mailbox_accounts', { accountId: account.id }, statusError)
          throw new Error(
            `mailboxSyncJob: failed to persist sync status for ${account.email_address}: ${statusError.message}`,
          )
        }

        if (ingested.attachmentsQueued > 0) {
          await inngest.send({
            name: 'mailbox/attachments.queued',
            data: { accountId: account.id },
          })
        }

        synced++
        logger.info(
          `[mailbox-sync] ${account.email_address}: +${ingested.messagesInserted} msg, ` +
            `${ingested.messagesSkipped} dupes, ${ingested.threadsCreated} new threads`,
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)

        if (error instanceof MailboxAuthError) {
          await markAuthFailed(db, account.id, message)
          logger.error(`[mailbox-sync] ${account.email_address}: AUTH FAILED — ${message}`)
        } else {
          const { error: recordError } = await db
            .from('mailbox_accounts')
            .update({ sync_error: message })
            .eq('id', account.id)

          // Judgement call: already inside the catch block for the
          // ORIGINAL failure. If this write also fails, throwing would
          // propagate out of the per-account try/catch — there is no
          // outer catch around the loop — and abort every remaining
          // account's sync for a strictly less informative error. So this
          // logs loudly instead of throwing; the original error is still
          // logged below unconditionally.
          if (recordError) {
            logDbError('mailboxSyncJob', 'mailbox_accounts', { accountId: account.id }, recordError)
          }
          logger.error(`[mailbox-sync] ${account.email_address}: ${message}`)
        }
        // Continue to the next account — one bad mailbox must not stop
        // every other tenant's mail.
      }
    }

    return { accounts: accounts.length, synced }
  },
)

/**
 * Stall watchdog — every 15 minutes.
 *
 * The most dangerous failure in this feature is the silent one: the cron
 * stops, or every run throws, and nobody notices for a week while
 * residents go unanswered. A sync that has not completed in 30 minutes is
 * broken by definition — the cron runs every 2.
 *
 * A second, independent check covers the historical backfill chain (Task
 * 16). That chain's own try/catch records `backfill_status: 'failed'` on
 * any JS-level throw, but a step that dies out-of-band — a platform
 * timeout, an OOM, a process kill — never reaches the catch and leaves
 * the row at `backfill_status: 'running'` forever. That gap got sharper
 * once mailboxSyncJob started skipping its re-trigger of
 * `mailbox/backfill.requested` while `backfill_status` is already
 * `'running'` (see the comment on that check in Step 3 above): the
 * accidental recovery a blind re-trigger used to provide is gone, so
 * without this second check a killed backfill leaves the setup UI showing
 * "Importing history…" indefinitely, with no code path able to correct
 * it.
 *
 * Staleness is read from `backfill_updated_at`
 * (migrations/0032_mailbox_backfill_watchdog.sql), a column stamped by a
 * DB trigger on `mailbox_accounts` whenever `backfill_status` or
 * `backfill_progress` changes — deliberately NOT by application code, so
 * mailbox-backfill.ts (Task 16) needed no changes to keep it current: its
 * existing per-page `.update()` already touches both columns.
 *
 * Threshold: 30 minutes, same as the sync check above, chosen with a wide
 * margin over any legitimate in-flight page. A page is expected to take
 * seconds; even the pathological case — every one of PAGE_SIZE (50)
 * message fetches hitting GmailClient's full retry ladder (3 retries,
 * ~500–2500ms backoff each) — tops out around 3-4 minutes for a single
 * page, roughly an order of magnitude under 30. A chain making normal
 * progress re-emits (and the trigger re-stamps `backfill_updated_at`)
 * every page, so 30 minutes of silence cannot be a healthy chain that
 * just happens to be mid-flight.
 *
 * On detection this marks `backfill_status: 'failed'` rather than
 * re-emitting `mailbox/backfill.requested` directly from here.
 * Considered and rejected: resuming correctly needs `pageToken` and
 * `afterDate`, which live only in the event payload threaded through the
 * chain — `backfill_progress` persists `done`/`has_more`/`total_estimate`
 * but not those two, so this watchdog has no way to resume mid-chain and
 * would have to restart from scratch regardless of which path fires the
 * event. Marking `'failed'` is a single honest state change that both
 * fixes the setup UI and releases mailboxSyncJob's own re-trigger guard
 * so the *next* truncated sync run restarts the chain using logic that
 * already exists and is already tested there, instead of duplicating
 * "start a fresh backfill" event-emission in a second file — which would
 * also risk a duplicate concurrent chain if the "dead" process turns out
 * to still be alive and finishes after this watchdog already re-emitted.
 *
 * This is not a complete recovery guarantee: restart depends on a future
 * truncated sync run for this account. That dependency was already
 * accepted when mailboxSyncJob's re-trigger guard stopped re-requesting a
 * `'running'` backfill; this watchdog closes the "permanently stuck" gap
 * that change introduced, not a pre-existing gap in how restarts fire.
 */
export const mailboxWatchdogJob = inngest.createFunction(
  { id: 'mailbox-watchdog', name: 'Mailbox Stall Watchdog' },
  { cron: '*/15 * * * *' },
  async ({ logger }) => {
    const db = createAdminClient()
    const threshold = new Date(Date.now() - 30 * 60 * 1000).toISOString()

    const { data: stalled, error: stalledError } = await db
      .from('mailbox_accounts')
      .select('id, email_address, last_synced_at')
      .is('disconnected_at', null)
      .eq('sync_status', 'ok')
      .or(`last_synced_at.is.null,last_synced_at.lt.${threshold}`)

    if (stalledError) {
      // A watchdog whose own read fails soft — `stalled` ends up null, the
      // loop below never runs, the function returns a clean
      // `{ stalled: 0 }` — is the worst version of the exact bug this job
      // exists to catch: Inngest's own failure tracking would see a
      // successful run. Throw so this is a visible, failing execution.
      logDbError('mailboxWatchdogJob', 'mailbox_accounts', {}, stalledError)
      throw new Error(`mailboxWatchdogJob: failed to load sync status: ${stalledError.message}`)
    }

    for (const account of stalled ?? []) {
      const { error: flagError } = await db
        .from('mailbox_accounts')
        .update({
          sync_status: 'stalled',
          sync_error: `No successful sync since ${account.last_synced_at ?? 'connection'}.`,
        })
        .eq('id', account.id)

      if (flagError) {
        // No enclosing per-account handler here to demote this to "record
        // and continue" — throw, same as the read above: a stall that
        // fails to get flagged must still fail the run visibly.
        logDbError('mailboxWatchdogJob', 'mailbox_accounts', { accountId: account.id }, flagError)
        throw new Error(
          `mailboxWatchdogJob: failed to flag ${account.email_address} as stalled: ${flagError.message}`,
        )
      }

      logger.error(`[mailbox-watchdog] STALLED: ${account.email_address}`)
    }

    // Second, independent check: a backfill chain stuck at
    // `backfill_status: 'running'` with no forward progress in 30 minutes.
    // See the doc comment above for why `backfill_updated_at` is the right
    // signal and why 'failed' (not a direct re-emit) is the right action.
    const { data: stalledBackfills, error: stalledBackfillsError } = await db
      .from('mailbox_accounts')
      .select('id, email_address, backfill_updated_at')
      .is('disconnected_at', null)
      .eq('backfill_status', 'running')
      .or(`backfill_updated_at.is.null,backfill_updated_at.lt.${threshold}`)

    if (stalledBackfillsError) {
      // Same reasoning as the sync-status read above: a soft failure here
      // must not be allowed to look like "nothing stalled" — throw so the
      // run fails visibly instead.
      logDbError('mailboxWatchdogJob', 'mailbox_accounts', {}, stalledBackfillsError)
      throw new Error(
        `mailboxWatchdogJob: failed to load backfill status: ${stalledBackfillsError.message}`,
      )
    }

    for (const account of stalledBackfills ?? []) {
      const { error: flagError } = await db
        .from('mailbox_accounts')
        .update({
          backfill_status: 'failed',
          sync_error: `Backfill made no progress since ${account.backfill_updated_at ?? 'it started'}.`,
        })
        .eq('id', account.id)

      if (flagError) {
        // Same judgement as the sync-stall loop above: no enclosing
        // handler to demote this to "record and continue" — a backfill
        // stall that fails to get flagged must still fail the run visibly.
        logDbError('mailboxWatchdogJob', 'mailbox_accounts', { accountId: account.id }, flagError)
        throw new Error(
          `mailboxWatchdogJob: failed to flag ${account.email_address}'s backfill as failed: ${flagError.message}`,
        )
      }

      logger.error(`[mailbox-watchdog] BACKFILL STALLED: ${account.email_address}`)
    }

    return {
      stalled: stalled?.length ?? 0,
      backfillStalled: stalledBackfills?.length ?? 0,
    }
  },
)
```

**Migration:** `migrations/0032_mailbox_backfill_watchdog.sql` adds
`mailbox_accounts.backfill_updated_at`, a `BEFORE UPDATE` trigger that
stamps it whenever `backfill_status` or `backfill_progress` changes, and
`mailbox_accounts_backfill_idx` (mirrors `mailbox_accounts_sync_idx` from
0029). The trigger — not an application-code write — is what keeps this
column current without touching mailbox-backfill.ts (Task 16). Idempotent;
applied with `rtk supabase db query --linked < migrations/0032_mailbox_backfill_watchdog.sql`
and verified by re-running it and confirming the column/trigger/index all
already exist on the second pass.

- [ ] **Step 4: Export the jobs**

Add to `packages/jobs/src/index.ts`:

```ts
export { mailboxSyncJob, mailboxWatchdogJob } from './mailbox-sync'
```

- [ ] **Step 5: Mount them in the Inngest handler**

In `apps/hoa/src/app/api/inngest/route.ts`, add to the import list:

```ts
  mailboxSyncJob,
  mailboxWatchdogJob,
```

and to the `functions` array:

```ts
    mailboxSyncJob,
    mailboxWatchdogJob,
```

- [ ] **Step 6: Surface stalled mailboxes in the daily digest**

In `packages/jobs/src/daily-digest.ts`, inside the per-org section that assembles digest content, add:

```ts
    const { data: brokenMailboxes, error: brokenMailboxesError } = await db
      .from('mailbox_accounts')
      .select('email_address, sync_status, sync_error')
      .eq('organization_id', org.id)
      .is('disconnected_at', null)
      .in('sync_status', ['stalled', 'auth_failed'])

    if (brokenMailboxesError) {
      // Judgement call: this check is best-effort visibility running
      // alongside digest generation, not a gate on it (see the module doc
      // comment — it runs "regardless of whether digest generation itself
      // succeeds"). A failed query must not read as "nothing is broken",
      // so it's logged loudly (message/code only — PostgrestError.details
      // can carry row values), but it does not throw and does not abort
      // this org's digest.
      logger.error(`[daily-digest] ${org.id}: failed to check mailbox sync status`, {
        code: brokenMailboxesError.code,
        message: brokenMailboxesError.message,
      })
    }

    for (const mailbox of brokenMailboxes ?? []) {
      logger.error(
        `[daily-digest] ${org.id}: mailbox ${mailbox.email_address} is ` +
          `${mailbox.sync_status} — ${mailbox.sync_error ?? 'no detail'}`,
      )
    }
```

- [ ] **Step 7: Typecheck**

```bash
rtk pnpm typecheck
```
Expected: PASS.

- [ ] **Step 8: Verify Inngest registers the functions**

```bash
rtk pnpm dev:hoa
```
Then in another terminal:

```bash
rtk curl -s http://localhost:3000/api/inngest | head -40
```
Expected: JSON listing function ids including `mailbox-sync` and `mailbox-watchdog`. Stop the dev server afterward.

- [ ] **Step 9: Commit**

```bash
rtk git add packages/jobs/ apps/hoa/src/app/api/inngest/route.ts pnpm-lock.yaml && rtk git commit -m "feat(jobs): mailbox sync cron, token refresh custody, stall watchdog"
```

---

## Task 16: Historical backfill job

Imports 12 months of history so the connect preview has real numbers and Phase B inherits a corpus.

**Files:**
- Create: `packages/jobs/src/mailbox-backfill.ts`
- Modify: `packages/jobs/src/index.ts`, `apps/hoa/src/app/api/inngest/route.ts`

**Interfaces:**
- Consumes: `GmailClient`, `buildScopeQuery`, `parseGmailMessage`, `isInScope` (Tasks 7–11); `getAccessTokenFor` (Task 15); `ingestMessages` (Task 13); `matchThread`/`applyMatch` (Task 14)
- Produces: `mailboxBackfillJob`, triggered by the `mailbox/backfill.requested` event

**INVARIANT (load-bearing — do not violate when touching this file):** the
number of message ids this job FETCHES on a page must always equal the
number it PROCESSES on that same page. `GmailClient.listMessages` takes an
optional `maxResults` (defaulting to 100, unchanged for `sync.ts`); the
backfill passes `PAGE_SIZE` as `maxResults` so the page it receives already
contains at most `PAGE_SIZE` ids, and it processes every one of them before
looking at `nextPageToken`. `nextPageToken` is Gmail's cursor for "after
everything this page contained" — fetching more than is processed (e.g. by
slicing the page down after receiving up to 100 results) silently drops the
unprocessed remainder: never ingested, never scope-checked, and never
retried, because the next page token already points past it. An earlier
version of this job did exactly that — requested Gmail's default 100 results
per page, then `.slice(0, PAGE_SIZE)`'d it down to 50 before the fetch loop,
dropping message positions 50–99 of every page, silently, forever. If a
smaller effective page is ever needed, shrink `PAGE_SIZE` — never fetch N and
process fewer than N.

- [ ] **Step 1: Write `packages/jobs/src/mailbox-backfill.ts`**

```ts
import { createAdminClient } from '@homeowner-portal/db'
import {
  buildScopeQuery,
  GmailClient,
  isInScope,
  MailboxAuthError,
  parseGmailMessage,
} from '@homeowner-portal/mailbox'
import { ingestMessages } from '../../../apps/hoa/src/lib/inbox/ingest'
import { applyMatch, matchThread } from '../../../apps/hoa/src/lib/inbox/match'
import { logDbError } from './db-error'
import { inngest } from './client'
import { getAccessTokenFor, markAuthFailed } from './mailbox-tokens'

const BACKFILL_MONTHS = 12
const PAGE_SIZE = 50

interface BackfillAccount {
  id: string
  organization_id: string
  email_address: string
  scope_mode: string
  scope_value: string | null
}

/**
 * Historical backfill, event-triggered at mailbox connect (and re-triggered
 * by mailbox-sync.ts on a truncated run whose backfill is not already in
 * flight — see Task 15).
 *
 * Separate from mailboxSyncJob because it is a fundamentally different
 * shape: thousands of messages instead of a handful, minutes instead of
 * seconds. Running it inside the 2-minute cron would starve every other
 * mailbox.
 *
 * Resumable by design. Each invocation drains one page of up to PAGE_SIZE
 * messages and re-emits itself while work remains, so no single function
 * invocation can exceed the platform timeout, and a crash resumes from the
 * last page token instead of restarting twelve months of history. Progress
 * is written to mailbox_accounts.backfill_progress for the setup UI.
 *
 * The account lookup and the `backfill_status: 'running'` write both live
 * INSIDE the try block below (not before it) so a transient failure in
 * either one is caught by the same catch that records `backfill_status:
 * 'failed'`. That catch only fires on a JS-level throw, though — it
 * cannot run if the invocation dies out-of-band (platform timeout, OOM,
 * process kill). mailboxWatchdogJob (Task 15) now covers exactly that gap
 * via `backfill_updated_at`, a column a DB trigger keeps current without
 * any change to this file (see the watchdog's own comment in Task 15 for
 * the full reasoning) — but this file's own try/catch remains the primary,
 * faster-acting mechanism; the watchdog is the 30-minute backstop for what
 * escapes it.
 */
export const mailboxBackfillJob = inngest.createFunction(
  {
    id: 'mailbox-backfill',
    name: 'Mailbox Historical Backfill',
    concurrency: [{ key: 'event.data.accountId', limit: 1 }],
  },
  { event: 'mailbox/backfill.requested' },
  async ({ event, logger, step }) => {
    const db = createAdminClient()
    const accountId = event.data.accountId as string
    const pageToken = (event.data.pageToken as string | undefined) ?? undefined
    const doneSoFar = (event.data.done as number | undefined) ?? 0

    // Carried forward from the event that started this chain (see the
    // re-emit below), computed/observed ONCE on the first invocation:
    //   - afterDate: pageToken is bound to the query string that minted
    //     it, so recomputing `afterDate` from `new Date()` on every
    //     invocation would mint a different `after:` clause if the chain
    //     spans midnight and replay a stale pageToken against it.
    //   - totalEstimate: Gmail's resultSizeEstimate is only meaningful as
    //     a stable "of ~N" figure if read once, from the first page, not
    //     re-read (and possibly drifting) on every page.
    const carriedAfterDate = event.data.afterDate as string | undefined
    const carriedTotalEstimate = (event.data.totalEstimate as number | null | undefined) ?? null

    let account: BackfillAccount | null = null

    try {
      const { data: accountData, error: accountError } = await db
        .from('mailbox_accounts')
        .select('id, organization_id, email_address, scope_mode, scope_value')
        .eq('id', accountId)
        .is('disconnected_at', null)
        .maybeSingle()

      if (accountError) {
        logDbError('mailboxBackfillJob', 'mailbox_accounts', { accountId }, accountError)
        throw new Error(
          `mailboxBackfillJob: failed to load mailbox account ${accountId}: ${accountError.message}`,
        )
      }

      if (!accountData) {
        logger.warn(`[mailbox-backfill] account ${accountId} not found or disconnected`)
        return { skipped: true }
      }

      account = accountData

      const { error: runningError } = await db
        .from('mailbox_accounts')
        .update({ backfill_status: 'running' })
        .eq('id', accountId)

      if (runningError) {
        logDbError('mailboxBackfillJob', 'mailbox_accounts', { accountId }, runningError)
      }

      const accessToken = await getAccessTokenFor(db, accountId)
      const client = new GmailClient(accessToken)

      let afterDate: string
      if (carriedAfterDate) {
        afterDate = carriedAfterDate
      } else {
        const since = new Date()
        since.setMonth(since.getMonth() - BACKFILL_MONTHS)
        afterDate = since.toISOString().slice(0, 10).replace(/-/g, '/')
      }

      const query = buildScopeQuery(
        account.scope_mode as 'address' | 'label' | 'all',
        account.scope_value,
        afterDate,
      )

      // PAGE_SIZE passed as maxResults — see the INVARIANT above. Every id
      // in page.messageIds is processed below; never slice it down.
      const page = await client.listMessages(query, pageToken, PAGE_SIZE)
      const ids = page.messageIds
      const totalEstimate = carriedTotalEstimate ?? page.resultSizeEstimate ?? null

      const messages = []
      let fetchFailures = 0
      for (const id of ids) {
        let parsed
        try {
          parsed = parseGmailMessage(await client.getMessage(id))
        } catch (error) {
          if (error instanceof MailboxAuthError) throw error
          fetchFailures++
          console.error(
            `mailbox backfill: skipping unfetchable message ${id}`,
            error instanceof Error ? error.message : String(error),
          )
          continue
        }

        if (
          isInScope(
            parsed,
            account.scope_mode as 'address' | 'label' | 'all',
            account.scope_value,
          )
        ) {
          messages.push(parsed)
        }
      }

      if (fetchFailures > 0) {
        logger.warn(
          `[mailbox-backfill] ${account.email_address}: ${fetchFailures} ` +
            `message(s) could not be fetched or parsed and were skipped`,
        )
      }

      const ingested = await ingestMessages(db, account.organization_id, accountId, messages)

      if (messages.length > 0) {
        const gmailThreadIds = [...new Set(messages.map((m) => m.gmailThreadId))]
        const { data: threads, error: threadsError } = await db
          .from('inbox_threads')
          .select('id')
          .eq('mailbox_account_id', accountId)
          .in('gmail_thread_id', gmailThreadIds)

        if (threadsError) {
          logDbError('mailboxBackfillJob', 'inbox_threads', { accountId }, threadsError)
          throw new Error(
            `mailboxBackfillJob: failed to load threads for matching for account ${accountId}: ${threadsError.message}`,
          )
        }

        for (const thread of threads ?? []) {
          await applyMatch(
            db,
            account.organization_id,
            thread.id,
            await matchThread(db, account.organization_id, thread.id),
          )
        }
      }

      // `done` counts every id this invocation FETCHED, which — by the
      // invariant above — is exactly the number it processed.
      const done = doneSoFar + ids.length
      const hasMore = page.nextPageToken !== null

      const { error: progressError } = await db
        .from('mailbox_accounts')
        .update({
          backfill_status: hasMore ? 'running' : 'done',
          // total_estimate is Gmail's resultSizeEstimate from the FIRST
          // page of this chain — an ESTIMATE, not an exact count. The UI
          // contract must tolerate `done > total_estimate`.
          backfill_progress: { done, has_more: hasMore, total_estimate: totalEstimate },
        })
        .eq('id', accountId)

      if (progressError) {
        logDbError('mailboxBackfillJob', 'mailbox_accounts', { accountId }, progressError)
        throw new Error(
          `mailboxBackfillJob: failed to persist backfill progress for ${account.email_address}: ${progressError.message}`,
        )
      }

      logger.info(
        `[mailbox-backfill] ${account.email_address}: ${done} processed, ` +
          `+${ingested.messagesInserted} new`,
      )

      if (hasMore) {
        // Re-emit rather than loop. afterDate and totalEstimate are carried
        // forward unchanged so every invocation in this chain uses the
        // identical query string and a stable estimate.
        await step.sendEvent('continue-backfill', {
          name: 'mailbox/backfill.requested',
          data: { accountId, pageToken: page.nextPageToken, done, afterDate, totalEstimate },
        })
      }

      return { done, hasMore }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      if (error instanceof MailboxAuthError) {
        await markAuthFailed(db, accountId, message)
      }

      const { error: failError } = await db
        .from('mailbox_accounts')
        .update({ backfill_status: 'failed', sync_error: message })
        .eq('id', accountId)

      if (failError) {
        logDbError('mailboxBackfillJob', 'mailbox_accounts', { accountId }, failError)
      }

      // `account` may still be null here if the account lookup itself
      // threw — fall back to the opaque accountId; there is no address to
      // log in that case.
      logger.error(`[mailbox-backfill] ${account?.email_address ?? accountId}: ${message}`)
      throw error
    }
  },
)
```

- [ ] **Step 2: Export and mount**

Add to `packages/jobs/src/index.ts`:

```ts
export { mailboxBackfillJob } from './mailbox-backfill'
```

Add `mailboxBackfillJob` to both the import list and the `functions` array in `apps/hoa/src/app/api/inngest/route.ts`.

- [ ] **Step 3: Typecheck and commit**

```bash
rtk pnpm typecheck && rtk git add packages/jobs/ apps/hoa/src/app/api/inngest/route.ts && rtk git commit -m "feat(jobs): resumable 12-month mailbox backfill"
```

---

## Task 17: OAuth connect flow

**Files:**
- Create: `apps/hoa/src/lib/inbox/connect.ts`
- Create: `apps/hoa/src/app/api/oauth/google/start/route.ts`
- Create: `apps/hoa/src/app/api/oauth/google/callback/route.ts`
- Modify: `apps/hoa/src/middleware.ts` (exempt the callback from auth rewrite if needed)

**Interfaces:**
- Consumes: `buildConsentUrl`, `exchangeCode`, `GmailClient`, `recommendScope`, `encryptToken`, `currentKeyVersion` (Tasks 6–11)
- Produces:
  ```ts
  startConnect(orgId, userId, returnTo): string                   // consent URL, synchronous
  completeConnect(code, state): Promise<{ accountId; orgId; returnTo }>
  loadScopeOptions(accountId): Promise<{ addresses; labels }>
  ```

- [ ] **Step 1: Write `apps/hoa/src/lib/inbox/connect.ts`**

```ts
/**
 * Mailbox connect — the OAuth dance.
 *
 * The `state` parameter is a signed payload, not a random nonce looked up
 * in a table. It carries org id, user id, and the return path, and it is
 * HMAC-signed with a short expiry. That gives CSRF protection without a
 * round-trip to Postgres on a path that runs at most a few times per
 * tenant, and it survives the redirect statelessly.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { createAdminClient } from '@homeowner-portal/db'
import {
  buildConsentUrl,
  currentKeyVersion,
  encryptToken,
  exchangeCode,
  GmailClient,
  recommendScope,
} from '@homeowner-portal/mailbox'

const STATE_TTL_MS = 10 * 60 * 1000

interface StatePayload {
  orgId: string
  userId: string
  returnTo: string
  issuedAt: number
}

function stateSecret(): string {
  const secret = process.env.MAILBOX_TOKEN_KEY
  if (!secret) throw new Error('MAILBOX_TOKEN_KEY is not set.')
  return secret
}

function signState(payload: StatePayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const mac = createHmac('sha256', stateSecret()).update(body).digest('base64url')
  return `${body}.${mac}`
}

function verifyState(state: string): StatePayload {
  const [body, mac] = state.split('.')
  if (!body || !mac) throw new Error('Malformed OAuth state.')

  const expected = createHmac('sha256', stateSecret()).update(body).digest('base64url')
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('OAuth state signature mismatch.')
  }

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as StatePayload
  if (Date.now() - payload.issuedAt > STATE_TTL_MS) {
    throw new Error('OAuth state expired — please start the connection again.')
  }
  return payload
}

export function startConnect(orgId: string, userId: string, returnTo: string): string {
  return buildConsentUrl({
    state: signState({ orgId, userId, returnTo, issuedAt: Date.now() }),
  })
}

export async function completeConnect(
  code: string,
  state: string,
): Promise<{ accountId: string; orgId: string; returnTo: string }> {
  const { orgId, userId, returnTo } = verifyState(state)

  const tokens = await exchangeCode(code)
  if (!tokens.refreshToken) {
    // Without a refresh token the connection dies in about an hour. This
    // happens when prompt=consent was omitted or the user previously
    // authorized and Google suppressed it.
    throw new Error(
      'Google did not return a refresh token. Remove HomeownerHub at ' +
        'myaccount.google.com/permissions and connect again.',
    )
  }

  const client = new GmailClient(tokens.accessToken)
  const profile = await client.getProfile()
  const sendAs = await client.listSendAs().catch(() => [])
  const recommended = recommendScope(sendAs, profile.emailAddress)

  const db = createAdminClient()

  // Reconnecting the same address reuses the row so history is preserved.
  const { data: existing } = await db
    .from('mailbox_accounts')
    .select('id')
    .eq('organization_id', orgId)
    .eq('email_address', profile.emailAddress)
    .is('disconnected_at', null)
    .maybeSingle()

  let accountId: string

  if (existing) {
    accountId = existing.id
    await db
      .from('mailbox_accounts')
      .update({ sync_status: 'ok', sync_error: null, connected_by: userId })
      .eq('id', accountId)
  } else {
    const { data: created, error } = await db
      .from('mailbox_accounts')
      .insert({
        organization_id: orgId,
        provider: 'gmail',
        email_address: profile.emailAddress,
        display_name: profile.emailAddress,
        scope_mode: recommended.scopeMode,
        scope_value: recommended.scopeValue,
        // Deliberately NOT set to profile.historyId. Leaving the cursor
        // null makes the first sync take the dated-bootstrap path, which
        // picks up recent mail instead of only what arrives from now on.
        sync_cursor: null,
        connected_by: userId,
      })
      .select('id')
      .single()

    if (error || !created) {
      throw new Error(error?.message ?? 'Could not save the mailbox connection.')
    }
    accountId = created.id
  }

  await db.from('mailbox_account_secrets').upsert({
    mailbox_account_id: accountId,
    refresh_token_enc: encryptToken(tokens.refreshToken),
    access_token_enc: encryptToken(tokens.accessToken),
    token_expires_at: tokens.expiresAt,
    key_version: currentKeyVersion(),
    updated_at: new Date().toISOString(),
  })

  return { accountId, orgId, returnTo }
}

/** Available send-as aliases and labels, for the scope picker. */
export async function loadScopeOptions(accountId: string): Promise<{
  addresses: string[]
  labels: Array<{ id: string; name: string }>
}> {
  const db = createAdminClient()
  const { getAccessTokenFor } = await import('@homeowner-portal/jobs/mailbox-tokens')
  const client = new GmailClient(await getAccessTokenFor(db, accountId))

  const [sendAs, labels] = await Promise.all([
    client.listSendAs().catch(() => []),
    client.listLabels().catch(() => []),
  ])

  return {
    addresses: sendAs.map((s) => s.sendAsEmail),
    labels: labels
      .filter((l) => l.type === 'user')
      .map((l) => ({ id: l.id, name: l.name })),
  }
}
```

- [ ] **Step 2: Export `getAccessTokenFor` from the jobs package**

Add to `packages/jobs/package.json` `exports`:

```json
  "exports": {
    ".": "./src/index.ts",
    "./mailbox-tokens": "./src/mailbox-tokens.ts"
  },
```

- [ ] **Step 3: Write the start route**

Create `apps/hoa/src/app/api/oauth/google/start/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { startConnect } from '@/lib/inbox/connect'

export async function GET(request: Request): Promise<Response> {
  const org = await getCurrentOrg()
  if (!org) return NextResponse.redirect(new URL('/onboarding', request.url))

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const returnTo =
    new URL(request.url).searchParams.get('returnTo') ?? '/settings/mailbox'

  try {
    return NextResponse.redirect(startConnect(org.id, user.id, returnTo))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not start connection.'
    return NextResponse.redirect(
      new URL(`${returnTo}?error=${encodeURIComponent(message)}`, request.url),
    )
  }
}
```

- [ ] **Step 4: Write the callback route**

Create `apps/hoa/src/app/api/oauth/google/callback/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { inngest } from '@homeowner-portal/jobs'
import { completeConnect } from '@/lib/inbox/connect'

/**
 * Google redirects here after consent.
 *
 * Errors redirect back to the originating page with a readable message
 * rather than rendering a raw 500 — a failed mailbox connection is a
 * recoverable user situation, not a crash.
 */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams

  const denied = params.get('error')
  if (denied) {
    return NextResponse.redirect(
      new URL(`/settings/mailbox?error=${encodeURIComponent(denied)}`, request.url),
    )
  }

  const code = params.get('code')
  const state = params.get('state')
  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/settings/mailbox?error=missing_code', request.url),
    )
  }

  try {
    const { accountId, returnTo } = await completeConnect(code, state)

    // Kick off the 12-month import so the connect preview has real
    // numbers by the time the user looks at it.
    await inngest.send({
      name: 'mailbox/backfill.requested',
      data: { accountId },
    })

    return NextResponse.redirect(
      new URL(`${returnTo}?connected=1&account=${accountId}`, request.url),
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection failed.'
    return NextResponse.redirect(
      new URL(`/settings/mailbox?error=${encodeURIComponent(message)}`, request.url),
    )
  }
}
```

- [ ] **Step 5: Confirm middleware does not intercept the callback**

Read `apps/hoa/src/middleware.ts` and check its `matcher`. The callback must be reachable by a logged-in user; if the matcher excludes `/api/*` paths from the auth rewrite (as it does for `/api/inngest`), add `/api/oauth` to the same exclusion list.

- [ ] **Step 6: Typecheck and commit**

```bash
rtk pnpm typecheck && rtk git add apps/hoa/src/lib/inbox/connect.ts apps/hoa/src/app/api/oauth/ packages/jobs/package.json && rtk git commit -m "feat(inbox): Google OAuth connect flow with signed state"
```

### Fix pass (2026-07-31): open redirect + state-signing tests

Post-implementation review found `returnTo` was read unvalidated from the
query string, signed into `state`, and later interpolated straight into
`new URL(...)` in the callback — `new URL(arg, base)` ignores `base`
whenever `arg` is already absolute (including `//evil.com`), so a crafted
`GET /api/oauth/google/start?returnTo=https://evil.com` link ended a
genuine Google consent flow on an attacker's domain. Signing `state` does
not fix this: the hostile value is attacker-supplied before signing, so
the signature just certifies it.

Fixes applied (full detail: `.superpowers/sdd/task-17-report.md`):

- Added `sanitizeReturnTo()` to `apps/hoa/src/lib/inbox/connect.ts` — a
  pure function accepting only a same-origin path (`/...`) and rejecting
  `//...`, any `.../\\...` backslash form, and anything containing
  `://`, falling back to `DEFAULT_RETURN_TO` (`/settings/mailbox`) on
  rejection. Applied at every entry/consumption point: the start route's
  query param, `startConnect`, `completeConnect`'s return value, and the
  callback route's redirect construction — defense in depth rather than
  a single choke point, since `state` may have been minted by an older
  build that signed an unvalidated value.
- Exported `signState`/`verifyState` from `connect.ts` (previously
  module-private) specifically so they could be unit-tested directly —
  this pure logic gates standing access to an entire HOA mailbox and had
  zero coverage. New tests: `apps/hoa/src/lib/inbox/connect.test.ts`
  (round trip, tampered payload byte, tampered MAC, expired TTL,
  malformed state in several shapes, and the `sanitizeReturnTo` matrix).
- `listSendAs()` failures during scope recommendation in `completeConnect`
  now log before falling back to an empty alias list, instead of
  silently swallowing a real Gmail outage.
- Reconnect intentionally still does not overwrite `scope_mode` /
  `scope_value` / `display_name` on an existing row — documented in a
  comment at the call site. Overwriting on every reconnect risks
  clobbering a scope a tenant deliberately hand-narrowed; if Google's
  recommendation should ever win on reconnect, that needs an explicit
  UI-driven "reset to recommended" action, not an implicit one here.

### Fix pass 2 (2026-07-31): control-character redirect bypass

The Fix pass above added `sanitizeReturnTo()` and applied it at four call
sites, describing that as defense in depth. It wasn't: all four call the
same function, and that function checked only the *literal* string
(`startsWith('//')`, `startsWith('/\\')`, `includes('://')`). The WHATWG
URL parser — what Node's `URL` runs, which is what
`NextResponse.redirect(new URL(...))` uses, and what every browser uses —
strips ASCII tab (0x09), LF (0x0A), and CR (0x0D) from *anywhere* in the
input, unconditionally, before any other parsing step. `/\t/evil.com`
passed every anchored check (one leading slash, not `//`, not `/\`, no
`://`) and was returned unchanged; the tab then vanished during parsing,
collapsing it to `//evil.com` — a protocol-relative network-path
reference that took over the host. Reachable end to end via
`GET /api/oauth/google/start?returnTo=%2F%09%2Fevil.com` (`%0A`/`%0D`
behave identically).

`sanitizeReturnTo()` now:
1. Rejects outright on any raw tab/CR/LF anywhere in the candidate,
   before any structural check runs — stripping them would just move
   the same class of bug one layer up.
2. Uses `includes`, not only `startsWith`, for `//` and `/\` — anchoring
   to position 0 is what made the original bypass possible.
3. Keeps the same-shape requirements (single leading `/`, no `://`
   anywhere) and still falls back to `DEFAULT_RETURN_TO` rather than
   attempting repair.
4. Adds a final authoritative check: `new URL(candidate, <dummy
   origin>)` resolved and compared against that dummy origin — the
   exact parser the real redirect uses, run ahead of time, so it can't
   disagree with what happens at redirect time the way hand-written
   string reasoning can (and did).

Full detail, attack matrix with actual output, and the corrected framing
of the MAC-tamper tests (they show a flipped byte is rejected — which a
plain `===` would also reject — not that the comparison is constant
time): `.superpowers/sdd/task-17-report.md`, "Fix pass 2" section.

---

## Task 18: Settings → Mailbox page

The permanent management surface. The onboarding card in Task 19 reuses these components.

**Files:**
- Create: `apps/hoa/src/app/(dashboard)/settings/mailbox/page.tsx`
- Create: `apps/hoa/src/app/(dashboard)/settings/mailbox/MailboxConnectCard.tsx`
- Create: `apps/hoa/src/app/(dashboard)/settings/mailbox/ScopePicker.tsx`
- Create: `apps/hoa/src/app/(dashboard)/settings/mailbox/actions.ts`
- Create: `apps/hoa/src/lib/inbox/queries.ts`

**Interfaces:**
- Consumes: `loadScopeOptions` (Task 17)
- Produces:
  ```ts
  getMailboxStatus(orgId): Promise<MailboxStatus | null>
  getConnectPreview(orgId, accountId): Promise<ConnectPreview>
  updateScope(formData): Promise<ActionState>
  disconnectMailbox(formData): Promise<ActionState>
  ```

- [ ] **Step 1: Write `apps/hoa/src/lib/inbox/queries.ts`**

```ts
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'

type Db = SupabaseClient<Database>

export interface MailboxStatus {
  id: string
  emailAddress: string
  scopeMode: 'address' | 'label' | 'all'
  scopeValue: string | null
  syncStatus: 'ok' | 'stalled' | 'auth_failed'
  syncError: string | null
  lastSyncedAt: string | null
  backfillStatus: 'pending' | 'running' | 'done' | 'failed'
  backfillDone: number
}

export interface ConnectPreviewRow {
  fromEmail: string | null
  subject: string | null
  matchedAddress: string | null
  confidence: string
}

export interface ConnectPreview {
  totalMessages: number
  matchedThreads: number
  needsReviewThreads: number
  sample: ConnectPreviewRow[]
}

export async function getMailboxStatus(
  db: Db,
  orgId: string,
): Promise<MailboxStatus | null> {
  const { data } = await db
    .from('mailbox_accounts')
    .select(
      'id, email_address, scope_mode, scope_value, sync_status, sync_error, ' +
        'last_synced_at, backfill_status, backfill_progress',
    )
    .eq('organization_id', orgId)
    .is('disconnected_at', null)
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null

  const progress = (data.backfill_progress ?? {}) as { done?: number }

  return {
    id: data.id,
    emailAddress: data.email_address,
    scopeMode: data.scope_mode as MailboxStatus['scopeMode'],
    scopeValue: data.scope_value,
    syncStatus: data.sync_status as MailboxStatus['syncStatus'],
    syncError: data.sync_error,
    lastSyncedAt: data.last_synced_at,
    backfillStatus: data.backfill_status as MailboxStatus['backfillStatus'],
    backfillDone: progress.done ?? 0,
  }
}

/**
 * The self-verifying panel shown right after connecting.
 *
 * This is where a tenant catches a bad matcher BEFORE it misfiles sixty
 * emails — so the sample deliberately shows what each message resolved
 * to, not just a count.
 */
export async function getConnectPreview(
  db: Db,
  orgId: string,
  accountId: string,
): Promise<ConnectPreview> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { count: totalMessages } = await db
    .from('inbox_messages')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .gte('sent_at', thirtyDaysAgo)

  const { data: threads } = await db
    .from('inbox_threads')
    .select('id, subject, unit_id, match_confidence, status, last_message_at')
    .eq('mailbox_account_id', accountId)
    .gte('last_message_at', thirtyDaysAgo)
    .order('last_message_at', { ascending: false })

  const all = threads ?? []
  const matched = all.filter((t) => t.unit_id !== null)
  const needsReview = all.filter((t) => t.status === 'needs_review')

  // Build a mixed sample — some matched, some not — so the preview shows
  // both outcomes rather than only the flattering one.
  const sampleThreads = [...matched.slice(0, 2), ...needsReview.slice(0, 1)].slice(0, 3)

  const sample: ConnectPreviewRow[] = []
  for (const thread of sampleThreads) {
    const { data: message } = await db
      .from('inbox_messages')
      .select('from_email')
      .eq('thread_id', thread.id)
      .eq('direction', 'inbound')
      .order('sent_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    let matchedAddress: string | null = null
    if (thread.unit_id) {
      const { data: unit } = await db
        .from('units')
        .select('address_line1')
        .eq('id', thread.unit_id)
        .maybeSingle()
      matchedAddress = unit?.address_line1 ?? null
    }

    sample.push({
      fromEmail: message?.from_email ?? null,
      subject: thread.subject,
      matchedAddress,
      confidence: thread.match_confidence,
    })
  }

  return {
    totalMessages: totalMessages ?? 0,
    matchedThreads: matched.length,
    needsReviewThreads: needsReview.length,
    sample,
  }
}
```

- [ ] **Step 2: Write the server actions**

Create `apps/hoa/src/app/(dashboard)/settings/mailbox/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export interface MailboxActionState {
  error?: string
  ok?: boolean
}

const ScopeSchema = z.object({
  accountId: z.string().uuid(),
  scopeMode: z.enum(['address', 'label', 'all']),
  scopeValue: z.string().max(320).optional(),
})

export async function updateScope(
  _prev: MailboxActionState,
  formData: FormData,
): Promise<MailboxActionState> {
  const org = await getCurrentOrg()
  if (!org) return { error: 'No organization in session.' }

  const parsed = ScopeSchema.safeParse({
    accountId: formData.get('accountId'),
    scopeMode: formData.get('scopeMode'),
    scopeValue: formData.get('scopeValue') || undefined,
  })
  if (!parsed.success) return { error: 'Invalid scope selection.' }

  const { accountId, scopeMode, scopeValue } = parsed.data

  // Fail closed: address and label modes are meaningless without a value,
  // and a null value would drop every message.
  if (scopeMode !== 'all' && !scopeValue) {
    return { error: 'Pick an address or a label for this scope.' }
  }

  const supabase = await getSupabaseServerClient()
  const { error } = await supabase
    .from('mailbox_accounts')
    .update({ scope_mode: scopeMode, scope_value: scopeValue ?? null })
    .eq('id', accountId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath('/settings/mailbox')
  revalidatePath('/onboarding/setup')
  return { ok: true }
}

export async function disconnectMailbox(
  _prev: MailboxActionState,
  formData: FormData,
): Promise<MailboxActionState> {
  const org = await getCurrentOrg()
  if (!org) return { error: 'No organization in session.' }

  const accountId = z.string().uuid().safeParse(formData.get('accountId'))
  if (!accountId.success) return { error: 'Invalid account.' }

  const supabase = await getSupabaseServerClient()

  // Soft disconnect. Ingested mail stays readable — the HOA's
  // correspondence record must not vanish because someone unlinked Gmail.
  const { error } = await supabase
    .from('mailbox_accounts')
    .update({ disconnected_at: new Date().toISOString() })
    .eq('id', accountId.data)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath('/settings/mailbox')
  return { ok: true }
}
```

- [ ] **Step 3: Write the scope picker**

Create `apps/hoa/src/app/(dashboard)/settings/mailbox/ScopePicker.tsx`:

```tsx
'use client'

import { useActionState, useState } from 'react'
import { Alert, Button } from '@homeowner-portal/ui'
import { updateScope, type MailboxActionState } from './actions'

const initial: MailboxActionState = {}

interface Props {
  accountId: string
  currentMode: 'address' | 'label' | 'all'
  currentValue: string | null
  addresses: string[]
  labels: Array<{ id: string; name: string }>
  recommendedAddress: string | null
}

export function ScopePicker({
  accountId,
  currentMode,
  currentValue,
  addresses,
  labels,
  recommendedAddress,
}: Props) {
  const [state, action, pending] = useActionState(updateScope, initial)
  const [mode, setMode] = useState(currentMode)
  const [value, setValue] = useState(currentValue ?? recommendedAddress ?? '')

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="scopeMode" value={mode} />
      <input type="hidden" name="scopeValue" value={mode === 'all' ? '' : value} />

      <p className="text-sm font-medium text-foreground">
        Which mail should HomeownerHub see?
      </p>

      <label
        className={`block cursor-pointer rounded-lg border p-3 ${
          mode === 'address' ? 'border-primary bg-primary/5' : 'border-border'
        }`}
      >
        <input
          type="radio"
          name="mode-ui"
          className="sr-only"
          checked={mode === 'address'}
          onChange={() => setMode('address')}
        />
        <span className="text-sm font-medium text-foreground">
          Mail sent to a specific address
        </span>
        <span className="mt-0.5 block text-xs text-muted">
          Recommended. Other mail in this account stays private.
        </span>
        {mode === 'address' ? (
          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="mt-2 w-full rounded-md border border-border bg-background p-2 text-sm"
          >
            {addresses.map((address) => (
              <option key={address} value={address}>
                {address}
                {address === recommendedAddress ? ' — recommended' : ''}
              </option>
            ))}
          </select>
        ) : null}
      </label>

      <label
        className={`block cursor-pointer rounded-lg border p-3 ${
          mode === 'label' ? 'border-primary bg-primary/5' : 'border-border'
        }`}
      >
        <input
          type="radio"
          name="mode-ui"
          className="sr-only"
          checked={mode === 'label'}
          onChange={() => setMode('label')}
        />
        <span className="text-sm font-medium text-foreground">
          Only mail with a Gmail label
        </span>
        <span className="mt-0.5 block text-xs text-muted">
          You sort in Gmail; we follow your label.
        </span>
        {mode === 'label' ? (
          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="mt-2 w-full rounded-md border border-border bg-background p-2 text-sm"
          >
            <option value="">Pick a label…</option>
            {labels.map((label) => (
              <option key={label.id} value={label.id}>
                {label.name}
              </option>
            ))}
          </select>
        ) : null}
      </label>

      <label
        className={`block cursor-pointer rounded-lg border p-3 ${
          mode === 'all' ? 'border-primary bg-primary/5' : 'border-border'
        }`}
      >
        <input
          type="radio"
          name="mode-ui"
          className="sr-only"
          checked={mode === 'all'}
          onChange={() => setMode('all')}
        />
        <span className="text-sm font-medium text-foreground">
          Everything in this inbox
        </span>
        <span className="mt-0.5 block text-xs text-muted">
          Only choose this for a mailbox used solely for the HOA. Personal mail in
          this account would become visible to the whole board.
        </span>
      </label>

      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      {state.ok ? <Alert variant="success">Scope updated.</Alert> : null}

      <Button type="submit" loading={pending} size="sm">
        Save scope
      </Button>
    </form>
  )
}
```

- [ ] **Step 4: Write the connect card**

Create `apps/hoa/src/app/(dashboard)/settings/mailbox/MailboxConnectCard.tsx`:

```tsx
import Link from 'next/link'
import { Alert, Badge, Button, Card, CardContent } from '@homeowner-portal/ui'
import type { ConnectPreview, MailboxStatus } from '@/lib/inbox/queries'
import { ScopePicker } from './ScopePicker'

interface Props {
  status: MailboxStatus | null
  preview: ConnectPreview | null
  scopeOptions: { addresses: string[]; labels: Array<{ id: string; name: string }> }
  returnTo: string
}

export function MailboxConnectCard({ status, preview, scopeOptions, returnTo }: Props) {
  if (!status) {
    return (
      <Card variant="elevated">
        <CardContent className="space-y-3 p-6 text-center">
          <div className="text-2xl" aria-hidden>
            ✉️
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            Connect your HOA mailbox
          </h2>
          <p className="mx-auto max-w-md text-sm text-muted">
            Emails residents send to your HOA address appear here, matched to the
            right property, with dues and ARC context beside them.
          </p>
          <Button asChild size="lg">
            <Link href={`/api/oauth/google/start?returnTo=${encodeURIComponent(returnTo)}`}>
              Continue with Google
            </Link>
          </Button>
          <p className="text-xs text-muted">Nothing is ever sent without your approval.</p>
        </CardContent>
      </Card>
    )
  }

  const backfilling = status.backfillStatus === 'running'

  return (
    <div className="space-y-4">
      <Card variant="elevated">
        <CardContent className="space-y-4 p-6">
          <div className="flex items-start gap-3 border-b border-border pb-4">
            <div className="flex-1">
              <p className="font-medium text-foreground">{status.emailAddress}</p>
              <p className="text-xs text-muted">
                {status.syncStatus === 'ok'
                  ? `Syncing every 2 minutes · last check ${
                      status.lastSyncedAt
                        ? new Date(status.lastSyncedAt).toLocaleTimeString()
                        : 'pending'
                    }`
                  : status.syncError ?? 'Sync problem'}
              </p>
            </div>
            <Badge variant={status.syncStatus === 'ok' ? 'success' : 'error'}>
              {status.syncStatus === 'ok' ? 'Connected' : status.syncStatus}
            </Badge>
          </div>

          {status.syncStatus === 'auth_failed' ? (
            <Alert variant="error" title="Reconnect required">
              Google rejected the stored credentials. Mail is not syncing.{' '}
              <Link className="underline" href="/api/oauth/google/start">
                Reconnect
              </Link>
            </Alert>
          ) : null}

          {status.syncStatus === 'stalled' ? (
            <Alert variant="warning" title="Sync has stalled">
              No successful sync in over 30 minutes. Resident email may not be
              arriving. {status.syncError}
            </Alert>
          ) : null}

          {backfilling ? (
            <Alert variant="info" title="Importing history">
              {status.backfillDone.toLocaleString()} messages imported so far. You can
              keep working — this continues in the background.
            </Alert>
          ) : null}

          <ScopePicker
            accountId={status.id}
            currentMode={status.scopeMode}
            currentValue={status.scopeValue}
            addresses={
              scopeOptions.addresses.length > 0
                ? scopeOptions.addresses
                : [status.emailAddress]
            }
            labels={scopeOptions.labels}
            recommendedAddress={status.scopeValue}
          />
        </CardContent>
      </Card>

      {preview ? (
        <Card>
          <CardContent className="space-y-3 p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              What we found in the last 30 days
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="emails" value={preview.totalMessages} />
              <Stat label="matched to a property" value={preview.matchedThreads} tone="ok" />
              <Stat label="need review" value={preview.needsReviewThreads} tone="warn" />
            </div>

            {preview.sample.length > 0 ? (
              <>
                <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  Sample — check this looks right
                </p>
                <div className="divide-y divide-border rounded-lg border border-border text-sm">
                  {preview.sample.map((row, index) => (
                    <div key={index} className="flex flex-wrap gap-2 p-2">
                      <span className="min-w-[10rem] flex-1 font-medium text-foreground">
                        {row.fromEmail ?? 'unknown sender'}
                      </span>
                      <span className="min-w-[10rem] flex-1 text-muted">
                        {row.subject ?? '(no subject)'}
                      </span>
                      <span
                        className={
                          row.matchedAddress ? 'text-success' : 'text-warning'
                        }
                      >
                        {row.matchedAddress ? `→ ${row.matchedAddress}` : '→ needs review'}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'ok' | 'warn'
}) {
  const border =
    tone === 'ok' ? 'border-success' : tone === 'warn' ? 'border-warning' : 'border-border'
  return (
    <div className={`rounded-lg border ${border} p-3 text-center`}>
      <p className="text-xl font-bold text-foreground">{value.toLocaleString()}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  )
}
```

- [ ] **Step 5: Write the page**

Create `apps/hoa/src/app/(dashboard)/settings/mailbox/page.tsx`:

```tsx
import { Alert } from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getConnectPreview, getMailboxStatus } from '@/lib/inbox/queries'
import { loadScopeOptions } from '@/lib/inbox/connect'
import { MailboxConnectCard } from './MailboxConnectCard'

export const metadata = { title: 'Mailbox' }

export default async function MailboxSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>
}) {
  const params = await searchParams
  const org = await getCurrentOrg()
  if (!org) return null

  const supabase = await getSupabaseServerClient()
  const status = await getMailboxStatus(supabase, org.id)

  const [preview, scopeOptions] = status
    ? await Promise.all([
        getConnectPreview(supabase, org.id, status.id),
        loadScopeOptions(status.id).catch(() => ({ addresses: [], labels: [] })),
      ])
    : [null, { addresses: [], labels: [] }]

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mailbox</h1>
        <p className="text-sm text-muted">
          Connect the mailbox residents email, so their messages appear in HomeownerHub.
        </p>
      </div>

      {params.error ? (
        <Alert variant="error" title="Could not connect">
          {params.error}
        </Alert>
      ) : null}
      {params.connected ? (
        <Alert variant="success" title="Mailbox connected">
          We are importing your history now. Counts below fill in as it runs.
        </Alert>
      ) : null}

      <MailboxConnectCard
        status={status}
        preview={preview}
        scopeOptions={scopeOptions}
        returnTo="/settings/mailbox"
      />
    </main>
  )
}
```

- [ ] **Step 6: Typecheck**

```bash
rtk pnpm typecheck
```
Expected: PASS. If `Button` does not support `asChild`, replace that block with a plain `<a>` styled by `buttonVariants()` — check `packages/ui/src/components/Button.tsx` for which is available.

- [ ] **Step 7: Manual verification**

```bash
rtk pnpm dev:hoa
```
Visit `http://localhost:3000/settings/mailbox`. With no mailbox connected you should see the single "Continue with Google" card. Clicking it should redirect to Google's consent screen listing the Gmail scopes.

- [ ] **Step 8: Commit**

```bash
rtk git add apps/hoa/src/app/\(dashboard\)/settings/mailbox/ apps/hoa/src/lib/inbox/queries.ts && rtk git commit -m "feat(inbox): settings mailbox page with scope picker and connect preview"
```

**Reviewer follow-up (fix pass, same day):** review found one Critical and
three Important issues in the original implementation above, all fixed:

- **Critical — mode/value mismatch could be saved.** `ScopePicker.tsx` kept
  one shared `value` in `useState` across all three modes and never reset it
  on mode switch, so choosing an address, then clicking the "label" radio,
  then Save, silently submitted `scopeMode="label"` with an email address as
  `scopeValue`. The old server check only verified a value was *present*
  (`!scopeValue`), never that it matched the selected mode — the mismatch
  was persisted and only surfaced later as a thrown error inside a sync
  (`buildScopeQuery` on a malformed label id). Fixed at both layers: the
  radios' `onChange` now resets `value` to `''` on every mode switch, and
  `ScopeSchema` (moved to a new pure module, `scopeSchema.ts`) adds a
  `.superRefine` that validates the value's shape against the selected mode
  using the *same* `ADDRESS_RE`/`LABEL_RE` regexes `buildScopeQuery` in
  `packages/mailbox/src/scope.ts` validates against, so the action rejects
  precisely what the sync would later reject — never more permissive, never
  stricter (a `+`-tagged address and a subdomain address both still pass).
- **Important — whitespace-only value bypassed the guard.**
  `formData.get('scopeValue') || undefined` mapped `""` to `undefined` but
  left `" "` truthy, so `scopeMode !== 'all' && !scopeValue` never fired for
  a whitespace-only value. `ScopeSchema` now trims `scopeValue` before the
  emptiness check (matching the fail-closed `.trim()` in
  `packages/mailbox/src/scope.ts`'s `isInScope`), so `"   "` is rejected the
  same as `""`.
- **Important — a failed backfill was invisible.** `MailboxConnectCard.tsx`
  had no UI branch for `backfillStatus === 'failed'` (only `'running'` and
  the `syncStatus` alerts), so a mailbox whose history import the watchdog
  (Task 16 fix pass) marked `'failed'` looked connected with a preview that
  silently never filled in. Added an error `Alert` for that state. Confirmed
  via `packages/jobs/src/mailbox-sync.ts`'s watchdog and the OAuth callback
  (`apps/hoa/src/app/api/oauth/google/callback/route.ts`, which
  unconditionally re-sends `mailbox/backfill.requested` after any successful
  connect) that a failed backfill is not guaranteed to retry on its own — it
  only restarts automatically if a later sync for that account happens to
  run truncated — but reconnecting always restarts it immediately. The
  message is worded to reflect that honestly rather than promising an
  automatic retry that may not come.
- **Important — the stat row mixed units.** `getConnectPreview` returned
  `totalMessages` (a message count, queried separately from
  `inbox_messages`, org-scoped rather than account-scoped) rendered beside
  `matchedThreads`/`needsReviewThreads` (thread counts), so a thread with
  several messages made "X total / Y matched / Z need review" fail to
  reconcile. Removed the separate message-count query entirely and replaced
  it with `totalThreads: number` (renamed from `totalMessages`), computed as
  the length of the same account-scoped thread list already fetched for the
  matched/needs-review split — all three stats are now thread counts over
  the same 30-day, same-account window.

New pure module `apps/hoa/src/app/(dashboard)/settings/mailbox/scopeSchema.ts`
holds `ScopeSchema` so it can be unit tested without a Supabase client or
Next.js request context (`actions.ts` imports `next/headers` transitively via
`getSupabaseServerClient`, which fails outside a real request). Covered by a
new test file, `scopeSchema.test.ts`, added to the root `vitest.config.ts`
`include` globs. Full history in `.superpowers/sdd/task-18-report.md`.

---

## Task 19: Onboarding setup checklist

Org creation stays as it is; the new page is where it lands afterward. A checklist absorbs the OAuth round-trip as a plain re-render, where a linear wizard would need step-state restoration.

**Files:**
- Create: `apps/hoa/src/app/onboarding/setup/page.tsx`
- Create: `apps/hoa/src/app/onboarding/setup/SetupChecklist.tsx`
- Modify: `apps/hoa/src/app/onboarding/actions.ts` (redirect to `/onboarding/setup`)
- Modify: `apps/hoa/src/app/(dashboard)/page.tsx` (nudge banner)

**Interfaces:**
- Consumes: `getMailboxStatus`, `getConnectPreview` (Task 18)
- Produces: `getSetupProgress(db, orgId): Promise<SetupStep[]>`

- [ ] **Step 1: Add `getSetupProgress` to `apps/hoa/src/lib/inbox/queries.ts`**

```ts
export interface SetupStep {
  key: 'hoa_details' | 'mailbox' | 'properties' | 'board_members'
  title: string
  description: string
  done: boolean
  href: string
  cta: string
}

/**
 * Drives the onboarding checklist and the dashboard nudge.
 *
 * Completion is DERIVED from real data, never stored as a flag. A stored
 * "onboarding complete" boolean drifts the moment someone deletes their
 * last property, and then the checklist lies.
 */
export async function getSetupProgress(db: Db, orgId: string): Promise<SetupStep[]> {
  const [mailbox, properties, members] = await Promise.all([
    getMailboxStatus(db, orgId),
    db
      .from('units')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId),
    db
      .from('org_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('org_id', orgId),
  ])

  return [
    {
      key: 'hoa_details',
      title: 'HOA details',
      description: 'Name and size of your community.',
      done: true, // guaranteed — the org exists
      href: '/settings',
      cta: 'Edit',
    },
    {
      key: 'mailbox',
      title: 'Connect your HOA mailbox',
      description: 'Resident emails flow in automatically, matched to properties.',
      done: mailbox !== null,
      href: '/onboarding/setup',
      cta: 'Connect Google',
    },
    {
      key: 'properties',
      title: 'Import properties',
      description: 'Addresses and owners, so email can be matched to a home.',
      done: (properties.count ?? 0) > 0,
      href: '/admin/import-units',
      cta: 'Upload CSV',
    },
    {
      key: 'board_members',
      title: 'Invite board members',
      description: 'Give the rest of the board access.',
      done: (members.count ?? 0) > 1,
      href: '/settings/members',
      cta: 'Invite',
    },
  ]
}
```

- [ ] **Step 2: Write the checklist component**

Create `apps/hoa/src/app/onboarding/setup/SetupChecklist.tsx`:

```tsx
import Link from 'next/link'
import { Button, Card, CardContent } from '@homeowner-portal/ui'
import type { SetupStep } from '@/lib/inbox/queries'

export function SetupChecklist({
  steps,
  highlightKey,
}: {
  steps: SetupStep[]
  highlightKey?: SetupStep['key']
}) {
  const doneCount = steps.filter((s) => s.done).length

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <p className="text-sm text-muted">
          {doneCount} of {steps.length} done
        </p>
        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-border">
          <div
            className="h-full bg-success transition-all"
            style={{ width: `${(doneCount / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {steps.map((step) => {
        const highlighted = !step.done && step.key === highlightKey
        return (
          <Card
            key={step.key}
            variant={highlighted ? 'elevated' : 'default'}
            className={highlighted ? 'border-2 border-primary' : step.done ? 'opacity-60' : ''}
          >
            <CardContent className="flex items-center gap-3 p-4">
              <span aria-hidden className="text-lg">
                {step.done ? '✅' : step.key === 'mailbox' ? '✉️' : '•'}
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">{step.title}</p>
                {!step.done ? (
                  <p className="text-xs text-muted">{step.description}</p>
                ) : null}
              </div>
              {!step.done ? (
                <Button asChild size="sm" variant={highlighted ? 'primary' : 'secondary'}>
                  <Link href={step.href}>{step.cta}</Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Write the setup page**

Create `apps/hoa/src/app/onboarding/setup/page.tsx`:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Alert } from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  getConnectPreview,
  getMailboxStatus,
  getSetupProgress,
} from '@/lib/inbox/queries'
import { loadScopeOptions } from '@/lib/inbox/connect'
import { MailboxConnectCard } from '../../(dashboard)/settings/mailbox/MailboxConnectCard'
import { SetupChecklist } from './SetupChecklist'

export const metadata = { title: 'Finish setting up' }

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>
}) {
  const params = await searchParams
  const org = await getCurrentOrg()
  if (!org) redirect('/onboarding')

  const supabase = await getSupabaseServerClient()
  const [steps, status] = await Promise.all([
    getSetupProgress(supabase, org.id),
    getMailboxStatus(supabase, org.id),
  ])

  const [preview, scopeOptions] = status
    ? await Promise.all([
        getConnectPreview(supabase, org.id, status.id),
        loadScopeOptions(status.id).catch(() => ({ addresses: [], labels: [] })),
      ])
    : [null, { addresses: [], labels: [] }]

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Welcome to {org.name}</h1>
        <p className="text-sm text-muted">
          A few steps to get set up. You can come back to this any time.
        </p>
      </div>

      {params.error ? (
        <Alert variant="error" title="Could not connect">
          {params.error}
        </Alert>
      ) : null}

      <SetupChecklist steps={steps} highlightKey="mailbox" />

      <div className="pt-2">
        <MailboxConnectCard
          status={status}
          preview={preview}
          scopeOptions={scopeOptions}
          returnTo="/onboarding/setup"
        />
      </div>

      <p className="text-center text-xs text-muted">
        <Link href="/" className="underline">
          Skip for now — go to dashboard
        </Link>
      </p>
    </main>
  )
}
```

- [ ] **Step 4: Redirect new orgs to the checklist**

In `apps/hoa/src/app/onboarding/actions.ts`, find the `redirect(...)` call at the end of `createHoaOrg` (it currently sends new orgs to `/`) and change the target to:

```ts
  redirect('/onboarding/setup')
```

- [ ] **Step 5: Add the dashboard nudge**

In `apps/hoa/src/app/(dashboard)/page.tsx`, inside the default export before the main content, add:

```tsx
  const setupSteps = await getSetupProgress(supabase, org.id)
  const pendingSetup = setupSteps.filter((step) => !step.done)
```

and render above the dashboard widgets:

```tsx
      {pendingSetup.length > 0 ? (
        <Alert variant="info" title="Finish setting up">
          {pendingSetup.length} step{pendingSetup.length === 1 ? '' : 's'} left —{' '}
          {pendingSetup[0].title}.{' '}
          <Link href="/onboarding/setup" className="underline">
            Continue
          </Link>
        </Alert>
      ) : null}
```

Add the matching imports (`Link` from `next/link`, `Alert` from `@homeowner-portal/ui`, `getSetupProgress` from `@/lib/inbox/queries`) if not already present, and reuse whatever `supabase` / `org` variables the page already builds.

- [ ] **Step 6: Typecheck and verify**

```bash
rtk pnpm typecheck && rtk pnpm dev:hoa
```
Visit `/onboarding/setup`. Expected: progress bar, four cards with mailbox highlighted, and the connect card below.

- [ ] **Step 7: Commit**

```bash
rtk git add apps/hoa/src/app/onboarding/ apps/hoa/src/app/\(dashboard\)/page.tsx apps/hoa/src/lib/inbox/queries.ts && rtk git commit -m "feat(onboarding): resumable setup checklist with mailbox connect"
```

---

## Task 20: Inbox list

**Files:**
- Create: `apps/hoa/src/app/(dashboard)/inbox/page.tsx`
- Create: `apps/hoa/src/app/(dashboard)/inbox/ThreadList.tsx`
- Modify: `apps/hoa/src/lib/inbox/queries.ts`
- Modify: `apps/hoa/src/components/layout/` navigation (add the Inbox link)

**Interfaces:**
- Consumes: `MailboxStatus` (Task 18)
- Produces:
  ```ts
  type InboxFilter = 'needs_review' | 'open' | 'waiting' | 'closed' | 'all'
  interface ThreadListItem { id, subject, fromName, fromEmail, snippet, lastMessageAt,
                             unitId, propertyAddress, matchConfidence, status, hasAttachments }
  listThreads(db, orgId, filter, limit?): Promise<ThreadListItem[]>
  countThreadsByStatus(db, orgId): Promise<Record<string, number>>
  ```

- [ ] **Step 1: Add the queries**

Append to `apps/hoa/src/lib/inbox/queries.ts`:

```ts
export type InboxFilter = 'needs_review' | 'open' | 'waiting' | 'closed' | 'all'

export interface ThreadListItem {
  id: string
  subject: string | null
  fromName: string | null
  fromEmail: string | null
  snippet: string | null
  lastMessageAt: string | null
  unitId: string | null
  propertyAddress: string | null
  matchConfidence: string
  status: string
  hasAttachments: boolean
}

export async function countThreadsByStatus(
  db: Db,
  orgId: string,
): Promise<Record<InboxFilter, number>> {
  const statuses: Array<Exclude<InboxFilter, 'all'>> = [
    'needs_review',
    'open',
    'waiting',
    'closed',
  ]

  const counts = await Promise.all(
    statuses.map((status) =>
      db
        .from('inbox_threads')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('status', status),
    ),
  )

  const result = {} as Record<InboxFilter, number>
  statuses.forEach((status, index) => {
    result[status] = counts[index].count ?? 0
  })
  result.all = statuses.reduce((sum, status) => sum + result[status], 0)
  return result
}

export async function listThreads(
  db: Db,
  orgId: string,
  filter: InboxFilter,
  limit = 50,
): Promise<ThreadListItem[]> {
  let query = db
    .from('inbox_threads')
    .select('id, subject, unit_id, match_confidence, status, last_message_at')
    .eq('organization_id', orgId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (filter !== 'all') query = query.eq('status', filter)

  const { data: threads } = await query
  if (!threads || threads.length === 0) return []

  const threadIds = threads.map((t) => t.id)
  const unitIds = threads.map((t) => t.unit_id).filter((id): id is string => id !== null)

  // Batch the lookups rather than querying per row — a 50-thread page
  // would otherwise fire 150 round-trips.
  const [{ data: messages }, { data: units }, { data: attachments }] = await Promise.all([
    db
      .from('inbox_messages')
      .select('thread_id, from_name, from_email, stripped_text, sent_at')
      .in('thread_id', threadIds)
      .eq('direction', 'inbound')
      .order('sent_at', { ascending: false }),
    unitIds.length > 0
      ? db.from('units').select('id, address_line1').in('id', unitIds)
      : Promise.resolve({ data: [] as Array<{ id: string; address_line1: string }> }),
    db
      .from('inbox_attachments')
      .select('thread_id')
      .in('thread_id', threadIds)
      .neq('fetch_status', 'skipped'),
  ])

  const newestByThread = new Map<string, (typeof messages)[number]>()
  for (const message of messages ?? []) {
    if (!newestByThread.has(message.thread_id)) newestByThread.set(message.thread_id, message)
  }
  const addressByUnit = new Map((units ?? []).map((u) => [u.id, u.address_line1]))
  const threadsWithFiles = new Set((attachments ?? []).map((a) => a.thread_id))

  return threads.map((thread) => {
    const newest = newestByThread.get(thread.id)
    return {
      id: thread.id,
      subject: thread.subject,
      fromName: newest?.from_name ?? null,
      fromEmail: newest?.from_email ?? null,
      snippet: newest?.stripped_text?.slice(0, 140) ?? null,
      lastMessageAt: thread.last_message_at,
      unitId: thread.unit_id,
      propertyAddress: thread.unit_id ? addressByUnit.get(thread.unit_id) ?? null : null,
      matchConfidence: thread.match_confidence,
      status: thread.status,
      hasAttachments: threadsWithFiles.has(thread.id),
    }
  })
}
```

- [ ] **Step 2: Write the thread list**

Create `apps/hoa/src/app/(dashboard)/inbox/ThreadList.tsx`:

```tsx
import Link from 'next/link'
import type { ThreadListItem } from '@/lib/inbox/queries'

function confidenceTone(item: ThreadListItem): string {
  if (item.propertyAddress) return 'text-success'
  if (item.matchConfidence === 'medium' || item.matchConfidence === 'low')
    return 'text-warning'
  return 'text-muted'
}

function attributionLabel(item: ThreadListItem): string {
  if (item.propertyAddress) return item.propertyAddress
  if (item.matchConfidence === 'medium') return 'Suggested match — confirm'
  if (item.matchConfidence === 'low') return 'Possible match — confirm'
  return 'Unassigned'
}

export function ThreadList({
  threads,
  selectedId,
  filter,
}: {
  threads: ThreadListItem[]
  selectedId?: string
  filter: string
}) {
  if (threads.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted">
        Nothing here. Mail syncs every 2 minutes.
      </div>
    )
  }

  return (
    <ul className="divide-y divide-border">
      {threads.map((thread) => (
        <li key={thread.id}>
          <Link
            href={`/inbox/${thread.id}?filter=${filter}`}
            className={`block px-3 py-2.5 transition-colors hover:bg-muted/10 ${
              thread.id === selectedId ? 'border-l-4 border-primary bg-primary/5' : ''
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-semibold text-foreground">
                {thread.fromName ?? thread.fromEmail ?? 'Unknown sender'}
              </span>
              <span className="shrink-0 text-xs text-muted">
                {thread.lastMessageAt
                  ? new Date(thread.lastMessageAt).toLocaleDateString()
                  : ''}
              </span>
            </div>
            <p className="truncate text-sm text-foreground">
              {thread.subject ?? '(no subject)'}
              {thread.hasAttachments ? ' 📎' : ''}
            </p>
            <p className={`truncate text-xs ${confidenceTone(thread)}`}>
              ● {attributionLabel(thread)}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 3: Write the inbox page**

Create `apps/hoa/src/app/(dashboard)/inbox/page.tsx`:

```tsx
import Link from 'next/link'
import { Alert } from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  countThreadsByStatus,
  getMailboxStatus,
  listThreads,
  type InboxFilter,
} from '@/lib/inbox/queries'
import { ThreadList } from './ThreadList'

export const metadata = { title: 'Inbox' }

const FILTERS: Array<{ key: InboxFilter; label: string }> = [
  { key: 'needs_review', label: 'Needs review' },
  { key: 'open', label: 'Open' },
  { key: 'waiting', label: 'Waiting' },
  { key: 'all', label: 'All' },
]

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const params = await searchParams
  const org = await getCurrentOrg()
  if (!org) return null

  const filter = (FILTERS.find((f) => f.key === params.filter)?.key ??
    'needs_review') as InboxFilter

  const supabase = await getSupabaseServerClient()
  const [status, counts, threads] = await Promise.all([
    getMailboxStatus(supabase, org.id),
    countThreadsByStatus(supabase, org.id),
    listThreads(supabase, org.id, filter),
  ])

  if (!status) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <Alert variant="info" title="No mailbox connected">
          Connect your HOA mailbox to see resident email here.{' '}
          <Link href="/settings/mailbox" className="underline">
            Connect
          </Link>
        </Alert>
      </main>
    )
  }

  return (
    <main className="flex h-[calc(100vh-4rem)] flex-col">
      {status.syncStatus !== 'ok' ? (
        <Alert
          variant={status.syncStatus === 'auth_failed' ? 'error' : 'warning'}
          title={
            status.syncStatus === 'auth_failed'
              ? 'Mailbox disconnected — reconnect required'
              : 'Mail sync has stalled'
          }
          className="m-3"
        >
          {status.syncError ?? 'Resident email may not be arriving.'}{' '}
          <Link href="/settings/mailbox" className="underline">
            Fix
          </Link>
        </Alert>
      ) : null}

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-full max-w-sm shrink-0 overflow-y-auto border-r border-border xl:max-w-xs">
          <nav className="flex gap-1 border-b border-border p-2 text-xs">
            {FILTERS.map((option) => (
              <Link
                key={option.key}
                href={`/inbox?filter=${option.key}`}
                className={`rounded-full px-2.5 py-1 ${
                  option.key === filter
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted hover:bg-muted/10'
                }`}
              >
                {option.label} {counts[option.key] ?? 0}
              </Link>
            ))}
          </nav>
          <ThreadList threads={threads} filter={filter} />
        </aside>

        <section className="hidden flex-1 items-center justify-center text-sm text-muted lg:flex">
          Select a conversation
        </section>
      </div>
    </main>
  )
}
```

- [ ] **Step 4: Add the nav link**

Find the dashboard navigation array in `apps/hoa/src/components/layout/` (grep for an existing entry such as `href: '/communications'`) and add an Inbox item beside it:

```tsx
  { href: '/inbox', label: 'Inbox', icon: Mail },
```

Import `Mail` from `lucide-react` if it is not already imported in that file.

- [ ] **Step 5: Typecheck, verify, commit**

```bash
rtk pnpm typecheck && rtk pnpm dev:hoa
```
Visit `/inbox`. With no mailbox connected you should see the connect prompt; with one connected, the filter chips and thread list.

```bash
rtk git add apps/hoa/src/app/\(dashboard\)/inbox/ apps/hoa/src/lib/inbox/queries.ts apps/hoa/src/components/layout/ && rtk git commit -m "feat(inbox): thread list with status filters and match attribution"
```

### Post-implementation fix pass (2026-07-31)

Review of the built Task 20 code (not this plan's sample code specifically,
though the defects originated in the samples above and carried through
verbatim) found two Important findings, both fixed in the same branch:

1. **Attribution branched on the wrong field.** `confidenceTone` /
   `attributionLabel` in the Step 2 sample key off `propertyAddress` — a
   *derived* enrichment that `listThreads` fetches via a deliberately
   log-and-degrade batched query. `unitId` is the ground truth (set only
   at high confidence by `decideMatch` in `match.ts`, per the six-signal
   matcher). Branching on `propertyAddress` meant a real match rendered as
   "Unassigned" whenever that one enrichment query failed. Fixed by
   branching on `unitId !== null` first in both functions; when a unit is
   attached but its address didn't resolve, the row now reads "Matched —
   address unavailable" instead of lying that nothing matched.

2. **Counts were unbounded, the list was capped at 50, no pagination.**
   `countThreadsByStatus` counts every thread in a status;
   `listThreads` (Step 1 sample) hard-caps at `limit = 50` with no way to
   see thread #51 onward. Any status exceeding 50 threads — expected for
   Madison Park's backfilled history — showed a filter-chip count higher
   than the visible rows, and the remainder were permanently unreachable
   through the screen. Fixed with offset pagination: `listThreads` gained
   an `offset` parameter (using Supabase `.range()` instead of `.limit()`),
   `INBOX_PAGE_SIZE` (50) is now exported from `queries.ts` so the page and
   the query paginate off the same number, and `page.tsx` reads a `page`
   search param, clamps it against `Math.ceil(counts[filter] / pageSize)`,
   and renders "Showing X–Y of Z" with Previous/Next links that preserve
   the selected filter. The three batched enrichment queries in
   `listThreads` are unchanged — no per-row regression.

Minor findings fixed at the same time: `hasAttachments` now requires
`fetch_status = 'stored'` (a `pending`/`failed` attachment is not yet
retrievable, so the paperclip icon no longer promises a file that isn't
there); the empty state now distinguishes "no mail in the mailbox at all"
from "no threads match this filter" via an `hasAnyThreads` prop; and
`ThreadListItem.snippet` — computed but previously unused — is now
rendered as a muted preview line under the subject.

See `.superpowers/sdd/task-20-report.md` for the full attribution matrix,
verification output, and commit SHA.

---

## Task 21: Triage actions

Built before the thread view so the view has working buttons rather than placeholders.

**Files:**
- Create: `apps/hoa/src/lib/inbox/actions.ts`

**Interfaces:**
- Consumes: `matchThread`/`applyMatch` (Task 14)
- Produces:
  ```ts
  assignThreadToProperty(prev, formData): Promise<InboxActionState>
  setThreadStatus(prev, formData): Promise<InboxActionState>
  linkThreadToResource(prev, formData): Promise<InboxActionState>
  searchProperties(term: string): Promise<Array<{ unitId; address }>>
  ```
  `searchProperties` takes only a search term — it reads the org from the session, like every other action in this file.

  **Amended post-review (see `.superpowers/sdd/task-21-report.md`, "Fix
  pass — org-scoping + silent failures"):** the sample implementation
  below (and the version that originally shipped) writes `unitId` — form
  input — directly into `inbox_threads.unit_id` and
  `inbox_sender_aliases.unit_id` without checking it resolves inside the
  caller's org, relying entirely on RLS via `auth_org_ids()`, which
  returns every org a caller belongs to. `assignThreadToProperty` now
  resolves `unitId` through `getPropertyRef(db, org.id, unitId)`
  (apps/hoa/src/lib/properties/resolve.ts, Task 3) before writing it
  anywhere and rejects with an error if it doesn't resolve. Separately,
  `InboxActionState` gained an optional `warning?: string` field:
  `assignThreadToProperty` used to return `{ ok: true }` unconditionally
  even when the sender-alias upsert (the matcher's entire learning loop)
  or the message lookup that feeds it failed — a manager who ticked
  "remember this sender" was told something happened that didn't.
  `warning` carries a truthful partial-success message in that case
  while still returning `ok: true` for the assignment itself, which did
  succeed. The UI (`apps/hoa/src/app/(dashboard)/inbox/[id]/AssignPropertyForm.tsx`)
  does not yet render `state.warning` — see the Task 21 report for the
  follow-up. `applyMatch`'s guard against re-filing a closed thread was
  also widened here; see the amendment in Task 14 above for detail —
  the change lives in match.ts, not actions.ts, but the finding was
  raised against this task's behavior (a manager closing a thread via
  `setThreadStatus`), so it's cross-referenced from both places.
  Treat the interface above, and the actual files on disk, as
  authoritative over the code block in Step 1 below.

- [ ] **Step 1: Write `apps/hoa/src/lib/inbox/actions.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export interface InboxActionState {
  error?: string
  ok?: boolean
}

const AssignSchema = z.object({
  threadId: z.string().uuid(),
  unitId: z.string().uuid(),
  rememberSender: z.coerce.boolean().optional(),
})

/**
 * File a thread against a property by hand.
 *
 * Two side effects beyond the assignment itself:
 *   1. match_source becomes 'manual', which makes applyMatch() refuse to
 *      overwrite it when new mail arrives on the thread.
 *   2. If asked, the sender is remembered in inbox_sender_aliases so the
 *      NEXT email from that address matches at high confidence. That
 *      lookup table is the entire learning loop for matching — it is why
 *      the needs-review count falls week over week instead of holding
 *      steady.
 */
export async function assignThreadToProperty(
  _prev: InboxActionState,
  formData: FormData,
): Promise<InboxActionState> {
  const org = await getCurrentOrg()
  if (!org) return { error: 'No organization in session.' }

  const parsed = AssignSchema.safeParse({
    threadId: formData.get('threadId'),
    unitId: formData.get('unitId'),
    rememberSender: formData.get('rememberSender') === 'on',
  })
  if (!parsed.success) return { error: 'Pick a property to file this under.' }

  const { threadId, unitId, rememberSender } = parsed.data
  const supabase = await getSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('inbox_threads')
    .update({
      unit_id: unitId,
      match_confidence: 'high',
      match_source: 'manual',
      match_reason: { rule: 'manual_assignment', matched_on: user?.id ?? 'unknown' },
      status: 'open',
    })
    .eq('id', threadId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  if (rememberSender) {
    const { data: message } = await supabase
      .from('inbox_messages')
      .select('from_email')
      .eq('thread_id', threadId)
      .eq('direction', 'inbound')
      .order('sent_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (message?.from_email) {
      await supabase.from('inbox_sender_aliases').upsert(
        {
          organization_id: org.id,
          email_address: message.from_email.toLowerCase(),
          unit_id: unitId,
          source: 'manual',
          created_by: user?.id ?? null,
        },
        { onConflict: 'organization_id,email_address' },
      )
    }
  }

  revalidatePath('/inbox')
  revalidatePath(`/inbox/${threadId}`)
  return { ok: true }
}

const StatusSchema = z.object({
  threadId: z.string().uuid(),
  status: z.enum(['needs_review', 'open', 'waiting', 'closed']),
})

export async function setThreadStatus(
  _prev: InboxActionState,
  formData: FormData,
): Promise<InboxActionState> {
  const org = await getCurrentOrg()
  if (!org) return { error: 'No organization in session.' }

  const parsed = StatusSchema.safeParse({
    threadId: formData.get('threadId'),
    status: formData.get('status'),
  })
  if (!parsed.success) return { error: 'Invalid status.' }

  const supabase = await getSupabaseServerClient()
  const { error } = await supabase
    .from('inbox_threads')
    .update({ status: parsed.data.status })
    .eq('id', parsed.data.threadId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath('/inbox')
  revalidatePath(`/inbox/${parsed.data.threadId}`)
  return { ok: true }
}

const LinkSchema = z.object({
  threadId: z.string().uuid(),
  resourceType: z.enum(['ticket', 'arc_request', 'violation', 'communication_thread']),
  resourceId: z.string().uuid(),
})

export async function linkThreadToResource(
  _prev: InboxActionState,
  formData: FormData,
): Promise<InboxActionState> {
  const org = await getCurrentOrg()
  if (!org) return { error: 'No organization in session.' }

  const parsed = LinkSchema.safeParse({
    threadId: formData.get('threadId'),
    resourceType: formData.get('resourceType'),
    resourceId: formData.get('resourceId'),
  })
  if (!parsed.success) return { error: 'Invalid link target.' }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase.from('inbox_thread_links').upsert(
    {
      organization_id: org.id,
      thread_id: parsed.data.threadId,
      resource_type: parsed.data.resourceType,
      resource_id: parsed.data.resourceId,
      created_by: user?.id ?? null,
    },
    { onConflict: 'thread_id,resource_type,resource_id', ignoreDuplicates: true },
  )

  if (error) return { error: error.message }

  revalidatePath(`/inbox/${parsed.data.threadId}`)
  return { ok: true }
}

/** Property search for the triage assignment control. */
export async function searchProperties(
  term: string,
): Promise<Array<{ unitId: string; address: string }>> {
  const org = await getCurrentOrg()
  if (!org) return []

  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('units')
    .select('id, address_line1, unit_number')
    .eq('organization_id', org.id)
    .ilike('address_line1', `%${term}%`)
    .order('address_line1')
    .limit(20)

  return (data ?? []).map((unit) => ({
    unitId: unit.id,
    address: unit.unit_number
      ? `${unit.address_line1} #${unit.unit_number}`
      : unit.address_line1,
  }))
}
```

- [ ] **Step 2: Typecheck and commit**

```bash
rtk pnpm typecheck && rtk git add apps/hoa/src/lib/inbox/actions.ts && rtk git commit -m "feat(inbox): triage actions — assign, status, link, sender-alias learning"
```

---

## Task 22: Thread view with property rail

The three-pane payoff. The property rail is the reason to work here instead of Gmail.

**Files:**
- Create: `apps/hoa/src/app/(dashboard)/inbox/[id]/page.tsx`
- Create: `apps/hoa/src/app/(dashboard)/inbox/[id]/MessageThread.tsx`
- Create: `apps/hoa/src/app/(dashboard)/inbox/[id]/PropertyRail.tsx`
- Create: `apps/hoa/src/app/(dashboard)/inbox/[id]/AssignPropertyForm.tsx`
- Modify: `apps/hoa/src/lib/inbox/queries.ts`

**Interfaces:**
- Consumes: `assignThreadToProperty`, `setThreadStatus`, `searchProperties` (Task 21)
- Produces:
  ```ts
  getThreadDetail(db, orgId, threadId): Promise<ThreadDetail | null>
  getPropertyContext(db, orgId, unitId): Promise<PropertyContext | null>
  ```

- [ ] **Step 1: Add the queries**

Append to `apps/hoa/src/lib/inbox/queries.ts`:

```ts
export interface ThreadMessage {
  id: string
  direction: 'inbound' | 'outbound'
  fromName: string | null
  fromEmail: string | null
  toEmails: string[]
  subject: string | null
  bodyText: string | null
  strippedText: string | null
  sentAt: string | null
  attachments: Array<{
    id: string
    fileName: string
    sizeBytes: number | null
    fetchStatus: string
  }>
}

export interface ThreadDetail {
  id: string
  subject: string | null
  status: string
  unitId: string | null
  matchConfidence: string
  matchReason: Record<string, unknown> | null
  matchSource: string
  messages: ThreadMessage[]
}

export interface PropertyContext {
  address: string
  unitNumber: string | null
  residents: Array<{ name: string; role: string; email: string | null }>
  duesBalance: number
  duesOverdueCount: number
  openViolations: number
  openArcRequests: Array<{ id: string; summary: string; status: string }>
  openTickets: Array<{ id: string; subject: string; status: string }>
  lastCommunication: { subject: string; sentAt: string | null } | null
}

export async function getThreadDetail(
  db: Db,
  orgId: string,
  threadId: string,
): Promise<ThreadDetail | null> {
  const { data: thread } = await db
    .from('inbox_threads')
    .select('id, subject, status, unit_id, match_confidence, match_reason, match_source')
    .eq('organization_id', orgId)
    .eq('id', threadId)
    .maybeSingle()

  if (!thread) return null

  const { data: messages } = await db
    .from('inbox_messages')
    .select(
      'id, direction, from_name, from_email, to_emails, subject, body_text, stripped_text, sent_at',
    )
    .eq('thread_id', threadId)
    .order('sent_at', { ascending: true })

  const messageIds = (messages ?? []).map((m) => m.id)
  const { data: attachments } =
    messageIds.length > 0
      ? await db
          .from('inbox_attachments')
          .select('id, message_id, file_name, size_bytes, fetch_status')
          .in('message_id', messageIds)
          .neq('fetch_status', 'skipped')
      : { data: [] as Array<{
          id: string
          message_id: string
          file_name: string
          size_bytes: number | null
          fetch_status: string
        }> }

  return {
    id: thread.id,
    subject: thread.subject,
    status: thread.status,
    unitId: thread.unit_id,
    matchConfidence: thread.match_confidence,
    matchReason: thread.match_reason as Record<string, unknown> | null,
    matchSource: thread.match_source,
    messages: (messages ?? []).map((message) => ({
      id: message.id,
      direction: message.direction as 'inbound' | 'outbound',
      fromName: message.from_name,
      fromEmail: message.from_email,
      toEmails: message.to_emails ?? [],
      subject: message.subject,
      bodyText: message.body_text,
      strippedText: message.stripped_text,
      sentAt: message.sent_at,
      attachments: (attachments ?? [])
        .filter((a) => a.message_id === message.id)
        .map((a) => ({
          id: a.id,
          fileName: a.file_name,
          sizeBytes: a.size_bytes,
          fetchStatus: a.fetch_status,
        })),
    })),
  }
}

/**
 * Everything the rail shows. This is the differentiator over Gmail, so it
 * is assembled eagerly rather than lazily behind clicks — context that is
 * hidden stops being checked.
 */
export async function getPropertyContext(
  db: Db,
  orgId: string,
  unitId: string,
): Promise<PropertyContext | null> {
  const { data: unit } = await db
    .from('units')
    .select('id, address_line1, unit_number, legacy_hoa_property_id')
    .eq('organization_id', orgId)
    .eq('id', unitId)
    .maybeSingle()

  if (!unit) return null

  const legacyId = unit.legacy_hoa_property_id

  const [residentsRes, assessmentsRes, violationsRes, arcRes, ticketsRes, commsRes] =
    await Promise.all([
      legacyId
        ? db
            .from('property_residents')
            .select('full_name, role, email')
            .eq('property_id', legacyId)
            .is('moved_out_at', null)
        : Promise.resolve({ data: [] as Array<{ full_name: string; role: string; email: string | null }> }),
      db
        .from('assessments')
        .select('amount, due_date, status')
        .eq('unit_id', unitId)
        .neq('status', 'paid'),
      legacyId
        ? db
            .from('hoa_violations')
            .select('id', { count: 'exact', head: true })
            .eq('property_id', legacyId)
            .eq('status', 'open')
        : Promise.resolve({ count: 0 }),
      db
        .from('arc_requests')
        .select('id, summary, status')
        .eq('unit_id', unitId)
        .not('status', 'in', '("approved","denied","withdrawn")')
        .limit(5),
      db
        .from('tickets')
        .select('id, subject, status')
        .eq('unit_id', unitId)
        .neq('status', 'closed')
        .limit(5),
      db
        .from('communication_recipients')
        .select('communication_id, sent_at')
        .eq('unit_id', unitId)
        .order('sent_at', { ascending: false, nullsFirst: false })
        .limit(1),
    ])

  const unpaid = assessmentsRes.data ?? []
  const today = new Date().toISOString().slice(0, 10)

  let lastCommunication: PropertyContext['lastCommunication'] = null
  const lastRecipient = commsRes.data?.[0]
  if (lastRecipient?.communication_id) {
    const { data: communication } = await db
      .from('communications')
      .select('subject')
      .eq('id', lastRecipient.communication_id)
      .maybeSingle()
    if (communication) {
      lastCommunication = {
        subject: communication.subject,
        sentAt: lastRecipient.sent_at,
      }
    }
  }

  return {
    address: unit.address_line1,
    unitNumber: unit.unit_number,
    residents: (residentsRes.data ?? []).map((r) => ({
      name: r.full_name,
      role: r.role,
      email: r.email,
    })),
    duesBalance: unpaid.reduce((sum, a) => sum + Number(a.amount ?? 0), 0),
    duesOverdueCount: unpaid.filter((a) => a.due_date && a.due_date < today).length,
    openViolations: violationsRes.count ?? 0,
    openArcRequests: (arcRes.data ?? []).map((a) => ({
      id: a.id,
      summary: a.summary,
      status: a.status,
    })),
    openTickets: (ticketsRes.data ?? []).map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status,
    })),
    lastCommunication,
  }
}
```

- [ ] **Step 2: Write the message thread component**

Create `apps/hoa/src/app/(dashboard)/inbox/[id]/MessageThread.tsx`:

```tsx
import type { ThreadMessage } from '@/lib/inbox/queries'

export function MessageThread({ messages }: { messages: ThreadMessage[] }) {
  return (
    <div className="space-y-3">
      {messages.map((message) => (
        <article
          key={message.id}
          className={`rounded-lg border p-3 ${
            message.direction === 'outbound'
              ? 'border-primary/40 bg-primary/5'
              : 'border-border bg-muted/5'
          }`}
        >
          <header className="mb-2 flex flex-wrap items-baseline gap-2 text-xs text-muted">
            <span className="font-semibold text-foreground">
              {message.fromName ?? message.fromEmail ?? 'Unknown'}
            </span>
            <span>→ {message.toEmails.join(', ') || '—'}</span>
            <span className="ml-auto">
              {message.sentAt ? new Date(message.sentAt).toLocaleString() : ''}
            </span>
          </header>

          {/* strippedText is the new content; body_text still holds the
              full message including quoted history for reference. */}
          <p className="whitespace-pre-wrap text-sm text-foreground">
            {message.strippedText ?? message.bodyText ?? '(no body)'}
          </p>

          {message.attachments.length > 0 ? (
            <ul className="mt-2 space-y-1 border-t border-border pt-2">
              {message.attachments.map((file) => (
                <li key={file.id} className="text-xs">
                  {file.fetchStatus === 'stored' ? (
                    <a href={`/inbox/attachment/${file.id}`} className="underline">
                      📎 {file.fileName}
                    </a>
                  ) : file.fetchStatus === 'pending' ? (
                    <span className="text-muted">📎 {file.fileName} — downloading…</span>
                  ) : (
                    <span className="text-warning">
                      📎 {file.fileName} — couldn&apos;t retrieve, open in Gmail
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </article>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Write the assign form**

Create `apps/hoa/src/app/(dashboard)/inbox/[id]/AssignPropertyForm.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { Alert, Button } from '@homeowner-portal/ui'
import { assignThreadToProperty, type InboxActionState } from '@/lib/inbox/actions'

const initial: InboxActionState = {}

interface Props {
  threadId: string
  properties: Array<{ unitId: string; address: string }>
  suggestedUnitId?: string | null
}

export function AssignPropertyForm({ threadId, properties, suggestedUnitId }: Props) {
  const [state, action, pending] = useActionState(assignThreadToProperty, initial)

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="threadId" value={threadId} />

      <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
        File under property
      </label>
      <select
        name="unitId"
        defaultValue={suggestedUnitId ?? ''}
        className="w-full rounded-md border border-border bg-background p-2 text-sm"
        required
      >
        <option value="">Choose a property…</option>
        {properties.map((property) => (
          <option key={property.unitId} value={property.unitId}>
            {property.address}
            {property.unitId === suggestedUnitId ? ' — suggested' : ''}
          </option>
        ))}
      </select>

      <label className="flex items-center gap-2 text-xs text-muted">
        <input type="checkbox" name="rememberSender" defaultChecked />
        Remember this sender for next time
      </label>

      {state.error ? <Alert variant="error">{state.error}</Alert> : null}

      <Button type="submit" size="sm" loading={pending} className="w-full">
        Assign
      </Button>
    </form>
  )
}
```

- [ ] **Step 4: Write the property rail**

Create `apps/hoa/src/app/(dashboard)/inbox/[id]/PropertyRail.tsx`:

```tsx
import Link from 'next/link'
import type { PropertyContext, ThreadDetail } from '@/lib/inbox/queries'
import { AssignPropertyForm } from './AssignPropertyForm'

interface Props {
  thread: ThreadDetail
  context: PropertyContext | null
  properties: Array<{ unitId: string; address: string }>
}

export function PropertyRail({ thread, context, properties }: Props) {
  if (!context) {
    const suggested = (thread.matchReason?.candidate_unit_ids as string[] | undefined)?.[0]

    return (
      <div className="space-y-3 p-3">
        <p className="text-sm font-semibold text-foreground">Not filed yet</p>
        {suggested ? (
          <p className="rounded-md border border-warning bg-warning/10 p-2 text-xs">
            Suggested:{' '}
            {properties.find((p) => p.unitId === suggested)?.address ?? 'a property'} —
            matched via {String(thread.matchReason?.rule ?? 'unknown')}. Confirm below.
          </p>
        ) : (
          <p className="text-xs text-muted">
            No property matched this sender. File it manually, or leave it if it
            isn&apos;t about a specific home.
          </p>
        )}
        <AssignPropertyForm
          threadId={thread.id}
          properties={properties}
          suggestedUnitId={suggested ?? null}
        />
      </div>
    )
  }

  return (
    <div className="space-y-2.5 p-3">
      <div>
        <p className="font-semibold text-foreground">
          {context.address}
          {context.unitNumber ? ` #${context.unitNumber}` : ''}
        </p>
        <p className="text-xs text-muted">
          {context.residents.map((r) => `${r.name} (${r.role})`).join(' · ') ||
            'No residents on file'}
        </p>
        <p className="mt-0.5 text-[11px] text-muted">
          Matched via {String(thread.matchReason?.rule ?? 'unknown')}
          {thread.matchSource === 'manual' ? ' (manual)' : ''}
        </p>
      </div>

      <RailBox
        label="Dues"
        tone={context.duesBalance > 0 ? 'danger' : 'ok'}
        value={
          context.duesBalance > 0
            ? `$${context.duesBalance.toFixed(2)}${
                context.duesOverdueCount > 0
                  ? ` · ${context.duesOverdueCount} overdue`
                  : ''
              }`
            : 'Current'
        }
      />

      <RailBox
        label="Open violations"
        tone={context.openViolations > 0 ? 'warn' : 'plain'}
        value={context.openViolations > 0 ? String(context.openViolations) : 'None'}
      />

      <RailBox
        label="Open ARC"
        tone="plain"
        value={
          context.openArcRequests.length > 0
            ? context.openArcRequests.map((a) => `${a.summary} (${a.status})`).join(', ')
            : 'None'
        }
      />

      <RailBox
        label="Open tickets"
        tone="plain"
        value={
          context.openTickets.length > 0
            ? context.openTickets.map((t) => t.subject).join(', ')
            : 'None'
        }
      />

      <RailBox
        label="Last sent"
        tone="plain"
        value={
          context.lastCommunication
            ? `${context.lastCommunication.subject}${
                context.lastCommunication.sentAt
                  ? ` — ${new Date(context.lastCommunication.sentAt).toLocaleDateString()}`
                  : ''
              }`
            : 'Nothing sent yet'
        }
      />

      <div className="space-y-1 border-t border-border pt-2 text-xs">
        <Link href={`/properties/${thread.unitId}`} className="block underline">
          Open property →
        </Link>
        <Link href={`/tickets/new?unitId=${thread.unitId}`} className="block underline">
          Create ticket from this
        </Link>
      </div>
    </div>
  )
}

function RailBox({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'ok' | 'warn' | 'danger' | 'plain'
}) {
  const border =
    tone === 'danger'
      ? 'border-destructive'
      : tone === 'warn'
        ? 'border-warning'
        : 'border-border'

  return (
    <div className={`rounded-md border ${border} p-2`}>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  )
}
```

- [ ] **Step 5: Write the thread page**

Create `apps/hoa/src/app/(dashboard)/inbox/[id]/page.tsx`:

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  countThreadsByStatus,
  getPropertyContext,
  getThreadDetail,
  listThreads,
  type InboxFilter,
} from '@/lib/inbox/queries'
import { searchProperties } from '@/lib/inbox/actions'
import { ThreadList } from '../ThreadList'
import { MessageThread } from './MessageThread'
import { PropertyRail } from './PropertyRail'

export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ filter?: string }>
}) {
  const { id } = await params
  const { filter: filterParam } = await searchParams
  const filter = (filterParam ?? 'needs_review') as InboxFilter

  const org = await getCurrentOrg()
  if (!org) return null

  const supabase = await getSupabaseServerClient()
  const thread = await getThreadDetail(supabase, org.id, id)
  if (!thread) notFound()

  const [threads, counts, context, properties] = await Promise.all([
    listThreads(supabase, org.id, filter),
    countThreadsByStatus(supabase, org.id),
    thread.unitId ? getPropertyContext(supabase, org.id, thread.unitId) : null,
    searchProperties(''),
  ])

  return (
    <main className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* pane 1 — list */}
      <aside className="hidden w-72 shrink-0 overflow-y-auto border-r border-border lg:block">
        <nav className="border-b border-border p-2 text-xs">
          <Link href={`/inbox?filter=${filter}`} className="text-muted underline">
            ← All conversations ({counts[filter] ?? 0})
          </Link>
        </nav>
        <ThreadList threads={threads} selectedId={thread.id} filter={filter} />
      </aside>

      {/* pane 2 — conversation */}
      <section className="flex-1 overflow-y-auto p-4">
        <header className="mb-3">
          <h1 className="text-lg font-semibold text-foreground">
            {thread.subject ?? '(no subject)'}
          </h1>
          <p className="text-xs text-muted">
            {thread.messages.length} message
            {thread.messages.length === 1 ? '' : 's'} · {thread.status}
          </p>
        </header>

        <MessageThread messages={thread.messages} />

        <p className="mt-4 rounded-md border border-border bg-muted/5 p-3 text-xs text-muted">
          Replying from HomeownerHub arrives in Phase B. For now, reply in Gmail —
          the thread will sync back here within 2 minutes.
        </p>
      </section>

      {/* pane 3 — property rail */}
      <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-border xl:block">
        <PropertyRail thread={thread} context={context} properties={properties} />
      </aside>
    </main>
  )
}
```

The rail hides below `xl` and the list below `lg` — that is the collapse rule the spec called for. On a phone you get just the conversation, which is the right single pane to keep.

- [ ] **Step 6: Typecheck**

```bash
rtk pnpm typecheck
```
Expected: PASS. If `arc_requests` uses a column other than `summary`, or `tickets` other than `subject`, adjust `getPropertyContext` to match `packages/db/src/database.types.ts` — those two selects are the likeliest mismatch.

- [ ] **Step 7: Verify and commit**

```bash
rtk pnpm dev:hoa
```
Open a thread from `/inbox`. Expected: three panes on a wide window; the rail shows either property context or the assign form.

```bash
rtk git add apps/hoa/src/app/\(dashboard\)/inbox/ apps/hoa/src/lib/inbox/queries.ts && rtk git commit -m "feat(inbox): three-pane thread view with property context rail"
```

---

## Task 23: Attachment fetching and download

**Files:**
- Create: `packages/jobs/src/mailbox-attachments.ts`
- Create: `apps/hoa/src/app/(dashboard)/inbox/attachment/[id]/route.ts`
- Modify: `packages/jobs/src/index.ts`, `apps/hoa/src/app/api/inngest/route.ts`

**Interfaces:**
- Consumes: `GmailClient` (Task 10), `getAccessTokenFor` (Task 15)
- Produces: `mailboxAttachmentsJob`; `GET /inbox/attachment/:id` → signed-URL redirect

- [ ] **Step 1: Write the fetch job**

Create `packages/jobs/src/mailbox-attachments.ts`:

```ts
import { createHash } from 'node:crypto'
import { createAdminClient } from '@homeowner-portal/db'
import { GmailClient, MailboxAuthError } from '@homeowner-portal/mailbox'
import { inngest } from './client'
import { getAccessTokenFor, markAuthFailed } from './mailbox-tokens'

const BUCKET = 'hoa-documents'
const BATCH_SIZE = 20
const MAX_ATTEMPTS = 2

/**
 * Attachment fetcher.
 *
 * Separate from mailboxSyncJob on purpose: a 20 MB PDF must not stall the
 * 2-minute sync loop, and a failed download must retry on its own without
 * re-walking Gmail history. gmail_attachment_id is what makes that
 * independent retry possible.
 *
 * Runs on a schedule AND on the mailbox/attachments.queued event, so a
 * fresh sync gets its files promptly while the cron catches stragglers.
 */
export const mailboxAttachmentsJob = inngest.createFunction(
  { id: 'mailbox-attachments', name: 'Mailbox Attachment Fetch' },
  [{ cron: '*/5 * * * *' }, { event: 'mailbox/attachments.queued' }],
  async ({ logger }) => {
    const db = createAdminClient()

    const { data: pending } = await db
      .from('inbox_attachments')
      .select('id, organization_id, thread_id, message_id, file_name, gmail_attachment_id, fetch_attempts')
      .eq('fetch_status', 'pending')
      .lt('fetch_attempts', MAX_ATTEMPTS)
      .order('created_at')
      .limit(BATCH_SIZE)

    if (!pending || pending.length === 0) return { fetched: 0 }

    // One Gmail client per mailbox account, not per attachment.
    const clientCache = new Map<string, GmailClient>()
    let fetched = 0

    for (const attachment of pending) {
      try {
        const { data: message } = await db
          .from('inbox_messages')
          .select('gmail_message_id, thread_id')
          .eq('id', attachment.message_id)
          .maybeSingle()

        const { data: thread } = message
          ? await db
              .from('inbox_threads')
              .select('mailbox_account_id')
              .eq('id', message.thread_id)
              .maybeSingle()
          : { data: null }

        if (!message || !thread || !attachment.gmail_attachment_id) {
          await db
            .from('inbox_attachments')
            .update({
              fetch_status: 'failed',
              fetch_error: 'Missing message, thread, or Gmail attachment id.',
              fetch_attempts: attachment.fetch_attempts + 1,
            })
            .eq('id', attachment.id)
          continue
        }

        let client = clientCache.get(thread.mailbox_account_id)
        if (!client) {
          client = new GmailClient(
            await getAccessTokenFor(db, thread.mailbox_account_id),
          )
          clientCache.set(thread.mailbox_account_id, client)
        }

        const bytes = await client.getAttachment(
          message.gmail_message_id,
          attachment.gmail_attachment_id,
        )

        // Sanitize: a filename from an email is untrusted input and must
        // never be able to escape the org's storage prefix.
        const safeName = attachment.file_name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120)
        const path = `${attachment.organization_id}/inbox/${attachment.thread_id}/${attachment.message_id}/${safeName}`

        const { error: uploadError } = await db.storage
          .from(BUCKET)
          .upload(path, bytes, { upsert: true, contentType: undefined })

        if (uploadError) throw new Error(uploadError.message)

        await db
          .from('inbox_attachments')
          .update({
            storage_path: path,
            sha256: createHash('sha256').update(bytes).digest('hex'),
            size_bytes: bytes.length,
            fetch_status: 'stored',
            fetch_error: null,
            fetch_attempts: attachment.fetch_attempts + 1,
          })
          .eq('id', attachment.id)

        fetched++
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const attempts = attachment.fetch_attempts + 1

        if (error instanceof MailboxAuthError) {
          const { data: thread } = await db
            .from('inbox_threads')
            .select('mailbox_account_id')
            .eq('id', attachment.thread_id)
            .maybeSingle()
          if (thread) await markAuthFailed(db, thread.mailbox_account_id, message)
        }

        await db
          .from('inbox_attachments')
          .update({
            // Fail loudly at the cap. An attachment row that looks fine
            // but downloads nothing is worse than a visible error.
            fetch_status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
            fetch_error: message,
            fetch_attempts: attempts,
          })
          .eq('id', attachment.id)

        logger.error(`[mailbox-attachments] ${attachment.file_name}: ${message}`)
      }
    }

    logger.info(`[mailbox-attachments] stored ${fetched}/${pending.length}`)
    return { fetched }
  },
)
```

- [ ] **Step 2: Export and mount**

Add to `packages/jobs/src/index.ts`:

```ts
export { mailboxAttachmentsJob } from './mailbox-attachments'
```

Add `mailboxAttachmentsJob` to the import list and `functions` array in `apps/hoa/src/app/api/inngest/route.ts`.

- [ ] **Step 3: Write the download route**

Create `apps/hoa/src/app/(dashboard)/inbox/attachment/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Attachment download.
 *
 * The row is read through the USER-bound client, so board/admin RLS on
 * inbox_attachments decides access — the route does not re-implement
 * authorization. Only after that check does it mint a short-lived signed
 * URL for the private bucket.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params

  const org = await getCurrentOrg()
  if (!org) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const supabase = await getSupabaseServerClient()
  const { data: attachment } = await supabase
    .from('inbox_attachments')
    .select('storage_path, file_name, fetch_status')
    .eq('id', id)
    .eq('organization_id', org.id)
    .maybeSingle()

  if (!attachment) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  if (attachment.fetch_status !== 'stored' || !attachment.storage_path) {
    return NextResponse.json(
      { error: 'not_available', status: attachment.fetch_status },
      { status: 409 },
    )
  }

  const { data: signed, error } = await supabase.storage
    .from('hoa-documents')
    .createSignedUrl(attachment.storage_path, 60, {
      download: attachment.file_name,
    })

  if (error || !signed) {
    return NextResponse.json({ error: 'signing_failed' }, { status: 500 })
  }

  return NextResponse.redirect(signed.signedUrl)
}
```

- [ ] **Step 4: Typecheck and commit**

```bash
rtk pnpm typecheck && rtk git add packages/jobs/ apps/hoa/src/app/ && rtk git commit -m "feat(inbox): attachment fetch job and signed-URL download"
```

---

## Task 24: End-to-end verification

The final gate. Everything below must pass before Phase A is called done.

**Files:**
- Create: `scripts/test-mailbox-sync.ts`
- Create: `apps/hoa/e2e/inbox.spec.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: everything
- Produces: `pnpm test:mailbox-sync`

- [ ] **Step 1: Write the sync idempotency test**

Create `scripts/test-mailbox-sync.ts`:

```ts
/**
 * scripts/test-mailbox-sync.ts
 *
 * Proves the property the whole sync design rests on: ingesting the same
 * messages twice changes nothing. A historyId expiry, an Inngest retry,
 * and an overlapping cron run all re-deliver mail we already have.
 *
 * Run:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   pnpm exec tsx scripts/test-mailbox-sync.ts
 */

import './_load-env'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../packages/db/src/database.types'
import type { ParsedMessage } from '../packages/mailbox/src/types'
import { ingestMessages } from '../apps/hoa/src/lib/inbox/ingest'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const db = createClient<Database>(url, key)
const TAG = 'test-mailbox-sync-harness'
let failures = 0

function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

function message(id: string, threadId: string): ParsedMessage {
  return {
    gmailMessageId: id,
    gmailThreadId: threadId,
    rfc822MessageId: `<${id}@mail>`,
    inReplyTo: null,
    references: [],
    fromEmail: 'j.rivera@example.test',
    fromName: 'Jenna Rivera',
    toEmails: [`board@${TAG}.test`],
    ccEmails: [],
    deliveredTo: [],
    subject: `Subject ${id}`,
    bodyText: 'Body text.',
    bodyHtml: null,
    strippedText: 'Body text.',
    attachments: [
      {
        gmailAttachmentId: `att-${id}`,
        fileName: 'invoice.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1024,
        isInline: false,
      },
      {
        gmailAttachmentId: `logo-${id}`,
        fileName: 'logo.gif',
        contentType: 'image/gif',
        sizeBytes: 4096,
        isInline: true,
      },
    ],
    sentAt: new Date().toISOString(),
    labelIds: ['INBOX'],
  }
}

async function main(): Promise<void> {
  const { data: org } = await db
    .from('orgs')
    .insert({ name: `${TAG}-org`, hub_type: 'hoa' })
    .select('id')
    .single()
  if (!org) throw new Error('could not seed org')

  const { data: account } = await db
    .from('mailbox_accounts')
    .insert({
      organization_id: org.id,
      email_address: `board@${TAG}.test`,
      scope_mode: 'all',
    })
    .select('id')
    .single()

  const batch = [message('m1', 't1'), message('m2', 't1'), message('m3', 't2')]

  // ── first ingest ────────────────────────────────────────────────
  const first = await ingestMessages(db, org.id, account!.id, batch)
  check('A. first ingest creates 2 threads', first.threadsCreated === 2,
    `${first.threadsCreated}`)
  check('B. first ingest inserts 3 messages', first.messagesInserted === 3,
    `${first.messagesInserted}`)
  check('C. inline logo skipped, invoice queued', first.attachmentsQueued === 3,
    `${first.attachmentsQueued} queued (expect 3 invoices, 3 logos skipped)`)

  const { count: skipped } = await db
    .from('inbox_attachments')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', org.id)
    .eq('fetch_status', 'skipped')
  check('D. 3 inline images marked skipped', skipped === 3, `${skipped}`)

  // ── second ingest, identical input ──────────────────────────────
  const second = await ingestMessages(db, org.id, account!.id, batch)
  check('E. re-ingest creates NO new threads', second.threadsCreated === 0,
    `${second.threadsCreated}`)
  check('F. re-ingest inserts NO new messages', second.messagesInserted === 0,
    `${second.messagesInserted}`)
  check('G. re-ingest skips all 3 as duplicates', second.messagesSkipped === 3,
    `${second.messagesSkipped}`)

  const { count: totalMessages } = await db
    .from('inbox_messages')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', org.id)
  check('H. still exactly 3 messages in the database', totalMessages === 3,
    `${totalMessages}`)

  // ── manual assignment survives new mail ─────────────────────────
  const { data: thread } = await db
    .from('inbox_threads')
    .select('id')
    .eq('mailbox_account_id', account!.id)
    .eq('gmail_thread_id', 't1')
    .single()

  await db
    .from('inbox_threads')
    .update({ match_source: 'manual', status: 'open', match_confidence: 'high' })
    .eq('id', thread!.id)

  await ingestMessages(db, org.id, account!.id, [message('m4', 't1')])

  const { data: after } = await db
    .from('inbox_threads')
    .select('match_source, status')
    .eq('id', thread!.id)
    .single()
  check(
    'I. new mail does not clobber a manual assignment',
    after?.match_source === 'manual' && after?.status === 'open',
    `${after?.match_source}/${after?.status}`,
  )

  await db.from('orgs').delete().eq('id', org.id)

  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
```

- [ ] **Step 2: Add the script**

In root `package.json`:

```json
    "test:mailbox-sync": "tsx scripts/test-mailbox-sync.ts",
```

- [ ] **Step 3: Run it**

```bash
rtk pnpm exec tsx scripts/test-mailbox-sync.ts
```
Expected: `ALL PASS` — 9 checks.

- [ ] **Step 4: Write the E2E smoke test**

Create `apps/hoa/e2e/inbox.spec.ts`:

```ts
import { expect, test } from '@playwright/test'

/**
 * Inbox smoke test. Does NOT exercise Google OAuth — that needs a real
 * consent screen. It verifies the surfaces render and degrade correctly.
 *
 * Requires a logged-in storage state; follow whatever pattern the other
 * specs in this directory use for authentication.
 */

test('inbox prompts to connect when no mailbox exists', async ({ page }) => {
  await page.goto('/inbox')
  await expect(page.getByText(/no mailbox connected/i)).toBeVisible()
  await expect(page.getByRole('link', { name: /connect/i })).toBeVisible()
})

test('settings mailbox page offers a single Google button', async ({ page }) => {
  await page.goto('/settings/mailbox')
  await expect(
    page.getByRole('link', { name: /continue with google/i }),
  ).toBeVisible()
})

test('connect link targets the OAuth start route', async ({ page }) => {
  await page.goto('/settings/mailbox')
  const link = page.getByRole('link', { name: /continue with google/i })
  await expect(link).toHaveAttribute('href', /\/api\/oauth\/google\/start/)
})

test('onboarding setup shows the checklist with mailbox highlighted', async ({ page }) => {
  await page.goto('/onboarding/setup')
  await expect(page.getByText(/connect your hoa mailbox/i)).toBeVisible()
  await expect(page.getByText(/of 4 done/i)).toBeVisible()
})
```

- [ ] **Step 5: Full verification sweep**

Run every gate, in order:

```bash
rtk pnpm test:unit
```
Expected: PASS — roughly 60 tests across `packages/mailbox` and `apps/hoa/src/lib`.

```bash
rtk pnpm typecheck
```
Expected: PASS, no errors.

```bash
rtk pnpm build
```
Expected: PASS.

```bash
rtk pnpm exec tsx scripts/test-inbox-rls.ts && \
rtk pnpm exec tsx scripts/test-property-resolve.ts && \
rtk pnpm exec tsx scripts/test-inbox-match.ts && \
rtk pnpm exec tsx scripts/test-mailbox-sync.ts
```
Expected: `ALL PASS` from each of the four.

- [ ] **Step 6: Live verification against a real mailbox**

This is the only way to know Phase A actually works.

1. Create a Google Cloud project, enable the Gmail API, create an OAuth client, and add `<app-url>/api/oauth/google/callback` as an authorized redirect URI.
2. Set `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, and `MAILBOX_TOKEN_KEY` (`openssl rand -base64 32`).
3. Add your own Google account as a test user on the OAuth consent screen — restricted-scope verification is not needed for testing, only for external users.
4. `rtk pnpm dev:hoa`, then visit `/settings/mailbox` and connect.
5. Confirm, in order:
   - [ ] The scope picker pre-selects an address, not "everything"
   - [ ] `backfill_status` moves `pending → running → done`
   - [ ] The preview panel shows non-zero counts and a sample with real match outcomes
   - [ ] `/inbox` lists threads
   - [ ] A thread whose sender matches a resident shows the property rail with dues/ARC/violations
   - [ ] A thread with no match shows the assign form; assigning it with "remember this sender" writes an `inbox_sender_aliases` row
   - [ ] Send yourself a new email — it appears within ~2 minutes
   - [ ] An email with a PDF attachment gets `fetch_status='stored'` and the download link works
   - [ ] An email with only a signature logo shows **no** attachment in the UI

- [ ] **Step 7: Record the known debt**

Append to `docs/parking-lot.md`:

```markdown
### Extract `packages/inbox` from `apps/hoa/src/lib/inbox`

`packages/jobs/src/mailbox-{sync,backfill,attachments}.ts` import
`ingest.ts` and `match.ts` from `apps/hoa` by relative path. It resolves and
bundles correctly, but a package reaching into an app is backwards.

Fix: move `ingest.ts`, `match.ts`, `properties/resolve.ts`, and
`properties/normalize-address.ts` into a `packages/inbox` workspace package;
both `apps/hoa` and `packages/jobs` then import it normally. Mechanical —
the modules already have no Next-specific imports, which is why the move is
safe to defer rather than dangerous.

Deferred because doing it before Phase A was proven meant moving files that
were still changing every task.
```

- [ ] **Step 8: Commit**

```bash
rtk git add scripts/test-mailbox-sync.ts apps/hoa/e2e/inbox.spec.ts package.json docs/parking-lot.md && rtk git commit -m "test(inbox): sync idempotency + inbox e2e smoke"
```

---

## Done criteria

Phase A is complete when all of these hold:

- [ ] `rtk pnpm test:unit` passes (~60 tests)
- [ ] `rtk pnpm typecheck` passes
- [ ] `rtk pnpm build` passes
- [ ] All four integration scripts report `ALL PASS`
- [ ] `SELECT * FROM public.property_bridge_gaps` returns zero rows for Madison Park
- [ ] `mailbox_account_secrets` has **zero** RLS policies and is unreadable from a user session
- [ ] A real Gmail mailbox connects, backfills, syncs incrementally, and matches to properties
- [ ] Step 6's live checklist is fully ticked

## What Phase A explicitly does not do

Replying from inside HomeownerHub. The thread view says so directly rather than showing a disabled button, because a dead compose box reads as a bug. Replies happen in Gmail and sync back within two minutes — the board's workflow is unchanged, they just gain a system of record with property context attached.

Phase B (`inbox_reply_exemplars`, W32 drafting agent, Gmail send with `communications` mirroring) gets its own plan, written against the same spec.

