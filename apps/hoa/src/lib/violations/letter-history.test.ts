import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ unstable_rethrow: (e: unknown) => { throw e } }))

import { buildLetterHistory, stepOfFollowUp, type HistoryRun, type HistoryViolation } from './letter-history-core'
import { loadLetterHistory } from './letter-history'

const V1 = '11111111-1111-4111-8111-111111111111'
const V2 = '22222222-2222-4222-8222-222222222222'

const viol = (id: string, over: Partial<HistoryViolation> = {}): HistoryViolation => ({
  id,
  description: 'Overgrown lawn',
  notice_sent_at: null,
  approved_at: null,
  ...over,
})
const run = (id: string, violationId: string, letterKind: string | undefined, over: Partial<HistoryRun> = {}): HistoryRun => ({
  id,
  human_approved: true,
  approved_at: '2026-03-02T00:00:00Z',
  created_at: '2026-03-01T00:00:00Z',
  input: { followUp: { violationId, ...(letterKind ? { letterKind } : {}) } },
  ...over,
})

describe('step mapping', () => {
  it('maps each letter kind and falls back to a plain follow-up', () => {
    expect(stepOfFollowUp('second_notice')).toBe('second_notice')
    expect(stepOfFollowUp('hearing_notice')).toBe('hearing_notice')
    expect(stepOfFollowUp('fine_notice')).toBe('fine_notice')
    expect(stepOfFollowUp('decision_letter')).toBe('decision_letter')
    expect(stepOfFollowUp(undefined)).toBe('follow_up')
    expect(stepOfFollowUp('toString')).toBe('follow_up')
  })

  it('labels the first notice and follow-ups', () => {
    const rows = buildLetterHistory(
      [viol(V1, { notice_sent_at: '2026-01-01T00:00:00Z', approved_at: '2026-01-01T00:00:00Z' })],
      [run('r1', V1, 'fine_notice')],
    )
    expect(rows.map((r) => r.stepLabel)).toEqual(['Fine notice', 'First notice'])
    expect(rows[1]!.href).toBe(`/violations/${V1}#letter-first`)
    expect(rows[0]!.href).toBe(`/violations/${V1}#letter-r1`)
  })
})

describe('sort and approval', () => {
  it('sorts newest first and marks approval', () => {
    const rows = buildLetterHistory(
      [viol(V1, { notice_sent_at: '2026-01-01T00:00:00Z' }), viol(V2, { notice_sent_at: '2026-05-01T00:00:00Z', approved_at: '2026-05-01T00:00:00Z' })],
      [run('r1', V1, 'second_notice', { human_approved: false, approved_at: null, created_at: '2026-03-01T00:00:00Z' })],
    )
    expect(rows.map((r) => r.key)).toEqual([`first-${V2}`, 'run-r1', `first-${V1}`])
    expect(rows.map((r) => r.approved)).toEqual([true, false, false])
  })

  it('ignores runs for violations outside the set', () => {
    expect(buildLetterHistory([viol(V1)], [run('r1', V2, 'second_notice')])).toEqual([])
  })
})

function mockDb(violations: HistoryViolation[], runs: HistoryRun[]) {
  const calls: Array<{ table: string; eq: Array<[string, unknown]> }> = []
  const from = (table: string) => {
    const call = { table, eq: [] as Array<[string, unknown]> }
    calls.push(call)
    const b: Record<string, unknown> = {}
    const chain = () => b
    for (const m of ['select', 'is', 'in', 'order']) b[m] = chain
    b.eq = (c: string, v: unknown) => (call.eq.push([c, v]), b)
    b.range = () => Promise.resolve({ data: table === 'hoa_violations' ? violations : runs, error: null })
    return b
  }
  return { db: { from }, calls }
}

describe('loadLetterHistory', () => {
  it('scopes both reads to the org and property', async () => {
    const { db, calls } = mockDb([viol(V1, { notice_sent_at: '2026-01-01T00:00:00Z' })], [])
    await loadLetterHistory(db, { orgId: 'org-1', propertyId: 'prop-1' })
    expect(calls[0]!.eq).toContainEqual(['org_id', 'org-1'])
    expect(calls[0]!.eq).toContainEqual(['property_id', 'prop-1'])
    expect(calls[1]!.table).toBe('ai_runs')
    expect(calls[1]!.eq).toContainEqual(['organization_id', 'org-1'])
  })

  it('caps the page and reports more', async () => {
    const vs = Array.from({ length: 25 }, (_, i) =>
      viol(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, { notice_sent_at: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z` }),
    )
    const { db } = mockDb(vs, [])
    const res = await loadLetterHistory(db, { orgId: 'o', propertyId: 'p', limit: 20 })
    expect(res.ok && res.data.rows).toHaveLength(20)
    expect(res.ok && res.data.total).toBe(25)
    expect(res.ok && res.data.hasMore).toBe(true)
    const page2 = await loadLetterHistory(db, { orgId: 'o', propertyId: 'p', limit: 20, offset: 20 })
    expect(page2.ok && page2.data.rows).toHaveLength(5)
    expect(page2.ok && page2.data.hasMore).toBe(false)
  })

  it('returns an empty page when nothing was sent', async () => {
    const { db, calls } = mockDb([viol(V1)], [])
    const res = await loadLetterHistory(db, { orgId: 'o', propertyId: 'p' })
    expect(res.ok && res.data).toEqual({ rows: [], total: 0, hasMore: false })
    expect(calls).toHaveLength(2)
  })

  it('skips the follow-up read when the home has no violations', async () => {
    const { db, calls } = mockDb([], [])
    const res = await loadLetterHistory(db, { orgId: 'o', propertyId: 'p' })
    expect(res.ok && res.data.rows).toEqual([])
    expect(calls).toHaveLength(1)
  })
})
