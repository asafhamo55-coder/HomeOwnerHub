# Properties Phase 1A — Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the properties page a single indexed, board-gated database view that answers "which properties need attention" in one query at 5,000+ rows.

**Architecture:** One Postgres view, `hoa_property_list_v`, computes all four attention signals with lateral aggregates and precomputes a `severity_rank` so ordering is a plain column sort. It carries `security_invoker = on` *and* an `auth_is_board_or_admin` predicate, because the base-table RLS is org-scoped with no role gate. A thin TypeScript module wraps it; everything in that module that can be pure — search sanitizing, filter/sort/page parsing — is pure and unit-tested, because this repo's vitest harness cannot touch Postgres.

**Tech Stack:** PostgreSQL 15+ (Supabase), `pg_trgm`, PostgREST via `@supabase/supabase-js`, TypeScript, vitest for pure logic, `tsx` scripts for real-Postgres E2E.

**Source spec:** `docs/superpowers/specs/2026-08-02-properties-page-uplift-design.md` (§6, §10).
**Out of scope:** all UI. Routing, the list pane, and the panel tabs are Phase 1B. Phase 2 (inline actions, bulk actions, photos) is out of scope entirely.

## Global Constraints

- **Prefix every shell command with `rtk`**, including inside `&&` chains — per `CLAUDE.md`.
- **`rtk pnpm typecheck` is broken in this environment** (emits garbled `tsc --help`). Use `rtk proxy pnpm typecheck`.
- **`pnpm lint` fails repo-wide** — ESLint was never configured, `next lint` drops into an interactive prompt and exits 1. Do not run it and do not try to fix it; that is unrelated scope.
- **vitest is node-only and pure-modules-only** (`vitest.config.ts` — "PURE modules only — no Supabase, no Next server components, no network"). Anything needing real Postgres goes in `scripts/test-*.ts` following the `scripts/test-comms.ts` pattern.
- **No new dependencies.**
- **Migrations are idempotent and safe to re-run** — every existing migration uses `IF NOT EXISTS` / `OR REPLACE` / `DROP POLICY IF EXISTS`. Match that.
- **Take the next free migration number at implementation time.** `0038_dashboard_daily_snapshots.sql` is the highest as of 2026-08-03, so this plan says **0039** — but other work lands migrations concurrently and this spec has already been renumbered once. Check `ls migrations` first.
- **No PII in test output or script logs** — ids and counts only, never addresses, owner names, emails, or subjects.
- Money is `numeric(14,2)` throughout. Never introduce a `_cents` integer.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `migrations/0039_property_list_view.sql` | The view, the trgm extension, the search and lookup indexes, the grant |
| `scripts/test-property-list.ts` | Real-Postgres E2E: RLS (cross-org **and** same-org role), signal correctness, severity ordering |
| `apps/hoa/src/lib/properties/list-params.ts` | Pure: parse and sanitize search / filter / sort / page from URL params |
| `apps/hoa/src/lib/properties/list-params.test.ts` | vitest for the above |
| `apps/hoa/src/lib/properties/list.ts` | Server query against the view — consumes parsed params, returns rows + total |

---

### Task 1: The view migration

