import { describe, expect, it } from 'vitest'
import { contextStripModel, type StripInput } from './mobile-strip'

// Synthetic addresses and figures only.
const context: NonNullable<StripInput['context']> = {
  address: '12 Example Ct',
  unitNumber: null,
  openViolations: 2,
  openArcRequests: [{}],
  openTickets: [],
  degraded: [],
}

describe('contextStripModel', () => {
  it('home, balance owed and the non-zero open items', () => {
    expect(contextStripModel({ filed: true, context, account: { balanceCents: 41250, pastDueCount: 1, truncated: false } })).toEqual({
      home: '12 Example Ct',
      balance: { tone: 'owed', label: '$412.50 owed · past due' },
      open: ['2 violations', '1 ARC request'],
    })
  })

  it('a failed or capped ledger is "unknown", never nothing owed', () => {
    expect(contextStripModel({ filed: true, context, account: null }).balance).toEqual({ tone: 'unknown', label: 'Balance unknown' })
    expect(contextStripModel({ filed: true, context, account: { balanceCents: 0, pastDueCount: 0, truncated: true } }).balance!.tone).toBe(
      'unknown',
    )
  })

  it('a zero balance on a complete ledger is clear; no rail = no pill', () => {
    expect(contextStripModel({ filed: true, context, account: { balanceCents: 0, pastDueCount: 0, truncated: false } }).balance).toEqual({
      tone: 'clear',
      label: 'Nothing owed',
    })
    expect(contextStripModel({ filed: true, context, account: undefined }).balance).toBeNull()
  })

  it('a degraded count is left out rather than shown as zero or stale', () => {
    const m = contextStripModel({ filed: true, context: { ...context, unitNumber: '2B', degraded: ['violations'] }, account: undefined })
    expect(m.home).toBe('12 Example Ct #2B')
    expect(m.open).toEqual(['1 ARC request'])
  })

  it('unfiled and failed-context threads say so', () => {
    expect(contextStripModel({ filed: false, context: null, account: undefined }).home).toBe('Not filed under a home')
    expect(contextStripModel({ filed: true, context: null, account: undefined }).home).toMatch(/couldn’t load/)
  })
})
