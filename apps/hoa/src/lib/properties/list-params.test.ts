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

  it('falls back to attention on an unknown filter', () => {
    expect(parsePropertyListParams({ filter: 'nonsense' }).filter).toBe('attention')
  })

  it('falls back to severity on an unknown sort', () => {
    expect(parsePropertyListParams({ sort: 'drop table' }).sort).toBe('severity')
  })

  it('accepts every valid sort', () => {
    for (const s of ['severity', 'address', 'balance'] as const) {
      expect(parsePropertyListParams({ sort: s }).sort).toBe(s)
    }
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
