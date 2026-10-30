import { describe, expect, it } from 'vitest'
import { aiShare, oldestWaitDays } from './summary'
import type { ApprovalSource, InboxItem, InboxSection, SourceCounts } from './model'

const NY = 'America/New_York'

function item(source: ApprovalSource, createdAt: string | null): InboxItem {
  return { source, id: `${source}-${createdAt}`, title: 't', detail: null, amount: null, amountNote: null, createdAt, reasoning: null, citations: [], confidenceLabel: null, href: '/x', decision: null }
}
const section = (source: ApprovalSource, createdAts: (string | null)[]): InboxSection => ({
  source,
  ok: true,
  items: createdAts.map((c) => item(source, c)),
  total: createdAts.length,
})

describe('oldestWaitDays', () => {
  it('counts calendar days to the oldest item across sources', () => {
    const sections = [section('w3', ['2026-10-27T15:00:00Z']), section('bill', ['2026-10-20T15:00:00Z', '2026-10-28T15:00:00Z'])]
    expect(oldestWaitDays(sections, NY, new Date('2026-10-30T16:00:00Z'))).toBe(10)
  })

  it('is 0 for an item proposed today and null when nothing is waiting', () => {
    expect(oldestWaitDays([section('w3', ['2026-10-30T13:00:00Z'])], NY, new Date('2026-10-30T16:00:00Z'))).toBe(0)
    expect(oldestWaitDays([section('w3', [])], NY, new Date('2026-10-30T16:00:00Z'))).toBeNull()
  })

  it('uses the association day, not UTC: 01:00Z is still the evening before in New York', () => {
    // 2026-10-30T01:00Z is 21:00 on Oct 29 in New York.
    expect(oldestWaitDays([section('w3', ['2026-10-30T01:00:00Z'])], NY, new Date('2026-10-30T16:00:00Z'))).toBe(1)
  })

  it('does not lose a day across fall back (a 25 hour day)', () => {
    // Oct 30 23:30 EDT to Nov 2 00:30 EST is 50 hours, but 3 calendar days.
    expect(oldestWaitDays([section('w3', ['2026-10-31T03:30:00Z'])], NY, new Date('2026-11-02T05:30:00Z'))).toBe(3)
  })

  it('does not lose a day across spring forward (a 23 hour day)', () => {
    // Mar 7 23:30 EST to Mar 9 00:30 EDT is 24 hours, but 2 calendar days.
    expect(oldestWaitDays([section('w3', ['2026-03-08T04:30:00Z'])], NY, new Date('2026-03-09T04:30:00Z'))).toBe(2)
  })

  it('ignores vendors, failed sections and unreadable dates', () => {
    const sections: InboxSection[] = [section('vendor', ['2020-01-01T00:00:00Z']), { source: 'bill', ok: false }, section('w3', [null, 'garbage', '2026-10-28T15:00:00Z'])]
    expect(oldestWaitDays(sections, NY, new Date('2026-10-30T16:00:00Z'))).toBe(2)
  })
})

describe('aiShare', () => {
  const counts = (over: Partial<SourceCounts>): SourceCounts => ({ w18: 0, bill: 0, opening: 0, w3: 0, collections: 0, arc: 0, contact: 0, join: 0, pro: 0, vendor: 0, ...over })

  it('counts the AI-drafted sources against all waiting', () => {
    expect(aiShare(counts({ w18: 2, bill: 1, w3: 1, contact: 4, join: 2 }))).toEqual({ ai: 4, total: 10, percent: 40 })
  })
  it('is 0 percent when nothing is waiting', () => {
    expect(aiShare(counts({}))).toEqual({ ai: 0, total: 0, percent: 0 })
  })
  it('is unknown when any source failed to load', () => {
    expect(aiShare(counts({ w3: null }))).toBeNull()
  })
})
