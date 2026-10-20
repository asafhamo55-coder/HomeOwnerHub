// Test helpers for the BL-104 billing jobs: an in-memory query-builder fake
// and a Stripe port fake. No network, no database, no Stripe.

import type { BillingStripePort, SubscriptionItemChange, SubscriptionSnapshot } from './billing-stripe-port'

export interface FakeQuery {
  table: string
  op: 'select' | 'insert'
  filters: Array<[string, string, unknown]>
  row?: Record<string, unknown>
}

export type FakeHandler = (q: FakeQuery) => unknown

/** Every query resolves through `handler`; `queries` records them all. */
export function fakeDb(handler: FakeHandler) {
  const queries: FakeQuery[] = []
  const db = {
    from(table: string) {
      const q: FakeQuery = { table, op: 'select', filters: [] }
      queries.push(q)
      const chain: Record<string, unknown> = {}
      const filter =
        (kind: string) =>
        (col: string, ...rest: unknown[]) => {
          q.filters.push([kind, col, rest.length > 1 ? rest : rest[0]])
          return chain
        }
      for (const k of ['eq', 'in', 'not', 'is', 'gte', 'lt', 'contains']) chain[k] = filter(k)
      chain.select = () => chain
      chain.limit = () => chain
      chain.maybeSingle = () => chain
      chain.insert = (row: Record<string, unknown>) => {
        q.op = 'insert'
        q.row = row
        return chain
      }
      chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
        try {
          return Promise.resolve(handler(q)).then(resolve, reject)
        } catch (err) {
          return Promise.reject(err).then(resolve, reject)
        }
      }
      return chain
    },
  }
  return { db, queries }
}

export function filterValue(q: FakeQuery, kind: string, col: string): unknown {
  return q.filters.find(([k, c]) => k === kind && c === col)?.[2]
}

export function fakeStripe(subs: Record<string, SubscriptionSnapshot | null>, prices: Record<string, string> = {}) {
  const updates: SubscriptionItemChange[] = []
  const port: BillingStripePort = {
    getSubscription: async (id) => subs[id] ?? null,
    resolvePriceId: async (key) => prices[key] ?? null,
    updateSubscriptionItem: async (change) => {
      updates.push(change)
      // Reflect the change so a second run sees the new state (idempotency).
      for (const s of Object.values(subs)) {
        if (s && s.id === change.subscriptionId) {
          s.quantity = change.quantity
          if (change.priceId) s.lookupKey = Object.entries(prices).find(([, id]) => id === change.priceId)?.[0] ?? s.lookupKey
        }
      }
    },
  }
  return { port, updates }
}

export const silentLogger = () => ({ info: () => {}, error: () => {} })
