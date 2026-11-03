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

function fakeStore(e: AutopayEnrollment, charges: AutopayCharge[], noticed: Record<string, number> = {}, sandbox = false) {
  const attempts: AttemptInput[] = []
  const live = new Set<string>()
  const failures: Array<[number, boolean]> = []
  const audits: string[] = []
  const claims = new Set<string>()
  const noticedMap = new Map(Object.entries(noticed))
  let canceled = false
  let rejectUpdates = false
  const updates: Array<{ id: string; status: string; paymentIntentId?: string | null; failureCode?: string | null }> = []
  const orphans = new Map<string, { key: string; attempt: { id: string; period: string; createdAt: string; totalCents: number; applicationFeeCents: number; idempotencyKey: string } }>()
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
      const id = `att-${attempts.length}`
      orphans.set(id, { key, attempt: { id, period: a.period, createdAt: `${a.period}T12:00:00Z`, totalCents: a.totalCents, applicationFeeCents: a.applicationFeeCents, idempotencyKey: a.idempotencyKey } })
      return { id }
    },
    updateAttempt: async (id, patch, expectStatus) => {
      if (rejectUpdates) return false
      if (expectStatus && !orphans.has(id)) return false
      updates.push({ id, ...patch })
      if (patch.paymentIntentId || patch.status === 'failed') orphans.delete(id)
      return true
    },
    findOrphanAttempts: async (id) =>
      [...orphans.values()].filter((o) => o.key.startsWith(`${id}:`)).map((o) => o.attempt),
    setFailures: async (_id, n, paused) => {
      failures.push([n, paused])
    },
    cancel: async () => {
      canceled = true
    },
    boardEmails: async () => ['board@example.test'],
    orgSandbox: async () => sandbox,
    audit: async (a) => {
      audits.push(a)
    },
  }
  return { store, rejectUpdates: () => { rejectUpdates = true }, attempts, updates, failures, audits, isCanceled: () => canceled }
}

