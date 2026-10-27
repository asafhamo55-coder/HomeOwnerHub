import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { parsePropertyListParams } from '@/lib/properties/list-params'
import type { PropertyListRow } from '@/lib/properties/list'
import { PropertyList } from './PropertyList'

// BL-012: the empty property list carries the next action. createElement
// rather than JSX so this stays a plain .ts file under the root config.
// The root vitest config compiles app .tsx with the classic JSX runtime
// (Next uses the automatic one), so the component needs a global React.
;(globalThis as { React?: typeof React }).React = React
const h = React.createElement

const render = (raw: { filter?: string; q?: string }, noPropertiesYet?: boolean, allMatches?: number | null) =>
  renderToStaticMarkup(
    h(PropertyList, { rows: [], params: parsePropertyListParams(raw), noPropertiesYet, allMatches: allMatches ?? null }),
  )

const row = (over: Partial<PropertyListRow> = {}): PropertyListRow => ({
  id: 'p1',
  address: '12 Sample Way, Demo, FL 33000',
  unitNumber: null,
  ownerName: 'Pat Example',
  ownerEmail: null,
  ownerPhone: null,
  tenure: 'owner_occupied',
  unitId: null,
  balance: 0,
  oldestDueDate: null,
  daysOverdue: 0,
  openViolations: 0,
  violationsPastCure: 0,
  threadsNeedingReply: 0,
  hasOwner: true,
  hasTenure: true,
  hasUnitLink: false,
  severityRank: 6,
  needsAttention: false,
  isIncomplete: false,
  onWaitingList: false,
  openArc: 0,
  lastActivityAt: null,
  lastActivityKind: null,
  ...over,
})

describe('PropertyList empty states', () => {
  it('an association with no homes is sent to add the first one, on any filter', () => {
    for (const filter of ['attention', 'all', 'leased']) {
      const html = render({ filter }, true)
      expect(html).toContain('No properties yet')
      expect(html).toContain('href="/properties/new"')
      expect(html).toContain('Add a property')
      expect(html).not.toContain('Show all homes')
    }
  })

  it('an empty filter on a populated association offers the unfiltered list', () => {
    const html = render({ filter: 'attention' }, false)
    expect(html).toContain('Nothing needs attention right now.')
    expect(html).toContain('href="/properties"')
    expect(html).toContain('Show all homes')
  })

  it('an unknown org count (failed read) falls back to the filter copy, not "No properties yet"', () => {
    const html = render({ filter: 'attention' })
    expect(html).not.toContain('No properties yet')
    expect(html).toContain('Show all homes')
  })

  it('a search with no matches anywhere says what search looks at and offers to clear it', () => {
    const html = render({ filter: 'all', q: 'maple' }, true, 0)
    expect(html).toContain('No homes match')
    expect(html).toContain('address, unit, owner name, email and phone, and at everyone living there')
    expect(html).toContain('Clear search')
    expect(html).toContain('href="/properties"')
  })

  it('a filtered search with matches elsewhere offers them, keeping the search', () => {
    const html = render({ filter: 'attention', q: 'oak' }, false, 3)
    expect(html).toContain('3 homes match in All')
    expect(html).toContain('href="/properties?q=oak"')
    // Never the old copy, which promised "every home in this filter".
    expect(html).not.toContain('in this filter')
  })
})

describe('PropertyList rows', () => {
  it('never shows a "Missing data" pill for a missing unit link', () => {
    const html = renderToStaticMarkup(h(PropertyList, { rows: [row()], params: parsePropertyListParams({}) }))
    expect(html).not.toContain('Missing data')
  })

  it('names the missing field', () => {
    const html = renderToStaticMarkup(
      h(PropertyList, {
        rows: [row({ hasOwner: false, ownerName: null, isIncomplete: true, severityRank: 5 })],
        params: parsePropertyListParams({}),
      }),
    )
    expect(html).toContain('No owner')
  })

  it('row links keep the list state', () => {
    const html = renderToStaticMarkup(
      h(PropertyList, { rows: [row()], params: parsePropertyListParams({ filter: 'leased', q: 'Way' }) }),
    )
    expect(html).toContain('href="/properties/p1?filter=leased&amp;q=Way"')
  })
})

