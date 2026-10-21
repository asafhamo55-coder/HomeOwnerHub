// BL-103 follow-ups: customer.subscription.updated and invoice.payment_failed.
// A small stateful fake of the admin client (orgs + audit_log rows, filters
// including `metadata->>key`), so idempotency and ordering are asserted on
// the resulting state rather than on call lists.
import { describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import { applyStripeEvent, webhookHttpStatus, type WebhookDb } from './webhook'
import { AUDIT_INVOICE_PAYMENT_FAILED, AUDIT_SUBSCRIPTION_UPDATED, billingAttention } from './billing-status'

const ORG = '9a1b2c3d-0000-4000-8000-000000000001'
const OTHER = '9a1b2c3d-0000-4000-8000-000000000002'
type Row = Record<string, unknown>

function field(row: Row, col: string): unknown {
  const m = /^(\w+)->>(\w+)$/.exec(col)
  if (!m) return row[col]
  const obj = row[m[1]!] as Row | null | undefined
  const v = obj?.[m[2]!]
  return v == null ? null : String(v)
}

function stateDb(opts: { rpc?: (fn: string, args: Row) => { data: unknown; error: { code: string } | null } } = {}) {
  const tables: Record<string, Row[]> = { orgs: [], eviction_cases: [], audit_log: [] }
  const rpcs: Array<{ fn: string; args: Row }> = []
  let fail: { op: 'select' | 'insert' | 'update'; table: string; code: string } | null = null
  const takeFail = (op: 'select' | 'insert' | 'update', table: string) => {
    if (fail && fail.op === op && fail.table === table) {
      const code = fail.code
      fail = null
      return { code }
    }
    return null
  }

  const db: WebhookDb = {
    from(table) {
      return {
        update(patch) {
          const filters: Array<[string, string]> = []
          const b = {
            eq(c: string, v: string) {
              filters.push([c, v])
              return b
            },
            then(ok: (r: { error: { code: string } | null }) => unknown) {
              const error = takeFail('update', table)
              if (!error) for (const r of tables[table]!) if (filters.every(([c, v]) => field(r, c) === v)) Object.assign(r, patch)
              return Promise.resolve({ error }).then(ok)
            },
          }
          return b as never
        },
        select() {
          const filters: Array<[string, string]> = []
          let order: { col: string; asc: boolean } | null = null
          const isNull: Array<[string, null]> = []
          let limit = Infinity
          const q = {
            eq(c: string, v: string) {
              filters.push([c, v])
              return q
            },
            is(c: string, v: null) {
              isNull.push([c, v])
              return q
            },
            order(col: string, o: { ascending: boolean }) {
              order = { col, asc: o.ascending }
              return q
            },
            limit(n: number) {
              limit = n
              return q
            },
            then(ok: (r: { data: Row[] | null; error: { code: string } | null }) => unknown) {
              const error = takeFail('select', table)
              if (error) return Promise.resolve({ data: null, error }).then(ok)
              let rows = tables[table]!.filter(
                (r) => filters.every(([c, v]) => field(r, c) === v) && isNull.every(([c]) => (field(r, c) ?? null) === null),
              )
              if (order) {
                const { col, asc } = order
                rows = [...rows].sort((a, b) => {
                  const x = String(field(a, col) ?? '')
                  const y = String(field(b, col) ?? '')
                  return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1)
                })
              }
              return Promise.resolve({ data: rows.slice(0, limit).map((r) => structuredClone(r)), error: null }).then(ok)
            },
          }
          return q as never
        },
        insert(row) {
          const error = takeFail('insert', table)
          if (!error) tables[table]!.push(structuredClone(row))
          return Promise.resolve({ error })
        },
      }
    },
    rpc(fn, args) {
      const a = args as unknown as Row
      rpcs.push({ fn, args: a })
      if (opts.rpc) return Promise.resolve(opts.rpc(fn, a))
      // Like 0064's checkout function: the subscription's plan becomes the org's.
      if (fn === 'stripe_webhook_checkout_subscription' && a.p_plan != null) {
        const org = tables.orgs!.find((o) => o.id === a.p_org_id && o.stripe_sub_id === a.p_sub_id)
        if (org) org.plan = a.p_plan
      }
      return Promise.resolve({ data: 'subscription_started', error: null })
    },
  }

  return {
    db,
    rpcs,
    addOrg(row: Row) {
      tables.orgs!.push({ plan: 'free', doors_count: 0, stripe_customer_id: null, stripe_sub_id: null, ...row })
    },
    org: (id: string) => tables.orgs!.find((o) => o.id === id),
    audit: (action?: string) => tables.audit_log!.filter((r) => !action || r.action === action),
    failNext(op: 'select' | 'insert' | 'update', table: string, code = 'XX000') {
      fail = { op, table, code }
    },
  }
}

