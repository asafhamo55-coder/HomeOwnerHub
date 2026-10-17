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
    expect(html).toContain('address, unit, owner name and email')
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
