# Dashboard Triage Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the HOA dashboard answer "what needs me today?" by surfacing the shared inbox as a first-class triage queue and rebuilding the digest on deterministic facts.

**Architecture:** A new `lib/dashboard/triage.ts` reads the inbox queue, with its date arithmetic split into a pure `triage-compute.ts` so it is testable without a database. A new `dashboard_daily_snapshots` table records one row per org per day for point-in-time comparison. The digest becomes SQL-computed facts with a single AI suggestion line on top, so an AI outage stops being an error state.

**Tech Stack:** Next.js 15 App Router (server components), Supabase/PostgREST, TypeScript, Vitest, Tailwind via `@homeowner-portal/ui`.

**Spec:** `docs/superpowers/specs/2026-08-02-dashboard-triage-redesign-design.md`

## Global Constraints

- **Never log PII.** No email address, subject, or message body reaches a log — in application code or scripts. `PostgrestError.message`/`.code` only, never `.details`.
- **Never return a fabricated zero.** A failed count renders as "couldn't load", never `0`. A false zero reads as "nothing to do".
- **Every by-id and by-org query carries an explicit `.eq('organization_id', orgId)`.** RLS via `auth_org_ids()` returns every org a user belongs to, so it is not a substitute.
- **Active statuses are `('needs_review','open')`** everywhere in this plan. `'waiting'` and `'closed'` are excluded from every count.
- **Root vitest harness is pure-modules-only** (`vitest.config.ts`): no real Supabase, no network, no DOM. Tests use hand-rolled fakes or `vi.mock`.
- **Run tests with** `pnpm exec vitest run <path>` from the repo root.
- **Migrations are idempotent** (`IF NOT EXISTS` / `DROP POLICY IF EXISTS`) and safe to re-run.

## Deviation from the spec (accepted)

The spec's `TriageThread` includes `fromName`. `inbox_threads` has no such column — the inbox list derives it from a separate batched `inbox_messages` lookup. Adding it here would mean a second query plus a partial-failure path for a display nicety, so `TriageThread` ships as `{ id, subject, lastMessageAt, waitingDays }`. Sender name can be added later if the card reads poorly without it.

## File Structure

| File | Responsibility |
| --- | --- |
| `migrations/0037_dashboard_daily_snapshots.sql` | Snapshot table + RLS policy |
| `apps/hoa/src/lib/dashboard/triage-compute.ts` | Pure date/bucket arithmetic. No IO. |
| `apps/hoa/src/lib/dashboard/triage-compute.test.ts` | Tests for the above |
| `apps/hoa/src/lib/dashboard/triage.ts` | Supabase reads → `TriageSnapshot`, failure posture |
| `apps/hoa/src/lib/dashboard/triage.test.ts` | Tests via a recording fake client |
| `apps/hoa/src/lib/dashboard/digest-facts.ts` | Deterministic digest bullets + snapshot read/write |
| `apps/hoa/src/lib/dashboard/digest-facts.test.ts` | Tests for the above |
| `apps/hoa/src/components/dashboard/MailTriageCard.tsx` | The loud/quiet queue card |
| `apps/hoa/src/components/dashboard/DailyDigestCard.tsx` | Rewritten: facts + optional AI line |
| `packages/ai/src/tasks/daily-digest.ts` | Reshaped: one suggestion sentence |
| `apps/hoa/src/app/api/ai/daily-digest/route.ts` | Returns 200 with facts when AI fails |
| `apps/hoa/src/app/(dashboard)/page.tsx` | Recomposed layout |

---

### Task 1: Snapshot table and RLS

**Files:**
- Create: `migrations/0037_dashboard_daily_snapshots.sql`

**Interfaces:**
- Consumes: nothing
- Produces: table `public.dashboard_daily_snapshots(id, organization_id, captured_on, counts, captured_at)` with unique index on `(organization_id, captured_on)`

- [ ] **Step 1: Write the migration**

```sql
-- 0037_dashboard_daily_snapshots.sql
-- One row per org per day recording what the dashboard's headline numbers
-- looked like, so the digest can say "down 4 from yesterday" and the tiles
-- can grow trend arrows later.
--
-- Why a table and not a column on hoa_digests: hoa_digests is PK'd on
-- org_id — one row per org, overwritten on every refresh. The digest card
-- refreshes during the day, so single-row storage would move the delta
-- baseline forward and the delta would read "0 new" for the rest of the day.
--
-- The unique index makes a same-day re-write a no-op (ON CONFLICT DO
-- NOTHING at the call site). The delta baseline is always the most recent
-- row with captured_on < today, so within-day writes never disturb it.
--
-- Idempotent. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.dashboard_daily_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  captured_on     date NOT NULL,
  counts          jsonb NOT NULL,
  captured_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS dashboard_daily_snapshots_org_day_uniq
  ON public.dashboard_daily_snapshots(organization_id, captured_on);

-- Baseline lookup is "most recent row for this org before today".
CREATE INDEX IF NOT EXISTS dashboard_daily_snapshots_org_day_idx
  ON public.dashboard_daily_snapshots(organization_id, captured_on DESC);

ALTER TABLE public.dashboard_daily_snapshots ENABLE ROW LEVEL SECURITY;

-- Board/admin read only. `auth_org_ids()` alone would expose these counts
-- (open violations, dues outstanding) to every resident of the association
-- — the exact role-free gap 0036_ai_runs_board_only.sql was written to
-- close on ai_runs. Writes go through the service role, which bypasses RLS,
-- so no INSERT policy is needed.
DROP POLICY IF EXISTS org_access ON public.dashboard_daily_snapshots;

CREATE POLICY org_access ON public.dashboard_daily_snapshots
  FOR SELECT
  USING (organization_id = ANY (public.auth_org_ids())
         AND public.auth_is_board_or_admin(organization_id));
```

- [ ] **Step 2: Apply it to the dev database**

Run the SQL against Supabase using whichever path `docs/DEPLOY.md` prescribes for this repo (SQL editor or `psql` with `POSTGRES_URL_NON_POOLING` from `apps/hoa/.env.local`).

Expected: no error. Re-running it a second time must also succeed — that is the idempotency check.

- [ ] **Step 3: Verify the table and policy exist**

```bash
pnpm exec tsx -e "
import './scripts/_load-env'
import { createClient } from '@supabase/supabase-js'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const r = await db.from('dashboard_daily_snapshots').select('id', { count: 'exact', head: true })
console.log('table reachable, error:', r.error?.message ?? 'none', 'count:', r.count)
"
```

Expected: `table reachable, error: none count: 0`

- [ ] **Step 4: Commit**

```bash
git add migrations/0037_dashboard_daily_snapshots.sql
git commit -m "feat(db): daily dashboard snapshots for point-in-time comparison"
```

---

### Task 2: Pure triage arithmetic

**Files:**
- Create: `apps/hoa/src/lib/dashboard/triage-compute.ts`
- Test: `apps/hoa/src/lib/dashboard/triage-compute.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `interface ThreadRow { id: string; subject: string | null; last_message_at: string | null }`
  - `interface TriageThread { id: string; subject: string | null; lastMessageAt: string | null; waitingDays: number }`
  - `function waitingDays(lastMessageAt: string | null, now: Date): number`
  - `function toTriageThreads(rows: ThreadRow[], now: Date): TriageThread[]`
  - `function countWaitingOver(rows: ThreadRow[], now: Date, days: number): number`

- [ ] **Step 1: Write the failing test**

Create `apps/hoa/src/lib/dashboard/triage-compute.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { countWaitingOver, toTriageThreads, waitingDays } from './triage-compute'

const NOW = new Date('2026-08-02T12:00:00Z')

describe('waitingDays', () => {
  it('floors a partial day rather than rounding it up', () => {
    // 6 days and 23 hours is still "6 days waiting" to a human.
    expect(waitingDays('2026-07-26T13:00:00Z', NOW)).toBe(6)
  })

  it('returns 0 for a message that arrived moments ago', () => {
    expect(waitingDays('2026-08-02T11:59:00Z', NOW)).toBe(0)
  })

  it('returns 0 rather than a negative for a clock-skewed future timestamp', () => {
    expect(waitingDays('2026-08-03T12:00:00Z', NOW)).toBe(0)
  })

  it('returns 0 when the thread has no last_message_at', () => {
    expect(waitingDays(null, NOW)).toBe(0)
  })
})