const T = 1_790_000_000
const ev = (type: string, object: Row, opts: { id: string; created: number }): Stripe.Event =>
  ({ id: opts.id, created: opts.created, type, data: { object } }) as unknown as Stripe.Event

const subObj = (o: { id?: string; status: string; lookupKey?: string | null; priceId?: string; quantity?: number }) => ({
  id: o.id ?? 'sub_1',
  object: 'subscription',
  customer: 'cus_1',
  status: o.status,
  items: { data: [{ quantity: o.quantity ?? 41, price: { id: o.priceId ?? 'price_x', lookup_key: o.lookupKey === undefined ? 'hoa_per_door_monthly' : o.lookupKey } }] },
})
const updated = (id: string, created: number, o: Parameters<typeof subObj>[0]) => ev('customer.subscription.updated', subObj(o), { id, created })
const invoiceFailed = (id: string, created: number, sub: string | null, shape: 'parent' | 'legacy' = 'parent') =>
  ev(
    'invoice.payment_failed',
    shape === 'parent'
      ? { id: `in_${id}`, object: 'invoice', customer: 'cus_1', attempt_count: 1, parent: { subscription_details: { subscription: sub } } }
      : { id: `in_${id}`, object: 'invoice', customer: 'cus_1', attempt_count: 2, subscription: sub },
    { id, created },
  )

function payingOrg(extra: Row = {}) {
  const s = stateDb()
  s.addOrg({ id: ORG, plan: 'monthly', doors_count: 10, stripe_customer_id: 'cus_1', stripe_sub_id: 'sub_1', ...extra })
  return s
}

