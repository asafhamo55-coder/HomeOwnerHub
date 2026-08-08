# Properties Phase 1B — Split-View UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the properties table and its 639-line stacked detail page with an inbox-style split view whose left pane shows what needs attention and whose right pane is a tabbed property panel.

**Architecture:** Mirror `(dashboard)/inbox` exactly — `/properties` renders the list plus a placeholder, `/properties/<id>` renders the same list (hidden below `lg`) plus the panel. Each route fetches independently. Data comes from `listProperties` against `hoa_property_list_v` (Phase 1A, already shipped and measured at 41 ms for 5,000 rows). The phone experience falls out of the same two routes, with no separate mobile build.

**Tech Stack:** Next.js App Router (RSC), TypeScript, `@homeowner-portal/ui`, Tailwind semantic tokens, lucide-react, date-fns, vitest for pure logic.

**Source spec:** `docs/superpowers/specs/2026-08-02-properties-page-uplift-design.md`
**Depends on:** Phase 1A — `apps/hoa/src/lib/properties/list.ts`, `list-params.ts`, view `hoa_property_list_v` (migrations 0039/0040, both applied to production).
**Out of scope:** Phase 2 entirely — inline email/reply, log-violation-from-panel, bulk actions, photo attachments on violations.

## Global Constraints

- **Prefix every shell command with `rtk`**, including inside `&&` chains.
- **`rtk pnpm typecheck` is broken here** — use `rtk proxy pnpm typecheck`.
- **`pnpm lint` fails repo-wide** (ESLint was never configured). Do not run it, do not fix it.
- **vitest is node-only and pure-modules-only.** No component test harness exists and no Playwright runner is configured. Only pure modules get automated tests; UI correctness is verified by build + typecheck + a human checklist.
- **No new dependencies. No new UI library. No new color tokens.** Build from `@homeowner-portal/ui` and existing Tailwind semantic tokens only. This was an explicit user constraint.
- **There are no `text-success` / `text-warning` utilities.** The convention for status colour is literal `emerald-700 dark:emerald-400` / `amber-700 dark:amber-400` pairs — documented in `inbox/ThreadList.tsx:19-25` — plus the `destructive` token.
- **Colour is never the only cue.** Every severity dot carries a text label; pills spell out the reason.
- **No PII in logs or test fixtures.**

## Reference implementations — read before writing code

| What | Where | Why |
| --- | --- | --- |
| Split-view shell | `(dashboard)/inbox/page.tsx:136-188` | The `aside` + `section` structure and its responsive classes |
| Detail-route variant | `(dashboard)/inbox/[id]/page.tsx:92-133` | How the list is re-rendered and hidden below `lg` |
| Left-pane rows | `(dashboard)/inbox/ThreadList.tsx` | Row anatomy, selected state, colour convention |
| Pagination | `(dashboard)/inbox/page.tsx:154-182` | "Showing X–Y of Z" with Previous/Next |
| Page being replaced | `(dashboard)/properties/[id]/page.tsx` (639 lines) | Every section moving into a tab |

**Known API detail:** `Tabs` (`packages/ui/src/components/Tabs.tsx`) renders plain `<a>` elements, so a tab click is a full page load, not a client navigation. It accepts an explicit `active` boolean which overrides pathname matching — that is how `?tab=` is supported. Use it as-is; do not rewrite the shared primitive, which five other pages depend on.

---

### Task 1: Severity presentation (pure, tested)

Turning a `severityRank` and its counts into a dot tone, a label, and reason pills is the one part of the left pane that is pure logic, so it is written and tested on its own.

**Files:**
- Create: `apps/hoa/src/lib/properties/severity.ts`
- Create: `apps/hoa/src/lib/properties/severity.test.ts`

**Interfaces:**
- Consumes: `PropertyListRow` from `./list` (fields `severityRank`, `balance`, `daysOverdue`, `openViolations`, `violationsPastCure`, `threadsNeedingReply`, `hasOwner`, `hasTenure`, `hasUnitLink`).
- Produces:
  - `type SeverityTone = 'red' | 'amber' | 'slate' | 'clear'`
  - `function severityTone(rank: number): SeverityTone`
  - `function severityLabel(rank: number): string`
  - `function severityDotClass(tone: SeverityTone): string`
  - `interface ReasonPill { text: string; tone: SeverityTone }`
  - `function reasonPills(row: SeveritySource): ReasonPill[]`
  - `interface SeveritySource { balance: number; daysOverdue: number; openViolations: number; violationsPastCure: number; threadsNeedingReply: number; hasOwner: boolean; hasTenure: boolean; hasUnitLink: boolean }`