describe('toTriageThreads', () => {
  it('attaches waitingDays to each row and preserves input order', () => {
    const result = toTriageThreads(
      [
        { id: 't1', subject: 'Pond', last_message_at: '2026-07-27T12:00:00Z' },
        { id: 't2', subject: 'Parking', last_message_at: '2026-08-01T12:00:00Z' },
      ],
      NOW,
    )
    expect(result).toEqual([
      { id: 't1', subject: 'Pond', lastMessageAt: '2026-07-27T12:00:00Z', waitingDays: 6 },
      { id: 't2', subject: 'Parking', lastMessageAt: '2026-08-01T12:00:00Z', waitingDays: 1 },
    ])
  })

  it('returns an empty array for no rows', () => {
    expect(toTriageThreads([], NOW)).toEqual([])
  })
})

describe('countWaitingOver', () => {
  it('counts only threads strictly older than the threshold', () => {
    const rows = [
      { id: 'a', subject: null, last_message_at: '2026-07-20T12:00:00Z' }, // 13d
      { id: 'b', subject: null, last_message_at: '2026-07-29T12:00:00Z' }, // 4d
      { id: 'c', subject: null, last_message_at: '2026-07-30T12:00:00Z' }, // 3d — boundary
      { id: 'd', subject: null, last_message_at: '2026-08-02T00:00:00Z' }, // 0d
    ]
    // Exactly 3 days is not "over 3 days".
    expect(countWaitingOver(rows, NOW, 3)).toBe(2)
  })

  it('returns 0 for no rows', () => {
    expect(countWaitingOver([], NOW, 3)).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run apps/hoa/src/lib/dashboard/triage-compute.test.ts`

Expected: FAIL — `Failed to load url ./triage-compute`. The module does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Create `apps/hoa/src/lib/dashboard/triage-compute.ts`:

```ts
/**
 * Pure arithmetic for the dashboard's mail-triage card.
 *
 * Split out from triage.ts deliberately: the root vitest harness is
 * pure-modules-only (see vitest.config.ts), so keeping the date maths free
 * of Supabase is what makes it directly testable — the same reason
 * packages/workflows exports processReplyDrafterResponse separately from
 * its workflow wrapper.
 *
 * `now` is always injected rather than read from the clock inside these
 * functions, so tests pin a fixed instant instead of computing expectations
 * relative to a moving Date.now().
 */

const MS_PER_DAY = 86_400_000

/** The subset of an inbox_threads row this module needs. */
export interface ThreadRow {
  id: string
  subject: string | null
  last_message_at: string | null
}

export interface TriageThread {
  id: string
  subject: string | null
  lastMessageAt: string | null
  waitingDays: number
}

/**
 * Whole days a thread has been waiting, floored.
 *
 * Floored, not rounded: a thread sitting for 6 days 23 hours is "6 days" to
 * a board member, and rounding it to 7 would overstate every figure on the
 * card by up to a day. Clamped at 0 so a clock-skewed future timestamp
 * cannot render as a negative wait.
 */
export function waitingDays(lastMessageAt: string | null, now: Date): number {
  if (lastMessageAt === null) return 0
  const sent = new Date(lastMessageAt).getTime()
  if (Number.isNaN(sent)) return 0
  return Math.max(0, Math.floor((now.getTime() - sent) / MS_PER_DAY))
}

export function toTriageThreads(rows: ThreadRow[], now: Date): TriageThread[] {
  return rows.map((row) => ({
    id: row.id,
    subject: row.subject,
    lastMessageAt: row.last_message_at,
    waitingDays: waitingDays(row.last_message_at, now),
  }))
}

/** Threads waiting STRICTLY longer than `days`. */
export function countWaitingOver(rows: ThreadRow[], now: Date, days: number): number {
  return rows.filter((row) => waitingDays(row.last_message_at, now) > days).length
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run apps/hoa/src/lib/dashboard/triage-compute.test.ts`

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/hoa/src/lib/dashboard/triage-compute.ts apps/hoa/src/lib/dashboard/triage-compute.test.ts
git commit -m "feat(dashboard): pure triage date arithmetic"
```

---

### Task 3: The triage snapshot query

**Files:**
- Create: `apps/hoa/src/lib/dashboard/triage.ts`
- Test: `apps/hoa/src/lib/dashboard/triage.test.ts`

**Interfaces:**
- Consumes: `ThreadRow`, `TriageThread`, `toTriageThreads` from `./triage-compute`
- Produces:
  - `interface TriageSnapshot { needsReply: { count: number; oldestWaitingDays: number | null }; untriaged: { count: number }; threads: TriageThread[]; failed: boolean }`
  - `const ACTIVE_STATUSES: readonly ['needs_review', 'open']`
  - `function getTriageSnapshot(db: Db, orgId: string, now?: Date): Promise<TriageSnapshot>`

- [ ] **Step 1: Write the failing test**

Create `apps/hoa/src/lib/dashboard/triage.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { getTriageSnapshot } from './triage'

const NOW = new Date('2026-08-02T12:00:00Z')

interface Recorded {
  table: string
  filters: string[]
}

/**
 * Minimal chainable stand-in for the PostgREST builder. Records the
 * filters each query applied so the tests can assert the status/direction
 * predicates — those definitions are the load-bearing part of this module,
 * and a silently wrong `status` filter would put parked threads back in
 * front of a board member.
 */
function fakeDb(results: Array<{ data?: unknown; count?: number; error?: { message: string; code: string } | null }>) {
  const recorded: Recorded[] = []
  let call = 0

  function builder(table: string) {
    const filters: string[] = []
    const entry = { table, filters }
    recorded.push(entry)

    const result = results[call] ?? { data: [], count: 0, error: null }
    call += 1

    const chain = {
      select: () => chain,
      eq: (col: string, val: unknown) => { filters.push(`eq:${col}=${String(val)}`); return chain },
      is: (col: string, val: unknown) => { filters.push(`is:${col}=${String(val)}`); return chain },
      not: (col: string, op: string, val: unknown) => { filters.push(`not:${col}.${op}=${String(val)}`); return chain },
      in: (col: string, vals: readonly unknown[]) => { filters.push(`in:${col}=${vals.join(',')}`); return chain },
      order: (col: string, opts?: { ascending?: boolean }) => { filters.push(`order:${col}:${opts?.ascending ? 'asc' : 'desc'}`); return chain },
      limit: (n: number) => { filters.push(`limit:${n}`); return chain },
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: result.data ?? [], count: result.count ?? 0, error: result.error ?? null }).then(resolve),
    }
    return chain
  }

  return {
    db: { from: (table: string) => builder(table) } as never,
    recorded,
  }
}

describe('getTriageSnapshot', () => {
  it('excludes waiting and closed threads from both counts', async () => {
    const { db, recorded } = fakeDb([{ count: 32 }, { count: 365 }, { data: [] }])

    await getTriageSnapshot(db, 'org-1', NOW)

    for (const query of recorded) {
      expect(query.table).toBe('inbox_threads')
      expect(query.filters).toContain('in:status=needs_review,open')
      expect(query.filters).toContain('eq:organization_id=org-1')
    }
  })

  it('counts only property-matched inbound threads as needing a reply', async () => {
    const { db, recorded } = fakeDb([{ count: 32 }, { count: 365 }, { data: [] }])

    const snapshot = await getTriageSnapshot(db, 'org-1', NOW)

    expect(snapshot.needsReply.count).toBe(32)
    expect(recorded[0].filters).toContain('not:unit_id.is=null')
    expect(recorded[0].filters).toContain('eq:last_direction=inbound')
  })

  it('counts only unmatched threads as untriaged', async () => {
    const { db, recorded } = fakeDb([{ count: 32 }, { count: 365 }, { data: [] }])

    const snapshot = await getTriageSnapshot(db, 'org-1', NOW)

    expect(snapshot.untriaged.count).toBe(365)
    expect(recorded[1].filters).toContain('is:unit_id=null')
  })

  it('orders the thread rows oldest-waiting first and caps them at five', async () => {
    const { db, recorded } = fakeDb([{ count: 2 }, { count: 0 }, { data: [] }])

    await getTriageSnapshot(db, 'org-1', NOW)

    expect(recorded[2].filters).toContain('order:last_message_at:asc')
    expect(recorded[2].filters).toContain('limit:5')
  })

  it('derives oldestWaitingDays from the first returned row', async () => {
    const { db } = fakeDb([
      { count: 2 },
      { count: 0 },
      {
        data: [
          { id: 't1', subject: 'Pond', last_message_at: '2026-07-27T12:00:00Z' },
          { id: 't2', subject: 'Parking', last_message_at: '2026-08-01T12:00:00Z' },
        ],
      },
    ])

    const snapshot = await getTriageSnapshot(db, 'org-1', NOW)

    expect(snapshot.needsReply.oldestWaitingDays).toBe(6)
    expect(snapshot.threads).toHaveLength(2)
    expect(snapshot.threads[0].waitingDays).toBe(6)
    expect(snapshot.failed).toBe(false)
  })

  it('reports oldestWaitingDays as null when nothing is waiting', async () => {
    const { db } = fakeDb([{ count: 0 }, { count: 0 }, { data: [] }])

    const snapshot = await getTriageSnapshot(db, 'org-1', NOW)

    expect(snapshot.needsReply.oldestWaitingDays).toBeNull()
  })

  it('reports failed rather than zero when a count query errors', async () => {
    // A zero here would read as "nothing to do" and the queue would be
    // skipped — the failure this whole module is shaped to avoid.
    const { db } = fakeDb([
      { count: 0, error: { message: 'connection reset', code: '08006' } },
      { count: 0 },
      { data: [] },
    ])

    const snapshot = await getTriageSnapshot(db, 'org-1', NOW)

    expect(snapshot.failed).toBe(true)
  })

  it('reports failed when the thread-row query errors', async () => {
    const { db } = fakeDb([
      { count: 32 },
      { count: 365 },
      { data: [], error: { message: 'connection reset', code: '08006' } },
    ])

    const snapshot = await getTriageSnapshot(db, 'org-1', NOW)

    expect(snapshot.failed).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run apps/hoa/src/lib/dashboard/triage.test.ts`

Expected: FAIL — `Failed to load url ./triage`.

- [ ] **Step 3: Write the minimal implementation**

Create `apps/hoa/src/lib/dashboard/triage.ts`:

```ts
/**
 * The dashboard's mail-triage queue.
 *
 * Two-tier by design. The LOUD number is property-matched threads awaiting
 * a reply — the queue a board member can trust. The QUIET number is
 * unmatched threads, reported but not headlined: the unmatched set is
 * dominated by marketing mail, so headlining it trains the reader to
 * ignore the figure. It is still reported, because "unmatched" is not
 * "junk" — a resident who is not yet in the property roster lands there
 * too, and hiding them entirely would lose real mail.
 *
 * Never returns a fabricated zero. `countThreadsByStatus` in
 * lib/inbox/queries.ts throws for the same reason: a count that silently
 * falls back to 0 reads as "nothing to do" and the queue gets skipped.
 * This module cannot throw — it renders inside the dashboard, and a
 * mailbox outage must not take the whole page down — so it reports
 * `failed: true` and the card renders "couldn't load" instead of a number.
 *
 * Never logs a subject or an address; PostgrestError `.message`/`.code`
 * only, never `.details`.
 */

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { toTriageThreads, type ThreadRow, type TriageThread } from './triage-compute'

type Db = SupabaseClient<Database>

/**
 * 'waiting' means a human deliberately parked the thread; counting it as
 * needing attention today would defeat the act of parking it. 'closed' is
 * excluded for the obvious reason.
 */
export const ACTIVE_STATUSES = ['needs_review', 'open'] as const

/** How many thread rows the card lists. */
const THREAD_LIMIT = 5

export interface TriageSnapshot {
  needsReply: { count: number; oldestWaitingDays: number | null }
  untriaged: { count: number }
  threads: TriageThread[]
  /** True when any query failed — counts are UNKNOWN, not zero. */
  failed: boolean
}

function logDbError(context: string, error: PostgrestError): void {
  console.error(`getTriageSnapshot: ${context} failed`, {
    code: error.code,
    message: error.message,
  })
}

export async function getTriageSnapshot(
  db: Db,
  orgId: string,
  now: Date = new Date(),
): Promise<TriageSnapshot> {
  const [needsReplyResult, untriagedResult, rowsResult] = await Promise.all([
    db
      .from('inbox_threads')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .not('unit_id', 'is', null)
      .eq('last_direction', 'inbound')
      .in('status', ACTIVE_STATUSES),

    db
      .from('inbox_threads')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .is('unit_id', null)
      .in('status', ACTIVE_STATUSES),

    db
      .from('inbox_threads')
      .select('id, subject, last_message_at')
      .eq('organization_id', orgId)
      .not('unit_id', 'is', null)
      .eq('last_direction', 'inbound')
      .in('status', ACTIVE_STATUSES)
      // Oldest first: a triage queue that buries the six-day-old thread
      // under this morning's arrivals defeats its own purpose.
      .order('last_message_at', { ascending: true })
      .limit(THREAD_LIMIT),
  ])

  let failed = false
  if (needsReplyResult.error) {
    logDbError('needs-reply count', needsReplyResult.error)
    failed = true
  }
  if (untriagedResult.error) {
    logDbError('untriaged count', untriagedResult.error)
    failed = true
  }
  if (rowsResult.error) {
    logDbError('thread rows', rowsResult.error)
    failed = true
  }

  const threads = toTriageThreads((rowsResult.data ?? []) as ThreadRow[], now)

  return {
    needsReply: {
      count: needsReplyResult.count ?? 0,
      oldestWaitingDays: threads.length > 0 ? threads[0].waitingDays : null,
    },
    untriaged: { count: untriagedResult.count ?? 0 },
    threads,
    failed,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run apps/hoa/src/lib/dashboard/triage.test.ts`

Expected: PASS, 8 tests.

- [ ] **Step 5: Verify against the real database**

```bash
pnpm exec tsx -e "
import './scripts/_load-env'
import { createClient } from '@supabase/supabase-js'
import { getTriageSnapshot } from './apps/hoa/src/lib/dashboard/triage'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const { data } = await db.from('orgs').select('id').limit(1).single()
const snap = await getTriageSnapshot(db as never, data!.id)
// Counts and ids only — never a subject.
console.log({ needsReply: snap.needsReply, untriaged: snap.untriaged, threads: snap.threads.length, failed: snap.failed })
"
```

Expected: `failed: false`, with `needsReply.count` around 32 and `untriaged.count` around 365 on the current Madison Park data.

- [ ] **Step 6: Commit**

```bash
git add apps/hoa/src/lib/dashboard/triage.ts apps/hoa/src/lib/dashboard/triage.test.ts
git commit -m "feat(dashboard): mail triage snapshot that never reports a false zero"
```

---

### Task 4: The mail triage card

**Files:**
- Create: `apps/hoa/src/components/dashboard/MailTriageCard.tsx`

**Interfaces:**
- Consumes: `TriageSnapshot` from `@/lib/dashboard/triage`
- Produces: `function MailTriageCard({ snapshot }: { snapshot: TriageSnapshot }): JSX.Element`

This task has no test — the root vitest harness is pure-modules-only and does not render components. Its logic is confined to formatting already-tested numbers; verification is Step 2's visual check.

- [ ] **Step 1: Write the component**

Create `apps/hoa/src/components/dashboard/MailTriageCard.tsx`:

```tsx
import Link from 'next/link'
import { Mail } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import type { TriageSnapshot } from '@/lib/dashboard/triage'

/**
 * Two-tier by design: the property-matched count is the headline, the
 * unmatched backlog is a quiet footer link. See lib/dashboard/triage.ts
 * for why the quiet number is reported rather than hidden.
 */
export function MailTriageCard({ snapshot }: { snapshot: TriageSnapshot }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-3">
        <Mail className="h-4 w-4 text-muted" />
        <CardTitle className="text-base">Resident mail needing a reply</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {snapshot.failed ? (
          // Never "0" — a false zero reads as "nothing to do".
          <p className="text-sm text-muted">
            Couldn&apos;t load your mail queue.{' '}
            <Link href="/inbox" className="underline">
              Open the inbox
            </Link>
          </p>
        ) : snapshot.needsReply.count === 0 ? (
          <p className="text-sm text-muted">
            Nothing waiting on a reply. Every matched thread has been answered.
          </p>
        ) : (
          <>
            <p className="text-sm text-foreground">
              <span className="text-2xl font-semibold tabular-nums">
                {snapshot.needsReply.count}
              </span>{' '}
              waiting
              {snapshot.needsReply.oldestWaitingDays !== null ? (
                <span className="text-muted">
                  {' '}
                  · oldest {snapshot.needsReply.oldestWaitingDays}d
                </span>
              ) : null}
            </p>

            <ul className="divide-y divide-border border-t border-border">
              {snapshot.threads.map((thread) => (
                <li key={thread.id}>
                  <Link
                    href={`/inbox/${thread.id}`}
                    className="flex items-baseline justify-between gap-3 py-2 text-sm hover:bg-foreground/5"
                  >
                    <span className="truncate text-foreground">
                      {thread.subject ?? '(no subject)'}
                    </span>
                    <span className="shrink-0 tabular-nums text-xs text-muted">
                      {thread.waitingDays}d
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}

        {!snapshot.failed && snapshot.untriaged.count > 0 ? (
          <Link
            href="/inbox?filter=needs_review"
            className="block border-t border-border pt-2 text-xs text-muted underline"
          >
            {snapshot.untriaged.count.toLocaleString()} unmatched, untriaged ›
          </Link>
        ) : null}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Typecheck and view it**

Run: `pnpm typecheck`
Expected: 11/11 tasks successful.

Then run `pnpm --filter hoa dev`, open `/`, and confirm the card renders the counts, that the thread rows link into `/inbox/<id>`, and that the quiet footer links to the filtered inbox.

- [ ] **Step 3: Commit**

```bash
git add apps/hoa/src/components/dashboard/MailTriageCard.tsx
git commit -m "feat(dashboard): mail triage card with loud/quiet two-tier counts"
```

---

### Task 5: Deterministic digest facts and the snapshot write

**Files:**
- Create: `apps/hoa/src/lib/dashboard/digest-facts.ts`
- Test: `apps/hoa/src/lib/dashboard/digest-facts.test.ts`

**Interfaces:**
- Consumes: `ThreadRow`, `countWaitingOver` from `./triage-compute`
- Produces:
  - `interface DigestCounts { needsReply: number; oldestWaitingDays: number | null; untriaged: number; approvalsPending: number; duesOutstandingUsd: number }`
  - `interface DigestFacts { bullets: string[]; counts: DigestCounts }`
  - `function buildBullets(input: { newSinceBaseline: number | null; waitingOverThree: number; nextMeeting: string | null }): string[]`
  - `function isBaselineRow(capturedOn: string, today: string): boolean`
  - `function formatNextMeeting(meeting: { meetingType: string | null; daysUntil: number } | null): string | null`

Note on `getNextMeeting`: it returns `NextMeetingInfo | null` shaped
`{ id, meetingDate, meetingType, daysUntil, status }` — there is **no
`title` field** — and it falls back to the most recent PAST meeting when
none is upcoming, so `daysUntil` can be negative. `formatNextMeeting`
exists to absorb both facts.

Only the pure half is built and tested here. The bullets are strings a human reads, so getting the singular/plural and the omit-when-unknown rules right is the whole job.

- [ ] **Step 1: Write the failing test**

Create `apps/hoa/src/lib/dashboard/digest-facts.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildBullets, formatNextMeeting, isBaselineRow } from './digest-facts'

describe('buildBullets', () => {
  it('omits the "new since yesterday" bullet entirely when there is no baseline', () => {
    // Rendering "0 new since yesterday" on an org's first ever day would
    // be a claim we cannot support — there is nothing to compare against.
    const bullets = buildBullets({ newSinceBaseline: null, waitingOverThree: 2, nextMeeting: null })
    expect(bullets.some((b) => b.includes('since yesterday'))).toBe(false)
  })

  it('omits the "new since yesterday" bullet when the count is zero', () => {
    const bullets = buildBullets({ newSinceBaseline: 0, waitingOverThree: 2, nextMeeting: null })
    expect(bullets.some((b) => b.includes('since yesterday'))).toBe(false)
  })

  it('renders the singular form for exactly one new email', () => {
    const bullets = buildBullets({ newSinceBaseline: 1, waitingOverThree: 0, nextMeeting: null })
    expect(bullets).toContain('1 new resident email since yesterday')
  })

  it('renders the plural form for several new emails', () => {
    const bullets = buildBullets({ newSinceBaseline: 3, waitingOverThree: 0, nextMeeting: null })
    expect(bullets).toContain('3 new resident emails since yesterday')
  })

  it('renders the singular form for one long-waiting thread', () => {
    const bullets = buildBullets({ newSinceBaseline: null, waitingOverThree: 1, nextMeeting: null })
    expect(bullets).toContain('1 has now waited over 3 days')
  })

  it('renders the plural form for several long-waiting threads', () => {
    const bullets = buildBullets({ newSinceBaseline: null, waitingOverThree: 2, nextMeeting: null })
    expect(bullets).toContain('2 have now waited over 3 days')
  })

  it('omits the waiting bullet when nothing has waited that long', () => {
    const bullets = buildBullets({ newSinceBaseline: null, waitingOverThree: 0, nextMeeting: null })
    expect(bullets.some((b) => b.includes('waited over'))).toBe(false)
  })

  it('includes the next meeting when there is one', () => {
    const bullets = buildBullets({ newSinceBaseline: null, waitingOverThree: 0, nextMeeting: 'Thursday' })
    expect(bullets).toContain('Next meeting: Thursday')
  })

  it('returns an empty list when there is genuinely nothing to say', () => {
    expect(buildBullets({ newSinceBaseline: 0, waitingOverThree: 0, nextMeeting: null })).toEqual([])
  })
})

describe('formatNextMeeting', () => {
  it('returns null when there is no meeting', () => {
    expect(formatNextMeeting(null)).toBeNull()
  })

  it('omits a meeting that has already happened', () => {
    // getNextMeeting falls back to the most recent PAST meeting when none
    // is upcoming. "Next meeting: 5 days ago" is nonsense on a today card.
    expect(formatNextMeeting({ meetingType: 'Board', daysUntil: -5 })).toBeNull()
  })

  it('says today for a meeting happening today', () => {
    expect(formatNextMeeting({ meetingType: 'Board', daysUntil: 0 })).toBe('Next meeting: Board today')
  })

  it('says tomorrow for a meeting one day out', () => {
    expect(formatNextMeeting({ meetingType: 'Board', daysUntil: 1 })).toBe('Next meeting: Board tomorrow')
  })

  it('counts days for anything further out', () => {
    expect(formatNextMeeting({ meetingType: 'Annual', daysUntil: 4 })).toBe('Next meeting: Annual in 4 days')
  })

  it('drops the type when the meeting has none', () => {
    expect(formatNextMeeting({ meetingType: null, daysUntil: 4 })).toBe('Next meeting: in 4 days')
  })
})

describe('isBaselineRow', () => {
  it('accepts a snapshot from a previous day', () => {
    expect(isBaselineRow('2026-08-01', '2026-08-02')).toBe(true)
  })

  it('rejects a snapshot captured today, so refreshes cannot move the baseline', () => {
    expect(isBaselineRow('2026-08-02', '2026-08-02')).toBe(false)
  })

  it('works across a month boundary', () => {
    expect(isBaselineRow('2026-07-31', '2026-08-01')).toBe(true)
  })

  it('rejects a future-dated snapshot', () => {
    expect(isBaselineRow('2026-08-03', '2026-08-02')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run apps/hoa/src/lib/dashboard/digest-facts.test.ts`

Expected: FAIL — `Failed to load url ./digest-facts`.

- [ ] **Step 3: Write the minimal implementation**

Create `apps/hoa/src/lib/dashboard/digest-facts.ts`:

```ts
/**
 * The digest's deterministic half.
 *
 * Division of labour with the tiles: the TILES own current numbers, the
 * DIGEST owns what changed and what to do first. Bulleting "32 emails need
 * a reply" directly above a tile reading "Needs a reply 32" is the
 * duplication this redesign exists to remove, so none of these bullets
 * restates a tile.
 *
 * Both change-bullets are computed LIVE rather than by subtracting stored
 * counts. A net subtraction reports "0 new" on a day when three arrived and
 * three were answered, which is false. The snapshot table exists for
 * point-in-time comparison the live data cannot reconstruct — "down 4 from
 * yesterday" and, later, trend arrows.
 */

export interface DigestCounts {
  needsReply: number
  oldestWaitingDays: number | null
  untriaged: number
  approvalsPending: number
  /** Whole US dollars — the unit getDashboardKpis already returns. */
  duesOutstandingUsd: number
}

export interface DigestFacts {
  bullets: string[]
  counts: DigestCounts
}

export interface BulletInput {
  /** Null when no prior-day snapshot exists — the bullet is then omitted. */
  newSinceBaseline: number | null
  waitingOverThree: number
  nextMeeting: string | null
}

export function buildBullets(input: BulletInput): string[] {
  const bullets: string[] = []

  // Omitted rather than shown as "0 new": with no baseline there is
  // nothing to compare against, and claiming zero would be a claim we
  // cannot support.
  if (input.newSinceBaseline !== null && input.newSinceBaseline > 0) {
    bullets.push(
      input.newSinceBaseline === 1
        ? '1 new resident email since yesterday'
        : `${input.newSinceBaseline} new resident emails since yesterday`,
    )
  }

  if (input.waitingOverThree > 0) {
    bullets.push(
      input.waitingOverThree === 1
        ? '1 has now waited over 3 days'
        : `${input.waitingOverThree} have now waited over 3 days`,
    )
  }

  if (input.nextMeeting !== null) {
    bullets.push(`Next meeting: ${input.nextMeeting}`)
  }

  return bullets
}

/**
 * `getNextMeeting` returns `{ id, meetingDate, meetingType, daysUntil,
 * status }` and falls back to the most recent PAST meeting when nothing is
 * upcoming, so `daysUntil` can be negative. A past meeting is dropped —
 * "Next meeting: 5 days ago" is nonsense on a card about today.
 */
export function formatNextMeeting(
  meeting: { meetingType: string | null; daysUntil: number } | null,
): string | null {
  if (meeting === null) return null
  if (meeting.daysUntil < 0) return null

  const type = meeting.meetingType ? `${meeting.meetingType} ` : ''
  if (meeting.daysUntil === 0) return `Next meeting: ${type}today`
  if (meeting.daysUntil === 1) return `Next meeting: ${type}tomorrow`
  return `Next meeting: ${type}in ${meeting.daysUntil} days`
}

/**
 * A snapshot is a valid delta baseline only if it was captured on an
 * EARLIER day. Same-day rows are rejected so the card's own refreshes
 * cannot walk the baseline forward and flatten the delta to zero.
 *
 * Both arguments are ISO date strings (YYYY-MM-DD), which compare
 * correctly with `<` lexicographically — no Date parsing, no timezone.
 */
export function isBaselineRow(capturedOn: string, today: string): boolean {
  return capturedOn < today
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run apps/hoa/src/lib/dashboard/digest-facts.test.ts`

Expected: PASS, 19 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/hoa/src/lib/dashboard/digest-facts.ts apps/hoa/src/lib/dashboard/digest-facts.test.ts
git commit -m "feat(dashboard): deterministic digest bullets with honest omissions"
```

---

### Task 6: Reshape the AI call to a single suggestion line

**Files:**
- Modify: `packages/ai/src/tasks/daily-digest.ts` (replace the whole file body)
- Test: `packages/ai/src/tasks/daily-digest.test.ts` (create)

**Interfaces:**
- Consumes: `runCloud` from `../agents/cloud`
- Produces:
  - `function acceptSuggestion(raw: string | null | undefined): string | null`
  - `function generateDigestSuggestion(params: { hoaName: string; needsReply: number; oldestWaitingDays: number | null; approvalsPending: number; threadSubjects: string[] }): Promise<string>`

The old `generateDailyDigest` export is replaced. Its only caller is the route rewritten in Task 7.

- [ ] **Step 1: Write the failing test**

Create `packages/ai/src/tasks/daily-digest.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { acceptSuggestion, MAX_SUGGESTION_CHARS } from './daily-digest'

describe('acceptSuggestion', () => {
  it('accepts a normal one-line suggestion', () => {
    expect(acceptSuggestion('Start with the retention pond thread — oldest, unanswered 6d')).toBe(
      'Start with the retention pond thread — oldest, unanswered 6d',
    )
  })

  it('trims surrounding whitespace', () => {
    expect(acceptSuggestion('  Start with the pond thread  ')).toBe('Start with the pond thread')
  })

  it('rejects an empty string', () => {
    expect(acceptSuggestion('')).toBeNull()
  })

  it('rejects a whitespace-only response', () => {
    expect(acceptSuggestion('   \n  ')).toBeNull()
  })

  it('rejects null and undefined', () => {
    expect(acceptSuggestion(null)).toBeNull()
    expect(acceptSuggestion(undefined)).toBeNull()
  })

  it('rejects a response longer than the cap', () => {
    // Past this the model has stopped answering "what should I start with"
    // and started writing prose — the failure this rewrite exists to end.
    expect(acceptSuggestion('x'.repeat(MAX_SUGGESTION_CHARS + 1))).toBeNull()
  })

  it('accepts a response exactly at the cap', () => {
    const atCap = 'x'.repeat(MAX_SUGGESTION_CHARS)
    expect(acceptSuggestion(atCap)).toBe(atCap)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run packages/ai/src/tasks/daily-digest.test.ts`

Expected: FAIL — `acceptSuggestion` and `MAX_SUGGESTION_CHARS` are not exported.

- [ ] **Step 3: Rewrite the module**

Replace the contents of `packages/ai/src/tasks/daily-digest.ts`:

```ts
import { runCloud } from '../agents/cloud'

/**
 * The digest's AI half: ONE sentence naming what to start with.
 *
 * The model is never asked to produce a count. Every number on the card is
 * computed in SQL and rendered directly, so there is no opportunity for a
 * wrong figure to reach a board member — the previous version asked for a
 * prose briefing over eight counts and restated numbers the tiles below it
 * already showed.
 */

/**
 * Roughly two lines at the card's width. Beyond this the model has stopped
 * answering "what should I start with" and started writing prose.
 */
export const MAX_SUGGESTION_CHARS = 200

/**
 * Gate the model's response. Returns the cleaned line, or null to render
 * facts only — an absent suggestion is a non-event, not an error.
 */
export function acceptSuggestion(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null
  const trimmed = raw.trim()
  if (trimmed === '') return null
  if (trimmed.length > MAX_SUGGESTION_CHARS) return null
  return trimmed
}

export async function generateDigestSuggestion(params: {
  hoaName: string
  needsReply: number
  oldestWaitingDays: number | null
  approvalsPending: number
  /** At most five, so the model can name one specifically. */
  threadSubjects: string[]
}): Promise<string> {
  return runCloud(
    'You are the HOA Hub assistant. You help a board member decide what to do first.',
    `HOA: ${params.hoaName}
Resident emails awaiting a reply: ${params.needsReply}
Longest wait: ${params.oldestWaitingDays ?? 0} days
Items awaiting board approval: ${params.approvalsPending}
Oldest waiting threads (subjects): ${params.threadSubjects.join(' | ') || 'none'}

Write ONE sentence, under ${MAX_SUGGESTION_CHARS} characters, telling the board
member what to start with and why. Name a specific thread from the list above
when one is present. Do NOT list counts — they are already displayed. Plain
text only, no bullet, no preamble.`,
    { max_tokens: 120 },
  )
}
```

- [ ] **Step 4: Update the package export**

In `packages/ai/src/index.ts`, replace the `generateDailyDigest` export line:

```ts
export { generateDigestSuggestion, acceptSuggestion, MAX_SUGGESTION_CHARS } from './tasks/daily-digest'
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm exec vitest run packages/ai/src/tasks/daily-digest.test.ts`

Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/ai/src/tasks/daily-digest.ts packages/ai/src/tasks/daily-digest.test.ts packages/ai/src/index.ts
git commit -m "feat(ai): digest AI produces one suggestion line, never counts"
```

---

### Task 7: The digest route stops treating an AI outage as an error

**Files:**
- Modify: `apps/hoa/src/app/api/ai/daily-digest/route.ts` (replace the whole file)
- Test: `apps/hoa/src/app/api/ai/daily-digest/route.test.ts` (create)

**Interfaces:**
- Consumes: `generateDigestSuggestion`, `acceptSuggestion` from `@homeowner-portal/ai`; `getTriageSnapshot` from `@/lib/dashboard/triage`; `buildBullets` from `@/lib/dashboard/digest-facts`; `countWaitingOver` from `@/lib/dashboard/triage-compute`
- Produces: `POST(): Promise<NextResponse>` returning `{ suggestion: string | null; bullets: string[]; generatedAt: string }`

- [ ] **Step 1: Write the failing test**

Create `apps/hoa/src/app/api/ai/daily-digest/route.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/orgs', () => ({
  getCurrentOrg: vi.fn(async () => ({ id: 'org-1', name: 'Madison Park' })),
}))

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      upsert: vi.fn(async () => ({ error: null })),
    })),
  })),
}))

