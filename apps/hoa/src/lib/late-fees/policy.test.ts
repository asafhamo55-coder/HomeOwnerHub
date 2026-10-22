import { describe, expect, it } from 'vitest'
import { LATE_FEE_LAWS } from './law'
import {
  DEFAULT_LATE_FEE_POLICY,
  eligibleChargeTypes,
  lateFeeForCharge,
  policyCharges,
  validateLateFeePolicy,
  type LateFeePolicy,
  type LateFeePolicyInput,
} from './policy'
import { LATE_FEE_POLICY_KEY, readLateFeePolicy, signLateFeePolicy, withLateFeePolicy } from './store'

const input = (over: Partial<LateFeePolicyInput> = {}): LateFeePolicyInput => ({
  enabled: true,
  mode: 'percent',
  percent: '5',
  flat: '',
  graceDays: '15',
  excludeFines: true,
  declarationAttested: true,
  declarationRef: 'Declaration, Article VI, Section 3',
  ...over,
})

const on = (over: Partial<LateFeePolicy> = {}): LateFeePolicy => ({
  ...DEFAULT_LATE_FEE_POLICY,
  enabled: true,
  percentBps: 500,
  graceDays: 0,
  declarationAttested: true,
  declarationRef: 'Art. VI § 3',
  ...over,
})

const TODAY = '2026-10-21'
const charge = (over: Partial<Parameters<typeof lateFeeForCharge>[2]> = {}) => ({
  assessmentType: 'regular',
  dueDate: '2026-09-01',
  amountCents: 10_000,
  paidCents: 0,
  ...over,
})

describe('the safe default', () => {
  it('is off, fines excluded, one fee per charge, nothing attested', () => {
    expect(DEFAULT_LATE_FEE_POLICY).toMatchObject({ enabled: false, excludeFines: true, oncePerCharge: true, declarationAttested: false })
    expect(policyCharges(DEFAULT_LATE_FEE_POLICY, null)).toBe(false)
    expect(lateFeeForCharge(DEFAULT_LATE_FEE_POLICY, null, charge(), TODAY)).toEqual({ charge: false, reason: 'off' })
  })
})

describe('validateLateFeePolicy', () => {
  it('accepts a 5% policy with 15 days of grace in Georgia', () => {
    const r = validateLateFeePolicy(input(), 'GA')
    expect(r).toEqual({
      ok: true,
      value: {
        enabled: true,
        mode: 'percent',
        percentBps: 500,
        flatCents: null,
        graceDays: 15,
        excludeFines: true,
        oncePerCharge: true,
        declarationAttested: true,
        declarationRef: 'Declaration, Article VI, Section 3',
      },
    })
  })

  it('refuses to turn late fees on without the declaration attestation, citing the GA rule', () => {
    const r = validateLateFeePolicy(input({ declarationAttested: false }), 'GA')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fieldErrors.declarationAttested).toMatch(/only if your declaration provides.*44-3-232\(b\)\(1\)/)
  })

  it('requires where the declaration provides for it', () => {
    const r = validateLateFeePolicy(input({ declarationRef: '   ' }), 'TX')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fieldErrors.declarationRef).toBeDefined()
  })

  it('GA: a percent above 10% cannot be saved', () => {
    const r = validateLateFeePolicy(input({ percent: '12' }), 'GA')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fieldErrors.percent).toMatch(/greater of \$10\.00 or 10%/)
    expect(validateLateFeePolicy(input({ percent: '10' }), 'GA').ok).toBe(true)
  })

  it('FL: a percent above 5% cannot be saved', () => {
    expect(validateLateFeePolicy(input({ percent: '5.01' }), 'FL').ok).toBe(false)
    expect(validateLateFeePolicy(input({ percent: '5' }), 'FL').ok).toBe(true)
  })

  it('CA: grace under 15 days cannot be saved', () => {
    const r = validateLateFeePolicy(input({ graceDays: '10' }), 'CA')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fieldErrors.graceDays).toMatch(/15 days/)
  })

  it('TX (no loaded rule): no cap beyond what the board sets', () => {
    expect(validateLateFeePolicy(input({ percent: '25', graceDays: '0' }), 'TX').ok).toBe(true)
  })

  it('a flat amount above the GA floor can be saved; the job cuts it per charge', () => {
    const r = validateLateFeePolicy(input({ mode: 'flat', percent: '', flat: '$25.00' }), 'GA')
    expect(r.ok && r.value.flatCents).toBe(2500)
  })

  it('refuses nonsense amounts and days', () => {
    for (const bad of [input({ percent: 'abc' }), input({ percent: '0' }), input({ mode: 'flat', flat: '0' }), input({ mode: 'flat', flat: '9999' }), input({ graceDays: '-1' }), input({ graceDays: '91' }), input({ mode: 'weekly' })]) {
      expect(validateLateFeePolicy(bad, 'TX').ok).toBe(false)
    }
  })

  it('turning late fees OFF needs no attestation and no amount', () => {
    const r = validateLateFeePolicy(input({ enabled: false, percent: '', declarationAttested: false, declarationRef: '' }), 'GA')
    expect(r.ok).toBe(true)
    if (r.ok) expect(policyCharges(r.value, LATE_FEE_LAWS.GA)).toBe(false)
  })

  it('strips control and bidi characters from the declaration reference', () => {
    const r = validateLateFeePolicy(input({ declarationRef: 'Art.‮ VI\n§ 3' }), 'TX')
    expect(r.ok && r.value.declarationRef).toBe('Art. VI § 3')
  })
})