- [ ] **Step 1: Write the failing test**

Create `apps/hoa/src/lib/properties/severity.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  reasonPills,
  severityDotClass,
  severityLabel,
  severityTone,
  type SeveritySource,
} from './severity'

const clean: SeveritySource = {
  balance: 0,
  daysOverdue: 0,
  openViolations: 0,
  violationsPastCure: 0,
  threadsNeedingReply: 0,
  hasOwner: true,
  hasTenure: true,
  hasUnitLink: true,
}

describe('severityTone', () => {
  it('maps ranks 1 and 2 to red', () => {
    expect(severityTone(1)).toBe('red')
    expect(severityTone(2)).toBe('red')
  })
  it('maps ranks 3 and 4 to amber', () => {
    expect(severityTone(3)).toBe('amber')
    expect(severityTone(4)).toBe('amber')
  })
  it('maps rank 5 to slate — a data gap is not urgency', () => {
    expect(severityTone(5)).toBe('slate')
  })
  it('maps rank 6 to clear', () => {
    expect(severityTone(6)).toBe('clear')
  })
  it('treats an unknown rank as clear rather than throwing', () => {
    expect(severityTone(99)).toBe('clear')
    expect(severityTone(0)).toBe('clear')
  })
})

describe('severityLabel', () => {
  it('gives every tone a text label, so colour is never the only cue', () => {
    for (const rank of [1, 2, 3, 4, 5, 6]) {
      expect(severityLabel(rank).length).toBeGreaterThan(0)
    }
  })
  it('names the specific reason for the urgent ranks', () => {
    expect(severityLabel(1)).toMatch(/cure/i)
    expect(severityLabel(2)).toMatch(/past due/i)
  })
})

describe('severityDotClass', () => {
  it('uses the destructive token for red and literal amber for amber', () => {
    expect(severityDotClass('red')).toContain('destructive')
    expect(severityDotClass('amber')).toContain('amber')
  })
  it('returns a distinct class per tone', () => {
    const all = (['red', 'amber', 'slate', 'clear'] as const).map(severityDotClass)
    expect(new Set(all).size).toBe(4)
  })
})

describe('reasonPills', () => {
  it('returns nothing for a clean property', () => {
    expect(reasonPills(clean)).toEqual([])
  })

  it('reports past-cure violations as red and names the count', () => {
    const pills = reasonPills({ ...clean, openViolations: 2, violationsPastCure: 1 })
    expect(pills).toContainEqual({ text: '1 past cure date', tone: 'red' })
  })

  it('reports open violations in the cure window as amber', () => {
    const pills = reasonPills({ ...clean, openViolations: 2 })
    expect(pills).toContainEqual({ text: '2 violations', tone: 'amber' })
  })

  it('pluralises a single violation correctly', () => {
    const pills = reasonPills({ ...clean, openViolations: 1 })
    expect(pills).toContainEqual({ text: '1 violation', tone: 'amber' })
  })

  it('reports unread mail as amber', () => {
    const pills = reasonPills({ ...clean, threadsNeedingReply: 3 })
    expect(pills).toContainEqual({ text: '3 unread', tone: 'amber' })
  })

  it('reports a data gap as slate', () => {
    const pills = reasonPills({ ...clean, hasUnitLink: false })
    expect(pills).toContainEqual({ text: 'Missing data', tone: 'slate' })
  })

  it('collapses several data gaps into one pill', () => {
    const pills = reasonPills({ ...clean, hasOwner: false, hasTenure: false, hasUnitLink: false })
    expect(pills.filter((p) => p.text === 'Missing data')).toHaveLength(1)
  })

  it('does not emit a balance pill — balance renders in its own column', () => {
    const pills = reasonPills({ ...clean, balance: 1340, daysOverdue: 92 })
    expect(pills.every((p) => !/\$/.test(p.text))).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk pnpm vitest run apps/hoa/src/lib/properties/severity.test.ts`
Expected: FAIL — cannot resolve `./severity`.

- [ ] **Step 3: Write the implementation**

Create `apps/hoa/src/lib/properties/severity.ts`:

