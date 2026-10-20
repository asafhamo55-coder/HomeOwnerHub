// Track every test-mode object the suite creates and remove it afterwards.
//
// Stripe cannot delete everything, so each kind gets the strongest removal
// it allows:
//   checkout session  expire (if still open)
//   payment intent    cancel (if not already terminal)
//   subscription      cancel (if not on a test clock: deleting the clock does it)
//   customer          delete
//   test clock        delete (also deletes its customers and subscriptions)
//   price             archive (prices are never deletable)
//   product           delete, else archive (a product with prices can't be deleted)
//
// Every object is tagged with SUITE_TAG metadata, and sweepStale() removes
// tagged leftovers of an earlier run that crashed before its cleanup.

export const SUITE_TAG = { bl103_suite: 'stripe-sandbox' } as const
export const CLOCK_NAME_PREFIX = 'bl103-'

export type Kind = 'checkoutSession' | 'paymentIntent' | 'subscription' | 'customer' | 'testClock' | 'price' | 'product'

/** Removal order: dependants before what they depend on. */
const ORDER: Kind[] = ['checkoutSession', 'paymentIntent', 'subscription', 'customer', 'testClock', 'price', 'product']

/** The slice of the SDK cleanup uses (structural, so tests can fake it). */
export interface CleanupClient {
  checkout: { sessions: { expire(id: string): Promise<unknown> } }
  paymentIntents: { cancel(id: string): Promise<unknown> }
  subscriptions: { cancel(id: string): Promise<unknown> }
  customers: { del(id: string): Promise<unknown> }
  testHelpers: { testClocks: { del(id: string): Promise<unknown> } }
  prices: { update(id: string, p: { active: boolean }): Promise<unknown> }
  products: { del(id: string): Promise<unknown>; update(id: string, p: { active: boolean }): Promise<unknown> }
}

export interface CleanupFailure {
  kind: Kind
  id: string
  /** Stripe error code or type only, never its message. */
  code: string
}

export interface CleanupReport {
  removed: number
  /** Already gone / already terminal: nothing left to do. */
  alreadyGone: number
  failures: CleanupFailure[]
}

function errCode(e: unknown): string {
  const o = e as { code?: string; type?: string } | null
  return o?.code ?? o?.type ?? 'unknown'
}

/** Errors that mean the object is already in the state cleanup wants. */
function isAlreadyDone(e: unknown, kind?: Kind): boolean {
  const o = e as { code?: string; type?: string; statusCode?: number } | null
  if (o?.code === 'resource_missing' || o?.statusCode === 404) return true
  // Cancelling a succeeded/canceled intent, or expiring a completed/expired
  // session, is Stripe saying "nothing to do".
  if (kind === 'paymentIntent' && o?.code === 'payment_intent_unexpected_state') return true
  if (kind === 'checkoutSession' && o?.statusCode === 400 && o?.type === 'StripeInvalidRequestError') return true
  return false
}

export class Registry {
  private items: Array<{ kind: Kind; id: string }> = []
  /** Subscriptions on a test clock: deleting the clock removes them. */
  private onClock = new Set<string>()

  add(kind: Kind, id: string | null | undefined): void {
    if (id && !this.items.some((i) => i.kind === kind && i.id === id)) this.items.push({ kind, id })
  }

  list(kind?: Kind) {
    return this.items.filter((i) => !kind || i.kind === kind).map((i) => i.id)
  }

  get size() {
    return this.items.length
  }

  async cleanup(stripe: CleanupClient): Promise<CleanupReport> {
    const report: CleanupReport = { removed: 0, alreadyGone: 0, failures: [] }
    for (const kind of ORDER) {
      for (const id of this.list(kind)) {
        if (kind === 'subscription' && this.onClock.has(id)) continue
        try {
          await removeOne(stripe, kind, id)
          report.removed++
        } catch (e) {
          if (isAlreadyDone(e, kind)) report.alreadyGone++
          else report.failures.push({ kind, id, code: errCode(e) })
        }
      }
    }
    this.items = report.failures.map(({ kind, id }) => ({ kind, id }))
    return report
  }

  markOnClock(subscriptionId: string) {
    this.onClock.add(subscriptionId)
  }
}

async function removeOne(stripe: CleanupClient, kind: Kind, id: string): Promise<void> {
  switch (kind) {
    case 'checkoutSession':
      await stripe.checkout.sessions.expire(id)
      return
    case 'paymentIntent':
      await stripe.paymentIntents.cancel(id)
      return
    case 'subscription':
      await stripe.subscriptions.cancel(id)
      return
    case 'customer':
      await stripe.customers.del(id)
      return
    case 'testClock':
      await stripe.testHelpers.testClocks.del(id)
      return
    case 'price':
      await stripe.prices.update(id, { active: false })
      return
    case 'product':
      try {
        await stripe.products.del(id)
      } catch (e) {
        if (isAlreadyDone(e)) throw e
        await stripe.products.update(id, { active: false })
      }
      return
  }
}

/** The slice of the SDK sweepStale uses. */
export interface SweepClient {
  customers: {
    search(p: { query: string; limit: number }): AsyncIterable<{ id: string; created: number }>
    del(id: string): Promise<unknown>
  }
  testHelpers: {
    testClocks: {
      list(p: { limit: number }): AsyncIterable<{ id: string; name?: string | null; created: number }>
      del(id: string): Promise<unknown>
    }
  }
  products: {
    search(p: { query: string; limit: number }): AsyncIterable<{ id: string; created: number; active: boolean }>
    del(id: string): Promise<unknown>
    update(id: string, p: { active: boolean }): Promise<unknown>
  }
}

/**
 * Remove suite-tagged objects older than `olderThanSec` (a crashed run's
 * leftovers). Younger ones may belong to a run in progress and are kept.
 * Best effort: returns counts, never throws on a single object.
 */
export async function sweepStale(stripe: SweepClient, opts: { olderThanSec?: number; nowSec?: number } = {}) {
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000)
  const cutoff = now - (opts.olderThanSec ?? 3_600)
  const tagQuery = `metadata['bl103_suite']:'${SUITE_TAG.bl103_suite}'`
  const counts = { customers: 0, testClocks: 0, products: 0, failed: 0 }
  const attempt = async (fn: () => Promise<unknown>, key: 'customers' | 'testClocks' | 'products') => {
    try {
      await fn()
      counts[key]++
    } catch {
      counts.failed++
    }
  }
  for await (const c of stripe.testHelpers.testClocks.list({ limit: 100 })) {
    if (c.name?.startsWith(CLOCK_NAME_PREFIX) && c.created < cutoff) await attempt(() => stripe.testHelpers.testClocks.del(c.id), 'testClocks')
  }
  for await (const c of stripe.customers.search({ query: tagQuery, limit: 100 })) {
    if (c.created < cutoff) await attempt(() => stripe.customers.del(c.id), 'customers')
  }
  for await (const p of stripe.products.search({ query: `${tagQuery} AND active:'true'`, limit: 100 })) {
    if (p.created < cutoff) {
      await attempt(async () => {
        try {
          await stripe.products.del(p.id)
        } catch {
          await stripe.products.update(p.id, { active: false })
        }
      }, 'products')
    }
  }
  return counts
}
