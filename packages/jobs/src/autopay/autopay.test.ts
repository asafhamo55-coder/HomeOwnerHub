import { describe, expect, it, vi } from 'vitest'
import { addDays, afterFailure, chargesToTake, decideRun, noticeCandidates, type AutopayCharge } from './decide'
import { buildOverMax, buildNotice } from './emails'
import {
  runAutopay,
  type AttemptInput,
  type AutopayChargePort,
  type AutopayDeps,
  type AutopayEnrollment,
  type AutopayStore,
  type ChargeOutcome,
} from './run'

const TODAY = '2026-12-01'
const reg = (id: string, due: string, cents: number, type = 'regular'): AutopayCharge => ({ id, type, dueDate: due, remainingCents: cents })

describe('decide', () => {
  it('addDays crosses month ends', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
  })
  it('notice names regular charges due within 3 days, once', () => {
    const charges = [reg('a', '2026-12-04', 25000), reg('b', '2026-12-05', 100), reg('c', '2026-12-02', 500, 'late_fee'), reg('d', '2026-12-03', 300)]
    const got = noticeCandidates({ charges, today: TODAY, includeOther: false, alreadyNoticed: new Map([['d', 300]]) })
    expect(got.map((c) => c.id)).toEqual(['a'])
    const withOther = noticeCandidates({ charges, today: TODAY, includeOther: true, alreadyNoticed: new Map() })
    expect(withOther.map((c) => c.id).sort()).toEqual(['a', 'c', 'd'])
  })
  it('the run never takes more than the notice named, nor un-noticed charges', () => {
    const charges = [reg('a', '2026-12-01', 30000), reg('new', '2026-12-01', 9900)]
    const got = chargesToTake({ charges, today: TODAY, includeOther: false, noticed: new Map([['a', 25000]]) })
    expect(got).toEqual([{ chargeId: 'a', cents: 25000 }])
  })
  it('the run skips charges not yet due', () => {
    expect(chargesToTake({ charges: [reg('a', '2026-12-04', 100)], today: TODAY, includeOther: false, noticed: new Map([['a', 100]]) })).toEqual([])
  })
  it('over the maximum does not charge; at the maximum does', () => {
    expect(decideRun({ duesCents: 41250, totalCents: 41250, maxCents: 30000 }).kind).toBe('over_max')
    expect(decideRun({ duesCents: 29000, totalCents: 30001, maxCents: 30000 }).kind).toBe('over_max')
    expect(decideRun({ duesCents: 29000, totalCents: 30000, maxCents: 30000 }).kind).toBe('charge')
    expect(decideRun({ duesCents: 0, totalCents: 0, maxCents: 30000 }).kind).toBe('nothing')
  })
  it('breaker pauses at two failures in a row', () => {
    expect(afterFailure(0)).toEqual({ consecutiveFailures: 1, paused: false })
    expect(afterFailure(1)).toEqual({ consecutiveFailures: 2, paused: true })
  })
})

describe('emails', () => {
  it('over-max wording states both amounts and that nothing was charged', () => {
    const e = buildOverMax({ totalCents: 41250, maxCents: 30000, manageUrl: 'https://x/m', payUrl: 'https://x/p' })
    expect(e.text).toContain('$300')
    expect(e.text).toContain('$412.50')
    expect(e.text).toContain('We did not charge you')
  })
  it('copy has no em dashes', () => {
    const n = buildNotice({ orgName: 'Oak HOA', runDate: '2026-12-04', totalCents: 25925, feeCents: 925, maxCents: 30000, method: 'card ending 4242', manageUrl: 'https://x' })
    expect(n.text + n.subject).not.toMatch(/—/)
    expect(n.text).toContain('$259.25')
  })
})

