# Dues Reminder Emails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an HOA manager send one consolidated dues reminder email per person — covering every outstanding charge across every property they own — from `/dues`, individually or in bulk.

**Architecture:** A new `apps/hoa/src/lib/dues-reminders/` module owns *who owes what* and renders each person's email body. The existing `communications` pipeline stays the delivery + audit layer, extended additively with a `precomputed` audience kind and a per-recipient merge bag so each recipient receives their own body while the send still produces one campaign row with per-recipient delivery tracking.

**Tech Stack:** Next.js 15 App Router (server components + server actions), TypeScript, Supabase (`@supabase/supabase-js` typed client), Zod, Resend, Tailwind, `@homeowner-portal/ui`, Vitest (node environment).

**Spec:** `docs/superpowers/specs/2026-08-09-dues-reminder-email-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Package manager is pnpm.** Run commands from the repo root: `/Users/asafhamo/HomeownerHub`.
- **Prefix shell commands with `rtk`** per `CLAUDE.md` — e.g. `rtk pnpm vitest run`, `rtk git commit`. RTK passes through unchanged when it has no filter, so it is always safe.
- **Tests are colocated** as `*.test.ts` beside their source. `vitest.config.ts` uses an allowlist: only `apps/**/src/**/*.test.{ts,tsx}` and `packages/**/src/**/*.test.{ts,tsx}` run. A test outside those globs is silently not run.
- **Vitest environment is `node`** — no DOM. Do not write tests that need `document` or render React.
- **Assessment statuses in this codebase are `open | partial | paid | waived`.** The `overdue` / `due` labels on the manager dues page are computed from the date, not stored. Only `open` and `partial` are outstanding.
- **Past-due boundary is `dueDate < today`** — a charge due *today* is NOT late. `today` is `new Date().toISOString().slice(0, 10)`.
- **Money is `number` throughout** (the DB columns are numeric and arrive as JS numbers). Round to cents with `Math.round(n * 100) / 100` before display or comparison.
- **Currency format is `en-US` USD with cents**: `$1,240.00`. (The manager dues page uses `maximumFractionDigits: 0`; the emails deliberately show cents because they are financial notices.)
- **Never log resident PII** — no addresses, names, emails, or bodies in `console.*`. Log ids and counts only.
- **Emails are email-client-safe HTML**: table layout, all styles inline, 600px max width, light-only palette with explicit background colours on every cell. No flexbox, no grid, no `<style>` blocks, no external CSS.
- **Past-due state always carries a text label** ("39 days late"), never colour alone.
- **The CTA reads "View my dues"**, never "Pay now" — there is no online payment. It links to `${NEXT_PUBLIC_APP_URL}/resident/dues`.
- **Role guard for every server action:** `admin` or `board` only. Use `getCurrentUserRoleInOrg(org.id)` and return `{ ok: false, error: "You don't have permission to perform this action." }` — do NOT use the `require*` guards from `@/lib/auth`, which call `redirect()` and throw.
- **Server actions return result objects**, never throw: `{ ok: true, ... } | { ok: false, error: string }`.

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `apps/hoa/src/lib/assessment-labels.ts` | `CHARGE_TYPE_LABELS` + `chargeTypeLabel()`, shared by the resident page and the email renderer. Cannot live in `assessments.ts`, which is `'use server'` and may only export async functions. |
| `apps/hoa/src/lib/assessment-labels.test.ts` | Tests for the above. |
| `apps/hoa/src/lib/dues-reminders/types.ts` | `ReminderCharge`, `ReminderProperty`, `ReminderPacket`, `SkippedOwner`, `PacketBuildResult`. Types only — keeps `render.ts` importable without pulling in Supabase. |
| `apps/hoa/src/lib/dues-reminders/packets.ts` | `buildReminderPackets()` — query outstanding charges, compute balances, group by owner email. |
| `apps/hoa/src/lib/dues-reminders/packets.test.ts` | Balance math, grouping, skips, sorting. |
| `apps/hoa/src/lib/dues-reminders/render.ts` | **Pure.** Email HTML/text rendering + formatting helpers. |
| `apps/hoa/src/lib/dues-reminders/render.test.ts` | The bulk of the coverage. |
| `apps/hoa/src/lib/dues-reminders/queries.ts` | `RECENT_REMINDER_DAYS`, `getLastRemindedByEmail()`. |
| `apps/hoa/src/lib/dues-reminders/actions.ts` | `'use server'` — `previewDuesReminders()`, `sendDuesReminders()`. |
| `apps/hoa/src/lib/dues-reminders/actions.test.ts` | Role guard, unconfigured-email refusal, recipient assembly. |
| `apps/hoa/src/lib/communications/audience.test.ts` | Regression tests for the `precomputed` short-circuit. |
| `apps/hoa/src/app/(dashboard)/dues/SendRemindersDialog.tsx` | `'use client'` — preview + note + send dialog. |
| `apps/hoa/src/app/(dashboard)/dues/WhoOwesPanel.tsx` | Server component — the "Who owes" list. |

**Modify**

| File | Change |
|---|---|
| `apps/hoa/src/lib/communications/audience.ts` | Add `'precomputed'` kind, `recipients` + `summary` on `AudienceDefinition`, optional `unitIds` on `ResolvedRecipient`, short-circuit, `summaryFor` case. |
| `apps/hoa/src/lib/communications/send.ts` | Accept `'precomputed'` + `recipients` + `extraMergeFields`; merge per-recipient fields into the bag; strip `recipients` before persisting `audience_definition`. |
| `apps/hoa/src/app/resident/dues/page.tsx` | Import labels from `@/lib/assessment-labels` instead of defining them inline. |
| `apps/hoa/src/app/(dashboard)/dues/page.tsx` | Render `<WhoOwesPanel />` above the period tables. |

---

### Task 1: Extract shared assessment labels

Small, self-contained, and unblocks the renderer. Nothing else depends on it yet.

**Files:**
- Create: `apps/hoa/src/lib/assessment-labels.ts`
- Create: `apps/hoa/src/lib/assessment-labels.test.ts`
- Modify: `apps/hoa/src/app/resident/dues/page.tsx:117-128` (delete the inline copy, import instead)

**Interfaces:**
- Consumes: nothing
- Produces: `CHARGE_TYPE_LABELS: Record<string, string>`, `chargeTypeLabel(type: string): string`

- [ ] **Step 1: Write the failing test**

Create `apps/hoa/src/lib/assessment-labels.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { chargeTypeLabel, CHARGE_TYPE_LABELS } from './assessment-labels'

describe('chargeTypeLabel', () => {
  it('maps the four known assessment types', () => {
    expect(chargeTypeLabel('regular')).toBe('Regular dues')
    expect(chargeTypeLabel('special')).toBe('Special assessment')
    expect(chargeTypeLabel('late_fee')).toBe('Late fee')
    expect(chargeTypeLabel('fine')).toBe('Fine')
  })

  it('humanizes an unknown snake_case type rather than showing the raw slug', () => {
    expect(chargeTypeLabel('parking_permit')).toBe('Parking permit')
  })

  it('leaves an unknown single word capitalized', () => {
    expect(chargeTypeLabel('interest')).toBe('Interest')
  })

  it('exposes the label map for callers that need to enumerate types', () => {
    expect(Object.keys(CHARGE_TYPE_LABELS)).toContain('regular')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `rtk pnpm vitest run apps/hoa/src/lib/assessment-labels.test.ts`
Expected: FAIL — `Failed to resolve import "./assessment-labels"`

- [ ] **Step 3: Write the implementation**

Create `apps/hoa/src/lib/assessment-labels.ts`:

```ts
// Friendly names for the assessment_type values (regular | special |
// late_fee | fine). Unknown types fall back to a humanized slug.
//
// This lives on its own rather than in assessments.ts because that file
// is 'use server' — Next only permits async function exports there, so a
// plain const would fail the build.

export const CHARGE_TYPE_LABELS: Record<string, string> = {
  regular: 'Regular dues',
  special: 'Special assessment',
  late_fee: 'Late fee',
  fine: 'Fine',
}

export function chargeTypeLabel(type: string): string {
  return CHARGE_TYPE_LABELS[type] ?? type.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `rtk pnpm vitest run apps/hoa/src/lib/assessment-labels.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Update the resident page to use the shared copy**

In `apps/hoa/src/app/resident/dues/page.tsx`, delete lines 117-128 (the `CHARGE_TYPE_LABELS` const and the `chargeTypeLabel` function, including the comment above them) and add to the existing imports at the top:

```ts
import { chargeTypeLabel } from '@/lib/assessment-labels'
```

Leave every call site alone — the function name and behaviour are identical.

- [ ] **Step 6: Typecheck**

Run: `rtk pnpm --filter hoa exec tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
rtk git add apps/hoa/src/lib/assessment-labels.ts apps/hoa/src/lib/assessment-labels.test.ts "apps/hoa/src/app/resident/dues/page.tsx"
rtk git commit -m "refactor(dues): extract shared assessment type labels"
```

---

### Task 2: Packet types and builder

The data layer: turn raw assessments into per-person packets.

**Files:**
- Create: `apps/hoa/src/lib/dues-reminders/types.ts`
- Create: `apps/hoa/src/lib/dues-reminders/packets.ts`
- Create: `apps/hoa/src/lib/dues-reminders/packets.test.ts`

**Interfaces:**
- Consumes: `getSupabaseServerClient` from `@/lib/supabase/server`
- Produces:
  - `buildReminderPackets(associationId: string): Promise<PacketBuildResult>`
  - `daysBetween(fromIso: string, toIso: string): number`
  - `unitLabel(u: { address_line1: string | null; unit_number: string | null }): string`
  - Types: `ReminderCharge`, `ReminderProperty`, `ReminderPacket`, `SkippedOwner`, `PacketBuildResult`

- [ ] **Step 1: Write the types**

Create `apps/hoa/src/lib/dues-reminders/types.ts`:

```ts
// Shapes shared between the packet builder (which does I/O) and the
// renderer (which must stay pure). Keeping them here lets render.test.ts
// build fixtures without importing anything that touches Supabase.

export interface ReminderCharge {
  id: string
  assessmentType: string // regular | special | late_fee | fine
  dueDate: string        // 'YYYY-MM-DD'
  amount: number         // the original assessment amount
  paid: number           // sum of payments applied
  balance: number        // amount - paid, floored at 0
  pastDue: boolean
  daysLate: number       // 0 when not past due
}

export interface ReminderProperty {
  unitId: string
  label: string          // "14 Oak St" / "22 Oak St · Unit B"
  charges: ReminderCharge[]
  subtotal: number
}

export interface ReminderPacket {
  email: string          // the recipient key — normalized lowercase
  ownerName: string
  userId: string | null
  properties: ReminderProperty[]
  totalDue: number
  pastDueTotal: number
  oldestDaysLate: number
  chargeCount: number
}

export interface SkippedOwner {
  ownerName: string
  unitLabel: string
}

export interface PacketBuildResult {
  packets: ReminderPacket[]
  skipped: SkippedOwner[]
}
```

- [ ] **Step 2: Write the failing test**

Create `apps/hoa/src/lib/dues-reminders/packets.test.ts`. The Supabase mock returns a different payload per table, matching the chained-builder shape the real client exposes.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({ from: mockFrom })),
}))