describe('customer.subscription.updated, M1 off (today)', () => {
  it('past_due records the status and raises the banner; the plan is untouched', async () => {
    const s = payingOrg()
    const r = await applyStripeEvent(updated('evt_a', T, { status: 'past_due' }), { db: s.db, m1: false })
    expect(r).toEqual({ ok: true, outcome: 'subscription_updated' })
    expect(s.org(ORG)).toMatchObject({ plan: 'monthly', stripe_sub_id: 'sub_1', doors_count: 10 })
    const rows = s.audit(AUDIT_SUBSCRIPTION_UPDATED)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      org_id: ORG,
      user_id: null,
      entity_type: 'stripe_subscription',
      metadata: { event_id: 'evt_a', sub_id: 'sub_1', status: 'past_due', plan: 'monthly', quantity: 41 },
    })
    // ids, status, plan, quantity and timestamps only — nothing else.
    expect(Object.keys(rows[0]!.metadata as Row).sort()).toEqual(['event_created', 'event_id', 'plan', 'quantity', 'status', 'sub_id'])
    expect(billingAttention(s.audit() as never, 'sub_1')).toMatchObject({ reason: 'past_due' })
    expect(s.rpcs).toEqual([])
  })

  it('a plan switch is NOT written before M1 (0000 plan check rejects monthly/annual)', async () => {
    const s = payingOrg()
    await applyStripeEvent(updated('evt_a', T, { status: 'active', lookupKey: 'hoa_per_door_annual' }), { db: s.db, m1: false })
    expect(s.org(ORG)!.plan).toBe('monthly')
    expect(s.audit(AUDIT_SUBSCRIPTION_UPDATED)[0]!.metadata).toMatchObject({ plan: 'annual' })
  })

  it('a quantity change syncs doors_count; the minimum floor does not', async () => {
    const s = payingOrg()
    // 10 doors bill at the 41-door minimum: no write.
    await applyStripeEvent(updated('evt_a', T, { status: 'active', quantity: 41 }), { db: s.db, m1: false })
    expect(s.org(ORG)!.doors_count).toBe(10)
    await applyStripeEvent(updated('evt_b', T + 10, { status: 'active', quantity: 180 }), { db: s.db, m1: false })
    expect(s.org(ORG)!.doors_count).toBe(180)
  })

  it('canceled downgrades, scoped to this subscription', async () => {
    const s = payingOrg()
    const r = await applyStripeEvent(updated('evt_a', T, { status: 'canceled' }), { db: s.db, m1: false })
    expect(r).toEqual({ ok: true, outcome: 'subscription_deleted' })
    expect(s.org(ORG)).toMatchObject({ plan: 'free', stripe_sub_id: null })
  })

  it('an update for a subscription the org is no longer on changes nothing', async () => {
    const s = payingOrg({ stripe_sub_id: 'sub_new' })
    const r = await applyStripeEvent(updated('evt_a', T, { id: 'sub_1', status: 'canceled' }), { db: s.db, m1: false })
    expect(r).toEqual({ ok: true, outcome: 'ignored', message: 'not_current_subscription' })
    expect(s.org(ORG)).toMatchObject({ plan: 'monthly', stripe_sub_id: 'sub_new' })
    expect(s.audit()).toEqual([])
  })

  it('the same event twice is a duplicate and appends nothing', async () => {
    const s = payingOrg()
    const e = updated('evt_a', T, { status: 'past_due' })
    await applyStripeEvent(e, { db: s.db, m1: false })
    expect(await applyStripeEvent(e, { db: s.db, m1: false })).toEqual({ ok: true, outcome: 'duplicate' })
    expect(s.audit()).toHaveLength(1)
  })

  it('out of order: a late past_due after the recovery is stale and the banner stays clear', async () => {
    const s = payingOrg()
    await applyStripeEvent(updated('evt_active', T + 60, { status: 'active' }), { db: s.db, m1: false })
    const late = await applyStripeEvent(updated('evt_pd', T, { status: 'past_due' }), { db: s.db, m1: false })
    expect(late).toEqual({ ok: true, outcome: 'ignored', message: 'stale_event' })
    expect(s.audit(AUDIT_SUBSCRIPTION_UPDATED)).toHaveLength(1)
    expect(billingAttention(s.audit() as never, 'sub_1')).toBeNull()
  })

  it('a member-forged audit row (user_id set, far-future clock) cannot make real updates stale', async () => {
    const s = payingOrg()
    // RLS audit_log_insert lets a board member insert rows as themselves.
    await s.db.from('audit_log').insert({
      org_id: ORG,
      user_id: 'board-user',
      action: AUDIT_SUBSCRIPTION_UPDATED,
      entity_type: 'stripe_subscription',
      metadata: { event_id: 'evt_forged', event_created: '9999-12-31T00:00:00.000Z', sub_id: 'sub_1', status: 'active' },
    })
    const r = await applyStripeEvent(updated('evt_real', T, { status: 'past_due' }), { db: s.db, m1: false })
    expect(r).toEqual({ ok: true, outcome: 'subscription_updated' })
  })

  it('out of order: a late quantity change does not overwrite a newer one', async () => {
    const s = payingOrg()
    await applyStripeEvent(updated('evt_2', T + 60, { status: 'active', quantity: 200 }), { db: s.db, m1: false })
    await applyStripeEvent(updated('evt_1', T, { status: 'active', quantity: 180 }), { db: s.db, m1: false })
    expect(s.org(ORG)!.doors_count).toBe(200)
  })

  it('same-second events end in the same state whichever arrives first', async () => {
    const run = async (order: Array<[string, string]>) => {
      const s = payingOrg()
      for (const [id, status] of order) await applyStripeEvent(updated(id, T, { status }), { db: s.db, m1: false })
      return billingAttention(s.audit() as never, 'sub_1')
    }
    const a = await run([['evt_a', 'past_due'], ['evt_b', 'active']])
    const b = await run([['evt_b', 'active'], ['evt_a', 'past_due']])
    expect(a).toEqual(b)
    expect(a).toBeNull() // evt_b > evt_a: active wins
  })

  it('a failed audit write is a 500, and the redelivery completes it', async () => {
    const s = payingOrg()
    const e = updated('evt_a', T, { status: 'active', quantity: 180 })
    s.failNext('insert', 'audit_log', '53300')
    const r = await applyStripeEvent(e, { db: s.db, m1: false })
    expect(r).toEqual({ ok: false, outcome: 'error', message: 'persist_failed', dbCode: '53300' })
    expect(webhookHttpStatus(r)).toBe(500)
    expect(await applyStripeEvent(e, { db: s.db, m1: false })).toEqual({ ok: true, outcome: 'subscription_updated' })
    expect(s.org(ORG)!.doors_count).toBe(180)
    expect(s.audit()).toHaveLength(1)
  })

  it('a failed read is a 500 (read_failed), never a silent 200', async () => {
    const s = payingOrg()
    s.failNext('select', 'orgs', '57014')
    const r1 = await applyStripeEvent(updated('evt_a', T, { status: 'past_due' }), { db: s.db, m1: false })
    expect(r1).toEqual({ ok: false, outcome: 'error', message: 'read_failed', dbCode: '57014' })
    expect(webhookHttpStatus(r1)).toBe(500)
    s.failNext('select', 'audit_log')
    expect(webhookHttpStatus(await applyStripeEvent(updated('evt_a', T, { status: 'past_due' }), { db: s.db, m1: false }))).toBe(500)
    s.failNext('update', 'orgs')
    expect(webhookHttpStatus(await applyStripeEvent(updated('evt_a', T, { status: 'canceled' }), { db: s.db, m1: false }))).toBe(500)
    expect(s.audit()).toEqual([])
  })

  it('no subscription id is ignored', async () => {
    const s = payingOrg()
    expect(await applyStripeEvent(ev('customer.subscription.updated', { status: 'active' }, { id: 'e', created: T }), { db: s.db, m1: false })).toEqual({
      ok: true,
      outcome: 'ignored',
      message: 'subscription_missing_id',
    })
  })
})

