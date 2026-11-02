import { describe, expect, it, vi } from 'vitest'

vi.mock('@homeowner-portal/db', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn(), appUrl: (p: string) => p }))

import { autopayChargePort } from './autopay-deps'
import { createFakeStripeConnect } from '@/lib/payments/stripe-connect-fake'

const input = {
  stripeAccountId: 'acct_1',
  customerId: 'cus_1',
  paymentMethodId: 'pm_1',
  amountCents: 25000,
  applicationFeeCents: 45,
  idempotencyKey: 'autopay:enr1:2026-11-01',
  metadata: { attempt_id: 'att-1', enrollment_id: 'enr1' },
}

describe('autopay off-session charge on the connected account', () => {
  it('charges the saved method on the association account with the run key', async () => {
    const fake = createFakeStripeConnect()
    const out = await autopayChargePort(fake).chargeOffSession(input)
    expect(out).toMatchObject({ status: 'succeeded' })
    expect(fake.offSessionCharges).toEqual([
      {
        stripeAccount: 'acct_1',
        customerId: 'cus_1',
        paymentMethodId: 'pm_1',
        amountCents: 25000,
        applicationFeeCents: 45,
        idempotencyKey: 'autopay:enr1:2026-11-01',
        metadata: { online_payment_id: 'att-1', enrollment_id: 'enr1' },
      },
    ])
  })

  it('a retried run with the same key gets the same answer and charges once', async () => {
    const fake = createFakeStripeConnect()
    const port = autopayChargePort(fake)
    const a = await port.chargeOffSession(input)
    const b = await port.chargeOffSession(input)
    expect(b).toEqual(a)
    expect(fake.offSessionCharges).toHaveLength(1)
  })

  it('an ACH debit that is still settling is processing, with the intent id kept', async () => {
    const fake = createFakeStripeConnect()
    fake.nextOffSession = { status: 'processing', paymentIntentId: 'pi_ach1', failureCode: null }
    expect(await autopayChargePort(fake).chargeOffSession(input)).toEqual({ status: 'processing', paymentIntentId: 'pi_ach1' })
  })

  it('a card that needs the owner comes back as requires_action', async () => {
    const fake = createFakeStripeConnect()
    fake.nextOffSession = { status: 'requires_action', paymentIntentId: 'pi_sca', failureCode: 'authentication_required' }
    expect(await autopayChargePort(fake).chargeOffSession(input)).toEqual({ status: 'requires_action', paymentIntentId: 'pi_sca' })
  })

  it('a decline is a failed outcome with its code, not a throw', async () => {
    const fake = createFakeStripeConnect()
    fake.nextOffSession = { status: 'failed', paymentIntentId: 'pi_dead', failureCode: 'card_declined' }
    expect(await autopayChargePort(fake).chargeOffSession(input)).toEqual({
      status: 'failed',
      failureCode: 'card_declined',
      paymentIntentId: 'pi_dead',
    })
  })

  it('anything else (Stripe unreachable) throws, which the daily run counts as a failed attempt', async () => {
    const fake = createFakeStripeConnect()
    fake.nextOffSession = new Error('network')
    await expect(autopayChargePort(fake).chargeOffSession(input)).rejects.toThrow('network')
  })
})
