import { describe, expect, it } from 'vitest'
import {
  PROPERTY_PAGE_SIZE,
  parsePropertyListParams,
  propertyExportHref,
  propertyListQuery,
  sanitizeSearch,
} from './list-params'

describe('parsePropertyListParams', () => {
  it('defaults to every home (search must find any home), sorted by severity, page 1', () => {
    expect(parsePropertyListParams({})).toEqual({
      filter: 'all',
      sort: 'severity',
      dir: 'asc',
      search: '',
      page: 1,
      offset: 0,
      limit: PROPERTY_PAGE_SIZE,
    })
  })

  it('accepts every valid filter', () => {
    for (const f of [
      'attention',
      'incomplete',
      'all',
      'owner_occupied',
      'leased',
      'unknown',
    ] as const) {
      expect(parsePropertyListParams({ filter: f }).filter).toBe(f)
    }
  })

  it('falls back to all on an unknown filter', () => {
    expect(parsePropertyListParams({ filter: 'nonsense' }).filter).toBe('all')
  })

  it('accepts the waiting filter', () => {
    expect(parsePropertyListParams({ filter: 'waiting' }).filter).toBe('waiting')
  })

  it('falls back to severity on an unknown sort', () => {
    expect(parsePropertyListParams({ sort: 'drop table' }).sort).toBe('severity')
  })

  it('accepts every valid sort', () => {
    for (const s of [
      'severity',
      'address',
      'owner',
      'contact',
      'tenure',
      'balance',
      'violations',
      'arc',
      'activity',
    ] as const) {
      expect(parsePropertyListParams({ sort: s }).sort).toBe(s)
    }
  })

  it('each sort has a natural default direction (money and counts biggest first)', () => {
    expect(parsePropertyListParams({ sort: 'address' }).dir).toBe('asc')
    expect(parsePropertyListParams({ sort: 'owner' }).dir).toBe('asc')
    expect(parsePropertyListParams({ sort: 'balance' }).dir).toBe('desc')
    expect(parsePropertyListParams({ sort: 'violations' }).dir).toBe('desc')
    expect(parsePropertyListParams({ sort: 'activity' }).dir).toBe('desc')
  })

  it('accepts an explicit direction and ignores garbage', () => {
    expect(parsePropertyListParams({ sort: 'balance', dir: 'asc' }).dir).toBe('asc')
    expect(parsePropertyListParams({ sort: 'balance', dir: 'sideways' }).dir).toBe('desc')
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

describe('propertyListQuery', () => {
  it('omits defaults so the bare list is /properties', () => {
    expect(propertyListQuery(parsePropertyListParams({}))).toBe('')
  })

  it('keeps filter, sort, search and page', () => {
    const p = parsePropertyListParams({ filter: 'attention', sort: 'address', q: '12 Oak', page: '2' })
    expect(propertyListQuery(p)).toBe('filter=attention&sort=address&q=12+Oak&page=2')
  })

  it('applies overrides, and a filter/sort change can drop the page', () => {
    const p = parsePropertyListParams({ filter: 'leased', q: 'x', page: '4' })
    expect(propertyListQuery(p, { filter: 'all', page: 1 })).toBe('q=x')
    expect(propertyListQuery(p, { search: '' })).toBe('filter=leased&page=4')
  })
})

describe('propertyListQuery: direction', () => {
  it('omits the direction when it is the sort’s default', () => {
    expect(propertyListQuery(parsePropertyListParams({ sort: 'balance', dir: 'desc' }))).toBe('sort=balance')
  })

  it('keeps a non-default direction', () => {
    expect(propertyListQuery(parsePropertyListParams({ sort: 'balance', dir: 'asc' }))).toBe('sort=balance&dir=asc')
  })

  it('a new sort without a direction override takes that sort’s default', () => {
    const p = parsePropertyListParams({ sort: 'address', dir: 'desc' })
    expect(propertyListQuery(p, { sort: 'balance' })).toBe('sort=balance')
    expect(propertyListQuery(p, { sort: 'balance', dir: 'asc' })).toBe('sort=balance&dir=asc')
  })
})

describe('propertyExportHref', () => {
  it('exports everything from the default view', () => {
    expect(propertyExportHref(parsePropertyListParams({}))).toBe('/properties/export')
  })

  it('forwards every filter the list understands, plus the search', () => {
    for (const filter of ['attention', 'incomplete', 'waiting', 'owner_occupied', 'leased', 'unknown']) {
      expect(propertyExportHref(parsePropertyListParams({ filter, q: 'Oak' }))).toBe(
        `/properties/export?filter=${filter}&q=Oak`,
      )
    }
  })

  it('never forwards sort or page — an export is the whole view', () => {
    expect(propertyExportHref(parsePropertyListParams({ sort: 'balance', page: '3' }))).toBe('/properties/export')
  })
})