function enrollment(over: Partial<AutopayEnrollment> = {}): AutopayEnrollment {
  return {
    id: 'enr-1',
    orgId: 'org-1',
    orgName: 'Oak HOA',
    associationId: 'assoc-1',
    unitId: 'unit-1',
    unitLabel: 'Unit 1',
    userId: 'user-1',
    ownerEmail: 'owner@example.test',
    maxCents: 30000,
    includeOtherCharges: false,
    consecutiveFailures: 0,
    stillOwner: true,
    paymentsReady: true,
    today: TODAY,
    method: { id: 'pm-1', type: 'ach', brand: null, last4: '4821', stripePaymentMethodId: 'pm_x', stripeCustomerId: 'cus_x', stripeAccountId: 'acct_x', isActive: true },
    ...over,
  }
}

function fakeStore(e: AutopayEnrollment, charges: AutopayCharge[], noticed: Record<string, number> = {}) {
  const attempts: AttemptInput[] = []
  const live = new Set<string>()
  const failures: Array<[number, boolean]> = []
  const audits: string[] = []
  const claims = new Set<string>()
  const noticedMap = new Map(Object.entries(noticed))
  let canceled = false
  const store: AutopayStore = {
    listActive: async () => [e],
    openCharges: async () => charges,
    noticedCharges: async () => new Map(noticedMap),
    recordNotice: async (_e, _p, cs) => {
      for (const c of cs) noticedMap.set(c.id, c.cents)
      return true
    },
    claim: async (k, en, p) => {
      const key = `${k}:${en.id}:${p}`
      if (claims.has(key)) return false
      claims.add(key)
      return true
    },
    hasLiveAttempt: async (id, p) => live.has(`${id}:${p}`),
    createAttempt: async (en, a) => {
      const key = `${en.id}:${a.period}`
      if (live.has(key)) return null
      live.add(key)
      attempts.push(a)
      return { id: `att-${attempts.length}` }
    },
    updateAttempt: async () => {},
    setFailures: async (_id, n, paused) => {
      failures.push([n, paused])
    },
    cancel: async () => {
      canceled = true
    },
    boardEmails: async () => ['board@example.test'],
    orgSandbox: async () => false,
    audit: async (a) => {
      audits.push(a)
    },
  }
  return { store, attempts, failures, audits, isCanceled: () => canceled }
}

function deps(outcome: ChargeOutcome | (() => ChargeOutcome), feeCharged = 0) {
  const charge = vi.fn(async () => (typeof outcome === 'function' ? outcome() : outcome))
  const port: AutopayChargePort = { chargeOffSession: charge as never }
  const sent: Array<{ to: string; subject: string }> = []
  const d: AutopayDeps = {
    charger: () => port,
    quote: async () => ({ feeCents: feeCharged, feeChargedCents: feeCharged, applicationFeeCents: 0, allocationMode: 'oldest_first' }),
    sendEmail: async (i) => {
      sent.push({ to: i.to, subject: i.subject })
      return { ok: true }
    },
    appUrl: (p) => `https://app.test${p}`,
  }
  return { d, charge, sent }
}

const quiet = { info: () => {}, error: () => {} }