```ts
// Presentation for the left pane's severity signal. Pure and free of React
// and Supabase imports so it runs under vitest's node-only harness.
//
// The rank itself is computed in SQL (hoa_property_list_v, migration 0039)
// so ordering can be a plain indexed column sort. This module only decides
// how a rank *reads*.

export type SeverityTone = 'red' | 'amber' | 'slate' | 'clear'

export interface SeveritySource {
  balance: number
  daysOverdue: number
  openViolations: number
  violationsPastCure: number
  threadsNeedingReply: number
  hasOwner: boolean
  hasTenure: boolean
  hasUnitLink: boolean
}

export interface ReasonPill {
  text: string
  tone: SeverityTone
}

export function severityTone(rank: number): SeverityTone {
  if (rank === 1 || rank === 2) return 'red'
  if (rank === 3 || rank === 4) return 'amber'
  if (rank === 5) return 'slate'
  return 'clear'
}

/**
 * Every dot carries one of these as its tooltip and screen-reader text.
 * Colour alone must never carry the meaning.
 */
export function severityLabel(rank: number): string {
  switch (rank) {
    case 1:
      return 'Violation past its cure date'
    case 2:
      return 'Past due balance'
    case 3:
      return 'Open violation'
    case 4:
      return 'Mail awaiting reply'
    case 5:
      return 'Missing property data'
    default:
      return 'Nothing outstanding'
  }
}

// No `text-success` / `text-warning` utilities exist in the shared Tailwind
// config — only the CSS-variable tokens. Literal emerald/amber with dark:
// pairs is the established convention (inbox/ThreadList.tsx:19-25).
export function severityDotClass(tone: SeverityTone): string {
  switch (tone) {
    case 'red':
      return 'bg-destructive'
    case 'amber':
      return 'bg-amber-500 dark:bg-amber-400'
    case 'slate':
      return 'bg-muted'
    default:
      return 'bg-border'
  }
}

/**
 * Short reasons shown under the address. Balance is deliberately excluded —
 * it renders right-aligned in its own column, and repeating it as a pill
 * makes the row noisier without adding information.
 */
export function reasonPills(row: SeveritySource): ReasonPill[] {
  const pills: ReasonPill[] = []

  if (row.violationsPastCure > 0) {
    pills.push({
      text: `${row.violationsPastCure} past cure date`,
      tone: 'red',
    })
  } else if (row.openViolations > 0) {
    pills.push({
      text: `${row.openViolations} ${row.openViolations === 1 ? 'violation' : 'violations'}`,
      tone: 'amber',
    })
  }

  if (row.threadsNeedingReply > 0) {
    pills.push({ text: `${row.threadsNeedingReply} unread`, tone: 'amber' })
  }

  // One pill however many fields are missing — three pills saying the same
  // thing is noise, and the panel names the specifics.
  if (!row.hasOwner || !row.hasTenure || !row.hasUnitLink) {
    pills.push({ text: 'Missing data', tone: 'slate' })
  }

  return pills
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk pnpm vitest run apps/hoa/src/lib/properties/severity.test.ts`
Expected: PASS, 16 tests.

- [ ] **Step 5: Typecheck and full suite**

Run: `rtk proxy pnpm typecheck && rtk pnpm test:unit`
Expected: clean; suite up by 16.

- [ ] **Step 6: Commit**

```bash
rtk git add apps/hoa/src/lib/properties/severity.ts apps/hoa/src/lib/properties/severity.test.ts
rtk git commit -m "feat(hoa): severity presentation for the properties list

Turns the SQL-computed severity_rank into a dot tone, a text label, and
reason pills. Every dot has a label so colour is never the only cue.
Balance is deliberately not a pill — it has its own column."
```

---

### Task 2: Left pane

**Files:**
- Create: `apps/hoa/src/app/(dashboard)/properties/PropertyList.tsx`
- Create: `apps/hoa/src/app/(dashboard)/properties/PropertyListFilters.tsx`

**Interfaces:**
- Consumes: `PropertyListRow` (`@/lib/properties/list`), `PropertyListParams`/`PROPERTY_PAGE_SIZE` (`@/lib/properties/list-params`), `severityTone`/`severityLabel`/`severityDotClass`/`reasonPills` (Task 1).
- Produces:
  - `function PropertyList(props: { rows: PropertyListRow[]; selectedId?: string; params: PropertyListParams; total: number }): JSX.Element`
  - `function PropertyListFilters(props: { params: PropertyListParams; counts: { attention: number; all: number } }): JSX.Element`

- [ ] **Step 1: Write `PropertyList.tsx`**

A server component. Mirror `inbox/ThreadList.tsx` structurally: a `<ul className="divide-y divide-border">`, each row a `<Link>` with `border-l-4 border-primary bg-primary/5` when selected.