import { buildReminderPackets, daysBetween, unitLabel } from './packets'

// The real client returns a thenable builder; every filter method returns
// `this` and awaiting it yields { data }. This fake does the same so the
// production code can chain freely without the test knowing the order.
function table(data: unknown[]) {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'is', 'not', 'lt', 'order', 'limit']) {
    builder[m] = () => builder
  }
  builder.then = (resolve: (v: { data: unknown[] }) => unknown) => resolve({ data })
  return builder
}

const TODAY = '2026-08-09'

beforeEach(() => {
  mockFrom.mockReset()
  vi.useFakeTimers()
  vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`))
})

function setupTables(opts: { assessments?: unknown[]; ownerships?: unknown[] }) {
  mockFrom.mockImplementation((name: string) => {
    if (name === 'assessments') return table(opts.assessments ?? [])
    if (name === 'ownerships') return table(opts.ownerships ?? [])
    throw new Error(`unexpected table: ${name}`)
  })
}

const UNIT_A = { id: 'unit-a', address_line1: '14 Oak St', unit_number: null }
const UNIT_B = { id: 'unit-b', address_line1: '22 Oak St', unit_number: 'B' }

describe('daysBetween', () => {
  it('counts whole days between two ISO dates', () => {
    expect(daysBetween('2026-07-01', '2026-08-09')).toBe(39)
  })

  it('returns 0 for the same day', () => {
    expect(daysBetween('2026-08-09', '2026-08-09')).toBe(0)
  })
})

describe('unitLabel', () => {
  it('appends the unit number when present', () => {
    expect(unitLabel(UNIT_B)).toBe('22 Oak St · Unit B')
  })

  it('uses the address alone when there is no unit number', () => {
    expect(unitLabel(UNIT_A)).toBe('14 Oak St')
  })
})

describe('buildReminderPackets', () => {
  it('subtracts payments so a partially paid charge reports its true balance', async () => {
    setupTables({
      assessments: [
        {
          id: 'a1', unit_id: 'unit-a', amount: 310, due_date: '2026-07-01',
          assessment_type: 'regular', payments: [{ amount: 160 }], unit: UNIT_A,
        },
      ],
      ownerships: [
        { unit_id: 'unit-a', owner_name: 'Dana', owner_email: 'dana@example.com', owner_user_id: 'u1' },
      ],
    })

    const { packets } = await buildReminderPackets('assoc-1')

    expect(packets).toHaveLength(1)
    expect(packets[0].properties[0].charges[0].balance).toBe(150)
    expect(packets[0].totalDue).toBe(150)
  })

  it('drops a charge whose payments already cover it', async () => {
    setupTables({
      assessments: [
        {
          id: 'a1', unit_id: 'unit-a', amount: 310, due_date: '2026-07-01',
          assessment_type: 'regular', payments: [{ amount: 310 }], unit: UNIT_A,
        },
      ],
      ownerships: [
        { unit_id: 'unit-a', owner_name: 'Dana', owner_email: 'dana@example.com', owner_user_id: null },
      ],
    })

    const { packets } = await buildReminderPackets('assoc-1')

    expect(packets).toHaveLength(0)
  })

  it('treats a charge due today as not yet late', async () => {
    setupTables({
      assessments: [
        {
          id: 'a1', unit_id: 'unit-a', amount: 310, due_date: TODAY,
          assessment_type: 'regular', payments: [], unit: UNIT_A,
        },
      ],
      ownerships: [
        { unit_id: 'unit-a', owner_name: 'Dana', owner_email: 'dana@example.com', owner_user_id: null },
      ],
    })

    const { packets } = await buildReminderPackets('assoc-1')

    expect(packets[0].properties[0].charges[0].pastDue).toBe(false)
    expect(packets[0].pastDueTotal).toBe(0)
  })

  it('consolidates one owner across two properties into a single packet', async () => {
    setupTables({
      assessments: [
        { id: 'a1', unit_id: 'unit-a', amount: 310, due_date: '2026-07-01', assessment_type: 'regular', payments: [], unit: UNIT_A },
        { id: 'a2', unit_id: 'unit-b', amount: 200, due_date: '2026-09-01', assessment_type: 'special', payments: [], unit: UNIT_B },
      ],
      ownerships: [
        { unit_id: 'unit-a', owner_name: 'Dana', owner_email: 'dana@example.com', owner_user_id: 'u1' },
        { unit_id: 'unit-b', owner_name: 'Dana', owner_email: 'DANA@example.com', owner_user_id: 'u1' },
      ],
    })

    const { packets } = await buildReminderPackets('assoc-1')

    expect(packets).toHaveLength(1)
    expect(packets[0].email).toBe('dana@example.com')
    expect(packets[0].properties).toHaveLength(2)
    expect(packets[0].totalDue).toBe(510)
    expect(packets[0].pastDueTotal).toBe(310)
    expect(packets[0].oldestDaysLate).toBe(39)
    expect(packets[0].chargeCount).toBe(2)
  })

  it('gives each co-owner of one unit their own packet with the full picture', async () => {
    setupTables({
      assessments: [
        { id: 'a1', unit_id: 'unit-a', amount: 310, due_date: '2026-07-01', assessment_type: 'regular', payments: [], unit: UNIT_A },
      ],
      ownerships: [
        { unit_id: 'unit-a', owner_name: 'Dana', owner_email: 'dana@example.com', owner_user_id: 'u1' },
        { unit_id: 'unit-a', owner_name: 'Sam', owner_email: 'sam@example.com', owner_user_id: 'u2' },
      ],
    })

    const { packets } = await buildReminderPackets('assoc-1')

    expect(packets).toHaveLength(2)
    expect(packets.every((p) => p.totalDue === 310)).toBe(true)
  })

  it('reports an owner with no email as skipped rather than dropping them silently', async () => {
    setupTables({
      assessments: [
        { id: 'a1', unit_id: 'unit-a', amount: 310, due_date: '2026-07-01', assessment_type: 'regular', payments: [], unit: UNIT_A },
      ],
      ownerships: [
        { unit_id: 'unit-a', owner_name: 'Priya', owner_email: null, owner_user_id: null },
      ],
    })

    const { packets, skipped } = await buildReminderPackets('assoc-1')

    expect(packets).toHaveLength(0)
    expect(skipped).toEqual([{ ownerName: 'Priya', unitLabel: '14 Oak St' }])
  })

  it('sorts packets by past-due total descending', async () => {
    setupTables({
      assessments: [
        { id: 'a1', unit_id: 'unit-a', amount: 100, due_date: '2026-07-01', assessment_type: 'regular', payments: [], unit: UNIT_A },
        { id: 'a2', unit_id: 'unit-b', amount: 900, due_date: '2026-07-01', assessment_type: 'regular', payments: [], unit: UNIT_B },
      ],
      ownerships: [
        { unit_id: 'unit-a', owner_name: 'Small', owner_email: 'small@example.com', owner_user_id: null },
        { unit_id: 'unit-b', owner_name: 'Big', owner_email: 'big@example.com', owner_user_id: null },
      ],
    })

    const { packets } = await buildReminderPackets('assoc-1')

    expect(packets.map((p) => p.email)).toEqual(['big@example.com', 'small@example.com'])
  })

  it('orders charges past-due-first, oldest first, then upcoming', async () => {
    setupTables({
      assessments: [
        { id: 'up', unit_id: 'unit-a', amount: 310, due_date: '2026-09-01', assessment_type: 'regular', payments: [], unit: UNIT_A },
        { id: 'new', unit_id: 'unit-a', amount: 110, due_date: '2026-07-15', assessment_type: 'late_fee', payments: [], unit: UNIT_A },
        { id: 'old', unit_id: 'unit-a', amount: 310, due_date: '2026-07-01', assessment_type: 'regular', payments: [], unit: UNIT_A },
      ],
      ownerships: [
        { unit_id: 'unit-a', owner_name: 'Dana', owner_email: 'dana@example.com', owner_user_id: null },
      ],
    })

    const { packets } = await buildReminderPackets('assoc-1')

    expect(packets[0].properties[0].charges.map((c) => c.id)).toEqual(['old', 'new', 'up'])
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `rtk pnpm vitest run apps/hoa/src/lib/dues-reminders/packets.test.ts`
Expected: FAIL — `Failed to resolve import "./packets"`

- [ ] **Step 4: Write the implementation**

Create `apps/hoa/src/lib/dues-reminders/packets.ts`:

```ts
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type {
  PacketBuildResult,
  ReminderCharge,
  ReminderPacket,
  ReminderProperty,
  SkippedOwner,
} from './types'

const MS_PER_DAY = 86_400_000

/** Whole days between two 'YYYY-MM-DD' dates. Both parse as UTC midnight,
 *  so this is timezone-stable — unlike a local-time date difference. */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / MS_PER_DAY)
}