describe('customer.subscription.updated, M1 on (0064 functions)', () => {
  it('a plan switch goes through the checkout function, then the audit row', async () => {
    const s = payingOrg()
    const r = await applyStripeEvent(updated('evt_a', T, { status: 'active', lookupKey: 'hoa_per_door_annual' }), { db: s.db, m1: true })
    expect(r).toEqual({ ok: true, outcome: 'subscription_updated' })
    expect(s.rpcs).toEqual([
      {
        fn: 'stripe_webhook_checkout_subscription',
        args: {
          p_event_id: 'evt_a',
          p_event_created: new Date(T * 1000).toISOString(),
          p_org_id: ORG,
          p_customer_id: 'cus_1',
          p_sub_id: 'sub_1',
          p_plan: 'annual',
        },
      },
    ])
    expect(s.audit(AUDIT_SUBSCRIPTION_UPDATED)).toHaveLength(1)
  })

  it('an unchanged plan or an unknown price calls no function', async () => {
    const s = payingOrg()
    await applyStripeEvent(updated('evt_a', T, { status: 'past_due' }), { db: s.db, m1: true })
    await applyStripeEvent(updated('evt_b', T + 1, { status: 'active', lookupKey: null }), { db: s.db, m1: true })
    expect(s.rpcs).toEqual([])
    expect(s.audit()).toHaveLength(2)
  })

  it('canceled goes through the deletion function; an unknown org still leaves the tombstone', async () => {
    const s = stateDb({ rpc: () => ({ data: 'subscription_deleted', error: null }) })
    s.addOrg({ id: ORG, plan: 'monthly', stripe_sub_id: 'sub_1' })
    expect(await applyStripeEvent(updated('evt_a', T, { status: 'canceled' }), { db: s.db, m1: true })).toEqual({
      ok: true,
      outcome: 'subscription_deleted',
    })
    expect(s.rpcs[0]).toMatchObject({ fn: 'stripe_webhook_subscription_deleted', args: { p_sub_id: 'sub_1' } })
    expect(s.audit()).toHaveLength(1)

    const lone = stateDb({ rpc: () => ({ data: 'ignored_not_current_subscription', error: null }) })
    expect(await applyStripeEvent(updated('evt_b', T, { id: 'sub_z', status: 'canceled' }), { db: lone.db, m1: true })).toEqual({
      ok: true,
      outcome: 'ignored',
      message: 'not_current_subscription',
    })
    expect(lone.rpcs[0]).toMatchObject({ fn: 'stripe_webhook_subscription_deleted', args: { p_sub_id: 'sub_z' } })
  })

  it('a failed function call is a 500 and writes no audit row', async () => {
    const s = stateDb({ rpc: () => ({ data: null, error: { code: '40P01' } }) })
    s.addOrg({ id: ORG, plan: 'monthly', stripe_sub_id: 'sub_1' })
    const r = await applyStripeEvent(updated('evt_a', T, { status: 'active', lookupKey: 'hoa_per_door_annual' }), { db: s.db, m1: true })
    expect(webhookHttpStatus(r)).toBe(500)
    expect(s.audit()).toEqual([])
  })
})