```tsx
import Link from 'next/link'
import type { PropertyListRow } from '@/lib/properties/list'
import type { PropertyListParams } from '@/lib/properties/list-params'
import {
  reasonPills,
  severityDotClass,
  severityLabel,
  severityTone,
} from '@/lib/properties/severity'

function money(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

/** Preserves the current filter/sort/search/page when linking to a property. */
function queryFor(params: PropertyListParams): string {
  const q = new URLSearchParams()
  if (params.filter !== 'attention') q.set('filter', params.filter)
  if (params.sort !== 'severity') q.set('sort', params.sort)
  if (params.search) q.set('q', params.search)
  if (params.page > 1) q.set('page', String(params.page))
  const s = q.toString()
  return s ? `?${s}` : ''
}

export function PropertyList({
  rows,
  selectedId,
  params,
}: {
  rows: PropertyListRow[]
  selectedId?: string
  params: PropertyListParams
}) {
  if (rows.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted">
        {params.search
          ? `No properties match “${params.search}”.`
          : params.filter === 'attention'
            ? 'Nothing needs attention right now.'
            : 'No properties yet.'}
      </div>
    )
  }

  const qs = queryFor(params)

  return (
    <ul className="divide-y divide-border">
      {rows.map((row) => {
        const tone = severityTone(row.severityRank)
        const pills = reasonPills(row)
        const selected = row.id === selectedId
        return (
          <li key={row.id}>
            <Link
              href={`/properties/${row.id}${qs}`}
              className={`block px-3 py-2.5 transition-colors hover:bg-muted/10 ${
                selected ? 'border-l-4 border-primary bg-primary/5' : ''
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${severityDotClass(tone)}`}
                    title={severityLabel(row.severityRank)}
                    aria-hidden
                  />
                  <span className="sr-only">{severityLabel(row.severityRank)}</span>
                  <span className="truncate text-sm font-semibold text-foreground">
                    {row.address}
                    {row.unitNumber ? (
                      <span className="font-normal text-muted"> · {row.unitNumber}</span>
                    ) : null}
                  </span>
                </span>
                {row.balance > 0 ? (
                  <span className="shrink-0 text-xs font-bold tabular-nums text-destructive">
                    {money(row.balance)}
                  </span>
                ) : null}
              </div>
              <p className="truncate pl-4 text-xs text-muted">
                {[row.ownerName ?? 'No owner on file', row.tenure ? row.tenure.replace(/_/g, '-') : null]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {pills.length > 0 ? (
                <div className="flex flex-wrap gap-1 pl-4 pt-1">
                  {pills.map((p) => (
                    <span
                      key={p.text}
                      className={`rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
                        p.tone === 'red'
                          ? 'bg-destructive/10 text-destructive'
                          : p.tone === 'amber'
                            ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                            : 'bg-muted/10 text-muted'
                      }`}
                    >
                      {p.text}
                    </span>
                  ))}
                </div>
              ) : null}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
```

- [ ] **Step 2: Write `PropertyListFilters.tsx`**

Search form plus filter chips plus a sort control. All URL-driven so the view is shareable, matching the inbox's chip styling (`bg-primary text-primary-fg` when active).