function deps(outcome: ChargeOutcome | (() => ChargeOutcome), feeCharged = 0, find: () => Promise<ChargeOutcome | null> = async () => null) {
  const charge = vi.fn(async () => (typeof outcome === 'function' ? outcome() : outcome))
  const findCharge = vi.fn(find)
  const port: AutopayChargePort = { chargeOffSession: charge as never, findCharge: findCharge as never }
  const sent: Array<{ to: string; subject: string; text: string }> = []
  const d: AutopayDeps = {
    charger: () => port,
    quote: async () => ({ feeCents: feeCharged, feeChargedCents: feeCharged, applicationFeeCents: 0, allocationMode: 'oldest_first' }),
    sendEmail: async (i) => {
      sent.push({ to: i.to, subject: i.subject, text: i.text })
      return { ok: true }
    },
    appUrl: (p) => `https://app.test${p}`,
  }
  return { d, charge, findCharge, sent }
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

  it('GAP 2: a timeout (no Stripe verdict) leaves the attempt recoverable and counts no failure', async () => {
    const f = fakeStore(enrollment(), [reg('a', TODAY, 25000)], { a: 25000 })
    const x = deps(() => {
      throw Object.assign(new Error('socket hang up'), { type: 'StripeConnectionError' })
    })
    const r = await runAutopay(f.store, x.d, { m8Applied: true, logger: quiet })
    expect(r.failed).toBe(0)
    expect(r.errors).toBe(1)
    expect(f.failures).toEqual([])
    expect(f.updates.some((u) => u.status === 'failed')).toBe(false)
  })

  it('GAP 2: the next run retries the orphaned attempt with the SAME idempotency key and records the intent', async () => {
    const f = fakeStore(enrollment(), [reg('a', TODAY, 25000)], { a: 25000 })
    let calls = 0
    const x = deps(() => {
      calls += 1
      if (calls === 1) throw Object.assign(new Error('socket hang up'), { type: 'StripeConnectionError' })
      return { status: 'succeeded', paymentIntentId: 'pi_9' }
    })
    await runAutopay(f.store, x.d, { m8Applied: true, logger: quiet })
    const r2 = await runAutopay(f.store, x.d, { m8Applied: true, logger: quiet })
    expect(r2.charged).toBe(1)
    expect(f.attempts).toHaveLength(1) // no second attempt row
    const keys = x.charge.mock.calls.map((c) => (c as unknown as [{ idempotencyKey: string }])[0].idempotencyKey)
    expect(keys).toEqual([`autopay:enr-1:${TODAY}`, `autopay:enr-1:${TODAY}`])
    expect(f.updates.at(-1)).toMatchObject({ id: 'att-1', status: 'succeeded', paymentIntentId: 'pi_9' })
  })

  it('GAP 4: the notice names the EARLIEST due date, not the latest', async () => {
    const f = fakeStore(enrollment(), [reg('a', '2026-12-03', 100), reg('b', '2026-12-02', 200)])
    const x = deps({ status: 'succeeded', paymentIntentId: 'pi_1' })
    await runAutopay(f.store, x.d, { m8Applied: true, logger: quiet })
    expect(x.sent).toHaveLength(1)
    expect(x.sent[0]!.subject + x.sent[0]!.text).toContain('December 2, 2026')
  })

  const connErr = () => Object.assign(new Error('timed out'), { type: 'StripeConnectionError' })
  const DAY2 = '2026-12-02'

  it('GAP 2 (two days): tomorrow reconciles yesterday\'s orphan against Stripe, finds the charge, and does not charge again', async () => {
    const f = fakeStore(enrollment(), [reg('a', TODAY, 25000)], { a: 25000 })
    const x1 = deps(() => {
      throw connErr()
    })
    await runAutopay(f.store, x1.d, { m8Applied: true, logger: quiet })
    // Next day: a different e.today, so the Stripe idempotency key from day one is not the lookup.
    const e2 = enrollment({ today: DAY2 })
    const f2 = { ...f.store, listActive: async () => [e2], openCharges: async () => [reg('b', DAY2, 25000)], noticedCharges: async () => new Map([['b', 25000]]) } as AutopayStore
    const x2 = deps({ status: 'succeeded', paymentIntentId: 'pi_new' }, 0, async () => ({ status: 'succeeded', paymentIntentId: 'pi_day1' }))
    const r2 = await runAutopay(f2, x2.d, { m8Applied: true, logger: quiet })
    expect(x2.findCharge).toHaveBeenCalledWith(expect.objectContaining({ attemptId: 'att-1' }))
    expect(f.updates.at(-1)).toMatchObject({ id: 'att-1', status: 'succeeded', paymentIntentId: 'pi_day1' })
    expect(x2.charge).not.toHaveBeenCalled() // nothing new is charged on the run that reconciled
    expect(r2.errors).toBe(0)
  })

  it('GAP 2: while Stripe cannot say, the enrollment is blocked and the board is told once', async () => {
    const f = fakeStore(enrollment(), [reg('a', TODAY, 25000)], { a: 25000 })
    await runAutopay(f.store, deps(() => { throw connErr() }).d, { m8Applied: true, logger: quiet })
    const e2 = enrollment({ today: DAY2 })
    const f2 = { ...f.store, listActive: async () => [e2], openCharges: async () => [reg('b', DAY2, 25000)], noticedCharges: async () => new Map([['b', 25000]]) } as AutopayStore
    const x2 = deps({ status: 'succeeded', paymentIntentId: 'pi_new' }, 0, async () => {
      throw new Error('stripe down')
    })
    const r2 = await runAutopay(f2, x2.d, { m8Applied: true, logger: quiet })
    expect(x2.charge).not.toHaveBeenCalled()
    expect(r2.errors).toBeGreaterThan(0)
    expect(x2.sent.map((s) => s.to)).toContain('board@example.test')
    expect(f.updates.some((u) => u.status === 'failed')).toBe(false)
  })

  it('MEDIUM: a "no charge" answer on a young attempt (under 48h) is not trusted: the enrollment stays blocked', async () => {
    const f = fakeStore(enrollment(), [reg('a', TODAY, 25000)], { a: 25000 })
    await runAutopay(f.store, deps(() => { throw connErr() }).d, { m8Applied: true, logger: quiet })
    const e2 = enrollment({ today: DAY2 })
    const f2 = { ...f.store, listActive: async () => [e2], openCharges: async () => [reg('b', DAY2, 25000)], noticedCharges: async () => new Map([['b', 25000]]) } as AutopayStore
    const x2 = deps({ status: 'succeeded', paymentIntentId: 'pi' })
    await runAutopay(f2, x2.d, { m8Applied: true, logger: quiet })
    expect(f.updates.some((u) => u.status === 'failed')).toBe(false)
    expect(x2.charge).not.toHaveBeenCalled()
    expect(x2.sent.map((s) => s.to)).toContain('board@example.test')
  })

  it('MEDIUM: an orphan of any age (even 30 days) still blocks new charges', async () => {
    const f = fakeStore(enrollment(), [reg('a', TODAY, 25000)], { a: 25000 })
    await runAutopay(f.store, deps(() => { throw connErr() }).d, { m8Applied: true, logger: quiet })
    const e2 = enrollment({ today: '2027-01-15' })
    const f2 = { ...f.store, listActive: async () => [e2], openCharges: async () => [reg('b', '2027-01-15', 25000)], noticedCharges: async () => new Map([['b', 25000]]) } as AutopayStore
    const x2 = deps({ status: 'succeeded', paymentIntentId: 'pi' }, 0, async () => {
      throw new Error('stripe down')
    })
    await runAutopay(f2, x2.d, { m8Applied: true, logger: quiet })
    expect(x2.charge).not.toHaveBeenCalled()
  })

  it('GAP 2: Stripe confirming (search and list) there is no charge on an attempt over 48h old closes it without a strike', async () => {
    const f = fakeStore(enrollment(), [reg('a', TODAY, 25000)], { a: 25000 })
    await runAutopay(f.store, deps(() => { throw connErr() }).d, { m8Applied: true, logger: quiet })
    const e2 = enrollment({ today: '2026-12-04' })
    const f2 = { ...f.store, listActive: async () => [e2], openCharges: async () => [], noticedCharges: async () => new Map() } as AutopayStore
    await runAutopay(f2, deps({ status: 'succeeded', paymentIntentId: 'pi' }).d, { m8Applied: true, logger: quiet })
    expect(f.updates.at(-1)).toMatchObject({ id: 'att-1', status: 'failed', failureCode: 'no_charge_found' })
    expect(f.failures).toEqual([])
  })

  it('MEDIUM: only genuinely indeterminate errors are left for reconciliation; everything else is a failure', async () => {
    const indeterminate = [
      connErr(),
      Object.assign(new Error('x'), { type: 'StripeAPIError', statusCode: 503 }),
      Object.assign(new Error('x'), { type: 'StripeRateLimitError' }),
      Object.assign(new Error('x'), { type: 'StripeIdempotencyError' }),
      Object.assign(new Error('x'), { code: 'ETIMEDOUT' }),
      Object.assign(new Error('x'), { name: 'TimeoutError' }),
    ]
    for (const err of indeterminate) {
      const f = fakeStore(enrollment(), [reg('a', TODAY, 25000)], { a: 25000 })
      const r = await runAutopay(f.store, deps(() => { throw err }).d, { m8Applied: true, logger: quiet })
      expect(r.failed, JSON.stringify(err)).toBe(0)
      expect(r.errors).toBe(1)
    }
    const definite = [
      new TypeError('bug'),
      new Error('plain'),
      Object.assign(new Error('x'), { type: 'StripeAuthenticationError' }),
      Object.assign(new Error('x'), { type: 'StripePermissionError' }),
      Object.assign(new Error('x'), { type: 'StripeInvalidRequestError', code: 'parameter_invalid' }),
      Object.assign(new Error('x'), { type: 'StripeAPIError', statusCode: 400 }),
    ]
    for (const err of definite) {
      const f = fakeStore(enrollment(), [reg('a', TODAY, 25000)], { a: 25000 })
      const r = await runAutopay(f.store, deps(() => { throw err }).d, { m8Applied: true, logger: quiet })
      expect(r.failed, String((err as Error).message)).toBe(1)
    }
  })

  it('LOW: a lost race on the attempt update counts no strike and sends no email', async () => {
    const f = fakeStore(enrollment(), [reg('a', TODAY, 25000)], { a: 25000 })
    f.rejectUpdates()
    const x = deps({ status: 'failed', failureCode: 'card_declined' })
    const r = await runAutopay(f.store, x.d, { m8Applied: true, logger: quiet })
    expect(r.failed).toBe(0)
    expect(f.failures).toEqual([])
    expect(x.sent).toHaveLength(0)
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

  it('takes no money for an org in sandbox mode (the resident Pay path refuses it too)', async () => {
    const f = fakeStore(enrollment(), [reg('a', TODAY, 25000)], { a: 25000 }, true)
    const x = deps({ status: 'succeeded', paymentIntentId: 'pi_1' })
    const r = await runAutopay(f.store, x.d, { m8Applied: true, logger: quiet })
    expect(r.charged).toBe(0)
    expect(x.charge).not.toHaveBeenCalled()
    expect(f.attempts).toHaveLength(0)
  })
})