**Files:**
- Create: `migrations/0039_property_list_view.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: view `public.hoa_property_list_v` with columns
  `id, org_id, address, unit_number, owner_name, owner_email, owner_phone, tenure, notes, created_at, updated_at, unit_id, balance, oldest_due_date, days_overdue, open_violations, violations_past_cure, threads_needing_reply, has_owner, has_tenure, has_unit_link, severity_rank`.

- [ ] **Step 1: Confirm the next free migration number**

Run: `rtk ls migrations | grep -E "^0[0-9]{3}" | sort | tail -3`
If `0039` is taken, use the next free number and rename consistently throughout this task.

- [ ] **Step 2: Write the migration**

Create `migrations/0039_property_list_view.sql`:

```sql
-- 0039_property_list_view.sql
-- One row per hoa_property carrying the four attention signals the
-- properties list needs, so the page answers "what needs me today" in a
-- single indexed query instead of N+1 per row at 5,000+ properties.
--
-- SECURITY — read this before changing anything below.
--
-- Two gates, both required:
--
--   1. security_invoker = on. Without it the view runs with its owner's
--      rights and ignores RLS on every base table — cross-org leakage.
--
--   2. auth_is_board_or_admin(org_id) in the WHERE clause. security_invoker
--      alone is NOT sufficient here: org_access on hoa_properties and
--      hoa_violations (0000_schema.sql:398-399) is bare
--      org_id = ANY (auth_org_ids()) with no role gate, so every resident
--      of an association can already read those rows. A view that joins
--      balance, open violations, and unread mail per property would hand a
--      resident their neighbours' financial and enforcement history in one
--      query — strictly worse than the raw tables, because it does the
--      correlation for them. Same hazard 0036_ai_runs_board_only.sql closed
--      on ai_runs and 0038_dashboard_daily_snapshots.sql designs against.
--
-- This is the first SQL view in this repository — there is no house style
-- to copy, so the reasoning is spelled out rather than assumed.
--
-- Idempotent. Safe to re-run.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Search is four ILIKE '%term%' predicates OR'd together, which no btree
-- index can serve. Per-column trgm GIN indexes do serve them.
CREATE INDEX IF NOT EXISTS hoa_properties_address_trgm_idx
  ON public.hoa_properties USING gin (address gin_trgm_ops);