describe('invoice.payment_failed', () => {
  for (const m1 of [false, true]) {
    it(`records ids only and raises the banner (M1 ${m1 ? 'on' : 'off'}); the plan is untouched`, async () => {
      const s = payingOrg()
      expect(await applyStripeEvent(invoiceFailed('evt_f', T, 'sub_1'), { db: s.db, m1 })).toEqual({ ok: true, outcome: 'invoice_failed' })
      const rows = s.audit(AUDIT_INVOICE_PAYMENT_FAILED)
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        org_id: ORG,
        entity_type: 'stripe_invoice',
        metadata: { event_id: 'evt_f', invoice_id: 'in_evt_f', sub_id: 'sub_1', attempt_count: 1 },
      })
      expect(s.org(ORG)!.plan).toBe('monthly')
      expect(s.rpcs).toEqual([])
      expect(billingAttention(s.audit() as never, 'sub_1')).toMatchObject({ reason: 'payment_failed' })
    })
  }

  it('reads the pre-basil top-level subscription too', async () => {
    const s = payingOrg()
    await applyStripeEvent(invoiceFailed('evt_f', T, 'sub_1', 'legacy'), { db: s.db, m1: false })
    expect(s.audit(AUDIT_INVOICE_PAYMENT_FAILED)[0]!.metadata).toMatchObject({ sub_id: 'sub_1', attempt_count: 2 })
  })

  it('is deduped on the event id', async () => {
    const s = payingOrg()
    const e = invoiceFailed('evt_f', T, 'sub_1')
    await applyStripeEvent(e, { db: s.db, m1: false })
    expect(await applyStripeEvent(e, { db: s.db, m1: false })).toEqual({ ok: true, outcome: 'duplicate' })
    expect(s.audit()).toHaveLength(1)
  })

  it('an invoice with no subscription, or for a subscription no org is on, is ignored', async () => {
    const s = payingOrg()
    s.addOrg({ id: OTHER, stripe_sub_id: null })
    expect((await applyStripeEvent(invoiceFailed('evt_1', T, null), { db: s.db, m1: false })).message).toBe('invoice_without_subscription')
    expect((await applyStripeEvent(invoiceFailed('evt_2', T, 'sub_gone'), { db: s.db, m1: false })).message).toBe('not_current_subscription')
    expect(s.audit()).toEqual([])
  })

  it('a failed insert or read is a 500', async () => {
    const s = payingOrg()
    s.failNext('insert', 'audit_log')
    expect(webhookHttpStatus(await applyStripeEvent(invoiceFailed('evt_f', T, 'sub_1'), { db: s.db, m1: false }))).toBe(500)
    s.failNext('select', 'audit_log')
    expect(webhookHttpStatus(await applyStripeEvent(invoiceFailed('evt_f', T, 'sub_1'), { db: s.db, m1: false }))).toBe(500)
    expect(s.audit()).toEqual([])
  })

  it('a later active clears a failed-invoice banner', async () => {
    const s = payingOrg()
    await applyStripeEvent(invoiceFailed('evt_f', T, 'sub_1'), { db: s.db, m1: false })
    await applyStripeEvent(updated('evt_ok', T + 3600, { status: 'active' }), { db: s.db, m1: false })
    expect(billingAttention(s.audit() as never, 'sub_1')).toBeNull()
  })
})