describe('PropertyList table and cards', () => {
  const list = (rows: PropertyListRow[], raw: Record<string, string> = {}, signalsOk = true) =>
    renderToStaticMarkup(h(PropertyList, { rows, params: parsePropertyListParams(raw), signalsOk }))

  it('every column header is a sort link with aria-sort; inactive money columns start biggest first', () => {
    const html = list([row()], { sort: 'address' })
    for (const label of ['Address · Unit', 'Owner', 'Contact', 'Tenure', 'Balance', 'Violations', 'Open ARC', 'Last activity']) {
      expect(html).toContain(`<span>${label}</span>`)
    }
    expect(html).toContain('aria-sort="ascending"')
    expect(html.match(/aria-sort="none"/g)?.length).toBe(7)
    // Address is active ascending: its header flips to descending.
    expect(html).toContain('href="/properties?sort=address&amp;dir=desc"')
    // Balance is inactive: first click sorts biggest first (its default, so no dir).
    expect(html).toContain('href="/properties?sort=balance"')
  })

  it('the default severity sort marks no column as sorted', () => {
    const html = list([row()])
    expect(html).not.toContain('aria-sort="ascending"')
    expect(html).not.toContain('aria-sort="descending"')
  })

  it('a row is one link to the home (keyboard-navigable), with call and email as their own targets', () => {
    const html = list([row({ ownerPhone: '(555) 010-1234', ownerEmail: 'pat@example.test' })])
    expect(html).toContain('data-row-link')
    expect(html).toContain('href="/properties/p1"')
    expect(html).toContain('aria-label="Call Pat Example"')
    expect(html).toContain('href="tel:5550101234"')
    expect(html).toContain('aria-label="Email Pat Example"')
  })

  it('shows days overdue beside the balance, and past-cure violations in red with words, not colour alone', () => {
    const html = list([row({ balance: 420, daysOverdue: 45, openViolations: 2, violationsPastCure: 1 })])
    expect(html).toContain('$420')
    expect(html).toContain('45d overdue')
    expect(html).toContain('1 past cure')
    expect(html).toContain('text-danger')
  })

  it('a phone card has street, owner, balance and the one most urgent status line', () => {
    const html = list([row({ address: '12 Sample Way, Demo, FL 33000', balance: 420, daysOverdue: 45, openViolations: 2 })])
    expect(html).toContain('12 Sample Way')
    expect(html).toContain('45 days overdue')
    expect(html).not.toContain('2 open violations')
  })

  it('open ARC and last activity say they could not load rather than showing 0', () => {
    const html = list([row({ openArc: null })], {}, false)
    expect(html).toContain('(couldn’t load)')
  })

  it('a quiet home says so instead of a blank cell', () => {
    expect(list([row()])).toContain('None this year')
    expect(list([row({ lastActivityAt: '2026-10-15T14:00:00Z', lastActivityKind: 'payment' })])).toContain('Payment')
  })
})

// Bug 2026-10-26 (Asaf, Safari): every click in the properties table opened the
// LAST property. The row link was "stretched" with after:absolute inset-0 and
// relied on position:relative on the <tr>, which Safari doesn't honour as a
// containing block. So every row's overlay covered the whole table and the
// last one won. Each <td> must be the containing block, and each row's cells
// may only link to that row's property.
describe('properties table rows link to their own property', () => {
  const tableHtml = () =>
    renderToStaticMarkup(
      h(PropertyList, {
        rows: [row({ id: 'p-first', address: '1 First St, Demo, GA 30000' }), row({ id: 'p-last', address: '9 Last St, Demo, GA 30000' })],
        params: parsePropertyListParams({}),
        allMatches: 2,
      }),
    )

  it('makes every table cell the positioning box for its links (not the <tr>)', () => {
    const html = tableHtml()
    const tds = html.match(/<td\b[^>]*>/g) ?? []
    expect(tds.length).toBeGreaterThan(0)
    for (const td of tds) expect(td).toMatch(/class="[^"]*\brelative\b/)
  })

  it('every cell in a row links only to that row (clicking anywhere on a row opens that home)', () => {
    const html = tableHtml()
    const rows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g)?.filter((r) => r.includes('<td')) ?? []
    expect(rows).toHaveLength(2)
    const [first, last] = rows
    const cells = (r: string) => r.match(/<td\b[\s\S]*?<\/td>/g) ?? []
    for (const td of cells(first!)) {
      expect(td).toMatch(/p-first/)
      expect(td).not.toMatch(/p-last/)
    }
    for (const td of cells(last!)) {
      expect(td).toMatch(/p-last/)
      expect(td).not.toMatch(/p-first/)
    }
  })
})