CREATE INDEX IF NOT EXISTS hoa_properties_unit_number_trgm_idx
  ON public.hoa_properties USING gin (unit_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS hoa_properties_owner_name_trgm_idx
  ON public.hoa_properties USING gin (owner_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS hoa_properties_owner_email_trgm_idx
  ON public.hoa_properties USING gin (owner_email gin_trgm_ops);

-- Lateral aggregate lookup keys. assessments already has a better partial
-- index for our filter — assessments_unit_open_idx on (unit_id, due_date)
-- WHERE status IN ('open','partial'), from 0006_accounting.sql — so it is
-- deliberately NOT duplicated here.
CREATE INDEX IF NOT EXISTS hoa_violations_property_id_idx
  ON public.hoa_violations(property_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS payments_assessment_id_idx
  ON public.payments(assessment_id);
CREATE INDEX IF NOT EXISTS inbox_threads_unit_id_idx
  ON public.inbox_threads(unit_id);
CREATE INDEX IF NOT EXISTS units_legacy_hoa_property_id_idx
  ON public.units(legacy_hoa_property_id);

CREATE OR REPLACE VIEW public.hoa_property_list_v
WITH (security_invoker = on) AS
SELECT
  p.id,
  p.org_id,
  p.address,
  p.unit_number,
  p.owner_name,
  p.owner_email,
  p.owner_phone,
  p.tenure,
  p.notes,
  p.created_at,
  p.updated_at,

  u.id AS unit_id,

  -- Money is numeric(14,2) everywhere in this schema. Not cents.
  COALESCE(dues.balance, 0)::numeric(14,2)        AS balance,
  dues.oldest_due_date,
  CASE
    WHEN dues.oldest_due_date IS NOT NULL AND dues.oldest_due_date < CURRENT_DATE
      THEN (CURRENT_DATE - dues.oldest_due_date)
    ELSE 0
  END                                             AS days_overdue,

  COALESCE(viol.open_violations, 0)               AS open_violations,
  COALESCE(viol.violations_past_cure, 0)          AS violations_past_cure,
  COALESCE(mail.threads_needing_reply, 0)         AS threads_needing_reply,

  (p.owner_name IS NOT NULL AND btrim(p.owner_name) <> '')   AS has_owner,
  (p.tenure IS NOT NULL AND p.tenure <> 'unknown')           AS has_tenure,
  (u.id IS NOT NULL)                                         AS has_unit_link,

  -- Lowest rank sorts first. A property matching several conditions takes
  -- its lowest. Past-cure outranks money: a lapsed cure deadline has legal
  -- consequences and cannot be recovered by acting sooner, whereas a
  -- balance keeps accruing predictably.
  CASE
    WHEN COALESCE(viol.violations_past_cure, 0) > 0 THEN 1
    WHEN COALESCE(dues.balance, 0) > 0
         AND dues.oldest_due_date IS NOT NULL
         AND dues.oldest_due_date < CURRENT_DATE   THEN 2
    WHEN COALESCE(viol.open_violations, 0) > 0     THEN 3
    WHEN COALESCE(mail.threads_needing_reply, 0) > 0 THEN 4
    WHEN p.owner_name IS NULL
         OR btrim(p.owner_name) = ''
         OR p.tenure IS NULL
         OR p.tenure = 'unknown'
         OR u.id IS NULL                           THEN 5
    ELSE 6
  END                                             AS severity_rank

FROM public.hoa_properties p

-- The bridge from 0005_units_backfill.sql. A NULL here IS the "no unit
-- link" data gap: assessments and inbox_threads key on units, not on
-- hoa_properties, so an unbridged property silently shows no dues and no
-- mail today with no visible symptom.
LEFT JOIN public.units u
  ON u.legacy_hoa_property_id = p.id

-- Outstanding dues. Only 'open' and 'partial' count — 'paid', 'waived' and
-- 'written_off' are settled and would inflate the balance. payments.amount
-- may be negative (refunds, per the CHECK amount <> 0), so this subtracts
-- signed sums rather than assuming positives. payments has no deleted_at.
LEFT JOIN LATERAL (
  SELECT
    SUM(a.amount - COALESCE(pay.paid, 0))                                  AS balance,
    MIN(a.due_date) FILTER (WHERE a.amount - COALESCE(pay.paid, 0) > 0)    AS oldest_due_date
  FROM public.assessments a
  LEFT JOIN LATERAL (
    SELECT SUM(pm.amount) AS paid
    FROM public.payments pm
    WHERE pm.assessment_id = a.id
  ) pay ON TRUE
  WHERE a.unit_id = u.id
    AND a.deleted_at IS NULL
    AND a.status IN ('open', 'partial')
) dues ON TRUE

-- Open violations. Five statuses exist (0000_schema.sql:212); open means
-- not yet settled. The cure clock starts when the notice went out — a NULL
-- notice_sent_at means no clock is running, so it is not past cure.
LEFT JOIN LATERAL (
  SELECT
    COUNT(*)                                        AS open_violations,
    COUNT(*) FILTER (
      WHERE v.notice_sent_at IS NOT NULL
        AND v.notice_sent_at
            + make_interval(days => COALESCE(v.cure_period_days, 0)) < now()
    )                                               AS violations_past_cure
  FROM public.hoa_violations v
  WHERE v.property_id = p.id
    AND v.deleted_at IS NULL
    AND v.status NOT IN ('resolved', 'waived')
) viol ON TRUE

-- Mail awaiting US. 'waiting' means the ball is in the resident's court and
-- must not read as work owed by the association; 'closed' is done.
-- inbox_threads has no deleted_at.
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS threads_needing_reply
  FROM public.inbox_threads it
  WHERE it.unit_id = u.id
    AND it.organization_id = p.org_id
    AND it.status IN ('needs_review', 'open')
) mail ON TRUE

WHERE p.deleted_at IS NULL
  AND public.auth_is_board_or_admin(p.org_id);

COMMENT ON VIEW public.hoa_property_list_v IS
  'Attention signals per HOA property. Board/admin only — see the security note in 0039_property_list_view.sql before relaxing any predicate.';

GRANT SELECT ON public.hoa_property_list_v TO authenticated;
```

- [ ] **Step 3: Apply the migration**

Apply via the Supabase SQL editor for project `xwdjsxfskvreguyvryhc` (the path every other migration in this repo uses — see `docs/DEPLOY.md` §1). Paste the file contents and run.

Expected: `CREATE EXTENSION`, four `CREATE INDEX`, four more `CREATE INDEX`, `CREATE VIEW`, `COMMENT`, `GRANT` — no errors.

- [ ] **Step 4: Verify the view exists and is invoker-rights**

Run in the SQL editor:

```sql
SELECT c.relname, c.reloptions
FROM pg_class c
WHERE c.relname = 'hoa_property_list_v';
```

Expected: one row, `reloptions` containing `security_invoker=on`. If `reloptions` is NULL the view was created without the option and **must** be fixed before proceeding — every downstream guarantee rests on it.

- [ ] **Step 5: Verify it returns sane shape**

```sql
SELECT count(*) AS rows,
       count(*) FILTER (WHERE severity_rank = 6) AS clear,
       count(*) FILTER (WHERE severity_rank < 6) AS needs_attention
FROM public.hoa_property_list_v;
```

Expected: runs without error. Counts may be zero if the SQL-editor session has no board membership — that is the role gate working, not a failure.

- [ ] **Step 6: Commit**

```bash
rtk git add migrations/0039_property_list_view.sql
rtk git commit -m "feat(db): property list view with attention signals

One row per property carrying balance, open violations, mail awaiting
reply, and data gaps, plus a precomputed severity_rank so ordering is a
plain column sort at 5,000+ rows.

Two security gates, both required: security_invoker = on, and an
auth_is_board_or_admin predicate. The second is not optional — org_access
on hoa_properties and hoa_violations is bare org_id = ANY(auth_org_ids())
with no role gate, so without it any resident could read every
neighbour's balance and violation history in one query."
```

---

### Task 2: Real-Postgres verification script

vitest cannot reach Postgres in this repo, so the guarantees that matter most — the two RLS gates and the signal arithmetic — are verified by a `tsx` script, following the established `scripts/test-*.ts` pattern.

**Files:**
- Create: `scripts/test-property-list.ts`

**Interfaces:**
- Consumes: the view from Task 1.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Read the existing pattern**

Read `scripts/test-comms.ts` — specifically its `import './_load-env'` header, its `createClient` setup, its `check(name, ok, detail?)` helper, and how it reports pass/fail and exits non-zero. Follow that structure exactly; do not invent a new harness.

- [ ] **Step 2: Write the script**

Create `scripts/test-property-list.ts`. Harness shape, with case A written out
in full — follow this structure for every remaining case:

```ts
/**
 * scripts/test-property-list.ts
 *
 * E2E for hoa_property_list_v. Hits real Postgres. Seeds two orgs, a board
 * member and a resident, then asserts both RLS gates and the signal
 * arithmetic. Logs ids and counts only — never addresses, owner names,
 * emails, or subjects.
 */
import './_load-env'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let failures = 0
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    console.log(`  PASS  ${name}`)
  } else {
    failures++
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const admin: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

async function caseA(): Promise<void> {
  const { data, error } = await admin.rpc('exec_sql' as never, {
    // If no exec_sql helper exists in this project, read reloptions with a
    // direct query from a psql session instead and assert by hand — do NOT
    // skip this check, it is the guard everything else rests on.
    q: `SELECT reloptions FROM pg_class WHERE relname = 'hoa_property_list_v'`,
  } as never)
  check(
    'A. view exists with security_invoker=on',
    !error && JSON.stringify(data ?? '').includes('security_invoker=on'),
    error?.message,
  )
}

async function main(): Promise<void> {
  try {
    await caseA()
    // ...remaining cases B–L
  } finally {
    // Delete every seeded row here so the script is re-runnable.
  }
  console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
```

Cases to cover, using the service-role client to seed and per-user clients
to assert RLS:

```
A. View exists and reports security_invoker=on
   Query pg_class.reloptions; fail loudly if the option is absent.

B. Cross-org isolation
   Seed org A and org B, each with one property. As a BOARD member of
   org A, select from the view. Assert: org A's property id present,
   org B's absent.

C. Same-org role gate  <-- the one most likely to be missed
   As a RESIDENT member of org A (org_members.role = 'resident'),
   select from the view. Assert: ZERO rows. The properties page is
   already board-gated at the route level, so omitting this predicate is
   invisible through the UI — the exposure is via PostgREST.

D. Balance excludes settled assessments
   Seed one unit with: 100.00 'open', 50.00 'partial' with a 20.00
   payment, 75.00 'paid', 30.00 'waived', 40.00 'written_off'.
   Assert balance = 130.00 (100 + (50-20)), not 295.00.

E. Balance tolerates a refund
   Add a -10.00 payment against the 'open' assessment.
   Assert balance = 140.00 — signed arithmetic, not abs().

F. Soft-deleted assessments are excluded
   Set deleted_at on the 100.00 'open' row; assert balance drops by 100.00.

G. Past-cure boundary
   Three violations on one property, all status 'notice_sent':
     - notice_sent_at NULL, cure_period_days 14      -> not past cure
     - notice_sent_at now()-13 days, cure 14          -> not past cure
     - notice_sent_at now()-15 days, cure 14          -> past cure
   Assert open_violations = 3, violations_past_cure = 1.

H. Resolved and waived violations do not count as open
   Add one 'resolved' and one 'waived'; assert open_violations unchanged.

I. threads_needing_reply counts only needs_review and open
   Seed four threads on the unit, one per status.
   Assert threads_needing_reply = 2.

J. Data-gap flags and rank 5
   A property with owner_name NULL and no units bridge row:
   assert has_owner = false, has_unit_link = false, severity_rank = 5.

K. severity_rank precedence
   A property with BOTH a past-cure violation and a past-due balance
   ranks 1, not 2 — past-cure outranks money.

L. A clean property ranks 6
   No dues, no violations, no mail, owner and tenure set, unit bridged.
```

Every assertion must print only ids and counts. No addresses, owner names, emails, or subjects — seeded fixtures included.

Clean up seeded rows in a `finally` block so the script is re-runnable.

- [ ] **Step 3: Run it**

Run: `rtk proxy pnpm tsx scripts/test-property-list.ts`
Expected: every case passes; the script exits 0.

- [ ] **Step 4: Prove case C actually catches the bug it is written for**

Temporarily edit the view in the SQL editor, dropping the
`AND public.auth_is_board_or_admin(p.org_id)` predicate, then re-run the
script.

Expected: **case C fails.** If it still passes, the test is not testing
anything and must be fixed before proceeding.

Then re-apply the migration to restore the predicate and re-run — all
cases pass again. Record both outcomes in your report.

- [ ] **Step 5: Commit**

```bash
rtk git add scripts/test-property-list.ts
rtk git commit -m "test(db): verify property list view RLS and signal arithmetic

Covers both security gates, including the same-org resident case that the
route-level board gate would otherwise hide. Case C was confirmed to fail
when the auth_is_board_or_admin predicate is removed."
```

---

### Task 3: Pure list-parameter handling

Everything about interpreting the URL that does not need a database goes here, so it can be unit-tested under vitest's node-only harness.

**Files:**
- Create: `apps/hoa/src/lib/properties/list-params.ts`
- Create: `apps/hoa/src/lib/properties/list-params.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type PropertyFilter = 'attention' | 'all' | 'owner_occupied' | 'leased' | 'unknown'`
  - `type PropertySort = 'severity' | 'address' | 'balance'`
  - `interface PropertyListParams { filter: PropertyFilter; sort: PropertySort; search: string; page: number; offset: number; limit: number }`
  - `const PROPERTY_PAGE_SIZE = 50`
  - `function parsePropertyListParams(raw: { filter?: string; sort?: string; q?: string; page?: string }): PropertyListParams`
  - `function sanitizeSearch(term: string): string`

- [ ] **Step 1: Write the failing test**

Create `apps/hoa/src/lib/properties/list-params.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  PROPERTY_PAGE_SIZE,
  parsePropertyListParams,
  sanitizeSearch,
} from './list-params'

describe('parsePropertyListParams', () => {
  it('defaults to the attention queue sorted by severity, page 1', () => {
    expect(parsePropertyListParams({})).toEqual({
      filter: 'attention',
      sort: 'severity',
      search: '',
      page: 1,
      offset: 0,
      limit: PROPERTY_PAGE_SIZE,
    })
  })

  it('accepts every valid filter', () => {
    for (const f of ['attention', 'all', 'owner_occupied', 'leased', 'unknown'] as const) {
      expect(parsePropertyListParams({ filter: f }).filter).toBe(f)
    }
  })

  it('falls back to attention on an unknown filter', () => {
    expect(parsePropertyListParams({ filter: 'nonsense' }).filter).toBe('attention')
  })

  it('falls back to severity on an unknown sort', () => {
    expect(parsePropertyListParams({ sort: 'drop table' }).sort).toBe('severity')
  })

  it('computes offset from page', () => {
    const p = parsePropertyListParams({ page: '3' })
    expect(p.page).toBe(3)
    expect(p.offset).toBe(2 * PROPERTY_PAGE_SIZE)
  })

  it('clamps a zero, negative, or garbage page to 1', () => {
    for (const page of ['0', '-4', 'abc', '']) {
      expect(parsePropertyListParams({ page }).page).toBe(1)
      expect(parsePropertyListParams({ page }).offset).toBe(0)
    }
  })

  it('trims the search term', () => {
    expect(parsePropertyListParams({ q: '  14 Alder  ' }).search).toBe('14 Alder')
  })
})

describe('sanitizeSearch', () => {
  it('passes an ordinary term through unchanged', () => {
    expect(sanitizeSearch('Alder')).toBe('Alder')
  })

  it('escapes LIKE wildcards so a stray % cannot match everything', () => {
    expect(sanitizeSearch('100%')).toBe('100\\%')
    expect(sanitizeSearch('a_b')).toBe('a\\_b')
    expect(sanitizeSearch('a\\b')).toBe('a\\\\b')
  })

  it('strips PostgREST or() separators that would break the filter', () => {
    expect(sanitizeSearch('a,b')).toBe('a b')
    expect(sanitizeSearch('a(b)c')).toBe('a b c')
  })

  it('caps length to prevent pathological input', () => {
    expect(sanitizeSearch('x'.repeat(500))).toHaveLength(100)
  })

  it('handles an empty term', () => {
    expect(sanitizeSearch('')).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk pnpm vitest run apps/hoa/src/lib/properties/list-params.test.ts`
Expected: FAIL — `Failed to resolve import "./list-params"`.

- [ ] **Step 3: Write the implementation**

Create `apps/hoa/src/lib/properties/list-params.ts`:

```ts
// Pure URL-parameter handling for the properties list. Deliberately free of
// Supabase and Next imports so it runs under vitest's node-only harness
// (vitest.config.ts is scoped to pure modules).

export type PropertyFilter =
  | 'attention'
  | 'all'
  | 'owner_occupied'
  | 'leased'
  | 'unknown'

export type PropertySort = 'severity' | 'address' | 'balance'

export interface PropertyListParams {
  filter: PropertyFilter
  sort: PropertySort
  search: string
  page: number
  offset: number
  limit: number
}

/** Matches the inbox's page size so the two lists paginate identically. */
export const PROPERTY_PAGE_SIZE = 50

const FILTERS: readonly PropertyFilter[] = [
  'attention',
  'all',
  'owner_occupied',
  'leased',
  'unknown',
]

const SORTS: readonly PropertySort[] = ['severity', 'address', 'balance']

/**
 * The page opens on the work queue, not on an alphabetical inventory —
 * hence 'attention' and 'severity' as the defaults rather than 'all'.
 */
export function parsePropertyListParams(raw: {
  filter?: string
  sort?: string
  q?: string
  page?: string
}): PropertyListParams {
  const filter = FILTERS.includes(raw.filter as PropertyFilter)
    ? (raw.filter as PropertyFilter)
    : 'attention'

  const sort = SORTS.includes(raw.sort as PropertySort)
    ? (raw.sort as PropertySort)
    : 'severity'

  const parsedPage = Number.parseInt(raw.page ?? '', 10)
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1

  return {
    filter,
    sort,
    search: (raw.q ?? '').trim(),
    page,
    offset: (page - 1) * PROPERTY_PAGE_SIZE,
    limit: PROPERTY_PAGE_SIZE,
  }
}

/**
 * Carried forward from the existing list page. Caps length against
 * pathological input, escapes LIKE wildcards so a stray `%` doesn't match
 * every property, and strips the `,` `(` `)` characters PostgREST uses as
 * `.or()` separators — inside an or() filter those would otherwise change
 * the shape of the query rather than the value being matched.
 */
export function sanitizeSearch(term: string): string {
  return term
    .slice(0, 100)
    .replace(/[%_\\]/g, '\\$&')
    .replace(/[,()]/g, ' ')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk pnpm vitest run apps/hoa/src/lib/properties/list-params.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Typecheck and run the full suite**

Run: `rtk proxy pnpm typecheck && rtk pnpm test:unit`
Expected: typecheck clean; suite green with 12 more tests than before.

- [ ] **Step 6: Commit**

```bash
rtk git add apps/hoa/src/lib/properties/list-params.ts apps/hoa/src/lib/properties/list-params.test.ts
rtk git commit -m "feat(hoa): pure parameter handling for the properties list

Defaults to the attention queue sorted by severity — the page should open
on the work queue, not an alphabetical inventory. Search sanitizing is
carried forward from the existing list page and now has tests."
```

---

### Task 4: The server query module

**Files:**
- Create: `apps/hoa/src/lib/properties/list.ts`

**Interfaces:**
- Consumes: `PropertyListParams`, `sanitizeSearch` (Task 3); the view (Task 1).
- Produces:
  - `interface PropertyListRow` — one per view column, camelCased
  - `interface PropertyListResult { rows: PropertyListRow[]; total: number }`
  - `async function listProperties(supabase: SupabaseClient, orgId: string, params: PropertyListParams): Promise<PropertyListResult>`

- [ ] **Step 1: Write the module**

Create `apps/hoa/src/lib/properties/list.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { sanitizeSearch, type PropertyListParams } from './list-params'

export interface PropertyListRow {
  id: string
  address: string
  unitNumber: string | null
  ownerName: string | null
  ownerEmail: string | null
  ownerPhone: string | null
  tenure: 'owner_occupied' | 'leased' | 'unknown' | null
  unitId: string | null
  balance: number
  oldestDueDate: string | null
  daysOverdue: number
  openViolations: number
  violationsPastCure: number
  threadsNeedingReply: number
  hasOwner: boolean
  hasTenure: boolean
  hasUnitLink: boolean
  severityRank: number
}

export interface PropertyListResult {
  rows: PropertyListRow[]
  total: number
}

// The view is new in 0039 and is not in the generated Database types until
// the next `supabase gen types` pass, so the table name and column
// references are cast. Drop the casts once types are regenerated —
// aa78fc1 did exactly that for 0037's tables.
const VIEW = 'hoa_property_list_v'

export async function listProperties(
  supabase: SupabaseClient,
  orgId: string,
  params: PropertyListParams,
): Promise<PropertyListResult> {
  let query = supabase
    .from(VIEW as never)
    .select(
      'id, address, unit_number, owner_name, owner_email, owner_phone, tenure, unit_id, balance, oldest_due_date, days_overdue, open_violations, violations_past_cure, threads_needing_reply, has_owner, has_tenure, has_unit_link, severity_rank',
      { count: 'exact' },
    )
    .eq('org_id' as never, orgId)

  // 'attention' is severity_rank < 6 — anything the board owes work on.
  // The tenure filters are plain equality; 'all' adds no predicate.
  if (params.filter === 'attention') {
    query = query.lt('severity_rank' as never, 6)
  } else if (params.filter === 'unknown') {
    // `tenure` is nullable — a property whose tenure was never recorded has
    // NULL, not the string 'unknown'. `.eq('tenure','unknown')` would
    // silently hide exactly the properties this filter exists to surface,
    // which is also how `has_tenure` is defined in the view.
    query = query.or('tenure.is.null,tenure.eq.unknown')
  } else if (params.filter !== 'all') {
    query = query.eq('tenure' as never, params.filter)
  }

  if (params.search.length > 0) {
    const safe = sanitizeSearch(params.search)
    query = query.or(
      `address.ilike.%${safe}%,unit_number.ilike.%${safe}%,owner_name.ilike.%${safe}%,owner_email.ilike.%${safe}%`,
    )
  }

  // severity_rank ascending puts the worst first; address is the tiebreak
  // in every mode so ordering is stable across pages.
  if (params.sort === 'severity') {
    query = query
      .order('severity_rank' as never, { ascending: true })
      .order('address' as never, { ascending: true })
  } else if (params.sort === 'balance') {
    query = query
      .order('balance' as never, { ascending: false })
      .order('address' as never, { ascending: true })
  } else {
    query = query.order('address' as never, { ascending: true })
  }

  const { data, error, count } = await query.range(
    params.offset,
    params.offset + params.limit - 1,
  )

  if (error) throw new Error(error.message)

  const raw = (data ?? []) as unknown as Array<Record<string, unknown>>

  return {
    rows: raw.map((r) => ({
      id: String(r.id),
      address: String(r.address ?? ''),
      unitNumber: (r.unit_number as string | null) ?? null,
      ownerName: (r.owner_name as string | null) ?? null,
      ownerEmail: (r.owner_email as string | null) ?? null,
      ownerPhone: (r.owner_phone as string | null) ?? null,
      tenure: (r.tenure as PropertyListRow['tenure']) ?? null,
      unitId: (r.unit_id as string | null) ?? null,
      balance: Number(r.balance ?? 0),
      oldestDueDate: (r.oldest_due_date as string | null) ?? null,
      daysOverdue: Number(r.days_overdue ?? 0),
      openViolations: Number(r.open_violations ?? 0),
      violationsPastCure: Number(r.violations_past_cure ?? 0),
      threadsNeedingReply: Number(r.threads_needing_reply ?? 0),
      hasOwner: Boolean(r.has_owner),
      hasTenure: Boolean(r.has_tenure),
      hasUnitLink: Boolean(r.has_unit_link),
      severityRank: Number(r.severity_rank ?? 6),
    })),
    total: count ?? 0,
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `rtk proxy pnpm typecheck`
Expected: clean across all packages.

- [ ] **Step 3: Exercise it against real Postgres**

Append a case `M` to `scripts/test-property-list.ts` that calls
`listProperties` with a board-member client and
`{ filter: 'attention', sort: 'severity', search: '', page: 1, offset: 0, limit: 50 }`,
asserting: `total` is a number, `rows.length <= 50`, `rows` are ordered by
non-decreasing `severityRank`, and every row's `severityRank` is `< 6`.

Add a case `N` calling it with `{ filter: 'all', sort: 'address', search: '<a seeded address fragment>', page: 1, offset: 0, limit: 50 }`
asserting the seeded property is returned and a non-matching one is not.

Run: `rtk proxy pnpm tsx scripts/test-property-list.ts`
Expected: all cases pass, exit 0.

- [ ] **Step 4: Measure it**

In the SQL editor, run:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM public.hoa_property_list_v
ORDER BY severity_rank, address
LIMIT 50;
```

Record total execution time in your report. The spec's §6 decision — a
plain view rather than a materialized view or trigger-maintained counters —
rests on this number. If it exceeds ~200 ms on the current dataset, say so
explicitly and stop rather than escalating on your own: the escalation path
is the spec author's call.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/hoa/src/lib/properties/list.ts scripts/test-property-list.ts
rtk git commit -m "feat(hoa): server query for the properties list view

Filter, search, sort and offset-paginate against hoa_property_list_v,
matching the inbox's pagination shape. Column references are cast until
the generated Database types catch up with 0039."
```

---

## Verification

```bash
rtk proxy pnpm typecheck && rtk pnpm test:unit && rtk proxy pnpm tsx scripts/test-property-list.ts
```

The single most important result in this plan is case **C** — a resident of
the same org sees zero rows — together with the Task 2 Step 4 proof that it
fails when the predicate is removed. Everything else is recoverable; that one
is a silent data leak.

## What this plan does not do

- No UI. Routing, the list pane, the panel and its six tabs are Phase 1B,
  written once this lands so it can cite these modules' real signatures.
- No regeneration of `packages/db/src/database.types.ts`. The `as never`
  casts come out in a later pass, following the precedent in `aa78fc1`.
- No change to the existing `/properties` page, which keeps working
  untouched until 1B replaces it.