export function unitLabel(u: {
  address_line1: string | null
  unit_number: string | null
}): string {
  const address = u.address_line1 ?? 'Your property'
  return u.unit_number ? `${address} · Unit ${u.unit_number}` : address
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

interface AssessmentRow {
  id: string
  unit_id: string
  amount: number
  due_date: string
  assessment_type: string
  payments: { amount: number }[] | null
  unit: { id: string; address_line1: string | null; unit_number: string | null } | null
}

interface OwnershipRow {
  unit_id: string
  owner_name: string | null
  owner_email: string | null
  owner_user_id: string | null
}

/**
 * Everything a set of reminder emails needs, grouped by person.
 *
 * Two deliberate departures from resolveAudience(), which resolves the
 * same tables for the general communications composer:
 *
 *   1. Every ownership row is kept, not one per unit — co-owners are
 *      jointly liable and each gets the full picture.
 *   2. Recipients are keyed by email, not unit — someone who owns three
 *      properties gets one email covering all three.
 */
export async function buildReminderPackets(
  associationId: string,
): Promise<PacketBuildResult> {
  const supabase = await getSupabaseServerClient()

  const { data: assessmentData } = await supabase
    .from('assessments')
    .select(
      'id, unit_id, amount, due_date, assessment_type, payments(amount), unit:unit_id(id, address_line1, unit_number)',
    )
    .eq('association_id', associationId)
    .in('status', ['open', 'partial'])
    .is('deleted_at', null)

  const assessments = (assessmentData ?? []) as unknown as AssessmentRow[]
  const today = new Date().toISOString().slice(0, 10)

  // Charges with a real remaining balance, bucketed by unit.
  const chargesByUnit = new Map<string, ReminderCharge[]>()
  const unitLabels = new Map<string, string>()

  for (const a of assessments) {
    const paid = (a.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
    const balance = round(Number(a.amount) - paid)
    if (balance <= 0) continue

    const pastDue = a.due_date < today
    const charge: ReminderCharge = {
      id: a.id,
      assessmentType: a.assessment_type,
      dueDate: a.due_date,
      amount: round(Number(a.amount)),
      paid: round(paid),
      balance,
      pastDue,
      daysLate: pastDue ? daysBetween(a.due_date, today) : 0,
    }

    if (!chargesByUnit.has(a.unit_id)) chargesByUnit.set(a.unit_id, [])
    chargesByUnit.get(a.unit_id)!.push(charge)
    if (a.unit) unitLabels.set(a.unit_id, unitLabel(a.unit))
  }

  const unitIds = [...chargesByUnit.keys()]
  if (unitIds.length === 0) return { packets: [], skipped: [] }

  // Past-due first (oldest first), then upcoming by due date.
  for (const charges of chargesByUnit.values()) {
    charges.sort((x, y) => {
      if (x.pastDue !== y.pastDue) return x.pastDue ? -1 : 1
      return x.dueDate.localeCompare(y.dueDate)
    })
  }

  const { data: ownershipData } = await supabase
    .from('ownerships')
    .select('unit_id, owner_name, owner_email, owner_user_id')
    .in('unit_id', unitIds)
    .is('valid_to', null)

  const ownerships = (ownershipData ?? []) as unknown as OwnershipRow[]

  const byEmail = new Map<string, ReminderPacket>()
  const skipped: SkippedOwner[] = []

  for (const o of ownerships) {
    const charges = chargesByUnit.get(o.unit_id)
    if (!charges || charges.length === 0) continue

    const label = unitLabels.get(o.unit_id) ?? 'Your property'
    const email = o.owner_email?.trim().toLowerCase()
    if (!email) {
      skipped.push({ ownerName: o.owner_name ?? 'Owner', unitLabel: label })
      continue
    }

    const property: ReminderProperty = {
      unitId: o.unit_id,
      label,
      charges,
      subtotal: round(charges.reduce((s, c) => s + c.balance, 0)),
    }

    const existing = byEmail.get(email)
    if (existing) {
      existing.properties.push(property)
      // Prefer a real name over the "Owner" placeholder.
      if (existing.ownerName === 'Owner' && o.owner_name) existing.ownerName = o.owner_name
      if (!existing.userId && o.owner_user_id) existing.userId = o.owner_user_id
    } else {
      byEmail.set(email, {
        email,
        ownerName: o.owner_name ?? 'Owner',
        userId: o.owner_user_id,
        properties: [property],
        totalDue: 0,
        pastDueTotal: 0,
        oldestDaysLate: 0,
        chargeCount: 0,
      })
    }
  }

  const packets = [...byEmail.values()]
  for (const p of packets) {
    let total = 0
    let pastDue = 0
    let oldest = 0
    let count = 0
    for (const prop of p.properties) {
      for (const c of prop.charges) {
        total += c.balance
        count += 1
        if (c.pastDue) {
          pastDue += c.balance
          if (c.daysLate > oldest) oldest = c.daysLate
        }
      }
    }
    p.totalDue = round(total)
    p.pastDueTotal = round(pastDue)
    p.oldestDaysLate = oldest
    p.chargeCount = count

    // Properties carrying arrears lead; then the largest balance.
    p.properties.sort((x, y) => {
      const xLate = x.charges.some((c) => c.pastDue)
      const yLate = y.charges.some((c) => c.pastDue)
      if (xLate !== yLate) return xLate ? -1 : 1
      return y.subtotal - x.subtotal
    })
  }

  packets.sort((x, y) => y.pastDueTotal - x.pastDueTotal || y.totalDue - x.totalDue)

  return { packets, skipped }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `rtk pnpm vitest run apps/hoa/src/lib/dues-reminders/packets.test.ts`
Expected: PASS, 11 tests

- [ ] **Step 6: Commit**

```bash
rtk git add apps/hoa/src/lib/dues-reminders/types.ts apps/hoa/src/lib/dues-reminders/packets.ts apps/hoa/src/lib/dues-reminders/packets.test.ts
rtk git commit -m "feat(dues): build per-person dues reminder packets"
```

---

### Task 3: Email renderer

Pure functions, no I/O. This is where the coverage concentrates.

**Files:**
- Create: `apps/hoa/src/lib/dues-reminders/render.ts`
- Create: `apps/hoa/src/lib/dues-reminders/render.test.ts`

**Interfaces:**
- Consumes: `ReminderPacket` from `./types`, `chargeTypeLabel` from `@/lib/assessment-labels`
- Produces:
  - `escapeHtml(s: string): string`
  - `formatUsd(n: number): string`
  - `formatDueDate(iso: string): string`
  - `amountSummary(packet: ReminderPacket): string`
  - `renderDuesTableHtml(packet: ReminderPacket): string`
  - `renderDuesTableText(packet: ReminderPacket): string`
  - `renderNoteHtml(note: string | undefined): string`
  - `renderShellHtml(opts: { note?: string; portalUrl: string }): string`
  - `renderShellText(opts: { note?: string; portalUrl: string }): string`
  - `SUBJECT_TEMPLATE: string`

- [ ] **Step 1: Write the failing test**

Create `apps/hoa/src/lib/dues-reminders/render.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { ReminderPacket } from './types'
import {
  amountSummary,
  escapeHtml,
  formatDueDate,
  formatUsd,
  renderDuesTableHtml,
  renderDuesTableText,
  renderNoteHtml,
  renderShellHtml,
  renderShellText,
} from './render'

function packet(overrides: Partial<ReminderPacket> = {}): ReminderPacket {
  return {
    email: 'dana@example.com',
    ownerName: 'Dana',
    userId: null,
    properties: [
      {
        unitId: 'unit-a',
        label: '14 Oak St',
        subtotal: 420,
        charges: [
          {
            id: 'a1', assessmentType: 'regular', dueDate: '2026-07-01',
            amount: 310, paid: 0, balance: 310, pastDue: true, daysLate: 39,
          },
          {
            id: 'a2', assessmentType: 'late_fee', dueDate: '2026-07-15',
            amount: 110, paid: 0, balance: 110, pastDue: true, daysLate: 25,
          },
        ],
      },
    ],
    totalDue: 420,
    pastDueTotal: 420,
    oldestDaysLate: 39,
    chargeCount: 2,
    ...overrides,
  }
}

const SIMPLE = packet({
  properties: [
    {
      unitId: 'unit-a',
      label: '14 Oak St',
      subtotal: 310,
      charges: [
        {
          id: 'a1', assessmentType: 'regular', dueDate: '2026-09-01',
          amount: 310, paid: 0, balance: 310, pastDue: false, daysLate: 0,
        },
      ],
    },
  ],
  totalDue: 310,
  pastDueTotal: 0,
  oldestDaysLate: 0,
  chargeCount: 1,
})

describe('formatting helpers', () => {
  it('formats money with cents', () => {
    expect(formatUsd(1240)).toBe('$1,240.00')
    expect(formatUsd(150.5)).toBe('$150.50')
  })

  it('formats a due date without a year', () => {
    expect(formatDueDate('2026-07-01')).toBe('Jul 1')
  })

  it('escapes HTML-significant characters', () => {
    expect(escapeHtml('<b>&"x"</b>')).toBe('&lt;b&gt;&amp;&quot;x&quot;&lt;/b&gt;')
  })
})

describe('amountSummary', () => {
  it('names both totals when something is past due', () => {
    expect(amountSummary(packet())).toBe('$420.00 due, $420.00 past due')
  })

  it('names only the total when nothing is late', () => {
    expect(amountSummary(SIMPLE)).toBe('$310.00 due')
  })
})

describe('renderDuesTableHtml', () => {
  it('labels a past-due charge in text, not colour alone', () => {
    const html = renderDuesTableHtml(packet())
    expect(html).toContain('39 days late')
    expect(html).toContain('25 days late')
  })

  it('uses friendly charge type names', () => {
    const html = renderDuesTableHtml(packet())
    expect(html).toContain('Regular dues')
    expect(html).toContain('Late fee')
  })

  it('shows the grand total and the past-due total', () => {
    const html = renderDuesTableHtml(packet())
    expect(html).toContain('$420.00')
  })

  it('omits the property heading and subtotal for a single property', () => {
    const html = renderDuesTableHtml(SIMPLE)
    expect(html).not.toContain('Subtotal')
    expect(html).not.toContain('>14 Oak St<')
  })

  it('shows a heading and subtotal per property when there are several', () => {
    const multi = packet({
      properties: [
        ...packet().properties,
        {
          unitId: 'unit-b',
          label: '22 Oak St · Unit B',
          subtotal: 200,
          charges: [
            {
              id: 'b1', assessmentType: 'special', dueDate: '2026-09-01',
              amount: 200, paid: 0, balance: 200, pastDue: false, daysLate: 0,
            },
          ],
        },
      ],
      totalDue: 620,
      chargeCount: 3,
    })
    const html = renderDuesTableHtml(multi)
    expect(html).toContain('14 Oak St')
    expect(html).toContain('22 Oak St · Unit B')
    expect(html).toContain('Subtotal')
  })

  it('escapes a property label so a crafted address cannot inject markup', () => {
    const nasty = packet({
      properties: [{ ...packet().properties[0], label: '<script>x</script>' }],
    })
    const html = renderDuesTableHtml(nasty)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('uses only inline styles — no style blocks or classes', () => {
    const html = renderDuesTableHtml(packet())
    expect(html).not.toContain('<style')
    expect(html).not.toContain('class=')
  })
})

describe('renderDuesTableText', () => {
  it('mirrors the HTML content in plain text', () => {
    const text = renderDuesTableText(packet())
    expect(text).toContain('Regular dues')
    expect(text).toContain('Jul 1')
    expect(text).toContain('$310.00')
    expect(text).toContain('39 days late')
    expect(text).not.toContain('<')
  })

  it('lists past-due charges before upcoming ones, matching the HTML order', () => {
    const text = renderDuesTableText(packet())
    expect(text.indexOf('Regular dues')).toBeLessThan(text.indexOf('Late fee'))
  })
})

describe('renderShellHtml', () => {
  it('carries the merge placeholders the send pipeline fills per recipient', () => {
    const html = renderShellHtml({ portalUrl: 'https://app.test/resident/dues' })
    expect(html).toContain('{{owner_name}}')
    expect(html).toContain('{{association_name}}')
    expect(html).toContain('{{dues_table}}')
  })

  it('links the CTA to the portal and never promises online payment', () => {
    const html = renderShellHtml({ portalUrl: 'https://app.test/resident/dues' })
    expect(html).toContain('https://app.test/resident/dues')
    expect(html).toContain('View my dues')
    expect(html).not.toContain('Pay now')
  })

  it('omits the note block entirely when no note is given', () => {
    expect(renderNoteHtml(undefined)).toBe('')
    expect(renderNoteHtml('   ')).toBe('')
  })

  it('escapes a note so a manager cannot inject markup into every resident inbox', () => {
    const html = renderShellHtml({ note: '<img src=x onerror=alert(1)>', portalUrl: 'https://app.test' })
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })

  it('preserves note line breaks as <br>', () => {
    const html = renderShellHtml({ note: 'line one\nline two', portalUrl: 'https://app.test' })
    expect(html).toContain('line one<br>line two')
  })
})

describe('renderShellText', () => {
  it('carries the plain-text merge placeholder and the note', () => {
    const text = renderShellText({ note: 'Pool assessment included.', portalUrl: 'https://app.test' })
    expect(text).toContain('{{dues_text}}')
    expect(text).toContain('Pool assessment included.')
    expect(text).not.toContain('<')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `rtk pnpm vitest run apps/hoa/src/lib/dues-reminders/render.test.ts`
Expected: FAIL — `Failed to resolve import "./render"`

- [ ] **Step 3: Write the implementation**

Create `apps/hoa/src/lib/dues-reminders/render.ts`:

```ts
/**
 * Email rendering for dues reminders. Deliberately pure — no database,
 * no env reads, no clock — so the whole layout is unit-testable against
 * fixture packets.
 *
 * Email-client constraints drive every choice here: table layout, inline
 * styles only, 600px max width, light-only palette with an explicit
 * background on every cell. Gmail and Outlook force-invert dark mode, and
 * a cell without its own background colour is where that goes wrong. Past
 * due is always marked with TEXT as well as colour for the same reason.
 */

import { chargeTypeLabel } from '@/lib/assessment-labels'
import type { ReminderPacket } from './types'

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const SUBJECT_TEMPLATE = '{{association_name}} dues — {{amount_summary}}'

export function formatUsd(n: number): string {
  return USD.format(n)
}

/** '2026-07-01' → 'Jul 1'. Parsed by hand rather than via Date so the
 *  result never shifts by a day in a negative-offset timezone. */
export function formatDueDate(iso: string): string {
  const [, month, day] = iso.split('-')
  return `${MONTHS[Number(month) - 1]} ${Number(day)}`
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function amountSummary(packet: ReminderPacket): string {
  const total = `${formatUsd(packet.totalDue)} due`
  return packet.pastDueTotal > 0
    ? `${total}, ${formatUsd(packet.pastDueTotal)} past due`
    : total
}

// ─── palette ─────────────────────────────────────────────────────────
const TEXT = '#1a1d21'
const MUTED = '#6b7280'
const LINE = '#eef0f2'
const PANEL = '#f9fafb'
const DANGER = '#b42318'
const DANGER_BG = '#fef3f2'
const DANGER_LINE = '#fbd5d1'

function chargeRow(
  charge: ReminderPacket['properties'][number]['charges'][number],
  isLast: boolean,
): string {
  const border = isLast ? '' : `border-bottom:1px solid ${LINE};`
  const late = charge.pastDue
    ? `<span style="display:inline-block;margin-top:3px;background:${DANGER_BG};color:${DANGER};font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;">${charge.daysLate} ${charge.daysLate === 1 ? 'day' : 'days'} late</span>`
    : ''

  return `<tr><td style="padding:11px 14px;${border}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="font-size:13px;font-weight:600;color:${TEXT};">${escapeHtml(chargeTypeLabel(charge.assessmentType))}<div style="font-size:11px;font-weight:400;color:${MUTED};margin-top:2px;">Due ${formatDueDate(charge.dueDate)}</div></td>
<td style="text-align:right;vertical-align:top;"><div style="font-size:14px;font-weight:700;color:${TEXT};">${formatUsd(charge.balance)}</div>${late}</td>
</tr></table></td></tr>`
}

export function renderDuesTableHtml(packet: ReminderPacket): string {
  const multi = packet.properties.length > 1

  const totalCard = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${DANGER_BG};border:1px solid ${DANGER_LINE};border-radius:10px;margin-bottom:20px;">
<tr><td style="padding:16px 18px;">
<div style="font-size:12px;color:${MUTED};font-weight:600;">Total due</div>
<div style="font-size:32px;font-weight:700;letter-spacing:-0.6px;margin-top:2px;color:${TEXT};">${formatUsd(packet.totalDue)}</div>
${
  packet.pastDueTotal > 0
    ? `<div style="margin-top:6px;font-size:12px;font-weight:700;color:${DANGER};">${formatUsd(packet.pastDueTotal)} past due &middot; oldest ${packet.oldestDaysLate} ${packet.oldestDaysLate === 1 ? 'day' : 'days'}</div>`
    : ''
}
</td></tr></table>`

  const blocks = packet.properties
    .map((property) => {
      const heading = multi
        ? `<div style="font-size:13px;font-weight:700;margin-bottom:8px;color:${TEXT};">${escapeHtml(property.label)}</div>`
        : ''
      const rows = property.charges
        .map((c, i) => chargeRow(c, i === property.charges.length - 1 && !multi))
        .join('')
      const subtotal = multi
        ? `<tr><td style="padding:10px 14px;border-top:1px solid ${LINE};font-size:12px;color:${MUTED};">Subtotal <span style="float:right;font-weight:700;color:${TEXT};">${formatUsd(property.subtotal)}</span></td></tr>`
        : ''
      return `${heading}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PANEL};border:1px solid ${LINE};border-radius:10px;margin-bottom:14px;">${rows}${subtotal}</table>`
    })
    .join('')

  return totalCard + blocks
}

export function renderDuesTableText(packet: ReminderPacket): string {
  const lines: string[] = []
  lines.push(`TOTAL DUE: ${formatUsd(packet.totalDue)}`)
  if (packet.pastDueTotal > 0) {
    lines.push(`Past due: ${formatUsd(packet.pastDueTotal)} (oldest ${packet.oldestDaysLate} days)`)
  }
  lines.push('')

  const multi = packet.properties.length > 1
  for (const property of packet.properties) {
    if (multi) lines.push(`-- ${property.label} --`)
    for (const c of property.charges) {
      const late = c.pastDue ? `  (${c.daysLate} ${c.daysLate === 1 ? 'day' : 'days'} late)` : ''
      lines.push(`  ${chargeTypeLabel(c.assessmentType)} — due ${formatDueDate(c.dueDate)} — ${formatUsd(c.balance)}${late}`)
    }
    if (multi) {
      lines.push(`  Subtotal: ${formatUsd(property.subtotal)}`)
      lines.push('')
    }
  }
  return lines.join('\n')
}

/** Exported so its empty case is testable directly — the alternative is a
 *  marker attribute in production email markup that exists only for a
 *  test assertion. */
export function renderNoteHtml(note: string | undefined): string {
  const trimmed = note?.trim()
  if (!trimmed) return ''
  const body = escapeHtml(trimmed).replace(/\r?\n/g, '<br>')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;border-radius:8px;margin-bottom:18px;">
<tr><td style="padding:12px 14px;font-size:13px;line-height:1.5;color:${TEXT};">${body}</td></tr></table>`
}

export function renderShellHtml(opts: { note?: string; portalUrl: string }): string {
  return `<div style="background:#f4f5f7;padding:18px;">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;font-family:Helvetica,Arial,sans-serif;color:${TEXT};">
<div style="padding:18px 22px;"><div style="font-size:11px;letter-spacing:1.2px;text-transform:uppercase;color:${MUTED};font-weight:700;">{{association_name}}</div></div>
<div style="padding:0 22px 22px;">
<p style="margin:0 0 4px;font-size:15px;font-weight:700;">Hi {{owner_name}},</p>
<p style="margin:0 0 18px;font-size:13px;line-height:1.5;color:#4b5563;">Here&rsquo;s everything currently outstanding on your account.</p>
${renderNoteHtml(opts.note)}
{{dues_table}}
<div style="text-align:center;"><a href="${escapeHtml(opts.portalUrl)}" style="display:inline-block;background:#111827;color:#ffffff;font-size:13px;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;">View my dues</a></div>
<p style="margin:16px 0 0;font-size:11px;line-height:1.6;color:${MUTED};text-align:center;">To pay or request a detailed statement, reply to this email or contact your community manager.</p>
</div>
<div style="padding:14px 22px;background:#fafafa;border-top:1px solid ${LINE};font-size:10px;line-height:1.6;color:#9ca3af;">Sent by {{association_name}} because you are an owner of record.</div>
</div></div>`
}

export function renderShellText(opts: { note?: string; portalUrl: string }): string {
  const note = opts.note?.trim()
  return [
    '{{association_name}}',
    '',
    'Hi {{owner_name}},',
    '',
    "Here's everything currently outstanding on your account.",
    '',
    ...(note ? [note, ''] : []),
    '{{dues_text}}',
    '',
    `View your dues: ${opts.portalUrl}`,
    '',
    'To pay or request a detailed statement, reply to this email or contact your community manager.',
    '',
    'Sent by {{association_name}} because you are an owner of record.',
  ].join('\n')
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `rtk pnpm vitest run apps/hoa/src/lib/dues-reminders/render.test.ts`
Expected: PASS, 19 tests

- [ ] **Step 5: Commit**

```bash
rtk git add apps/hoa/src/lib/dues-reminders/render.ts apps/hoa/src/lib/dues-reminders/render.test.ts
rtk git commit -m "feat(dues): render consolidated dues reminder emails"
```

---

### Task 4: `precomputed` audience kind

**Files:**
- Modify: `apps/hoa/src/lib/communications/audience.ts:21-30` (kind union), `:32-60` (definition), `:62-72` (recipient), `:95-112` (short-circuits), `:299-329` (`summaryFor`)
- Create: `apps/hoa/src/lib/communications/audience.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `AudienceKind` including `'precomputed'`; `AudienceDefinition.recipients?: ResolvedRecipient[]`; `AudienceDefinition.summary?: string`; `ResolvedRecipient.unitIds?: string[]`

- [ ] **Step 1: Write the failing test**

Create `apps/hoa/src/lib/communications/audience.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

const { mockFrom } = vi.hoisted(() => ({
  // Reaching the database for a precomputed audience is itself the defect
  // these tests guard against.
  mockFrom: vi.fn(() => {
    throw new Error('precomputed audiences must not query the database')
  }),
}))

import { resolveAudience, type ResolvedRecipient } from './audience'

const db = { from: mockFrom } as never

const RECIPIENTS: ResolvedRecipient[] = [
  {
    unitId: 'unit-a',
    unitIds: ['unit-a', 'unit-b'],
    unitAddress: '14 Oak St',
    unitNumber: null,
    recipientName: 'Dana',
    email: 'dana@example.com',
    phone: null,
    userId: 'user-1',
  },
]

describe('resolveAudience — precomputed', () => {
  it('returns the caller list verbatim without touching the database', async () => {
    const result = await resolveAudience(db, 'assoc-1', {
      kind: 'precomputed',
      recipients: RECIPIENTS,
    })

    expect(result.recipients).toEqual(RECIPIENTS)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('uses the caller-supplied summary when given', async () => {
    const result = await resolveAudience(db, 'assoc-1', {
      kind: 'precomputed',
      recipients: RECIPIENTS,
      summary: '1 owner with outstanding dues',
    })

    expect(result.summary).toBe('1 owner with outstanding dues')
  })

  it('falls back to a generic summary when none is supplied', async () => {
    const result = await resolveAudience(db, 'assoc-1', {
      kind: 'precomputed',
      recipients: RECIPIENTS,
    })

    expect(result.summary).toBe('1 recipient')
  })

  it('handles an empty recipient list without error', async () => {
    const result = await resolveAudience(db, 'assoc-1', { kind: 'precomputed' })

    expect(result.recipients).toEqual([])
    expect(result.summary).toBe('0 recipients')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `rtk pnpm vitest run apps/hoa/src/lib/communications/audience.test.ts`
Expected: FAIL — TypeScript rejects `kind: 'precomputed'`, or the call falls through to the unit query and throws

- [ ] **Step 3: Add the kind to the union**

In `apps/hoa/src/lib/communications/audience.ts`, append to the `AudienceKind` union (after the `'manual_emails'` line):

```ts
  | 'precomputed'             // caller-resolved recipients (dues reminders)
```

- [ ] **Step 4: Extend `AudienceDefinition` and `ResolvedRecipient`**

Add these fields to `AudienceDefinition`, after the existing `phones?: string[]` field:

```ts
  /** Populated when kind = 'precomputed'. The caller has already worked
   *  out exactly who should receive this and supplies the list directly.
   *  Used by dues reminders, where "who" depends on outstanding balances
   *  that this module has no business knowing about.
   *
   *  NOTE: send.ts strips this before persisting audience_definition —
   *  names and emails belong in communication_recipients, not duplicated
   *  into the campaign row. */
  recipients?: ResolvedRecipient[]
  /** Human summary for kind = 'precomputed'. Only the caller knows what
   *  the list means, so only the caller can describe it. */
  summary?: string
```

Add this field to `ResolvedRecipient`, after `unitId`:

```ts
  /** Every unit this recipient is responsible for. Present only for
   *  audiences that consolidate across properties; `unitId` stays the
   *  primary for the recipient row's FK. */
  unitIds?: string[]
```

- [ ] **Step 5: Add the short-circuit**

In `resolveAudience`, immediately after the `manual_emails` short-circuit (the block ending `return resolveManualContacts(...)`), add:

```ts
  // Precomputed — the caller already resolved this. No DB work at all,
  // and deliberately no validation: this path is server-only and its one
  // caller builds the list from its own queries.
  if (def.kind === 'precomputed') {
    const recipients = def.recipients ?? []
    return { recipients, summary: summaryFor(def, recipients.length) }
  }
```

- [ ] **Step 6: Add the `summaryFor` case**

In `summaryFor`, add before the closing brace of the switch:

```ts
    case 'precomputed':
      return def.summary ?? `${count} ${noun}`
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `rtk pnpm vitest run apps/hoa/src/lib/communications/audience.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 8: Verify no existing behaviour regressed**

Run: `rtk pnpm vitest run apps/hoa/src/lib && rtk pnpm --filter hoa exec tsc --noEmit`
Expected: all pass, no type errors

- [ ] **Step 9: Commit**

```bash
rtk git add apps/hoa/src/lib/communications/audience.ts apps/hoa/src/lib/communications/audience.test.ts
rtk git commit -m "feat(comms): add precomputed audience kind"
```

---

### Task 5: Per-recipient merge fields in the send pipeline

**Files:**
- Modify: `apps/hoa/src/lib/communications/send.ts:40-78` (schema), `:130-149` (persist), `:246-257` (merge bag)

**Interfaces:**
- Consumes: `AudienceDefinition` with `'precomputed'` from Task 4
- Produces: `SendCommunicationInput.extraMergeFields?: Record<string, Record<string, string | number>>` — keyed by recipient email

- [ ] **Step 1: Extend the Zod schema**

In `apps/hoa/src/lib/communications/send.ts`, add `'precomputed'` to the audience kind enum list (after `'manual_emails'`), then add these two fields to the `audience` object schema, after `phones`:

```ts
    recipients: z
      .array(
        z.object({
          unitId: z.string(),
          unitIds: z.array(z.string()).optional(),
          unitAddress: z.string().nullable(),
          unitNumber: z.string().nullable(),
          recipientName: z.string().nullable(),
          email: z.string().nullable(),
          phone: z.string().nullable(),
          userId: z.string().nullable(),
        }),
      )
      .optional(),
    summary: z.string().max(200).optional(),
```

Then add this top-level field to `SendSchema`, after `relatedResource`:

```ts
  /** Per-recipient merge values, keyed by recipient email. Lets a caller
   *  give every recipient a different body — dues reminders send each
   *  owner their own charge table through {{dues_table}}. */
  extraMergeFields: z
    .record(z.string(), z.record(z.string(), z.union([z.string(), z.number()])))
    .optional(),
```

- [ ] **Step 2: Write the failing test**

`sendCommunication` is a `'use server'` action that resolves an audience, writes two tables, and calls Resend — mocking all of that to assert one merge-bag spread would test the mock. The end-to-end assertion that `extraMergeFields` reaches the body lives in Task 7's `actions.test.ts`, where `sendCommunication` is mocked and its *input* is inspected.

What this task pins down instead is the contract that spread depends on: that `renderTemplate` injects a raw HTML fragment through a placeholder and renders an absent one as empty rather than throwing. Create `apps/hoa/src/lib/communications/send-merge.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { renderTemplate } from './templates'

// Guards the contract send.ts relies on: extraMergeFields values are
// spread into the same flat bag renderTemplate consumes, and an absent
// field renders as empty rather than throwing.
describe('merge bag contract', () => {
  it('renders a per-recipient HTML fragment through a placeholder', () => {
    const bag = {
      owner_name: 'Dana',
      dues_table: '<table><tr><td>$310.00</td></tr></table>',
    }
    const { rendered } = renderTemplate('Hi {{owner_name}}, {{dues_table}}', bag)

    expect(rendered).toBe('Hi Dana, <table><tr><td>$310.00</td></tr></table>')
  })

  it('renders an absent placeholder as empty and reports it', () => {
    const { rendered, missingFields } = renderTemplate('A{{nope}}B', { owner_name: 'Dana' })

    expect(rendered).toBe('AB')
    expect(missingFields).toEqual(['nope'])
  })
})
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `rtk pnpm vitest run apps/hoa/src/lib/communications/send-merge.test.ts`
Expected: PASS, 2 tests (this documents existing `renderTemplate` behaviour the next step depends on)

- [ ] **Step 4: Merge the per-recipient fields into the bag**

In `deliverOne`, replace the `bag` definition:

```ts
    const bag = {
      owner_name: recipient.recipient_name ?? 'Resident',
      recipient_name: recipient.recipient_name ?? 'Resident',
      association_name: associationName,
      unit_id: recipient.unit_id ?? '',
      // Caller-supplied per-recipient values win over the defaults above.
      // Keyed by email because that is the only identifier a precomputed
      // audience is guaranteed to share with the persisted recipient row.
      ...(value.extraMergeFields?.[recipient.email ?? ''] ?? {}),
    }
```

- [ ] **Step 5: Strip recipients before persisting the audience definition**

`audience_definition` is a jsonb column. Persisting the recipient array would duplicate every name and email into the campaign row, where they do not belong. Replace the `audience_definition` line in `commPayload`:

```ts
    // Strip the recipient array for precomputed audiences — names and
    // emails live in communication_recipients, and copying them here
    // would scatter PII across two tables for no benefit.
    audience_definition: (value.audience.kind === 'precomputed'
      ? { kind: 'precomputed', summary: value.audience.summary }
      : value.audience) as never,
```

- [ ] **Step 6: Typecheck and run the full lib suite**

Run: `rtk pnpm --filter hoa exec tsc --noEmit && rtk pnpm vitest run apps/hoa/src/lib`
Expected: no type errors, all tests pass

- [ ] **Step 7: Commit**

```bash
rtk git add apps/hoa/src/lib/communications/send.ts apps/hoa/src/lib/communications/send-merge.test.ts
rtk git commit -m "feat(comms): support per-recipient merge fields"
```

---

### Task 6: Last-reminded lookup

**Files:**
- Create: `apps/hoa/src/lib/dues-reminders/queries.ts`
- Create: `apps/hoa/src/lib/dues-reminders/queries.test.ts`

**Interfaces:**
- Consumes: `getSupabaseServerClient`
- Produces: `RECENT_REMINDER_DAYS: 7`, `DUES_REMINDER_RESOURCE_TYPE: 'dues_reminder'`, `getLastRemindedByEmail(associationId: string): Promise<Map<string, string>>` (email → most recent ISO timestamp)

- [ ] **Step 1: Write the failing test**

Create `apps/hoa/src/lib/dues-reminders/queries.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({ from: mockFrom })),
}))

import { getLastRemindedByEmail, RECENT_REMINDER_DAYS } from './queries'

function table(data: unknown[]) {
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'is', 'not', 'order', 'limit']) {
    builder[m] = () => builder
  }
  builder.then = (resolve: (v: { data: unknown[] }) => unknown) => resolve({ data })
  return builder
}

beforeEach(() => mockFrom.mockReset())

describe('RECENT_REMINDER_DAYS', () => {
  it('is a single source of truth for the repeat window', () => {
    expect(RECENT_REMINDER_DAYS).toBe(7)
  })
})

describe('getLastRemindedByEmail', () => {
  it('keeps the most recent send per email', async () => {
    mockFrom.mockReturnValue(
      table([
        { sent_at: '2026-08-01T10:00:00Z', communication_recipients: [{ email: 'dana@example.com' }] },
        { sent_at: '2026-08-06T10:00:00Z', communication_recipients: [{ email: 'dana@example.com' }] },
        { sent_at: '2026-07-02T10:00:00Z', communication_recipients: [{ email: 'sam@example.com' }] },
      ]),
    )

    const map = await getLastRemindedByEmail('assoc-1')

    expect(map.get('dana@example.com')).toBe('2026-08-06T10:00:00Z')
    expect(map.get('sam@example.com')).toBe('2026-07-02T10:00:00Z')
  })

  it('normalizes email case so lookups match packet keys', async () => {
    mockFrom.mockReturnValue(
      table([
        { sent_at: '2026-08-06T10:00:00Z', communication_recipients: [{ email: 'DANA@Example.com' }] },
      ]),
    )

    const map = await getLastRemindedByEmail('assoc-1')

    expect(map.get('dana@example.com')).toBe('2026-08-06T10:00:00Z')
  })

  it('returns an empty map when nothing has been sent', async () => {
    mockFrom.mockReturnValue(table([]))

    expect((await getLastRemindedByEmail('assoc-1')).size).toBe(0)
  })

  it('ignores rows with a null sent_at', async () => {
    mockFrom.mockReturnValue(
      table([{ sent_at: null, communication_recipients: [{ email: 'dana@example.com' }] }]),
    )

    expect((await getLastRemindedByEmail('assoc-1')).size).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `rtk pnpm vitest run apps/hoa/src/lib/dues-reminders/queries.test.ts`
Expected: FAIL — `Failed to resolve import "./queries"`

- [ ] **Step 3: Write the implementation**

Create `apps/hoa/src/lib/dues-reminders/queries.ts`:

```ts
import { getSupabaseServerClient } from '@/lib/supabase/server'

/** The window the UI calls "recently reminded". One constant so the
 *  panel's "Reminded 3d ago" line and the dialog's repeat warning can
 *  never disagree. */
export const RECENT_REMINDER_DAYS = 7

/** Marker written to communications.related_resource so a dues reminder
 *  is distinguishable from a hand-written dues announcement. */
export const DUES_REMINDER_RESOURCE_TYPE = 'dues_reminder'

interface CommRow {
  sent_at: string | null
  communication_recipients: { email: string | null }[] | null
}

/**
 * email (lowercased) → ISO timestamp of the most recent reminder sent to
 * them. Bounded to the last 200 campaigns; reminders are infrequent and
 * the panel only cares about the recent past.
 */
export async function getLastRemindedByEmail(
  associationId: string,
): Promise<Map<string, string>> {
  const supabase = await getSupabaseServerClient()

  const { data } = await supabase
    .from('communications')
    .select('sent_at, communication_recipients(email)')
    .eq('association_id', associationId)
    .eq('related_resource->>type', DUES_REMINDER_RESOURCE_TYPE)
    .not('sent_at', 'is', null)
    .order('sent_at', { ascending: false })
    .limit(200)

  const rows = (data ?? []) as unknown as CommRow[]
  const latest = new Map<string, string>()

  for (const row of rows) {
    if (!row.sent_at) continue
    for (const recipient of row.communication_recipients ?? []) {
      const email = recipient.email?.trim().toLowerCase()
      if (!email) continue
      const seen = latest.get(email)
      if (!seen || row.sent_at > seen) latest.set(email, row.sent_at)
    }
  }

  return latest
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `rtk pnpm vitest run apps/hoa/src/lib/dues-reminders/queries.test.ts`
Expected: PASS, 5 tests

The unit tests mock the client, so they cannot prove the `related_resource->>type` filter is valid PostgREST. Verify that separately against the real database before moving on — run the app, send one reminder (Task 10 covers this), and confirm the panel then shows a "Reminded today" line. If the filter is rejected, the fallback is to select `related_resource` unfiltered and narrow in JS:

```ts
const rows = (data ?? []).filter(
  (r) => (r.related_resource as { type?: string } | null)?.type === DUES_REMINDER_RESOURCE_TYPE,
)
```

- [ ] **Step 5: Commit**

```bash
rtk git add apps/hoa/src/lib/dues-reminders/queries.ts apps/hoa/src/lib/dues-reminders/queries.test.ts
rtk git commit -m "feat(dues): track when each owner was last reminded"
```

---

### Task 7: Preview and send actions

**Files:**
- Create: `apps/hoa/src/lib/dues-reminders/actions.ts`
- Create: `apps/hoa/src/lib/dues-reminders/actions.test.ts`

**Interfaces:**
- Consumes: `buildReminderPackets`, `getLastRemindedByEmail`, `RECENT_REMINDER_DAYS`, `DUES_REMINDER_RESOURCE_TYPE`, all of `render.ts`, `sendCommunication`, `getPrimaryAssociation`, `getCurrentOrg`, `getCurrentUserRoleInOrg`
- Produces:
  - `PacketSummary` — `{ email, ownerName, propertyCount, totalDue, pastDueTotal, oldestDaysLate, lastRemindedAt, recentlyReminded }`
  - `previewDuesReminders(input?: { emails?: string[] }): Promise<PreviewResult>`
  - `sendDuesReminders(input: { emails: string[]; note?: string }): Promise<SendResult>`

- [ ] **Step 1: Write the failing test**

Create `apps/hoa/src/lib/dues-reminders/actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReminderPacket } from './types'

const {
  mockGetOrg, mockGetRole, mockGetAssoc, mockBuild, mockLastReminded, mockSend, mockRevalidate,
} = vi.hoisted(() => ({
  mockGetOrg: vi.fn(async () => ({ id: 'org-1', name: 'Madison Park' })),
  mockGetRole: vi.fn(async () => 'admin' as string | null),
  mockGetAssoc: vi.fn(async () => ({ id: 'assoc-1', name: 'Madison Park' })),
  mockBuild: vi.fn(),
  mockLastReminded: vi.fn(async () => new Map<string, string>()),
  mockSend: vi.fn(async () => ({
    ok: true, communicationId: 'comm-1', recipientCount: 1,
    sentCount: 1, failedCount: 0, skippedCount: 0,
  })),
  mockRevalidate: vi.fn(),
}))

vi.mock('@/lib/orgs', () => ({ getCurrentOrg: mockGetOrg }))
vi.mock('@/lib/auth', () => ({ getCurrentUserRoleInOrg: mockGetRole }))
vi.mock('@/lib/vendors', () => ({ getPrimaryAssociation: mockGetAssoc }))
vi.mock('./packets', () => ({ buildReminderPackets: mockBuild }))
vi.mock('./queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./queries')>()),
  getLastRemindedByEmail: mockLastReminded,
}))
vi.mock('@/lib/communications/send', () => ({ sendCommunication: mockSend }))
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidate }))

import { previewDuesReminders, sendDuesReminders } from './actions'

const PACKET: ReminderPacket = {
  email: 'dana@example.com',
  ownerName: 'Dana',
  userId: 'user-1',
  properties: [
    {
      unitId: 'unit-a',
      label: '14 Oak St',
      subtotal: 310,
      charges: [{
        id: 'a1', assessmentType: 'regular', dueDate: '2026-07-01',
        amount: 310, paid: 0, balance: 310, pastDue: true, daysLate: 39,
      }],
    },
  ],
  totalDue: 310,
  pastDueTotal: 310,
  oldestDaysLate: 39,
  chargeCount: 1,
}

const CURRENT: ReminderPacket = {
  ...PACKET,
  email: 'sam@example.com',
  ownerName: 'Sam',
  pastDueTotal: 0,
  properties: [{
    ...PACKET.properties[0],
    charges: [{ ...PACKET.properties[0].charges[0], pastDue: false, daysLate: 0 }],
  }],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetOrg.mockResolvedValue({ id: 'org-1', name: 'Madison Park' })
  mockGetRole.mockResolvedValue('admin')
  mockGetAssoc.mockResolvedValue({ id: 'assoc-1', name: 'Madison Park' })
  mockBuild.mockResolvedValue({ packets: [PACKET, CURRENT], skipped: [] })
  mockLastReminded.mockResolvedValue(new Map())
  mockSend.mockResolvedValue({
    ok: true, communicationId: 'comm-1', recipientCount: 1,
    sentCount: 1, failedCount: 0, skippedCount: 0,
  })
  process.env.RESEND_API_KEY = 'test-key'
  process.env.EMAIL_FROM = 'HOA <hoa@test.com>'
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.test'
})

describe('previewDuesReminders authorization', () => {
  it('refuses a caller whose role is resident', async () => {
    mockGetRole.mockResolvedValue('resident')

    const result = await previewDuesReminders()

    expect(result).toEqual({
      ok: false,
      error: "You don't have permission to perform this action.",
    })
  })

  it('refuses before building any packets', async () => {
    mockGetRole.mockResolvedValue('resident')

    await previewDuesReminders()

    expect(mockBuild).not.toHaveBeenCalled()
  })
})

describe('previewDuesReminders', () => {
  it('includes only past-due owners when no explicit emails are given', async () => {
    const result = await previewDuesReminders()

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.packets.map((p) => p.email)).toEqual(['dana@example.com'])
  })

  it('includes a named owner even when nothing of theirs is past due', async () => {
    const result = await previewDuesReminders({ emails: ['sam@example.com'] })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.packets.map((p) => p.email)).toEqual(['sam@example.com'])
  })

  it('renders a real preview body for the first recipient', async () => {
    const result = await previewDuesReminders()

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.previewHtml).toContain('Dana')
    expect(result.previewHtml).toContain('$310.00')
    expect(result.previewHtml).toContain('39 days late')
  })

  it('reports email delivery as unconfigured when the API key is absent', async () => {
    delete process.env.RESEND_API_KEY

    const result = await previewDuesReminders()

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.emailConfigured).toBe(false)
  })

  it('flags owners reminded inside the recent window', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString()
    mockLastReminded.mockResolvedValue(new Map([['dana@example.com', twoDaysAgo]]))

    const result = await previewDuesReminders()

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.packets[0].recentlyReminded).toBe(true)
    expect(result.recentlyRemindedCount).toBe(1)
  })
})

describe('sendDuesReminders', () => {
  it('refuses to send when email delivery is not configured', async () => {
    delete process.env.RESEND_API_KEY

    const result = await sendDuesReminders({ emails: ['dana@example.com'] })

    expect(result).toEqual({
      ok: false,
      error: 'Email delivery is not configured, so nothing would be sent.',
    })
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('refuses when no recipient matches the requested emails', async () => {
    const result = await sendDuesReminders({ emails: ['nobody@example.com'] })

    expect(result.ok).toBe(false)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('sends one precomputed campaign carrying per-recipient merge fields', async () => {
    await sendDuesReminders({ emails: ['dana@example.com'] })

    expect(mockSend).toHaveBeenCalledTimes(1)
    const input = mockSend.mock.calls[0][0]
    expect(input.category).toBe('dues')
    expect(input.channels).toEqual(['email'])
    expect(input.audience.kind).toBe('precomputed')
    expect(input.audience.recipients).toHaveLength(1)
    expect(input.audience.recipients[0].email).toBe('dana@example.com')
    expect(input.relatedResource).toEqual({ type: 'dues_reminder', id: 'assoc-1' })
    expect(input.extraMergeFields['dana@example.com'].dues_table).toContain('$310.00')
    expect(input.extraMergeFields['dana@example.com'].amount_summary).toBe(
      '$310.00 due, $310.00 past due',
    )
  })

  it('carries every unit the owner is responsible for on the recipient', async () => {
    await sendDuesReminders({ emails: ['dana@example.com'] })

    const input = mockSend.mock.calls[0][0]
    expect(input.audience.recipients[0].unitIds).toEqual(['unit-a'])
    expect(input.audience.recipients[0].unitId).toBe('unit-a')
  })

  it('bakes an escaped manager note into the shared body', async () => {
    await sendDuesReminders({ emails: ['dana@example.com'], note: '<b>Pool</b> fee' })

    const input = mockSend.mock.calls[0][0]
    expect(input.bodyHtml).toContain('&lt;b&gt;Pool&lt;/b&gt; fee')
    expect(input.bodyHtml).not.toContain('<b>Pool</b>')
  })

  it('reports the counts the pipeline returned', async () => {
    mockSend.mockResolvedValue({
      ok: true, communicationId: 'comm-9', recipientCount: 2,
      sentCount: 2, failedCount: 0, skippedCount: 0,
    })

    const result = await sendDuesReminders({ emails: ['dana@example.com'] })

    expect(result).toEqual({ ok: true, communicationId: 'comm-9', sentCount: 2, failedCount: 0 })
  })

  it('surfaces a pipeline failure instead of claiming success', async () => {
    mockSend.mockResolvedValue({ ok: false, error: 'Resend rejected the sender' })

    const result = await sendDuesReminders({ emails: ['dana@example.com'] })

    expect(result).toEqual({ ok: false, error: 'Resend rejected the sender' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `rtk pnpm vitest run apps/hoa/src/lib/dues-reminders/actions.test.ts`
Expected: FAIL — `Failed to resolve import "./actions"`

- [ ] **Step 3: Write the implementation**

Create `apps/hoa/src/lib/dues-reminders/actions.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentOrg } from '@/lib/orgs'
import { getCurrentUserRoleInOrg } from '@/lib/auth'
import { getPrimaryAssociation } from '@/lib/vendors'
import { sendCommunication } from '@/lib/communications/send'
import { buildReminderPackets } from './packets'
import { DUES_REMINDER_RESOURCE_TYPE, RECENT_REMINDER_DAYS, getLastRemindedByEmail } from './queries'
import {
  SUBJECT_TEMPLATE,
  amountSummary,
  renderDuesTableHtml,
  renderDuesTableText,
  renderShellHtml,
  renderShellText,
} from './render'
import type { ReminderPacket, SkippedOwner } from './types'

const DENIED = "You don't have permission to perform this action."

export interface PacketSummary {
  email: string
  ownerName: string
  propertyCount: number
  totalDue: number
  pastDueTotal: number
  oldestDaysLate: number
  lastRemindedAt: string | null
  recentlyReminded: boolean
}

export type PreviewResult =
  | {
      ok: true
      packets: PacketSummary[]
      skipped: SkippedOwner[]
      totalOutstanding: number
      recentlyRemindedCount: number
      emailConfigured: boolean
      previewHtml: string
    }
  | { ok: false; error: string }

export type SendResult =
  | { ok: true; communicationId: string; sentCount: number; failedCount: number }
  | { ok: false; error: string }

/** Resend no-ops and reports success when unconfigured (see email.ts).
 *  Inheriting that would let the UI claim "14 sent" having sent nothing,
 *  so every entry point checks this first. */
function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
}

function portalUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  return `${base.replace(/\/$/, '')}/resident/dues`
}