```tsx
import Link from 'next/link'
import { Search } from 'lucide-react'
import { Input } from '@homeowner-portal/ui'
import type { PropertyListParams, PropertyFilter, PropertySort } from '@/lib/properties/list-params'

const FILTERS: Array<{ key: PropertyFilter; label: string }> = [
  { key: 'attention', label: 'Needs attention' },
  { key: 'all', label: 'All' },
  { key: 'owner_occupied', label: 'Owner-occupied' },
  { key: 'leased', label: 'Leased' },
  { key: 'unknown', label: 'Unknown' },
]

const SORTS: Array<{ key: PropertySort; label: string }> = [
  { key: 'severity', label: 'Severity' },
  { key: 'address', label: 'Address' },
  { key: 'balance', label: 'Balance' },
]

function hrefWith(params: PropertyListParams, patch: Partial<Record<string, string>>): string {
  const q = new URLSearchParams()
  const filter = patch.filter ?? params.filter
  const sort = patch.sort ?? params.sort
  if (filter !== 'attention') q.set('filter', filter)
  if (sort !== 'severity') q.set('sort', sort)
  if (params.search) q.set('q', params.search)
  // Changing a filter or sort always returns to page 1 — staying on page 7
  // of a list that just became 2 pages long shows an empty pane.
  const s = q.toString()
  return s ? `/properties?${s}` : '/properties'
}

export function PropertyListFilters({ params }: { params: PropertyListParams }) {
  return (
    <div className="space-y-2 border-b border-border p-2">
      <form action="/properties" method="get" className="flex items-center gap-2">
        {params.filter !== 'attention' ? (
          <input type="hidden" name="filter" value={params.filter} />
        ) : null}
        {params.sort !== 'severity' ? (
          <input type="hidden" name="sort" value={params.sort} />
        ) : null}
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <Input
            type="search"
            name="q"
            defaultValue={params.search}
            placeholder="Search address, unit, owner, email"
            aria-label="Search properties"
            className="pl-8 text-sm"
          />
        </div>
      </form>

      <nav aria-label="Filter properties" className="flex flex-wrap gap-1 text-xs">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={hrefWith(params, { filter: f.key })}
            aria-current={params.filter === f.key ? 'page' : undefined}
            className={`rounded-full px-2.5 py-1 ${
              params.filter === f.key
                ? 'bg-primary text-primary-fg'
                : 'text-muted hover:bg-muted/10'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      <div className="flex items-center gap-1 text-[11px] text-muted">
        <span className="uppercase tracking-wide">Sort</span>
        {SORTS.map((s) => (
          <Link
            key={s.key}
            href={hrefWith(params, { sort: s.key })}
            aria-current={params.sort === s.key ? 'page' : undefined}
            className={`rounded px-1.5 py-0.5 ${
              params.sort === s.key ? 'font-semibold text-foreground' : 'hover:text-foreground'
            }`}
          >
            {s.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `rtk proxy pnpm typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
rtk git add "apps/hoa/src/app/(dashboard)/properties/PropertyList.tsx" "apps/hoa/src/app/(dashboard)/properties/PropertyListFilters.tsx"
rtk git commit -m "feat(hoa): properties left pane — rows, filters, sort

Mirrors inbox/ThreadList.tsx: same selected-row treatment, same chip
styling, same URL-driven filters so a filtered view is a shareable link."
```

---

### Task 3: Split-view routing

Replaces the existing table page. The old `page.tsx` and `PropertiesBulkActions.tsx` go; bulk actions return in Phase 2.

**Files:**
- Rewrite: `apps/hoa/src/app/(dashboard)/properties/page.tsx`
- Delete: `apps/hoa/src/app/(dashboard)/properties/PropertiesBulkActions.tsx`

**Interfaces:**
- Consumes: `listProperties` (`@/lib/properties/list`), `parsePropertyListParams` (`@/lib/properties/list-params`), `PropertyList`, `PropertyListFilters` (Task 2).
- Produces: the `/properties` route, and the `<PropertiesShell>` structure that Task 5 reuses in `[id]/page.tsx`.

- [ ] **Step 1: Rewrite `page.tsx`**

```tsx
import Link from 'next/link'
import { Download, Plus } from 'lucide-react'
import { Alert, Button } from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { listProperties } from '@/lib/properties/list'
import { parsePropertyListParams } from '@/lib/properties/list-params'
import { PropertyList } from './PropertyList'
import { PropertyListFilters } from './PropertyListFilters'

export const metadata = { title: 'Properties' }
export const dynamic = 'force-dynamic'

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; sort?: string; q?: string; page?: string }>
}) {
  const org = await getCurrentOrg()
  if (!org) return null

  const params = parsePropertyListParams(await searchParams)
  const supabase = await getSupabaseServerClient()

  let rows: Awaited<ReturnType<typeof listProperties>>['rows'] = []
  let total = 0
  let error: string | null = null
  try {
    const result = await listProperties(supabase, org.id, params)
    rows = result.rows
    total = result.total
  } catch (e) {
    // Surfaced in the list pane rather than crashing the route, so the
    // rest of the page stays usable — the old page rendered a raw
    // error.message into a bare Card.
    error = e instanceof Error ? e.message : 'Could not load properties.'
  }

  return (
    <main className="flex h-[calc(100vh-4rem)] flex-col">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Properties</h1>
          <p className="text-xs text-muted">
            {total} {total === 1 ? 'home' : 'homes'} in {org.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            {/* Plain anchor — Link would prefetch the CSV. */}
            <a href="/properties/export">
              <Download className="h-4 w-4" />
              Export
            </a>
          </Button>
          <Button asChild size="sm">
            <Link href="/properties/new">
              <Plus className="h-4 w-4" />
              Add property
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-full max-w-sm shrink-0 overflow-y-auto border-r border-border xl:max-w-xs">
          <PropertyListFilters params={params} />
          {error ? (
            <Alert variant="error" title="Could not load properties" className="m-3">
              {error}
            </Alert>
          ) : (
            <>
              <PropertyList rows={rows} params={params} total={total} />
              {total > params.limit ? (
                <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted">
                  <span>
                    Showing {params.offset + 1}–{Math.min(params.offset + rows.length, total)} of{' '}
                    {total}
                  </span>
                  <div className="flex gap-3">
                    {params.page > 1 ? (
                      <Link
                        href={`/properties?${new URLSearchParams({ filter: params.filter, sort: params.sort, ...(params.search ? { q: params.search } : {}), page: String(params.page - 1) })}`}
                        className="underline hover:text-foreground"
                      >
                        Previous
                      </Link>
                    ) : (
                      <span className="text-muted/50">Previous</span>
                    )}
                    {params.offset + rows.length < total ? (
                      <Link
                        href={`/properties?${new URLSearchParams({ filter: params.filter, sort: params.sort, ...(params.search ? { q: params.search } : {}), page: String(params.page + 1) })}`}
                        className="underline hover:text-foreground"
                      >
                        Next
                      </Link>
                    ) : (
                      <span className="text-muted/50">Next</span>
                    )}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </aside>

        <section className="hidden flex-1 items-center justify-center text-sm text-muted lg:flex">
          Select a property
        </section>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Delete the superseded bulk-action island**

```bash
rtk git rm "apps/hoa/src/app/(dashboard)/properties/PropertiesBulkActions.tsx"
```

Bulk actions are Phase 2. Leaving an unreferenced client island behind invites someone to wire it back into a layout it no longer fits.

- [ ] **Step 3: Verify nothing still imports it**

Run: `rtk grep -rn "PropertiesBulkActions" apps/hoa/src`
Expected: no matches.

- [ ] **Step 4: Typecheck and build**

Run: `rtk proxy pnpm typecheck && rtk proxy pnpm exec turbo run build --filter=hoa`
Expected: both clean. The build is the gate that catches RSC/client boundary mistakes typecheck misses.

- [ ] **Step 5: Commit**

```bash
rtk git add -A "apps/hoa/src/app/(dashboard)/properties"
rtk git commit -m "feat(hoa): properties split view replaces the table

/properties is now the inbox-shaped shell: filters and list in the aside,
'Select a property' placeholder beside it. Query failures render as an
Alert in the pane instead of a raw error string in a bare Card.

Drops PropertiesBulkActions — bulk actions return in Phase 2."
```

---

### Task 4: Panel shell — header, stat strip, tabs

**Files:**
- Create: `apps/hoa/src/app/(dashboard)/properties/[id]/PropertyPanel.tsx`

**Interfaces:**
- Consumes: `Tabs`, `StatCard`, `Badge` from `@homeowner-portal/ui`; `PropertyListRow`.
- Produces: `function PropertyPanel(props: { propertyId: string; address: string; unitNumber: string | null; ownerName: string | null; ownerEmail: string | null; ownerPhone: string | null; tenure: string | null; stats: PanelStats; currentTab: PanelTab; query: string; children: React.ReactNode }): JSX.Element`
  - `type PanelTab = 'overview' | 'residents' | 'mail' | 'violations' | 'dues' | 'history'`
  - `interface PanelStats { balance: number; daysOverdue: number; openViolations: number; violationsPastCure: number; residents: number; threadsNeedingReply: number }`
  - `function parsePanelTab(raw: string | undefined): PanelTab`

- [ ] **Step 1: Write the component**

```tsx
import { Badge, StatCard, Tabs } from '@homeowner-portal/ui'

export type PanelTab = 'overview' | 'residents' | 'mail' | 'violations' | 'dues' | 'history'

const TABS: readonly PanelTab[] = [
  'overview',
  'residents',
  'mail',
  'violations',
  'dues',
  'history',
]

export function parsePanelTab(raw: string | undefined): PanelTab {
  return TABS.includes(raw as PanelTab) ? (raw as PanelTab) : 'overview'
}

export interface PanelStats {
  balance: number
  daysOverdue: number
  openViolations: number
  violationsPastCure: number
  residents: number
  threadsNeedingReply: number
}

const LABELS: Record<PanelTab, string> = {
  overview: 'Overview',
  residents: 'Residents',
  mail: 'Mail',
  violations: 'Violations',
  dues: 'Dues',
  history: 'History',
}

export function PropertyPanel({
  propertyId,
  address,
  unitNumber,
  ownerName,
  ownerEmail,
  ownerPhone,
  tenure,
  stats,
  currentTab,
  query,
  children,
}: {
  propertyId: string
  address: string
  unitNumber: string | null
  ownerName: string | null
  ownerEmail: string | null
  ownerPhone: string | null
  tenure: string | null
  stats: PanelStats
  currentTab: PanelTab
  query: string
  children: React.ReactNode
}) {
  // `Tabs` renders plain <a> elements and matches on pathname, so the active
  // tab is passed explicitly — our tabs differ only by query string.
  const items = TABS.map((t) => ({
    label: LABELS[t],
    href: `/properties/${propertyId}?${new URLSearchParams({
      ...Object.fromEntries(new URLSearchParams(query)),
      tab: t,
    })}`,
    active: t === currentTab,
    badge:
      t === 'violations'
        ? stats.openViolations || null
        : t === 'mail'
          ? stats.threadsNeedingReply || null
          : t === 'residents'
            ? stats.residents || null
            : null,
  }))

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-foreground">{address}</h2>
          {unitNumber ? <span className="text-sm text-muted">Unit {unitNumber}</span> : null}
          {tenure ? (
            <Badge variant={tenure === 'leased' ? 'warning' : tenure === 'owner_occupied' ? 'success' : 'neutral'} size="sm">
              {tenure.replace(/_/g, '-')}
            </Badge>
          ) : null}
        </div>
        <p className="mt-0.5 text-xs text-muted">
          {[ownerName ?? 'No owner on file', ownerEmail, ownerPhone].filter(Boolean).join(' · ')}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-px border-b border-border bg-border sm:grid-cols-4">
        <StatCard
          label="Balance"
          value={stats.balance > 0 ? `$${stats.balance.toFixed(2)}` : '$0'}
          meta={stats.daysOverdue > 0 ? `${stats.daysOverdue} days overdue` : 'Current'}
        />
        <StatCard
          label="Open violations"
          value={stats.openViolations}
          meta={stats.violationsPastCure > 0 ? `${stats.violationsPastCure} past cure` : 'None past cure'}
        />
        <StatCard label="Residents" value={stats.residents} meta="on file" />
        <StatCard
          label="Unread mail"
          value={stats.threadsNeedingReply}
          meta={stats.threadsNeedingReply > 0 ? 'awaiting reply' : 'nothing waiting'}
        />
      </div>

      <Tabs items={items} aria-label="Property sections" className="px-2" />

      <div className="flex-1 px-4 py-4">{children}</div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `rtk proxy pnpm typecheck`
Expected: clean. If `StatCard` rejects a numeric `value`, wrap in `String(...)` — its prop is `React.ReactNode`, so a number is valid.

- [ ] **Step 3: Commit**

```bash
rtk git add "apps/hoa/src/app/(dashboard)/properties/[id]/PropertyPanel.tsx"
rtk git commit -m "feat(hoa): property panel shell — header, stat strip, tabs

Tabs render as plain anchors and match on pathname, so active state is
passed explicitly since our tabs differ only by query string."
```

---

### Task 5: Wire the detail route into the split view

The 639-line `[id]/page.tsx` becomes: the same aside as `/properties`, plus the panel, with its existing sections rendered per tab. The section JSX and helper components move, they are not rewritten.

**Files:**
- Rewrite: `apps/hoa/src/app/(dashboard)/properties/[id]/page.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–4, plus the existing `getPropertyDetail`, `getLeaseCap`, `getPrimaryAssociation`, `listThreadsForUnit`, and the client islands `TenureSelector`, `AddResidentForm`, `PropertyActions`, `ResidentActions`, `ResidentRow`, `EnterPortalButton`.

- [ ] **Step 1: Read the page you are replacing, completely**

Read `apps/hoa/src/app/(dashboard)/properties/[id]/page.tsx` end to end — all 639 lines — before changing anything. Note especially:
- the `Promise.all` data fetch (violations, assessments, correspondence) around line 117
- `correspondence-state.ts`, which distinguishes "not linked to a unit" from "linked, zero threads" from "read failed"; that three-way distinction must survive
- the admin-only gating on `EnterPortalButton`
- the lease-cap logic feeding `TenureSelector`
- the local helpers `TenureBadge`, `ResidentRow`, `CorrespondenceRow`, `EventRow` (lines 458-639)

- [ ] **Step 2: Restructure the route**

Keep every existing fetch and helper. Change only the layout: render the aside (list, `hidden lg:block`) beside `<PropertyPanel>`, and switch on `tab` to choose which existing section renders inside it.

```tsx
// The aside mirrors /properties so the list survives navigation; hidden
// below lg so the panel is the whole page on a phone — the same structure
// inbox/[id]/page.tsx uses.
<main className="flex h-[calc(100vh-4rem)] overflow-hidden">
  <aside className="hidden w-full max-w-sm shrink-0 overflow-y-auto border-r border-border lg:block xl:max-w-xs">
    <PropertyListFilters params={params} />
    <PropertyList rows={rows} selectedId={id} params={params} total={total} />
  </aside>

  <section className="flex-1 overflow-hidden">
    <div className="lg:hidden">
      <BackLink href="/properties">All properties</BackLink>
    </div>
    <PropertyPanel
      propertyId={id}
      address={p.address}
      unitNumber={p.unit_number}
      ownerName={p.owner_name}
      ownerEmail={p.owner_email}
      ownerPhone={p.owner_phone}
      tenure={tenure}
      stats={stats}
      currentTab={tab}
      query={query}
    >
      {tab === 'overview' ? <OverviewTab … /> : null}
      {tab === 'residents' ? <ResidentsSection … /> : null}
      {tab === 'mail' ? <CorrespondenceSection … /> : null}
      {tab === 'violations' ? <ViolationsSection … /> : null}
      {tab === 'dues' ? <DuesSection … /> : null}
      {tab === 'history' ? <HistorySection … /> : null}
    </PropertyPanel>
  </section>
</main>
```

Extract each existing `<section>` body into a local function component in the same file (`ResidentsSection`, `CorrespondenceSection`, `ViolationsSection`, `DuesSection`, `HistorySection`) rather than moving them to new files — the file shrinks because the wrapper markup goes, and keeping them together preserves the shared props and helpers without inventing six new modules.

`OverviewTab` is new: recent activity (the most recent 4 events) plus a residents summary plus the `TenureSelector`.

- [ ] **Step 3: Typecheck and build**

Run: `rtk proxy pnpm typecheck && rtk proxy pnpm exec turbo run build --filter=hoa`
Expected: both clean.

- [ ] **Step 4: Parity self-check against the old page**

Confirm every one of these still renders, on the right tab:
- Owner name / email / phone / notes
- Tenure badge, "Updated …" line, `TenureSelector` with `capInPlace`
- `EnterPortalButton` **only** when `isAdmin && p.owner_email`
- Residents list with `AddResidentForm` and per-row `ResidentActions`
- All three correspondence states (not linked / linked-but-empty / read failed)
- History with the "Showing latest 25 events" note
- Violations list with status badges
- Dues table with period, due date, amount, status

Any that regress is a defect, not a simplification.

- [ ] **Step 5: Commit**

```bash
rtk git add "apps/hoa/src/app/(dashboard)/properties/[id]/page.tsx"
rtk git commit -m "feat(hoa): property detail becomes the split-view panel

Sections move into tabs; the list stays beside them on desktop and gives
way to the panel on a phone, matching inbox/[id]. Every existing fetch,
helper and client island is preserved — including the three-way
correspondence state and the admin-only Enter portal gate."
```

---

## Verification

```bash
rtk proxy pnpm typecheck && rtk pnpm test:unit && rtk proxy pnpm exec turbo run build --filter=hoa
```

The build is the important gate here: with no component test harness, it is the only automated check that catches RSC/client-boundary errors.

### Human checklist (nothing automated covers this)

1. `/properties` opens on **Needs attention**, sorted by severity.
2. Clicking a property keeps the list visible and highlights the row.
3. Filter chips, sort, search and pagination all survive a reload and are shareable as links.
4. Every tab renders and is deep-linkable: `/properties/<id>?tab=dues`.
5. At 390 px wide the list is the page; opening a property replaces it and **Back** returns.
6. A property with no bridged unit shows "Missing data" and the panel names it.
7. `Enter portal` appears for admins only.

## What this plan does not do

- No bulk actions, no inline email/reply, no log-violation-from-panel — Phase 2.
- Does not rewrite `Tabs` to use `next/link`. Five other pages share it; making tab clicks client-side navigations is worth doing, but on its own, not smuggled into this.
- Adds no component test harness. Still the largest quality gap in this repo.