describe('runAutopay', () => {
  it('does nothing while M8 is off', async () => {
    const f = fakeStore(enrollment(), [])
    const r = await runAutopay(f.store, deps({ status: 'succeeded', paymentIntentId: 'pi_1' }).d, { m8Applied: false, logger: quiet })
    expect(r.skipped).toBe('m8_off')
  })

  it('sends a notice first and does not charge a charge noticed in the same run', async () => {
    const f = fakeStore(enrollment(), [reg('a', TODAY, 25000)])
    const x = deps({ status: 'succeeded', paymentIntentId: 'pi_1' })
    const r = await runAutopay(f.store, x.d, { m8Applied: true, logger: quiet })
    expect(r.notices).toBe(1)
    expect(x.charge).not.toHaveBeenCalled()
    expect(x.sent).toHaveLength(1)
  })

  it('charges a noticed, due charge exactly once per date, even if run twice', async () => {
    const f = fakeStore(enrollment(), [reg('a', TODAY, 25000)], { a: 25000 })
    const x = deps({ status: 'succeeded', paymentIntentId: 'pi_1' })
    const r1 = await runAutopay(f.store, x.d, { m8Applied: true, logger: quiet })
    const r2 = await runAutopay(f.store, x.d, { m8Applied: true, logger: quiet })
    expect(r1.charged).toBe(1)
    expect(r2.charged).toBe(0)
    expect(x.charge).toHaveBeenCalledTimes(1)
    expect(f.attempts[0]).toMatchObject({ duesCents: 25000, totalCents: 25000, idempotencyKey: `autopay:enr-1:${TODAY}` })
  })

  it('over the maximum (fee included) does not charge and emails owner and board, once', async () => {
    const f = fakeStore(enrollment({ maxCents: 25500 }), [reg('a', TODAY, 25000)], { a: 25000 })
    const x = deps({ status: 'succeeded', paymentIntentId: 'pi_1' }, 925)
    const r1 = await runAutopay(f.store, x.d, { m8Applied: true, logger: quiet })
    const r2 = await runAutopay(f.store, x.d, { m8Applied: true, logger: quiet })
    expect(r1.overMax).toBe(1)
    expect(r2.overMax).toBe(0)
    expect(x.charge).not.toHaveBeenCalled()
    expect(x.sent.map((s) => s.to).sort()).toEqual(['board@example.test', 'owner@example.test'])
  })

  it('charges only what the notice named when new charges appeared', async () => {
    const f = fakeStore(enrollment(), [reg('a', TODAY, 25000), reg('late', TODAY, 5000)], { a: 25000 })
    const x = deps({ status: 'processing', paymentIntentId: 'pi_1' })
    await runAutopay(f.store, x.d, { m8Applied: true, logger: quiet })
    expect(f.attempts[0]!.duesCents).toBe(25000)
  })

  it('pauses on the second consecutive failure and tells the owner and board', async () => {
    const f = fakeStore(enrollment({ consecutiveFailures: 1 }), [reg('a', TODAY, 25000)], { a: 25000 })
    const x = deps({ status: 'failed', failureCode: 'insufficient_funds' })
    const r = await runAutopay(f.store, x.d, { m8Applied: true, logger: quiet })
    expect(r.paused).toBe(1)
    expect(f.failures).toEqual([[2, true]])
    expect(f.audits).toContain('autopay.paused')
    expect(x.sent.map((s) => s.to).sort()).toEqual(['board@example.test', 'owner@example.test'])
  })

  it('a thrown Stripe error counts as a failure, not a crash', async () => {
    const f = fakeStore(enrollment(), [reg('a', TODAY, 25000)], { a: 25000 })
    const x = deps(() => {
      throw Object.assign(new Error('boom'), { code: 'card_declined' })
    })
    const r = await runAutopay(f.store, x.d, { m8Applied: true, logger: quiet })
    expect(r.failed).toBe(1)
    expect(r.errors).toBe(0)
  })

  it('cancels when the owner no longer owns the home, and charges nothing', async () => {
    const f = fakeStore(enrollment({ stillOwner: false }), [reg('a', TODAY, 25000)], { a: 25000 })
    const x = deps({ status: 'succeeded', paymentIntentId: 'pi_1' })
    const r = await runAutopay(f.store, x.d, { m8Applied: true, logger: quiet })
    expect(r.canceled).toBe(1)
    expect(f.isCanceled()).toBe(true)
    expect(x.charge).not.toHaveBeenCalled()
  })

  it('with no Stripe port it notices but takes no money', async () => {
    const f = fakeStore(enrollment(), [reg('a', TODAY, 25000)], { a: 25000 })
    const x = deps({ status: 'succeeded', paymentIntentId: 'pi_1' })
    x.d.charger = () => null
    const r = await runAutopay(f.store, x.d, { m8Applied: true, logger: quiet })
    expect(r.charged).toBe(0)
    expect(f.attempts).toHaveLength(0)
  })
})
