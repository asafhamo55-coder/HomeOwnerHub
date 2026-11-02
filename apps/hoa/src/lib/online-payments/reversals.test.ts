import { describe, expect, it, vi } from 'vitest'
import {
  ReverseRefused,
  handleReversalEvent,
  isReversalEvent,
  type AttemptView,
  type ConnectEventLike,
  type ReversalDeps,
  type ReverseOutcome,
} from './reversals'
import { runBoardRefund, type RefundGateway } from './refund-core'

const ACCT = 'acct_1'
const posted = '2026-11-01T12:00:00Z'
const postedSec = Date.parse(posted) / 1000

const base: AttemptView = {
  id: 'att-1',
  organizationId: 'org-1',
  associationId: 'assoc-1',
  unitId: 'unit-1',
  payerUserId: 'user-1',
  methodType: 'ach',
  status: 'succeeded',
  stripeAccountId: ACCT,
  totalCents: 25000,
  duesCents: 25000,
  feeCents: 245,
  feePayer: 'association',
  postedAt: posted,
  postedCents: 25000,
  reversedCents: 0,
}

const ok = (o: Partial<ReverseOutcome> = {}): ReverseOutcome => ({
  alreadyApplied: false,
  status: 'refunded',
  reversedCents: 25000,
  shortCents: 0,
  returnedFeeCents: 0,
  ...o,
})

function make(attempt: AttemptView | null, opts: { fee?: number | null; reverse?: () => Promise<ReverseOutcome> } = {}) {
  const store = {
    findAttempt: vi.fn(async () => attempt),
    returnedFeeSetting: vi.fn(async () => opts.fee ?? null),
    reverse: vi.fn(opts.reverse ?? (async () => ok())),
    markDisputed: vi.fn(async () => true),
  }
  const notifier = { resident: vi.fn(async () => {}), board: vi.fn(async () => {}) }
  const deps: ReversalDeps = { store, notifier }
  return { deps, store, notifier }
}

const ev = (type: string, object: Record<string, unknown>, extra: Partial<ConnectEventLike> = {}): ConnectEventLike => ({
  id: 'evt_1',
  type,
  account: ACCT,
  created: postedSec + 3600,
  data: { object },
  ...extra,
})

describe('payment_intent.payment_failed', () => {
  it('before posting: marks failed, no fee, tells the resident only', async () => {
    const { deps, store, notifier } = make({ ...base, status: 'processing', postedAt: null, postedCents: 0 }, { fee: 2500 })
    const r = await handleReversalEvent(ev('payment_intent.payment_failed', { id: 'pi_1' }), deps)
    expect(r.outcome).toBe('applied')
    expect(store.reverse).toHaveBeenCalledWith(expect.objectContaining({ kind: 'failed', ref: 'failed:pi_1', returnedFeeCents: 0 }))
    expect(notifier.resident).toHaveBeenCalledOnce()
    expect(notifier.board).not.toHaveBeenCalled()
  })

  it('after posting: reverses with the board fee, capped at $30, and alerts the board', async () => {
    const { deps, store, notifier } = make(base, { fee: 10000, reverse: async () => ok({ returnedFeeCents: 3000 }) })
    const r = await handleReversalEvent(ev('payment_intent.payment_failed', { id: 'pi_1' }), deps)
    expect(r.outcome).toBe('applied')
    expect(store.reverse).toHaveBeenCalledWith(expect.objectContaining({ returnedFeeCents: 3000 }))
    expect(notifier.board).toHaveBeenCalledOnce()
  })

  it('no fee when the board set none', async () => {
    const { deps, store } = make(base, { fee: null })
    await handleReversalEvent(ev('payment_intent.payment_failed', { id: 'pi_1' }), deps)
    expect(store.reverse).toHaveBeenCalledWith(expect.objectContaining({ returnedFeeCents: 0 }))
  })

  it('ignores a stale failure older than the posting', async () => {
    const { deps, store } = make(base)
    const r = await handleReversalEvent(ev('payment_intent.payment_failed', { id: 'pi_1' }, { created: postedSec - 60 }), deps)
    expect(r.outcome).toBe('ignored_stale')
    expect(store.reverse).not.toHaveBeenCalled()
  })

  it('never reverses a posted card payment', async () => {
    const { deps, store } = make({ ...base, methodType: 'card' })
    expect((await handleReversalEvent(ev('payment_intent.payment_failed', { id: 'pi_1' }), deps)).outcome).toBe('ignored')
    expect(store.reverse).not.toHaveBeenCalled()
  })

  it('rejects another account, retries an unknown attempt, no-ops a replay', async () => {
    expect((await handleReversalEvent(ev('payment_intent.payment_failed', { id: 'pi_1' }, { account: 'acct_x' }), make(base).deps)).outcome).toBe('rejected_account')
    expect((await handleReversalEvent(ev('payment_intent.payment_failed', { id: 'pi_1' }), make(null).deps)).outcome).toBe('retry')
    const replay = make(base, { reverse: async () => ok({ alreadyApplied: true }) })
    expect((await handleReversalEvent(ev('payment_intent.payment_failed', { id: 'pi_1' }), replay.deps)).outcome).toBe('already_applied')
    expect(replay.notifier.resident).not.toHaveBeenCalled()
  })
})