async function loadContext(): Promise<
  { ok: true; associationId: string } | { ok: false; error: string }
> {
  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No organization found.' }

  const role = await getCurrentUserRoleInOrg(org.id)
  if (role !== 'admin' && role !== 'board') return { ok: false, error: DENIED }

  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }

  return { ok: true, associationId: assoc.id }
}

/** Bulk targets past-due owners only; an explicit email list targets
 *  exactly those people, past due or not — the manager picked them. */
function selectPackets(packets: ReminderPacket[], emails?: string[]): ReminderPacket[] {
  if (emails && emails.length > 0) {
    const wanted = new Set(emails.map((e) => e.trim().toLowerCase()))
    return packets.filter((p) => wanted.has(p.email))
  }
  return packets.filter((p) => p.pastDueTotal > 0)
}

export async function previewDuesReminders(
  input?: { emails?: string[] },
): Promise<PreviewResult> {
  const ctx = await loadContext()
  if (!ctx.ok) return ctx

  const { packets: all, skipped } = await buildReminderPackets(ctx.associationId)
  const selected = selectPackets(all, input?.emails)
  const lastReminded = await getLastRemindedByEmail(ctx.associationId)

  const cutoff = Date.now() - RECENT_REMINDER_DAYS * 86_400_000
  const summaries: PacketSummary[] = selected.map((p) => {
    const at = lastReminded.get(p.email) ?? null
    return {
      email: p.email,
      ownerName: p.ownerName,
      propertyCount: p.properties.length,
      totalDue: p.totalDue,
      pastDueTotal: p.pastDueTotal,
      oldestDaysLate: p.oldestDaysLate,
      lastRemindedAt: at,
      recentlyReminded: at !== null && Date.parse(at) >= cutoff,
    }
  })

  const first = selected[0]
  const previewHtml = first
    ? renderShellHtml({ portalUrl: portalUrl() })
        .replace('{{dues_table}}', renderDuesTableHtml(first))
        .replace(/\{\{owner_name\}\}/g, first.ownerName)
    : ''

  return {
    ok: true,
    packets: summaries,
    skipped,
    totalOutstanding: Math.round(selected.reduce((s, p) => s + p.totalDue, 0) * 100) / 100,
    recentlyRemindedCount: summaries.filter((s) => s.recentlyReminded).length,
    emailConfigured: emailConfigured(),
    previewHtml,
  }
}