describe('lateFeeForCharge', () => {
  it('fines are excluded by default and included only when the board says so', () => {
    expect(eligibleChargeTypes(on())).toEqual(['regular', 'special'])
    expect(lateFeeForCharge(on(), null, charge({ assessmentType: 'fine' }), TODAY)).toEqual({ charge: false, reason: 'type' })
    expect(lateFeeForCharge(on({ excludeFines: false }), null, charge({ assessmentType: 'fine' }), TODAY)).toMatchObject({ charge: true, feeCents: 500 })
  })

  it('never a late fee on a late fee or a collection cost', () => {
    for (const t of ['late_fee', 'collection_legal', 'collection_letter', 'collection_processing', 'lien_filing']) {
      expect(lateFeeForCharge(on({ excludeFines: false }), null, charge({ assessmentType: t }), TODAY)).toEqual({ charge: false, reason: 'type' })
    }
  })

  it('grace period: late only once the due date plus the grace is before today', () => {
    const p = on({ graceDays: 10 })
    expect(lateFeeForCharge(p, null, charge({ dueDate: '2026-10-11' }), TODAY)).toEqual({ charge: false, reason: 'grace' })
    expect(lateFeeForCharge(p, null, charge({ dueDate: '2026-10-10' }), TODAY).charge).toBe(true)
    expect(lateFeeForCharge(on(), null, charge({ dueDate: TODAY }), TODAY)).toEqual({ charge: false, reason: 'grace' })
  })

  it('a paid-off charge earns nothing; a partial pays percent on what is left', () => {
    expect(lateFeeForCharge(on(), null, charge({ paidCents: 10_000 }), TODAY)).toEqual({ charge: false, reason: 'paid' })
    expect(lateFeeForCharge(on({ percentBps: 1000 }), null, charge({ paidCents: 6_000 }), TODAY)).toMatchObject({ feeCents: 400, lateCents: 4_000 })
  })

  it('GA cap: a flat $25 is cut to $10 on a $50 charge and kept on a $400 one', () => {
    const p = on({ mode: 'flat', percentBps: null, flatCents: 2500 })
    expect(lateFeeForCharge(p, LATE_FEE_LAWS.GA, charge({ amountCents: 5_000 }), TODAY)).toEqual({ charge: true, feeCents: 1000, lateCents: 5_000, capped: true })
    expect(lateFeeForCharge(p, LATE_FEE_LAWS.GA, charge({ amountCents: 40_000 }), TODAY)).toEqual({ charge: true, feeCents: 2500, lateCents: 40_000, capped: false })
  })

  it('a policy outside the state rule charges nothing at all (re-checked at run time)', () => {
    expect(lateFeeForCharge(on({ percentBps: 1500 }), LATE_FEE_LAWS.GA, charge(), TODAY)).toEqual({ charge: false, reason: 'off' })
    expect(lateFeeForCharge(on({ declarationAttested: false }), null, charge(), TODAY)).toEqual({ charge: false, reason: 'off' })
  })

  it('CA: the 15-day delinquency rule raises a shorter grace', () => {
    // Saved before the association's state was CA: grace 20 is fine, the job uses max(20, 15).
    expect(lateFeeForCharge(on({ graceDays: 20 }), LATE_FEE_LAWS.CA, charge({ dueDate: '2026-10-05' }), TODAY)).toEqual({ charge: false, reason: 'grace' })
  })
})

describe('signed storage', () => {
  const SECRET = 's3cret'
  const stamp = { updatedAt: '2026-10-21T10:00:00.000Z', updatedBy: 'user-1' }

  it('round-trips and keeps the other compliance_settings keys', () => {
    const stored = signLateFeePolicy('assoc-1', on(), stamp, SECRET)
    const settings = withLateFeePolicy({ pay_by_zelle: { x: 1 } }, stored)
    expect(settings.pay_by_zelle).toEqual({ x: 1 })
    expect(readLateFeePolicy('assoc-1', settings, SECRET)).toEqual({ state: 'saved', policy: on(), updatedAt: stamp.updatedAt })
  })

  it('nothing stored reads as the safe default', () => {
    expect(readLateFeePolicy('assoc-1', {}, SECRET)).toEqual({ state: 'none', policy: DEFAULT_LATE_FEE_POLICY })
  })

  it('a tampered, moved, unsigned or unverifiable policy reads as unverified (off)', () => {
    const stored = signLateFeePolicy('assoc-1', on(), stamp, SECRET)
    const tampered = { ...stored, policy: { ...stored.policy, percentBps: 5000 } }
    expect(readLateFeePolicy('assoc-1', { [LATE_FEE_POLICY_KEY]: tampered }, SECRET).state).toBe('unverified')
    expect(readLateFeePolicy('assoc-2', { [LATE_FEE_POLICY_KEY]: stored }, SECRET).state).toBe('unverified')
    expect(readLateFeePolicy('assoc-1', { [LATE_FEE_POLICY_KEY]: { ...stored, sig: 'nope' } }, SECRET).state).toBe('unverified')
    expect(readLateFeePolicy('assoc-1', { [LATE_FEE_POLICY_KEY]: stored }, null).state).toBe('unverified')
    expect(readLateFeePolicy('assoc-1', { [LATE_FEE_POLICY_KEY]: stored }, 'other').state).toBe('unverified')
    const r = readLateFeePolicy('assoc-1', { [LATE_FEE_POLICY_KEY]: tampered }, SECRET)
    expect(r.policy.enabled).toBe(false)
  })
})