describe('charge.refunded', () => {
  const charge = (refunds: unknown[]) => ({ id: 'ch_1', payment_intent: 'pi_1', refunds: { data: refunds } })

  it('applies each refund under its own ref and caps to the dues', async () => {
    const { deps, store } = make(base)
    const r = await handleReversalEvent(ev('charge.refunded', charge([{ id: 're_1', amount: 25245, status: 'succeeded' }])), deps)
    expect(r.outcome).toBe('applied')
    expect(store.reverse).toHaveBeenCalledWith(expect.objectContaining({ kind: 'refund', ref: 're_1', cents: 25000 }))
  })

  it('the echo of the board refund is already_applied and sends nothing', async () => {
    const { deps, notifier } = make(base, { reverse: async () => ok({ alreadyApplied: true }) })
    const r = await handleReversalEvent(ev('charge.refunded', charge([{ id: 're_1', amount: 25000 }])), deps)
    expect(r.outcome).toBe('already_applied')
    expect(notifier.resident).not.toHaveBeenCalled()
  })

  it('a refund of only a homeowner-paid fee touches nothing', async () => {
    const { deps, store } = make({ ...base, reversedCents: 25000, status: 'refunded' })
    const r = await handleReversalEvent(ev('charge.refunded', charge([{ id: 're_2', amount: 800 }])), deps)
    expect(r.outcome).toBe('already_applied')
    expect(store.reverse).not.toHaveBeenCalled()
  })

  it('treats a database refusal as already on the books, not an error', async () => {
    const { deps } = make(base, { reverse: async () => { throw new ReverseRefused('55000') } })
    expect((await handleReversalEvent(ev('charge.refunded', charge([{ id: 're_1', amount: 100 }])), deps)).outcome).toBe('already_applied')
  })

  it('lets other errors through so Stripe redelivers', async () => {
    const { deps } = make(base, { reverse: async () => { throw new Error('db down') } })
    await expect(handleReversalEvent(ev('charge.refunded', charge([{ id: 're_1', amount: 100 }])), deps)).rejects.toThrow('db down')
  })
})

describe('disputes', () => {
  const dispute = (status: string) => ({ id: 'dp_1', payment_intent: 'pi_1', charge: 'ch_1', amount: 25000, status, evidence_details: { due_by: postedSec + 86400 * 10 } })

  it('created: marks disputed, reverses nothing, alerts the board with a deadline', async () => {
    const { deps, store, notifier } = make(base)
    expect((await handleReversalEvent(ev('charge.dispute.created', dispute('needs_response')), deps)).outcome).toBe('applied')
    expect(store.markDisputed).toHaveBeenCalledWith('att-1')
    expect(store.reverse).not.toHaveBeenCalled()
    expect(notifier.board).toHaveBeenCalledOnce()
  })

  it('created twice alerts once', async () => {
    const { deps, store, notifier } = make(base)
    store.markDisputed.mockResolvedValueOnce(false)
    expect((await handleReversalEvent(ev('charge.dispute.created', dispute('needs_response')), deps)).outcome).toBe('already_applied')
    expect(notifier.board).not.toHaveBeenCalled()
  })

  it('closed lost: full reversal', async () => {
    const { deps, store } = make({ ...base, status: 'disputed' })
    expect((await handleReversalEvent(ev('charge.dispute.closed', dispute('lost')), deps)).outcome).toBe('applied')
    expect(store.reverse).toHaveBeenCalledWith(expect.objectContaining({ kind: 'dispute_lost', ref: 'dp_1' }))
  })

  it('closed won: recorded, nothing reversed', async () => {
    const { deps, store } = make({ ...base, status: 'disputed' })
    expect((await handleReversalEvent(ev('charge.dispute.closed', dispute('won')), deps)).outcome).toBe('applied')
    expect(store.reverse).toHaveBeenCalledWith(expect.objectContaining({ kind: 'dispute_won' }))
  })

  it('rejects another account', async () => {
    expect((await handleReversalEvent(ev('charge.dispute.created', dispute('x'), { account: 'acct_x' }), make(base).deps)).outcome).toBe('rejected_account')
  })
})

describe('event routing', () => {
  it('knows its four events', () => {
    expect(isReversalEvent('charge.refunded')).toBe(true)
    expect(isReversalEvent('payment_intent.succeeded')).toBe(false)
  })
})