// ─── Concurrent deliveries (security review 2026-10-20, Low) ──────────
//
// No row lock: two deliveries can both pass the ordering check, and the
// older one's write can land last. Each delivery reconciles to the newest
// applied audit row after writing its own, so the newer state wins.

/** Holds writes matching `hold` until `release()`; everything else passes through. */
function gated(db: WebhookDb, hold: { update?: (table: string, patch: Row) => boolean; rpc?: (fn: string, args: Row) => boolean }) {
  let release!: () => void
  const gate = new Promise<void>((r) => (release = r))
  const wrapped: WebhookDb = {
    from(table) {
      const t = db.from(table)
      return {
        select: (c: string) => t.select(c),
        insert: (row: Row) => t.insert(row),
        update(patch: Row) {
          const inner = t.update(patch)
          if (!hold.update?.(table, patch)) return inner
          const f = {
            eq(c: string, v: string) {
              inner.eq(c, v)
              return f
            },
            then(ok: (r: { error: unknown }) => unknown, bad?: (e: unknown) => unknown) {
              return gate.then(() => inner).then(ok as never, bad)
            },
          }
          return f as never
        },
      }
    },
    rpc(fn, args) {
      if (!hold.rpc?.(fn, args as unknown as Row)) return db.rpc(fn, args)
      return gate.then(() => db.rpc(fn, args))
    },
  }
  return { db: wrapped, release }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('customer.subscription.updated, concurrent deliveries', () => {
  it('M1 off: an older quantity whose write lands after the newer one is reconciled to the newer', async () => {
    const s = payingOrg()
    // Hold the OLDER event's doors_count write until the newer one has finished.
    const g = gated(s.db, { update: (table, patch) => table === 'orgs' && patch.doors_count === 50 })
    const older = applyStripeEvent(updated('evt_a', T, { status: 'active', quantity: 50 }), { db: g.db, m1: false })
    await tick() // the older delivery has passed its ordering check and is blocked on its write
    const newer = await applyStripeEvent(updated('evt_b', T + 5, { status: 'active', quantity: 60 }), { db: s.db, m1: false })
    expect(newer).toEqual({ ok: true, outcome: 'subscription_updated' })
    expect(s.org(ORG)!.doors_count).toBe(60)
    g.release()
    // Without the reconcile, doors_count would now be the stale 50.
    expect(await older).toEqual({ ok: true, outcome: 'subscription_updated' })
    expect(s.org(ORG)!.doors_count).toBe(60)
    expect(s.audit(AUDIT_SUBSCRIPTION_UPDATED)).toHaveLength(2)
  })

  it('M1 on: an older plan switch that lands last is re-applied as the newer plan', async () => {
    const s = payingOrg()
    // Older event: switch to annual. Newer event: back to monthly (already
    // the org's plan, so the newer delivery calls no function).
    const g = gated(s.db, { rpc: (_fn, args) => args.p_event_id === 'evt_a' })
    const older = applyStripeEvent(updated('evt_a', T, { status: 'active', lookupKey: 'hoa_per_door_annual' }), { db: g.db, m1: true })
    await tick()
    await applyStripeEvent(updated('evt_b', T + 5, { status: 'active', lookupKey: 'hoa_per_door_monthly' }), { db: s.db, m1: true })
    g.release()
    expect(await older).toEqual({ ok: true, outcome: 'subscription_updated' })
    expect(s.org(ORG)!.plan).toBe('monthly')
    // The re-apply carries a deterministic id, so 0064's dedupe neither
    // swallows it nor repeats it on a redelivery.
    expect(s.rpcs.map((r) => r.args.p_event_id)).toEqual(['evt_a', 'evt_b:reconcile:evt_a'])
    expect(s.rpcs[1]!.args).toMatchObject({ p_plan: 'monthly', p_event_created: new Date((T + 5) * 1000).toISOString() })
  })

  it('in-order deliveries reconcile to themselves and write nothing extra', async () => {
    const s = payingOrg()
    await applyStripeEvent(updated('evt_a', T, { status: 'active', lookupKey: 'hoa_per_door_annual', quantity: 50 }), { db: s.db, m1: true })
    await applyStripeEvent(updated('evt_b', T + 5, { status: 'active', lookupKey: 'hoa_per_door_monthly', quantity: 60 }), { db: s.db, m1: true })
    expect(s.rpcs.map((r) => r.args.p_event_id)).toEqual(['evt_a', 'evt_b'])
    expect(s.org(ORG)).toMatchObject({ plan: 'monthly', doors_count: 60 })
  })

  it('a failed reconcile is a 500, and the redelivery (a duplicate) reconciles again', async () => {
    const s = payingOrg()
    const g = gated(s.db, { update: (table, patch) => table === 'orgs' && patch.doors_count === 50 })
    const older = applyStripeEvent(updated('evt_a', T, { status: 'active', quantity: 50 }), { db: g.db, m1: false })
    await tick()
    await applyStripeEvent(updated('evt_b', T + 5, { status: 'active', quantity: 60 }), { db: s.db, m1: false })
    // The older delivery's own (already issued, held) write succeeds; the
    // next orgs update it issues, its reconcile write, fails.
    const origFrom = s.db.from
    let failed = false
    s.db.from = ((table: Parameters<WebhookDb['from']>[0]) => {
      const t = origFrom.call(s.db, table)
      if (table !== 'orgs' || failed) return t
      return {
        ...t,
        update(patch: Row) {
          failed = true
          s.failNext('update', 'orgs')
          return t.update(patch)
        },
      }
    }) as WebhookDb['from']
    g.release()
    const r = await older
    expect(webhookHttpStatus(r)).toBe(500)
    expect(s.org(ORG)!.doors_count).toBe(50)
    s.db.from = origFrom
    const again = await applyStripeEvent(updated('evt_a', T, { status: 'active', quantity: 50 }), { db: s.db, m1: false })
    expect(again).toEqual({ ok: true, outcome: 'duplicate' })
    expect(s.org(ORG)!.doors_count).toBe(60)
  })
})

// ─── Forged applied-update rows (security review #2, SEC-N2) ──────────
//
// Until 0063, a member can insert audit_log rows with user_id NULL. A row
// newer than the incoming event is honoured only if Stripe confirms it.

function fakeStripe(events: Stripe.Event[], opts: { down?: boolean } = {}) {
  const calls: string[] = []
  return {
    calls,
    client: {
      events: {
        async retrieve(id: string) {
          calls.push(id)
          if (opts.down) throw Object.assign(new Error('connection'), { type: 'StripeConnectionError' })
          const e = events.find((x) => x.id === id)
          if (!e) throw Object.assign(new Error('No such event'), { statusCode: 404, code: 'resource_missing' })
          return e
        },
      },
    },
  }
}

const forgedRow = (metadata: Row) => ({
  org_id: ORG,
  user_id: null,
  action: AUDIT_SUBSCRIPTION_UPDATED,
  entity_type: 'stripe_subscription',
  metadata: { sub_id: 'sub_1', status: 'active', plan: 'annual', quantity: 999, ...metadata },
})

describe('SEC-N2: a user_id NULL row newer than the event is verified against Stripe', () => {
  it('a row naming an event Stripe does not have is ignored: the real update applies (ids-only log)', async () => {
    const s = payingOrg()
    await s.db.from('audit_log').insert(forgedRow({ event_id: 'evt_forged', event_created: '9999-12-31T00:00:00.000Z' }))
    const stripe = fakeStripe([])
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = await applyStripeEvent(updated('evt_real', T, { status: 'past_due', quantity: 180 }), { db: s.db, m1: true, stripe: stripe.client })
    expect(r).toEqual({ ok: true, outcome: 'subscription_updated' })
    expect(stripe.calls).toContain('evt_forged')
    // reconcile did not copy the forged plan / quantity
    expect(s.org(ORG)).toMatchObject({ plan: 'monthly', doors_count: 180 })
    expect(s.rpcs.filter((x) => x.args.p_plan === 'annual')).toEqual([])
    expect(JSON.stringify(warn.mock.calls)).toContain('evt_forged')
    warn.mockRestore()
  })

  it('a real event id with a forged clock or state, or another subscription, is ignored', async () => {
    const s = payingOrg()
    const realOther = updated('evt_other_sub', T + 30, { id: 'sub_2', status: 'active' })
    const realOld = updated('evt_old', T - 30, { status: 'active', quantity: 41, lookupKey: 'hoa_per_door_annual' })
    await s.db.from('audit_log').insert(forgedRow({ event_id: 'evt_other_sub', event_created: new Date((T + 30) * 1000).toISOString() }))
    await s.db.from('audit_log').insert(forgedRow({ event_id: 'evt_old', event_created: '9999-12-31T00:00:00.000Z', quantity: 41 }))
    const stripe = fakeStripe([realOther, realOld])
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = await applyStripeEvent(updated('evt_real', T, { status: 'past_due' }), { db: s.db, m1: false, stripe: stripe.client })
    warn.mockRestore()
    expect(r).toEqual({ ok: true, outcome: 'subscription_updated' })
    expect(stripe.calls.sort()).toEqual(['evt_old', 'evt_other_sub'])
  })

  it('a genuine newer update still makes a late event stale', async () => {
    const s = payingOrg()
    const newer = updated('evt_active', T + 60, { status: 'active' })
    const stripe = fakeStripe([newer])
    await applyStripeEvent(newer, { db: s.db, m1: false, stripe: stripe.client })
    const late = await applyStripeEvent(updated('evt_pd', T, { status: 'past_due' }), { db: s.db, m1: false, stripe: stripe.client })
    expect(late).toEqual({ ok: true, outcome: 'ignored', message: 'stale_event' })
    expect(stripe.calls).toEqual(['evt_active'])
  })

  it('older rows are never looked up (nothing to verify on the normal path)', async () => {
    const s = payingOrg()
    const stripe = fakeStripe([])
    await applyStripeEvent(updated('evt_1', T, { status: 'active' }), { db: s.db, m1: false, stripe: stripe.client })
    await applyStripeEvent(updated('evt_2', T + 60, { status: 'past_due' }), { db: s.db, m1: false, stripe: stripe.client })
    expect(stripe.calls).toEqual([])
  })

  it('Stripe unreachable while a newer row needs checking is a 500, not a pass', async () => {
    const s = payingOrg()
    await s.db.from('audit_log').insert(forgedRow({ event_id: 'evt_x', event_created: '9999-12-31T00:00:00.000Z' }))
    const r = await applyStripeEvent(updated('evt_real', T, { status: 'past_due' }), { db: s.db, m1: false, stripe: fakeStripe([], { down: true }).client })
    expect(r).toEqual({ ok: false, outcome: 'error', message: 'verify_failed' })
    expect(webhookHttpStatus(r)).toBe(500)
    expect(s.audit(AUDIT_SUBSCRIPTION_UPDATED)).toHaveLength(1) // only the forged row
  })

  it('invoice.payment_failed: a forged row naming the event id alone does not dedupe the real failure', async () => {
    const s = payingOrg()
    await s.db.from('audit_log').insert({
      org_id: ORG,
      user_id: null,
      action: AUDIT_INVOICE_PAYMENT_FAILED,
      entity_type: 'stripe_invoice',
      metadata: { event_id: 'evt_f', sub_id: 'sub_1' },
    })
    expect(await applyStripeEvent(invoiceFailed('evt_f', T, 'sub_1'), { db: s.db, m1: false })).toEqual({ ok: true, outcome: 'invoice_failed' })
  })
})
