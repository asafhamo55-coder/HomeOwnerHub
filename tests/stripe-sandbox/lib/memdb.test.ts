import { describe, expect, it } from 'vitest'
import { createMemDb } from './memdb'

// The scenarios and expected outcomes below are copied from the
// real-Postgres integration test of migrations/0064_m1_batch.sql
// (tests/integration/security/m1-batch.test.ts, section F). If the model
// drifts from the SQL, these fail.

const ORG = '9a1b2c3d-0000-4000-8000-0000000000aa'
const T1 = '2026-10-01T00:00:00Z'
const T2 = '2026-10-10T00:00:00Z'
const T3 = '2026-10-10T00:00:05Z'

type Step = 'c1' | 'c2' | 'd1'

function setup() {
  const m = createMemDb()
  m.addOrg(ORG)
  async function run(step: Step) {
    if (step === 'd1') {
      const { data, error } = await m.db.rpc('stripe_webhook_subscription_deleted', {
        p_event_id: 'evt_d1',
        p_event_created: T3,
        p_sub_id: 'sub_1',
      })
      expect(error).toBeNull()
      return data
    }
    const one = step === 'c1'
    const { data, error } = await m.db.rpc('stripe_webhook_checkout_subscription', {
      p_event_id: one ? 'evt_c1' : 'evt_c2',
      p_event_created: one ? T1 : T2,
      p_org_id: ORG,
      p_customer_id: 'cus_1',
      p_sub_id: one ? 'sub_1' : 'sub_2',
      p_plan: one ? 'monthly' : 'annual',
    })
    expect(error).toBeNull()
    return data
  }
  return { m, run }
}

describe('memdb models 0064 per-subscription ordering', () => {
  const orders: Step[][] = [
    ['c1', 'c2', 'd1'],
    ['c1', 'd1', 'c2'],
    ['c2', 'c1', 'd1'],
    ['c2', 'd1', 'c1'],
    ['d1', 'c1', 'c2'],
    ['d1', 'c2', 'c1'],
  ]
  for (const order of orders) {
    it(`${order.join(' → ')} ends on sub_2 (annual)`, async () => {
      const { m, run } = setup()
      for (const step of order) await run(step)
      expect(m.billing(ORG)).toEqual({ plan: 'annual', stripe_sub_id: 'sub_2' })
    })
  }

  it('cancelling the only subscription downgrades to free; a late checkout cannot revive it', async () => {
    const { m, run } = setup()
    expect(await run('c1')).toBe('subscription_started')
    expect(m.billing(ORG)).toEqual({ plan: 'monthly', stripe_sub_id: 'sub_1' })
    expect(await run('d1')).toBe('subscription_deleted')
    expect(m.billing(ORG)).toEqual({ plan: 'free', stripe_sub_id: null })
  })

  it('a deletion that arrives before its own checkout leaves the org free', async () => {
    const { m, run } = setup()
    expect(await run('d1')).toBe('ignored_not_current_subscription')
    expect(await run('c1')).toBe('ignored_subscription_deleted')
    expect(m.billing(ORG)).toEqual({ plan: 'free', stripe_sub_id: null })
  })

  it('a redelivered event is a duplicate and changes nothing', async () => {
    const { m, run } = setup()
    await run('c1')
    const writes = m.writes()
    expect(await run('c1')).toBe('duplicate')
    expect(m.eventCount()).toBe(1)
    expect(m.writes()).toBe(writes)
  })

  it('a pre-M1 subscription (no row) is still cancelled by its deletion', async () => {
    const m = createMemDb()
    m.addOrg(ORG, { plan: 'monthly', stripe_sub_id: 'sub_legacy' })
    const { data } = await m.db.rpc('stripe_webhook_subscription_deleted', {
      p_event_id: 'evt_legacy',
      p_event_created: T3,
      p_sub_id: 'sub_legacy',
    })
    expect(data).toBe('subscription_deleted')
    expect(m.billing(ORG)).toEqual({ plan: 'free', stripe_sub_id: null })
  })

  it('checkout for an unknown org is ignored but still recorded once', async () => {
    const m = createMemDb()
    const args = {
      p_event_id: 'evt_x',
      p_event_created: T1,
      p_org_id: ORG,
      p_customer_id: 'cus_1',
      p_sub_id: 'sub_1',
      p_plan: 'monthly',
    }
    expect((await m.db.rpc('stripe_webhook_checkout_subscription', args)).data).toBe('ignored_org_not_found')
    expect((await m.db.rpc('stripe_webhook_checkout_subscription', args)).data).toBe('duplicate')
  })

  it('payment checkout stamps the case only within the org', async () => {
    const m = createMemDb()
    m.addOrg(ORG)
    m.addCase('case_1', ORG)
    m.addCase('case_other', 'another-org')
    const base = { p_event_created: T1, p_org_id: ORG, p_customer_id: 'cus_9', p_payment_intent_id: 'pi_1' }
    expect((await m.db.rpc('stripe_webhook_checkout_payment', { ...base, p_event_id: 'e1', p_case_id: 'case_1' })).data).toBe(
      'case_payment_recorded',
    )
    expect((await m.db.rpc('stripe_webhook_checkout_payment', { ...base, p_event_id: 'e2', p_case_id: 'case_other' })).data).toBe(
      'ignored_case_not_found',
    )
    expect(m.case('case_1')?.stripe_payment_id).toBe('pi_1')
    expect(m.case('case_other')?.stripe_payment_id).toBeNull()
    expect(m.org(ORG)?.stripe_customer_id).toBe('cus_9')
  })
})

describe('memdb table updates', () => {
  it('apply to rows matching every eq filter', async () => {
    const m = createMemDb()
    m.addOrg(ORG, { stripe_customer_id: 'cus_1' })
    m.addOrg('other', { stripe_customer_id: 'cus_2' })
    expect(await m.db.from('orgs').update({ plan: 'monthly' }).eq('stripe_customer_id', 'cus_1')).toEqual({ error: null })
    expect(m.org(ORG)?.plan).toBe('monthly')
    expect(m.org('other')?.plan).toBe('free')
    expect(m.writes()).toBe(1)
  })

  it("the pre-0064 plan check rejects 'monthly' / 'annual' with 23514 and changes nothing", async () => {
    const m = createMemDb({ planCheck: 'pre0064' })
    m.addOrg(ORG)
    const r = await m.db.from('orgs').update({ plan: 'annual', stripe_sub_id: 'sub_1' }).eq('id', ORG)
    expect(r).toEqual({ error: { code: '23514' } })
    expect(m.org(ORG)).toMatchObject({ plan: 'free', stripe_sub_id: null })
    expect(m.writes()).toBe(0)
  })

  it('failNextWrite injects one failure, then recovers', async () => {
    const m = createMemDb()
    m.addOrg(ORG)
    m.failNextWrite('40001')
    expect(await m.db.from('orgs').update({ plan: 'pro' }).eq('id', ORG)).toEqual({ error: { code: '40001' } })
    expect(await m.db.from('orgs').update({ plan: 'pro' }).eq('id', ORG)).toEqual({ error: null })
    expect(m.org(ORG)?.plan).toBe('pro')
  })
})