describe('board refund', () => {
  const gateway = () => {
    const createRefund = vi.fn(async () => ({ id: 're_9' }))
    return { gw: { createRefund } satisfies RefundGateway, createRefund }
  }
  const run = (attempt: AttemptView, cents: number | null, d = make(attempt), g = gateway()) =>
    runBoardRefund(d.deps, g.gw, { attempt, paymentIntentId: 'pi_1', cents, userId: 'u1' }).then((res) => ({ res, d, g }))

  it('full refund returns our fee and notifies both sides', async () => {
    const { res, d, g } = await run(base, null)
    expect(res).toMatchObject({ ok: true, full: true, refundedCents: 25000 })
    expect(g.createRefund).toHaveBeenCalledWith(expect.objectContaining({ refundApplicationFee: true, amountCents: 25000 }))
    expect(d.store.reverse).toHaveBeenCalledWith(expect.objectContaining({ kind: 'refund', ref: 're_9', cents: 25000, by: 'u1' }))
    expect(d.notifier.resident).toHaveBeenCalledOnce()
    expect(d.notifier.board).toHaveBeenCalledOnce()
  })

  it('partial refund keeps our fee', async () => {
    const { res, g } = await run(base, 10000)
    expect(res).toMatchObject({ ok: true, full: false })
    expect(g.createRefund).toHaveBeenCalledWith(expect.objectContaining({ refundApplicationFee: false, amountCents: 10000 }))
  })

  it('refuses more than is left, and unposted payments, before calling Stripe', async () => {
    const a = await run({ ...base, reversedCents: 20000 }, 6000)
    expect(a.res.ok).toBe(false)
    expect(a.g.createRefund).not.toHaveBeenCalled()
    const b = await run({ ...base, status: 'processing', postedAt: null }, null)
    expect(b.res.ok).toBe(false)
    expect(b.g.createRefund).not.toHaveBeenCalled()
  })

  it('a Stripe failure changes nothing', async () => {
    const d = make(base)
    const g = { createRefund: vi.fn(async () => { throw new Error('x') }) }
    const res = await runBoardRefund(d.deps, g, { attempt: base, paymentIntentId: 'pi_1', cents: null, userId: 'u1' })
    expect(res.ok).toBe(false)
    expect(d.store.reverse).not.toHaveBeenCalled()
  })
})

describe('charge.refunded without a refunds list (Stripe omits Charge.refunds unless expanded)', () => {
  const bare = { id: 'ch_1', payment_intent: 'pi_1', amount_refunded: 25000 }

  it('reads the refunds from Stripe and applies them', async () => {
    const { deps, store } = make(base)
    const listRefunds = vi.fn(async () => [{ id: 're_9', amountCents: 25000, status: 'succeeded' }])
    const r = await handleReversalEvent(ev('charge.refunded', bare), { ...deps, listRefunds })
    expect(listRefunds).toHaveBeenCalledWith(ACCT, 'ch_1')
    expect(r.outcome).toBe('applied')
    expect(store.reverse).toHaveBeenCalledWith(expect.objectContaining({ kind: 'refund', ref: 're_9', cents: 25000 }))
  })

  it('fails loudly, never silently ignoring, when it has no way to read them', async () => {
    const { deps, store } = make(base)
    await expect(handleReversalEvent(ev('charge.refunded', bare), deps)).rejects.toThrow(/no way to read the refunds/)
    expect(store.reverse).not.toHaveBeenCalled()
  })

  it('fails loudly when Stripe cannot be reached, so the route answers 500 and Stripe redelivers', async () => {
    const { deps, store } = make(base)
    const listRefunds = vi.fn(async () => {
      throw new Error('stripe down')
    })
    await expect(handleReversalEvent(ev('charge.refunded', bare), { ...deps, listRefunds })).rejects.toThrow('stripe down')
    expect(store.reverse).not.toHaveBeenCalled()
  })

  it('fails loudly when money came back but Stripe lists no refunds', async () => {
    const { deps } = make(base)
    await expect(handleReversalEvent(ev('charge.refunded', bare), { ...deps, listRefunds: async () => [] })).rejects.toThrow(/lists no refunds/)
  })

  it('a refund still pending is applied, a failed one is not', async () => {
    const { deps, store } = make(base)
    await handleReversalEvent(ev('charge.refunded', bare), {
      ...deps,
      listRefunds: async () => [
        { id: 're_a', amountCents: 100, status: 'failed' },
        { id: 're_b', amountCents: 200, status: 'pending' },
      ],
    })
    expect(store.reverse).toHaveBeenCalledTimes(1)
    expect(store.reverse).toHaveBeenCalledWith(expect.objectContaining({ ref: 're_b', cents: 200 }))
  })
})
