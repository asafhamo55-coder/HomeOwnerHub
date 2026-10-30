import { describe, expect, it } from 'vitest'
import {
  coiBucket,
  coiCounts,
  coiHref,
  matchesSearch,
  parseCoi,
  sortByCoi,
  type CoiVendor,
} from './coi-filter'

const today = new Date(2026, 9, 30)
const v = (name: string, date: string | null, status: string | null = 'green'): CoiVendor & { dba: null } => ({
  legal_name: name,
  dba: null,
  compliance: { status, coi_expiration_date: date },
})
const none: CoiVendor = { legal_name: 'No row', compliance: null }

describe('coiBucket', () => {
  it('maps dates and complianceKey into buckets', () => {
    expect(coiBucket(v('a', '2026-10-29'), today)).toBe('expired')
    expect(coiBucket(v('a', '2026-10-30'), today)).toBe('expiring')
    expect(coiBucket(v('a', '2026-11-29'), today)).toBe('expiring')
    expect(coiBucket(v('a', '2026-11-30'), today)).toBe('ok')
    expect(coiBucket(v('a', null), today)).toBe('missing')
    expect(coiBucket(v('a', '2027-06-01', 'missing'), today)).toBe('missing')
    expect(coiBucket(none, today)).toBe('missing')
  })
  it('parses only known filter values', () => {
    expect(parseCoi('expired')).toBe('expired')
    expect(parseCoi('nope')).toBeNull()
    expect(parseCoi(undefined)).toBeNull()
  })
})

describe('filter with q', () => {
  const list = [v('Acme Roofing', '2026-10-01'), v('Acme Paving', '2027-05-01'), v('Bolt Electric', '2026-10-01')]
  it('applies both', () => {
    const out = list.filter((x) => matchesSearch(x, 'acme') && coiBucket(x, today) === 'expired')
    expect(out.map((x) => x.legal_name)).toEqual(['Acme Roofing'])
  })
  it('keeps q in chip links and the filter in other links', () => {
    expect(coiHref({ q: 'acme', coi: 'expired' })).toBe('/vendors?q=acme&coi=expired')
    expect(coiHref({ coi: null })).toBe('/vendors')
    expect(coiHref({ q: 'a b', coi: 'ok', sort: 'coi' })).toBe('/vendors?q=a+b&coi=ok&sort=coi')
  })
})

describe('sortByCoi', () => {
  it('orders soonest first with missing last', () => {
    const out = sortByCoi(
      [v('late', '2027-01-01'), none, v('past', '2026-01-01'), v('soon', '2026-11-01'), v('nodate', null)],
      today,
    )
    expect(out.map((x) => x.legal_name)).toEqual(['past', 'soon', 'late', 'No row', 'nodate'])
  })
})

describe('coiCounts', () => {
  it('counts each bucket from the loaded list', () => {
    const c = coiCounts(
      [v('a', '2026-01-01'), v('b', '2026-11-01'), v('c', '2027-05-01'), v('d', '2027-06-01'), none],
      today,
    )
    expect(c).toEqual({ expired: 1, expiring: 1, missing: 1, ok: 2 })
  })
})
