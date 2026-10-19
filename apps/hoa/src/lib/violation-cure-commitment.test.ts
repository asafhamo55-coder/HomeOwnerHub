import { describe, expect, it } from 'vitest'
import { assertRequestedActionAllowed, selectStateRules } from '@homeowner-portal/workflows/W3-state-rules'
import {
  CURE_COMMITMENT_AUDIT,
  cureCommitmentApplies,
  cureCommitmentInputSchema,
  cureCommitmentPenaltyBlock,
  latestCureCommitment,
  loadCureCommitment,
  withCureCommitment,
  type CommitmentDb,
} from './violation-cure-commitment'

const V = '11111111-1111-4111-8111-111111111111'
const ca = selectStateRules('CA')
const fl = selectStateRules('FL')
const other = selectStateRules('TX')
const rec = (at: string, committedOn = '2026-10-01', note: string | null = null) => ({
  action: CURE_COMMITMENT_AUDIT.recorded,
  created_at: at,
  metadata: { committedOn, note },
})
const wd = (at: string) => ({ action: CURE_COMMITMENT_AUDIT.withdrawn, created_at: at, metadata: {} })
const COMMITMENT = { committedOn: '2026-10-01', note: null, recordedAt: '2026-10-02T00:00:00Z' }

describe('cureCommitmentApplies', () => {
  it('is California only', () => {
    expect(cureCommitmentApplies(ca)).toBe(true)
    expect(cureCommitmentApplies(fl)).toBe(false)
    expect(cureCommitmentApplies(other)).toBe(false)
    expect(cureCommitmentApplies(selectStateRules(null))).toBe(false)
  })
})

describe('latestCureCommitment', () => {
  it('is null with no rows', () => {
    expect(latestCureCommitment([])).toBeNull()
  })
  it('returns the newest recorded commitment', () => {
    const c = latestCureCommitment([rec('2026-10-02T00:00:00Z', '2026-10-01', 'Roofer booked')])
    expect(c).toEqual({ committedOn: '2026-10-01', note: 'Roofer booked', recordedAt: '2026-10-02T00:00:00Z' })
  })
  it('a later withdrawal clears it; a later record restores it', () => {
    expect(latestCureCommitment([rec('2026-10-02T00:00:00Z'), wd('2026-10-03T00:00:00Z')])).toBeNull()
    expect(
      latestCureCommitment([wd('2026-10-03T00:00:00Z'), rec('2026-10-02T00:00:00Z'), rec('2026-10-04T00:00:00Z', '2026-10-04')])
        ?.committedOn,
    ).toBe('2026-10-04')
  })
  it('ignores other actions and malformed metadata', () => {
    expect(latestCureCommitment([{ action: 'something.else', created_at: '2026-10-05T00:00:00Z', metadata: {} }])).toBeNull()
    expect(latestCureCommitment([{ ...rec('2026-10-02T00:00:00Z'), metadata: { committedOn: 'soon' } }])).toBeNull()
  })
})

describe('cureCommitmentInputSchema', () => {
  const now = new Date('2026-10-19T12:00:00Z')
  const schema = cureCommitmentInputSchema(now)
  it('accepts a past date and blanks an empty note', () => {
    const r = schema.safeParse({ violationId: V, committedOn: '2026-10-01', note: '  ' })
    expect(r.success && r.data.note).toBe(null)
  })
  it('refuses a missing, malformed or future date', () => {
    expect(schema.safeParse({ violationId: V }).success).toBe(false)
    expect(schema.safeParse({ violationId: V, committedOn: '10/01/2026' }).success).toBe(false)
    expect(schema.safeParse({ violationId: V, committedOn: '2026-11-30' }).success).toBe(false)
  })
  it('refuses an over-long note', () => {
    expect(schema.safeParse({ violationId: V, committedOn: '2026-10-01', note: 'x'.repeat(1001) }).success).toBe(false)
  })
})

describe('cureCommitmentPenaltyBlock', () => {
  it('blocks a CA fine and suspension citing § 5855(c)(2)', () => {
    expect(cureCommitmentPenaltyBlock(ca, COMMITMENT)).toMatch(/5855\(c\)\(2\).*fine/)
    expect(cureCommitmentPenaltyBlock(ca, COMMITMENT, 'impose_suspension')).toMatch(/5855\(c\)\(2\).*suspension/)
  })
  it('blocks nothing without a commitment or outside California', () => {
    expect(cureCommitmentPenaltyBlock(ca, null)).toBeNull()
    expect(cureCommitmentPenaltyBlock(fl, COMMITMENT)).toBeNull()
    expect(cureCommitmentPenaltyBlock(other, COMMITMENT)).toBeNull()
  })
})

describe('withCureCommitment', () => {
  it('leaves the action alone without a commitment', () => {
    const a = { step: 'impose_fine' as const, hearingHeld: true }
    expect(withCureCommitment(a, null)).toBe(a)
    expect(withCureCommitment(undefined, null)).toBeUndefined()
  })
  it('sets the flag, overriding a client that sent false, and W3 then refuses a CA fine', () => {
    const action = withCureCommitment(
      { step: 'impose_fine', hearingHeld: true, financialCommitmentToCure: false },
      COMMITMENT,
    )
    expect(action).toMatchObject({ step: 'impose_fine', financialCommitmentToCure: true })
    expect(() => assertRequestedActionAllowed(ca, action)).toThrow(/5855\(c\)\(2\)/)
    // A first notice still drafts.
    expect(() => assertRequestedActionAllowed(ca, withCureCommitment(undefined, COMMITMENT))).not.toThrow()
  })
})

describe('loadCureCommitment', () => {
  function fakeDb(result: { data: unknown; error: { code: string } | null }) {
    const calls: Array<[string, ...unknown[]]> = []
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'order']) {
      q[m] = (...args: unknown[]) => {
        calls.push([m, ...args])
        return q
      }
    }
    q.limit = async () => result
    return { db: { from: (t: string) => (calls.push(['from', t]), q) } as unknown as CommitmentDb, calls }
  }

  it('reads the violation’s audit rows in the org', async () => {
    const { db, calls } = fakeDb({ data: [rec('2026-10-02T00:00:00Z')], error: null })
    expect((await loadCureCommitment(db, 'org-1', V))?.committedOn).toBe('2026-10-01')
    expect(calls).toContainEqual(['from', 'audit_log'])
    expect(calls).toContainEqual(['eq', 'org_id', 'org-1'])
    expect(calls).toContainEqual(['eq', 'entity_type', 'hoa_violation'])
    expect(calls).toContainEqual(['eq', 'entity_id', V])
  })
  it('throws on a failed read rather than reading as none', async () => {
    const { db } = fakeDb({ data: null, error: { code: '42501' } })
    await expect(loadCureCommitment(db, 'org-1', V)).rejects.toThrow('cure_commitment_audit_failed')
  })
})
