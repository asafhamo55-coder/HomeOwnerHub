import { describe, expect, it } from 'vitest'
import { canPayNow, onboardingStatus, validateFeeSettings } from './connect-account'

const base = { detailsSubmitted: false, chargesEnabled: false, payoutsEnabled: false, requirementsDue: [] as string[] }

describe('onboardingStatus', () => {
  it('walks the states', () => {
    expect(onboardingStatus(null)).toBe('not_started')
    expect(onboardingStatus(base)).toBe('needs_details')
    expect(onboardingStatus({ ...base, detailsSubmitted: true })).toBe('in_review')
    expect(onboardingStatus({ ...base, detailsSubmitted: true, requirementsDue: ['x'] })).toBe('needs_attention')
    expect(onboardingStatus({ ...base, detailsSubmitted: true, chargesEnabled: true })).toBe('payouts_pending')
    expect(onboardingStatus({ ...base, detailsSubmitted: true, chargesEnabled: true, payoutsEnabled: true })).toBe('ready')
  })
})

describe('canPayNow', () => {
  const on = { onlinePaymentsEnabled: true, chargesEnabled: true, payoutsEnabled: true }
  it('needs the switch, charges, payouts and M8', () => {
    expect(canPayNow(on, true)).toBe(true)
    expect(canPayNow({ ...on, chargesEnabled: false }, true)).toBe(false)
    expect(canPayNow({ ...on, payoutsEnabled: false }, true)).toBe(false)
    expect(canPayNow({ ...on, onlinePaymentsEnabled: false }, true)).toBe(false)
    expect(canPayNow(null, true)).toBe(false)
    expect(canPayNow(on, false)).toBe(false)
  })
})

describe('validateFeeSettings', () => {
  const ok = { achFeePayer: 'association', cardFeePayer: 'association', returnedPaymentFeeCents: 0, acknowledgeCardFee: false }
  const ga = { associationState: 'GA', alreadyAcknowledged: false }
  it('accepts association-pays anywhere', () => {
    expect(validateFeeSettings(ok, { associationState: 'FL', alreadyAcknowledged: false }).ok).toBe(true)
  })
  it('card fee to residents needs Georgia and an acknowledgement', () => {
    const card = { ...ok, cardFeePayer: 'homeowner' }
    expect(validateFeeSettings(card, { associationState: 'FL', alreadyAcknowledged: false }).ok).toBe(false)
    expect(validateFeeSettings(card, { associationState: 'MA', alreadyAcknowledged: true }).ok).toBe(false)
    expect(validateFeeSettings(card, ga).ok).toBe(false)
    const r = validateFeeSettings({ ...card, acknowledgeCardFee: true }, ga)
    expect(r).toMatchObject({ ok: true, value: { recordAcknowledgement: true } })
    expect(validateFeeSettings(card, { ...ga, alreadyAcknowledged: true })).toMatchObject({
      ok: true,
      value: { recordAcknowledgement: false },
    })
  })
  it('caps the returned fee at 3000 cents and rejects junk', () => {
    expect(validateFeeSettings({ ...ok, returnedPaymentFeeCents: 3000 }, ga)).toMatchObject({ ok: true, value: { returnedPaymentFeeCents: 3000 } })
    expect(validateFeeSettings({ ...ok, returnedPaymentFeeCents: 3001 }, ga).ok).toBe(false)
    expect(validateFeeSettings({ ...ok, returnedPaymentFeeCents: 1.5 }, ga).ok).toBe(false)
    expect(validateFeeSettings({ ...ok, returnedPaymentFeeCents: -1 }, ga).ok).toBe(false)
    expect(validateFeeSettings({ ...ok, achFeePayer: 'x' }, ga).ok).toBe(false)
  })
})
