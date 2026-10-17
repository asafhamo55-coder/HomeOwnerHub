import { describe, expect, it } from 'vitest'
import { parsePropertyListParams } from './list-params'
import {
  compareAddress,
  filterCounts,
  isIncompleteRecord,
  matchesFilter,
  missingFields,
  selectPropertyView,
  sortPropertyRows,
  type PropertyViewRow,
} from './list-view'

const row = (over: Partial<PropertyViewRow> = {}): PropertyViewRow => ({
  id: over.id ?? 'p',
  address: '1 Oak St',
  tenure: 'owner_occupied',
  balance: 0,
  severityRank: 6,
  needsAttention: false,
  hasOwner: true,
  hasTenure: true,
  hasUnitLink: true,
  onWaitingList: false,
  ...over,
})

describe('compareAddress', () => {
  it('sorts house numbers numerically: 128 before 1200', () => {
    const sorted = ['1200 Oak St', '128 Oak St', '13 Oak St', '2 Oak St'].sort(compareAddress)
    expect(sorted).toEqual(['2 Oak St', '13 Oak St', '128 Oak St', '1200 Oak St'])
  })

  it('is case-insensitive and still deterministic for equal numbers', () => {
    expect(compareAddress('5 alder way', '5 Birch Way')).toBeLessThan(0)
    expect(compareAddress('5 Birch Way', '5 birch way')).not.toBeNaN()
  })
})

describe('isIncompleteRecord / missingFields', () => {
  it('does not count a missing unit link — that is the system’s gap, not the board’s', () => {
    expect(isIncompleteRecord(row({ hasUnitLink: false }))).toBe(false)
    expect(missingFields(row({ hasUnitLink: false }))).toEqual([])
  })

  it('names what is missing', () => {
    expect(missingFields(row({ hasOwner: false }))).toEqual(['owner'])
    expect(missingFields(row({ hasTenure: false }))).toEqual(['tenure'])
    expect(missingFields(row({ hasOwner: false, hasTenure: false }))).toEqual(['owner', 'tenure'])
    expect(isIncompleteRecord(row({ hasTenure: false }))).toBe(true)
  })
})

describe('matchesFilter', () => {
  it('all matches everything', () => {
    expect(matchesFilter(row(), 'all')).toBe(true)
  })
  it('attention follows needsAttention', () => {
    expect(matchesFilter(row({ needsAttention: true }), 'attention')).toBe(true)
    expect(matchesFilter(row(), 'attention')).toBe(false)
  })
  it('unknown tenure covers both NULL and the literal unknown', () => {
    expect(matchesFilter(row({ tenure: null }), 'unknown')).toBe(true)
    expect(matchesFilter(row({ tenure: 'unknown' }), 'unknown')).toBe(true)
    expect(matchesFilter(row({ tenure: 'leased' }), 'unknown')).toBe(false)
  })
  it('waiting is the queue, not a tenure', () => {
    expect(matchesFilter(row({ onWaitingList: true }), 'waiting')).toBe(true)
    expect(matchesFilter(row({ tenure: 'leased' }), 'waiting')).toBe(false)
  })
  it('incomplete ignores the unit link', () => {
    expect(matchesFilter(row({ hasUnitLink: false }), 'incomplete')).toBe(false)
    expect(matchesFilter(row({ hasOwner: false }), 'incomplete')).toBe(true)
  })
  it('tenure filters match their tenure', () => {
    expect(matchesFilter(row({ tenure: 'leased' }), 'leased')).toBe(true)
    expect(matchesFilter(row({ tenure: 'leased' }), 'owner_occupied')).toBe(false)
  })
})

describe('filterCounts', () => {
  it('counts every filter over the same rows (so they reflect the search)', () => {
    const rows = [
      row({ id: 'a', needsAttention: true }),
      row({ id: 'b', hasOwner: false, tenure: null, hasTenure: false }),
      row({ id: 'c', tenure: 'leased', onWaitingList: false }),
      row({ id: 'd', onWaitingList: true }),
    ]
    expect(filterCounts(rows)).toEqual({
      all: 4,
      attention: 1,
      incomplete: 1,
      waiting: 1,
      owner_occupied: 2,
      leased: 1,
      unknown: 1,
    })
  })
})

describe('sortPropertyRows', () => {
  const rows = [
    row({ id: 'x', address: '1200 Oak St', severityRank: 3, balance: 10 }),
    row({ id: 'y', address: '128 Oak St', severityRank: 1, balance: 500 }),
    row({ id: 'z', address: '13 Oak St', severityRank: 3, balance: 500 }),
  ]
  it('address: natural order', () => {
    expect(sortPropertyRows(rows, 'address').map((r) => r.id)).toEqual(['z', 'y', 'x'])
  })
  it('severity: worst first, natural address tiebreak', () => {
    expect(sortPropertyRows(rows, 'severity').map((r) => r.id)).toEqual(['y', 'z', 'x'])
  })
  it('balance: largest first, natural address tiebreak', () => {
    expect(sortPropertyRows(rows, 'balance').map((r) => r.id)).toEqual(['z', 'y', 'x'])
  })
  it('does not mutate its input', () => {
    const before = rows.map((r) => r.id)
    sortPropertyRows(rows, 'address')
    expect(rows.map((r) => r.id)).toEqual(before)
  })
})

describe('selectPropertyView', () => {
  const rows = Array.from({ length: 120 }, (_, i) =>
    row({ id: `p${i}`, address: `${i + 1} Elm St`, needsAttention: i % 10 === 0 }),
  )

  it('filters, sorts and pages, and the total is the filtered total', () => {
    const v = selectPropertyView(rows, parsePropertyListParams({ filter: 'attention', sort: 'address' }))
    expect(v.total).toBe(12)
    expect(v.rows.map((r) => r.address)).toEqual(
      ['1', '11', '21', '31', '41', '51', '61', '71', '81', '91', '101', '111'].map((n) => `${n} Elm St`),
    )
  })

  it('pages 50 at a time', () => {
    const v = selectPropertyView(rows, parsePropertyListParams({ sort: 'address', page: '3' }))
    expect(v.total).toBe(120)
    expect(v.rows).toHaveLength(20)
    expect(v.rows[0].address).toBe('101 Elm St')
  })

  it('returns counts for every filter alongside the page', () => {
    const v = selectPropertyView(rows, parsePropertyListParams({ filter: 'attention' }))
    expect(v.counts.all).toBe(120)
    expect(v.counts.attention).toBe(12)
  })
})
