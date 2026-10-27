import { describe, expect, it, vi } from 'vitest'
import { conflictGate, loadDisclosureStatus } from './load'
import { BLOCKED_MESSAGE, EMPTY_CONFLICT_DISCLOSURES, withDisclosure } from './model'
import { signConflictDisclosures, withConflictDisclosures } from './store'

vi.mock('@/lib/pay-by-zelle', () => ({ paySettingsSecret: () => 'k' }))

const id = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ORG = id(1)
const ASSOC = id(2)
const BID = id(3)
const A = id(10)
const B = id(11)
const board = async () => [
  { userId: A, fullName: 'Ann' },
  { userId: B, fullName: 'Bo' },
]

function db(state: string, settings: unknown = {}, error = false) {
  const q: Record<string, unknown> = {}
  const chain = () => q
  q.select = chain
  q.eq = chain
  q.order = chain
  q.range = async () => ({
    data: error ? null : [{ id: ASSOC, name: 'X', state, governing_law_state: null, compliance_settings: settings }],
    error: error ? { code: 'XX' } : null,
  })
  return { from: () => q }
}

function settingsWith(...members: string[]) {
  let r = EMPTY_CONFLICT_DISCLOSURES
  for (const m of members) {
    r = withDisclosure(r, {
      decisionKind: 'bid_award',
      decisionId: BID,
      memberId: m,
      status: 'no_conflict',
      note: '',
      recordedAt: '2027-01-02T00:00:00.000Z',
      recordedBy: m,
    })
  }
  return withConflictDisclosures({}, signConflictDisclosures(ASSOC, r, { updatedAt: '2027-01-02T00:00:00.000Z', updatedBy: A }, 'k'))
}

const before = new Date('2026-12-31T15:00:00Z')
const after = new Date('2027-01-01T15:00:00Z')
const gate = (d: ReturnType<typeof db>, now: Date) => conflictGate(d, ORG, 'bid_award', BID, board, { now, secret: 'k' })

describe('the award gate, both sides of 2027-01-01', () => {
  it('Georgia before the date: never blocks', async () => {
    expect(await gate(db('GA'), before)).toBeNull()
  })
  it('Georgia from the date: blocks until every board member has disclosed', async () => {
    expect(await gate(db('GA'), after)).toBe(BLOCKED_MESSAGE)
    expect(await gate(db('GA', settingsWith(A)), after)).toBe(BLOCKED_MESSAGE)
    expect(await gate(db('GA', settingsWith(A, B)), after)).toBeNull()
  })
  it('a forged record does not unlock it', async () => {
    const forged = { conflict_disclosures: { v: 1, record: { disclosures: [] }, updated_at: 'x', updated_by: null, sig: 'aa' } }
    expect(await gate(db('GA', forged), after)).toBe(BLOCKED_MESSAGE)
  })
  it('other states never block', async () => {
    expect(await gate(db('FL'), after)).toBeNull()
    expect(await gate(db('FL'), before)).toBeNull()
  })
  it('a failed read blocks only from the date', async () => {
    expect(await gate(db('GA', {}, true), before)).toBeNull()
    expect(await gate(db('GA', {}, true), after)).not.toBeNull()
  })
  it('status reports mode and who is missing', async () => {
    const r = await loadDisclosureStatus(db('GA', settingsWith(A)), ORG, 'bid_award', BID, board, { now: after, secret: 'k' })
    expect(r.ok && r.status?.mode).toBe('required')
    expect(r.ok && r.status?.progress.missing).toEqual([B])
  })
})