export async function sendDuesReminders(
  input: { emails: string[]; note?: string },
): Promise<SendResult> {
  const ctx = await loadContext()
  if (!ctx.ok) return ctx

  if (!emailConfigured()) {
    return { ok: false, error: 'Email delivery is not configured, so nothing would be sent.' }
  }

  const { packets: all } = await buildReminderPackets(ctx.associationId)
  const selected = selectPackets(all, input.emails)
  if (selected.length === 0) {
    return { ok: false, error: 'None of the selected owners currently owe anything.' }
  }

  const note = input.note?.trim().slice(0, 500)

  const recipients = selected.map((p) => ({
    unitId: p.properties[0].unitId,
    unitIds: p.properties.map((prop) => prop.unitId),
    unitAddress: p.properties[0].label,
    unitNumber: null,
    recipientName: p.ownerName,
    email: p.email,
    phone: null,
    userId: p.userId,
  }))

  const extraMergeFields: Record<string, Record<string, string>> = {}
  for (const p of selected) {
    extraMergeFields[p.email] = {
      dues_table: renderDuesTableHtml(p),
      dues_text: renderDuesTableText(p),
      amount_summary: amountSummary(p),
    }
  }

  const result = await sendCommunication({
    category: 'dues',
    subject: SUBJECT_TEMPLATE,
    bodyHtml: renderShellHtml({ note, portalUrl: portalUrl() }),
    bodyText: renderShellText({ note, portalUrl: portalUrl() }),
    channels: ['email'],
    audience: {
      kind: 'precomputed',
      recipients,
      summary: `${selected.length} owner${selected.length === 1 ? '' : 's'} with outstanding dues`,
    },
    relatedResource: { type: DUES_REMINDER_RESOURCE_TYPE, id: ctx.associationId },
    extraMergeFields,
  })

  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath('/dues')
  return {
    ok: true,
    communicationId: result.communicationId,
    sentCount: result.sentCount,
    failedCount: result.failedCount,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `rtk pnpm vitest run apps/hoa/src/lib/dues-reminders/actions.test.ts`
Expected: PASS, 14 tests

- [ ] **Step 5: Typecheck**

Run: `rtk pnpm --filter hoa exec tsc --noEmit`
Expected: no errors.

If `tsc` rejects `mockSend.mock.calls[0][0]` as `never`, it is because `vi.fn(async () => …)` infers a zero-argument signature. Fix it by declaring the parameter type on the mock rather than casting the assertion:

```ts
mockSend: vi.fn(async (_input: Record<string, unknown>) => ({
  ok: true, communicationId: 'comm-1', recipientCount: 1,
  sentCount: 1, failedCount: 0, skippedCount: 0,
})),
```

- [ ] **Step 6: Commit**

```bash
rtk git add apps/hoa/src/lib/dues-reminders/actions.ts apps/hoa/src/lib/dues-reminders/actions.test.ts
rtk git commit -m "feat(dues): preview and send consolidated reminders"
```

---

### Task 8: Send dialog

**Files:**
- Create: `apps/hoa/src/app/(dashboard)/dues/SendRemindersDialog.tsx`

**Interfaces:**
- Consumes: `previewDuesReminders`, `sendDuesReminders`, `PacketSummary` from `@/lib/dues-reminders/actions`
- Produces: `<SendRemindersDialog emails={string[] | null} label={string} variant="primary" | "row" />` — `emails === null` means bulk (past-due owners)

The dialog pattern follows `apps/hoa/src/components/ai/AiRewriteButton.tsx`: `createPortal` to `document.body`, `role="dialog" aria-modal="true"`, `z-[100]` to clear the sticky header (z-20), sidebar (z-40) and dev role-switcher (z-50), Escape to close, backdrop click to close.

No test — the vitest environment is `node` and cannot render React. Behaviour is covered by Task 7's action tests; this component is wiring.

- [ ] **Step 1: Write the component**

```tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Loader2, Mail } from 'lucide-react'
import { Alert, Button, Textarea } from '@homeowner-portal/ui'
import {
  previewDuesReminders,
  sendDuesReminders,
  type PacketSummary,
} from '@/lib/dues-reminders/actions'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

interface PreviewState {
  packets: PacketSummary[]
  skipped: { ownerName: string; unitLabel: string }[]
  totalOutstanding: number
  recentlyRemindedCount: number
  emailConfigured: boolean
  previewHtml: string
}

export function SendRemindersDialog({
  emails,
  label,
  variant = 'row',
}: {
  emails: string[] | null
  label: string
  variant?: 'primary' | 'row'
}) {
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  useEffect(() => setMounted(true), [])

  const close = useCallback(() => {
    setOpen(false)
    setPreview(null)
    setError(null)
    setDone(null)
  }, [])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, close])

  async function load() {
    setOpen(true)
    setLoading(true)
    setError(null)
    const result = await previewDuesReminders(emails ? { emails } : undefined)
    setLoading(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setPreview(result)
  }

  async function send() {
    if (!preview) return
    setSending(true)
    setError(null)
    const result = await sendDuesReminders({
      emails: preview.packets.map((p) => p.email),
      note: note.trim() || undefined,
    })
    setSending(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setDone(
      result.failedCount > 0
        ? `Sent ${result.sentCount}, ${result.failedCount} failed.`
        : `Sent ${result.sentCount} reminder${result.sentCount === 1 ? '' : 's'}.`,
    )
    setPreview(null)
  }

  const count = preview?.packets.length ?? 0
  const canSend = Boolean(preview && count > 0 && preview.emailConfigured && !sending)

  const dialog = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Send dues reminders"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-background p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-foreground">Send dues reminders</h2>

        {loading ? (
          <p className="mt-6 flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Working out who owes what&hellip;
          </p>
        ) : null}

        {error ? (
          <Alert variant="error" className="mt-4">
            {error}
          </Alert>
        ) : null}

        {done ? (
          <div className="mt-4 space-y-4">
            <Alert variant="success">{done}</Alert>
            <Button onClick={close}>Close</Button>
          </div>
        ) : null}

        {preview && !done ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-foreground">
              <strong>{count}</strong> {count === 1 ? 'owner' : 'owners'} &middot;{' '}
              {usd.format(preview.totalOutstanding)} outstanding
            </p>

            {!preview.emailConfigured ? (
              <Alert variant="error">
                Email delivery isn&rsquo;t configured, so nothing would actually be sent. Set
                RESEND_API_KEY and EMAIL_FROM first.
              </Alert>
            ) : null}

            {preview.skipped.length > 0 ? (
              <Alert variant="warning">
                <span className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <span>
                    {preview.skipped.length}{' '}
                    {preview.skipped.length === 1 ? 'owner' : 'owners'} skipped &mdash; no email on
                    file: {preview.skipped.map((s) => s.ownerName).join(', ')}
                  </span>
                </span>
              </Alert>
            ) : null}

            {preview.recentlyRemindedCount > 0 ? (
              <Alert variant="warning">
                {preview.recentlyRemindedCount} of these {count === 1 ? 'was' : 'were'} reminded in
                the last 7 days.
              </Alert>
            ) : null}

            <div>
              <label htmlFor="reminder-note" className="text-sm font-medium text-foreground">
                Add a note (optional)
              </label>
              <Textarea
                id="reminder-note"
                value={note}
                maxLength={500}
                rows={3}
                placeholder="The pool assessment is due with September dues."
                onChange={(e) => setNote(e.target.value)}
                className="mt-1"
              />
            </div>

            {preview.previewHtml ? (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
                  Preview &mdash; {preview.packets[0]?.ownerName}
                </p>
                {/* srcdoc isolates the email's inline styles from the app's CSS. */}
                <iframe
                  title="Email preview"
                  srcDoc={preview.previewHtml}
                  className="h-80 w-full rounded-lg border border-border bg-white"
                />
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={close} disabled={sending}>
                Cancel
              </Button>
              <Button onClick={send} disabled={!canSend}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Send {count} reminder{count === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )

  return (
    <>
      {variant === 'primary' ? (
        <Button onClick={load}>
          <Mail className="h-4 w-4" />
          {label}
        </Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={load}>
          {label}
        </Button>
      )}
      {mounted && open ? createPortal(dialog, document.body) : null}
    </>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `rtk pnpm --filter hoa exec tsc --noEmit`
Expected: no errors. If `Alert` rejects `variant="success"` or `variant="warning"`, open `packages/ui/src/components/Alert.tsx`, read the actual variant union, and use the closest available one rather than adding a variant.

- [ ] **Step 3: Commit**

```bash
rtk git add "apps/hoa/src/app/(dashboard)/dues/SendRemindersDialog.tsx"
rtk git commit -m "feat(dues): add dues reminder preview and send dialog"
```

---

### Task 9: "Who owes" panel and page wiring

**Files:**
- Create: `apps/hoa/src/app/(dashboard)/dues/WhoOwesPanel.tsx`
- Modify: `apps/hoa/src/app/(dashboard)/dues/page.tsx` (import and render the panel above the period tables)

**Interfaces:**
- Consumes: `buildReminderPackets`, `getLastRemindedByEmail`, `RECENT_REMINDER_DAYS`, `SendRemindersDialog`
- Produces: `<WhoOwesPanel associationId={string} />` — an async server component

- [ ] **Step 1: Write the panel**

Create `apps/hoa/src/app/(dashboard)/dues/WhoOwesPanel.tsx`:

```tsx
import { Badge, Button, Card } from '@homeowner-portal/ui'
import { buildReminderPackets } from '@/lib/dues-reminders/packets'
import { getLastRemindedByEmail, RECENT_REMINDER_DAYS } from '@/lib/dues-reminders/queries'
import { SendRemindersDialog } from './SendRemindersDialog'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

function agoLabel(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  if (days <= 0) return 'Reminded today'
  return `Reminded ${days}d ago`
}

/**
 * The panel lists everyone with a balance, because the manager needs the
 * whole picture. The bulk button deliberately reaches a narrower set —
 * only past-due owners — so its label carries the real count rather than
 * a bare "Send reminders".
 */
export async function WhoOwesPanel({ associationId }: { associationId: string }) {
  const [{ packets, skipped }, lastReminded] = await Promise.all([
    buildReminderPackets(associationId),
    getLastRemindedByEmail(associationId),
  ])

  if (packets.length === 0) return null

  const pastDueCount = packets.filter((p) => p.pastDueTotal > 0).length
  const totalOutstanding = packets.reduce((s, p) => s + p.totalDue, 0)
  const totalPastDue = packets.reduce((s, p) => s + p.pastDueTotal, 0)
  const cutoff = Date.now() - RECENT_REMINDER_DAYS * 86_400_000

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background/50 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Who owes</p>
          <p className="text-xs text-muted">
            {packets.length} {packets.length === 1 ? 'owner' : 'owners'} ·{' '}
            {usd.format(totalOutstanding)} outstanding
            {totalPastDue > 0 ? ` · ${usd.format(totalPastDue)} past due` : ''}
          </p>
        </div>
        {pastDueCount > 0 ? (
          <SendRemindersDialog
            emails={null}
            variant="primary"
            label={`Send ${pastDueCount} reminder${pastDueCount === 1 ? '' : 's'}`}
          />
        ) : (
          // Disabled rather than hidden: everyone here owes something, so a
          // vanishing button reads as a bug. The label says why it is off.
          <Button disabled>No one is past due</Button>
        )}
      </div>

      <ul className="divide-y divide-border">
        {packets.map((p) => {
          const at = lastReminded.get(p.email) ?? null
          const recent = at !== null && Date.parse(at) >= cutoff
          return (
            <li key={p.email} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{p.ownerName}</p>
                <p className="text-xs text-muted">
                  {p.properties.length}{' '}
                  {p.properties.length === 1 ? 'property' : 'properties'}
                  {at ? ` · ${agoLabel(at)}` : ''}
                </p>
              </div>
              <span className="font-mono text-sm text-foreground">{usd.format(p.totalDue)}</span>
              {p.pastDueTotal > 0 ? (
                <Badge variant="destructive" size="sm">
                  {p.oldestDaysLate}d late
                </Badge>
              ) : (
                <Badge variant="outline" size="sm">
                  current
                </Badge>
              )}
              <SendRemindersDialog
                emails={[p.email]}
                label={recent ? 'Remind again' : 'Remind'}
              />
            </li>
          )
        })}
      </ul>

      {skipped.length > 0 ? (
        <p className="border-t border-border px-4 py-2 text-xs text-muted">
          {skipped.length} {skipped.length === 1 ? 'owner has' : 'owners have'} no email on file and
          cannot be reminded: {skipped.map((s) => s.ownerName).join(', ')}
        </p>
      ) : null}
    </Card>
  )
}
```

- [ ] **Step 2: Wire it into the dues page**

In `apps/hoa/src/app/(dashboard)/dues/page.tsx`, add the import beside the other local imports:

```ts
import { WhoOwesPanel } from './WhoOwesPanel'
```

Then render it immediately before the `{error ? (` block, so it sits above the period tables:

```tsx
      <WhoOwesPanel associationId={assoc.id} />

      {error ? (
```

- [ ] **Step 3: Typecheck and run the full suite**

Run: `rtk pnpm --filter hoa exec tsc --noEmit && rtk pnpm vitest run apps/hoa/src`
Expected: no type errors, all tests pass

- [ ] **Step 4: Build**

Run: `rtk pnpm --filter hoa build`
Expected: build succeeds. A `'use server'` export error here means a non-async export leaked into `actions.ts` — every export in that file must be an async function or a type.

- [ ] **Step 5: Commit**

```bash
rtk git add "apps/hoa/src/app/(dashboard)/dues/WhoOwesPanel.tsx" "apps/hoa/src/app/(dashboard)/dues/page.tsx"
rtk git commit -m "feat(dues): surface who owes and wire up reminders"
```

---

### Task 10: Manual verification

Automated tests cover the logic; this task proves the feature works against a real database and a real inbox. No code is written here.

**Files:** none

- [ ] **Step 1: Check the e2e harness before promising a spec**

Read `apps/hoa/e2e/inbox.spec.ts`. If it establishes an authenticated manager session that a new spec could reuse, write `apps/hoa/e2e/dues-reminders.spec.ts` covering: load `/dues` → the "Who owes" panel renders → click `Remind` → the dialog shows a preview → cancel. If it does **not** provide reusable auth, **write no e2e spec** and state plainly in the final report that e2e was skipped and why. Do not write a spec that skips itself.

- [ ] **Step 2: Verify against the local app**

Run the dev server and confirm, in order:

1. `/dues` shows the "Who owes" panel above the period tables, listing owners with balances.
2. A single-property, single-charge owner's preview shows **no** property heading and **no** subtotal.
3. A multi-property owner's preview shows one block per property, each with a subtotal, plus a grand total.
4. With `RESEND_API_KEY` unset, the dialog shows the "not configured" banner and the send button is disabled.
5. With it set, sending produces a toast, and `/communications` shows **one** campaign row with the right recipient count.

- [ ] **Step 3: Verify the delivered email**

Send one reminder to a real address. Confirm in the received mail:
- the subject carries both amounts when something is past due;
- past-due rows read "N days late" as text;
- the layout survives the client's dark mode with legible contrast;
- "View my dues" opens `/resident/dues`;
- the plain-text alternative lists the same charges in the same order.

- [ ] **Step 4: Report**

State what passed, what failed, and anything skipped — including e2e if it was skipped in Step 1. Do not report the feature complete unless steps 2 and 3 both passed.