vi.mock('@/lib/dashboard/triage', () => ({
  getTriageSnapshot: vi.fn(async () => ({
    needsReply: { count: 32, oldestWaitingDays: 6 },
    untriaged: { count: 365 },
    threads: [{ id: 't1', subject: 'Pond', lastMessageAt: '2026-07-27T12:00:00Z', waitingDays: 6 }],
    failed: false,
  })),
}))

vi.mock('@homeowner-portal/ai', async () => {
  const actual = await vi.importActual<typeof import('@homeowner-portal/ai')>('@homeowner-portal/ai')
  return { ...actual, generateDigestSuggestion: vi.fn() }
})

import { POST } from './route'
import { generateDigestSuggestion } from '@homeowner-portal/ai'

describe('POST /api/ai/daily-digest', () => {
  it('returns 200 with the facts when the AI call fails', async () => {
    // An AI outage is not an error state: the card's real content is
    // deterministic, so a 503 here would blank a card that has everything
    // it needs to render.
    vi.mocked(generateDigestSuggestion).mockRejectedValueOnce(new Error('model down'))

    const response = await POST()

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.suggestion).toBeNull()
    expect(Array.isArray(body.bullets)).toBe(true)
  })

  it('returns 200 with a null suggestion when the AI returns something too long', async () => {
    vi.mocked(generateDigestSuggestion).mockResolvedValueOnce('x'.repeat(500))

    const response = await POST()

    expect(response.status).toBe(200)
    expect((await response.json()).suggestion).toBeNull()
  })

  it('returns the suggestion when the AI answers normally', async () => {
    vi.mocked(generateDigestSuggestion).mockResolvedValueOnce('Start with the pond thread')

    const response = await POST()

    expect(response.status).toBe(200)
    expect((await response.json()).suggestion).toBe('Start with the pond thread')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run apps/hoa/src/app/api/ai/daily-digest/route.test.ts`

Expected: FAIL — the route still returns 503 on AI failure and has no `suggestion`/`bullets` in its response.

- [ ] **Step 3: Rewrite the route**

Replace the contents of `apps/hoa/src/app/api/ai/daily-digest/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { generateDigestSuggestion, acceptSuggestion } from '@homeowner-portal/ai'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getTriageSnapshot } from '@/lib/dashboard/triage'
import { buildBullets, formatNextMeeting } from '@/lib/dashboard/digest-facts'
import { getApprovalsInbox, getNextMeeting } from '@/lib/dashboard/queries'

/**
 * Regenerates the digest's AI suggestion line.
 *
 * An AI outage is NOT an error here. The card's real content — the bullets
 * — is computed in SQL, so this always returns 200 with the facts and
 * simply omits the suggestion. The previous version returned 503 and the
 * card rendered a warning banner in place of content it already had.
 */
export async function POST() {
  const org = await getCurrentOrg()
  if (!org) {
    return NextResponse.json({ error: 'no_org' }, { status: 403 })
  }

  const supabase = await getSupabaseServerClient()
  const [triage, approvals, nextMeeting] = await Promise.all([
    getTriageSnapshot(supabase, org.id),
    getApprovalsInbox(org.id),
    getNextMeeting(org.id),
  ])

  const bullets = buildBullets({
    // Wired to the snapshot baseline in Task 8; until then the bullet is
    // correctly omitted rather than guessed at.
    newSinceBaseline: null,
    waitingOverThree: triage.threads.filter((t) => t.waitingDays > 3).length,
    nextMeeting: formatNextMeeting(nextMeeting),
  })

  let suggestion: string | null = null
  try {
    const raw = await generateDigestSuggestion({
      hoaName: org.name,
      needsReply: triage.needsReply.count,
      oldestWaitingDays: triage.needsReply.oldestWaitingDays,
      approvalsPending: approvals.totalCount,
      threadSubjects: triage.threads.map((t) => t.subject ?? '(no subject)').slice(0, 5),
    })
    suggestion = acceptSuggestion(raw)
  } catch (err) {
    // Log the type only — never the model output, which renders thread
    // subjects.
    console.error(
      '[daily-digest] suggestion generation failed',
      err instanceof Error ? err.name : 'UnknownError',
    )
  }

  const generatedAt = new Date().toISOString()

  if (suggestion !== null) {
    const { error } = await supabase
      .from('hoa_digests')
      .upsert({ org_id: org.id, content: suggestion, generated_at: generatedAt })
    if (error) {
      // Persisting is a convenience, not the product. Never fail the
      // response over it.
      console.error('[daily-digest] upsert failed', { code: error.code, message: error.message })
    }
  }

  return NextResponse.json({ suggestion, bullets, generatedAt })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run apps/hoa/src/app/api/ai/daily-digest/route.test.ts`

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/hoa/src/app/api/ai/daily-digest/route.ts apps/hoa/src/app/api/ai/daily-digest/route.test.ts
git commit -m "feat(dashboard): an AI outage no longer blanks the digest"
```

---

### Task 8: Snapshot write and delta baseline

**Files:**
- Modify: `apps/hoa/src/lib/dashboard/digest-facts.ts` (append IO functions)
- Modify: `apps/hoa/src/app/api/ai/daily-digest/route.ts:34` (replace `newSinceBaseline: null`)

**Interfaces:**
- Consumes: `isBaselineRow`, `DigestCounts` from `./digest-facts`
- Produces:
  - `function readBaseline(db: Db, orgId: string, today: string): Promise<{ capturedAt: string; counts: DigestCounts } | null>`
  - `function writeSnapshot(db: Db, orgId: string, today: string, counts: DigestCounts): Promise<void>`
  - `function countNewSince(db: Db, orgId: string, since: string): Promise<number | null>`

- [ ] **Step 1: Append the IO functions**

Add to the end of `apps/hoa/src/lib/dashboard/digest-facts.ts`:

```ts
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { ACTIVE_STATUSES } from './triage'

type Db = SupabaseClient<Database>

function logDbError(fn: string, error: PostgrestError): void {
  console.error(`${fn} failed`, { code: error.code, message: error.message })
}

/** Today as YYYY-MM-DD, the form `captured_on` stores. */
export function todayISO(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/**
 * The most recent snapshot from an EARLIER day, or null if none exists.
 * Same-day rows are filtered out in SQL so a mid-day refresh cannot walk
 * the baseline forward.
 */
export async function readBaseline(
  db: Db,
  orgId: string,
  today: string,
): Promise<{ capturedAt: string; counts: DigestCounts } | null> {
  const { data, error } = await db
    .from('dashboard_daily_snapshots')
    .select('captured_on, captured_at, counts')
    .eq('organization_id', orgId)
    .lt('captured_on', today)
    .order('captured_on', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    logDbError('readBaseline', error)
    return null
  }
  if (!data) return null
  if (!isBaselineRow(data.captured_on as string, today)) return null

  return {
    capturedAt: data.captured_at as string,
    counts: data.counts as unknown as DigestCounts,
  }
}

/**
 * One row per org per day, first write wins. A failure is logged and
 * swallowed — telemetry must never block the page.
 */
export async function writeSnapshot(
  db: Db,
  orgId: string,
  today: string,
  counts: DigestCounts,
): Promise<void> {
  const { error } = await db
    .from('dashboard_daily_snapshots')
    .upsert(
      { organization_id: orgId, captured_on: today, counts },
      { onConflict: 'organization_id,captured_on', ignoreDuplicates: true },
    )
  if (error) logDbError('writeSnapshot', error)
}

/**
 * Resident mail that arrived since the baseline instant. Computed live, not
 * by subtracting stored counts — a subtraction reports "0 new" on a day
 * when three arrived and three were answered.
 *
 * Returns null on failure so the bullet is omitted rather than shown as 0.
 */
export async function countNewSince(
  db: Db,
  orgId: string,
  since: string,
): Promise<number | null> {
  const { count, error } = await db
    .from('inbox_threads')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .not('unit_id', 'is', null)
    .eq('last_direction', 'inbound')
    .in('status', ACTIVE_STATUSES)
    .gte('last_message_at', since)

  if (error) {
    logDbError('countNewSince', error)
    return null
  }
  return count ?? 0
}
```

- [ ] **Step 2: Wire it into the route**

In `apps/hoa/src/app/api/ai/daily-digest/route.ts`, add to the imports:

```ts
import {
  buildBullets,
  countNewSince,
  formatNextMeeting,
  readBaseline,
  todayISO,
  writeSnapshot,
} from '@/lib/dashboard/digest-facts'
import { getDashboardKpis } from '@/lib/dashboard/charts'
```

Then replace the `const bullets = buildBullets({...})` block with:

```ts
  const today = todayISO()
  const baseline = await readBaseline(supabase, org.id, today)
  const newSinceBaseline =
    baseline !== null ? await countNewSince(supabase, org.id, baseline.capturedAt) : null

  const bullets = buildBullets({
    newSinceBaseline,
    waitingOverThree: triage.threads.filter((t) => t.waitingDays > 3).length,
    nextMeeting: formatNextMeeting(nextMeeting),
  })

  // Record today's numbers for tomorrow's comparison. Never blocks the
  // response — a failed write is logged inside writeSnapshot.
  const kpis = await getDashboardKpis(org.id)
  await writeSnapshot(supabase, org.id, today, {
    needsReply: triage.needsReply.count,
    oldestWaitingDays: triage.needsReply.oldestWaitingDays,
    untriaged: triage.untriaged.count,
    approvalsPending: approvals.totalCount,
    duesOutstandingUsd: Math.round(kpis.duesOutstandingUsd.value),
  })
```

- [ ] **Step 3: Run the full suite**

Run: `pnpm exec vitest run`

Expected: all tests pass. The route tests from Task 7 still pass — the mocked client already stubs `lt`, `order`, `limit`, `maybeSingle` and `upsert`.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: 11/11 tasks successful.

- [ ] **Step 5: Commit**

```bash
git add apps/hoa/src/lib/dashboard/digest-facts.ts apps/hoa/src/app/api/ai/daily-digest/route.ts
git commit -m "feat(dashboard): record daily snapshots and compute the since-yesterday delta"
```

---

### Task 9: Rewrite the digest card

**Files:**
- Modify: `apps/hoa/src/components/dashboard/DailyDigestCard.tsx` (replace the whole file)

**Interfaces:**
- Consumes: `POST /api/ai/daily-digest` returning `{ suggestion, bullets, generatedAt }`
- Produces: `function DailyDigestCard({ initialSuggestion, initialBullets, initialGeneratedAt }): JSX.Element`

- [ ] **Step 1: Rewrite the component**

Replace the contents of `apps/hoa/src/components/dashboard/DailyDigestCard.tsx`:

```tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw, Sparkles } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import { formatDistanceToNow } from 'date-fns'

interface DailyDigestCardProps {
  initialSuggestion: string | null
  initialBullets: string[]
  initialGeneratedAt: string | null
}

/**
 * Once a day, not every four hours. The bullets are server-rendered and
 * always current; the only thing a refresh buys is a fresh suggestion
 * sentence about today, which does not change four times a day.
 */
const AUTO_REFRESH_AFTER_MS = 24 * 60 * 60 * 1000

export function DailyDigestCard({
  initialSuggestion,
  initialBullets,
  initialGeneratedAt,
}: DailyDigestCardProps) {
  const [suggestion, setSuggestion] = useState(initialSuggestion)
  const [bullets, setBullets] = useState(initialBullets)
  const [generatedAt, setGeneratedAt] = useState(initialGeneratedAt)
  const [loading, setLoading] = useState(false)
  const autoRefreshFired = useRef(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ai/daily-digest', { method: 'POST' })
      if (!res.ok) return
      const body = await res.json()
      setSuggestion(body.suggestion ?? null)
      setBullets(Array.isArray(body.bullets) ? body.bullets : [])
      setGeneratedAt(body.generatedAt ?? null)
    } catch {
      // No error state. The bullets on screen are server-rendered and
      // still correct; a failed refresh costs at most a stale suggestion
      // line, which is not worth an alarm banner.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (autoRefreshFired.current) return
    const isStale =
      !generatedAt || Date.now() - new Date(generatedAt).getTime() > AUTO_REFRESH_AFTER_MS
    if (!isStale) return
    autoRefreshFired.current = true
    refresh()
  }, [generatedAt, refresh])

  const hasContent = suggestion !== null || bullets.length > 0

  return (
    <Card variant="elevated">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <CardTitle className="text-base">Today</CardTitle>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={refresh}
          disabled={loading}
          aria-label="Refresh digest"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{loading ? 'Thinking…' : 'Refresh'}</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {suggestion ? (
          <p className="rounded-lg bg-primary/5 px-3 py-2 text-sm font-medium text-foreground">
            {suggestion}
          </p>
        ) : null}

        {bullets.length > 0 ? (
          <ul className="space-y-1.5 text-sm leading-relaxed text-foreground">
            {bullets.map((line) => (
              <li key={line} className="flex gap-2">
                <span
                  className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                  aria-hidden
                />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {!hasContent ? (
          <p className="text-sm text-muted">Nothing new since yesterday.</p>
        ) : null}

        {generatedAt ? (
          <p className="text-xs text-muted">
            Updated {formatDistanceToNow(new Date(generatedAt), { addSuffix: true })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`

Expected: FAIL in `apps/hoa` — `page.tsx` still passes the old `initialContent` prop. Task 10 fixes it. This is the expected intermediate state; do not "fix" it by reintroducing the old props.

- [ ] **Step 3: Commit**

```bash
git add apps/hoa/src/components/dashboard/DailyDigestCard.tsx
git commit -m "feat(dashboard): digest card renders facts, AI line optional"
```

---

### Task 10: Recompose the dashboard page

**Files:**
- Modify: `apps/hoa/src/app/(dashboard)/page.tsx`

**Interfaces:**
- Consumes: everything produced above
- Produces: the final layout

- [ ] **Step 1: Replace the DashboardContent function**

In `apps/hoa/src/app/(dashboard)/page.tsx`, add these imports alongside the existing ones:

```tsx
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getTriageSnapshot } from '@/lib/dashboard/triage'
import {
  buildBullets,
  countNewSince,
  formatNextMeeting,
  readBaseline,
  todayISO,
} from '@/lib/dashboard/digest-facts'
import { MailTriageCard } from '@/components/dashboard/MailTriageCard'
```

Replace the whole `DashboardContent` function body with:

```tsx
async function DashboardContent({ orgId }: { orgId: string }) {
  const supabase = await getSupabaseServerClient()

  const [
    kpis,
    violationsDonut,
    ticketCategoryDonut,
    activity,
    approvals,
    atRisk,
    nextMeeting,
    leaseSummary,
    digest,
    heatMapCells,
    triage,
  ] = await Promise.all([
    getDashboardKpis(orgId),
    getViolationStatusDonut(orgId),
    getTicketCategoryDonut(orgId),
    getThirtyDayActivity(orgId),
    getApprovalsInbox(orgId),
    getAtRiskThisWeek(orgId),
    getNextMeeting(orgId),
    getLeaseSummary(orgId),
    getLatestDigest(orgId),
    getComplianceHeatMap(orgId),
    getTriageSnapshot(supabase, orgId),
  ])

  const today = todayISO()
  const baseline = await readBaseline(supabase, orgId, today)
  const newSinceBaseline =
    baseline !== null ? await countNewSince(supabase, orgId, baseline.capturedAt) : null

  const bullets = buildBullets({
    newSinceBaseline,
    waitingOverThree: triage.threads.filter((t) => t.waitingDays > 3).length,
    nextMeeting: formatNextMeeting(nextMeeting),
  })

  return (
    <div className="space-y-6">
      {/* Today — the AI suggestion line plus deterministic bullets. The
          bullets deliberately never restate a tile below; they carry what
          CHANGED, which a tile structurally cannot show. */}
      <DailyDigestCard
        initialSuggestion={digest.content}
        initialBullets={bullets}
        initialGeneratedAt={digest.generatedAt}
      />

      {/* The four numbers that are about today. "Active vendors" was cut:
          reference data, not a daily decision. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiHero
          label="Needs a reply"
          value={triage.needsReply.count}
          display={triage.failed ? '—' : undefined}
          sub={triage.failed ? 'couldn’t load' : 'resident mail'}
          href="/inbox"
          upIsBad
        />
        <KpiHero
          label="Oldest waiting"
          value={triage.needsReply.oldestWaitingDays ?? 0}
          display={
            triage.failed
              ? '—'
              : triage.needsReply.oldestWaitingDays === null
                ? '—'
                : `${triage.needsReply.oldestWaitingDays}d`
          }
          href="/inbox"
          upIsBad
        />
        <KpiHero
          label="Approvals pending"
          value={approvals.totalCount}
          href="/violations/approval-queue"
          upIsBad
        />
        <KpiHero
          label="Dues overdue"
          value={kpis.duesOutstandingUsd.value}
          display={`$${Math.round(kpis.duesOutstandingUsd.value).toLocaleString()}`}
          previous={kpis.duesOutstandingUsd.previous}
          upIsBad
          href="/dues"
        />
      </div>

      <MailTriageCard snapshot={triage} />

      {/* Open by default — a confirmed "nothing urgent" is worth seeing. */}
      <details className="rounded-xl border border-border bg-surface" open>
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-medium hover:bg-foreground/5">
          <span>This week</span>
          <span className="text-xs text-muted">
            {approvals.totalCount + atRisk.totalCount === 0
              ? 'nothing urgent'
              : `${approvals.totalCount + atRisk.totalCount} items`}
          </span>
        </summary>
        <div className="space-y-4 border-t border-border p-4">
          <ApprovalsInbox items={approvals.items} />
          <div className="grid gap-4 sm:grid-cols-2">
            <AtRiskThisWeek items={atRisk.items} totalCount={atRisk.totalCount} />
            <NextMeeting meeting={nextMeeting} />
          </div>
        </div>
      </details>

      {/* Demoted, not deleted. These stopped competing with today's work. */}
      <details className="rounded-xl border border-border bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-medium hover:bg-foreground/5">
          <span className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted" />
            Money &amp; compliance
          </span>
        </summary>
        <div className="space-y-4 border-t border-border p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <KpiHero
              label="Open violations"
              value={kpis.openViolations.value}
              previous={kpis.openViolations.previous}
              upIsBad
              href="/violations"
            />
            <KpiHero
              label="Open tickets"
              value={kpis.openTickets.value}
              href="/tickets"
              upIsBad
            />
          </div>
          <div
            className={`grid gap-4 ${leaseSummary.hasAssociation ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}
          >
            <StatusDonut
              title="Violations by status"
              icon={<AlertTriangle className="h-4 w-4 text-muted" />}
              segments={violationsDonut.segments}
              total={violationsDonut.total}
              emptyTitle="No violations on file"
              emptyDescription="When violations are reported, the status breakdown will show here."
            />
            <StatusBar
              title="Tickets by category"
              icon={<MessageSquare className="h-4 w-4 text-muted" />}
              segments={ticketCategoryDonut.segments}
              total={ticketCategoryDonut.total}
              emptyTitle="No tickets yet"
              emptyDescription="When residents submit tickets, the category breakdown will show here."
            />
            <LeaseSummaryCard summary={leaseSummary} />
          </div>
          <ActivityBar buckets={activity.buckets} />
        </div>
      </details>

      <details className="rounded-xl border border-border bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-medium hover:bg-foreground/5">
          <span className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted" />
            3-month compliance heat map
          </span>
        </summary>
        <div className="border-t border-border p-2">
          <ComplianceHeatMap cells={heatMapCells} />
        </div>
      </details>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: 11/11 tasks successful. The `Briefcase` import may now be unused — remove it if the linter flags it.

- [ ] **Step 3: Run the full test suite**

Run: `pnpm exec vitest run`
Expected: all tests pass.

- [ ] **Step 4: Verify in the browser**

Run `pnpm --filter hoa dev` and open `/`. Confirm:
- The digest shows bullets (and a suggestion line if the model is reachable)
- The four tiles read Needs a reply / Oldest waiting / Approvals pending / Dues overdue
- The mail triage card lists oldest-waiting threads and links into `/inbox/<id>`
- "This week" is expanded; "Money & compliance" and the heat map are collapsed
- "Active vendors" no longer appears

- [ ] **Step 5: Build**

Run: `pnpm build`
Expected: 4/4 apps build.

- [ ] **Step 6: Commit**

```bash
git add "apps/hoa/src/app/(dashboard)/page.tsx"
git commit -m "feat(dashboard): triage-first layout, charts demoted"
```

---

## Self-review

**Spec coverage:** Every spec section maps to a task — definitions and error posture to Tasks 2–3, the card to Task 4, tile repointing/cuts/layout to Task 10, digest division of labour to Tasks 5–7, history and RLS to Tasks 1 and 8, failure behaviour across Tasks 3/7/8. The spec's three named follow-ups (bulk-mail suppression, inbox-side triage, trend arrows) are correctly absent.

**Resolved before execution:** `getNextMeeting` returns no `.title` and can return a past meeting. `formatNextMeeting` in Task 5 absorbs both; Tasks 7 and 10 call it rather than reading a field that does not exist.

**Type consistency:** `TriageSnapshot`, `TriageThread`, `ThreadRow`, `DigestCounts` and `ACTIVE_STATUSES` are defined once and imported everywhere. `ACTIVE_STATUSES` is exported from `triage.ts` and reused in `digest-facts.ts` so the two modules cannot drift apart on what "active" means.

**Ordering note:** Task 9 deliberately leaves the build red until Task 10. Execute them in order.
