/**
 * Migration batch M1 (migrations/0064_m1_batch.sql) against real Postgres.
 *
 *   A. BL-020 consent events: own 'portal' rows, board 'written'/'email'
 *      rows, append-only (no update, no delete), board reads all.
 *   B. BL-050 notice_posted_at: board writes it, a resident cannot.
 *   E. BL-063 alert_failed_attempts defaults to 0 and refuses negatives.
 *   F. Stripe: every delivery order of {checkout(sub_1), checkout(sub_2),
 *      deleted(sub_1)} ends with the org on sub_2 — the refuted r2 0064
 *      left it on free when the deletion came first. Plus dedupe, a
 *      deletion that precedes its own checkout, and no authenticated
 *      access to the stripe tables or functions.
 *
 * (C/D document visibility + storage: resident-documents.test.ts and
 * storage-isolation.test.ts. G sale floor: flows/record-sale.test.ts.)
 *
 * The lib is called with { m1: true } to exercise the post-flip code path
 * against the real schema. Ids and counts only; no PII.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { loadEmailConsent, recordEmailConsent } from '../../../apps/hoa/src/lib/email-consent'
import { adminDb, makeOrg, mintUser, type OrgFixture, type TestUser } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

let org: OrgFixture
let board: TestUser
let resident: TestUser
let neighbour: TestUser

beforeEach(async () => {
  await truncateAll()
  org = await makeOrg()
  board = await mintUser(org, 'board')
  resident = await mintUser(org, 'resident')
  neighbour = await mintUser(org, 'resident')
})

describe('A. BL-020 email consent events', () => {
  it('a member grants and revokes their own; the latest row is their state', async () => {
    const base = { orgId: org.orgId, userId: resident.id, recordedBy: resident.id, method: 'portal' as const }
    expect(await recordEmailConsent(resident.client, { ...base, granted: true }, { m1: true })).toEqual({ ok: true })
    expect(await recordEmailConsent(resident.client, { ...base, granted: false }, { m1: true })).toEqual({ ok: true })
    const mine = await loadEmailConsent(resident.client, org.orgId, { m1: true })
    expect(mine.ok && mine.available && mine.consent.get(resident.id)?.granted).toBe(false)
  })

  it('a member cannot record consent for a neighbour, or as the board would', async () => {
    const forNeighbour = await resident.client
      .from('member_email_consent_events')
      .insert({ organization_id: org.orgId, user_id: neighbour.id, recorded_by: resident.id, granted: true, method: 'portal' })
    expect(forNeighbour.error).not.toBeNull()
    const written = await resident.client
      .from('member_email_consent_events')
      .insert({ organization_id: org.orgId, user_id: resident.id, recorded_by: resident.id, granted: true, method: 'written' })
    expect(written.error).not.toBeNull()
    const forged = await resident.client
      .from('member_email_consent_events')
      .insert({ organization_id: org.orgId, user_id: resident.id, recorded_by: board.id, granted: true, method: 'portal' })
    expect(forged.error, 'recorded_by must be the caller').not.toBeNull()
  })

  it('the board records a written consent and reads every member; a member reads only their own', async () => {
    const r = await recordEmailConsent(
      board.client,
      { orgId: org.orgId, userId: neighbour.id, recordedBy: board.id, granted: true, method: 'written' },
      { m1: true },
    )
    expect(r).toEqual({ ok: true })
    await recordEmailConsent(
      resident.client,
      { orgId: org.orgId, userId: resident.id, recordedBy: resident.id, granted: true, method: 'portal' },
      { m1: true },
    )
    const all = await loadEmailConsent(board.client, org.orgId, { m1: true })
    expect(all.ok && all.available && [...all.consent.keys()].sort()).toEqual([neighbour.id, resident.id].sort())
    const own = await loadEmailConsent(resident.client, org.orgId, { m1: true })
    expect(own.ok && own.available && [...own.consent.keys()]).toEqual([resident.id])
  })

  it('rows are append-only: no update or delete, not even by the board', async () => {
    await recordEmailConsent(
      board.client,
      { orgId: org.orgId, userId: resident.id, recordedBy: board.id, granted: true, method: 'email' },
      { m1: true },
    )
    const { data: rows } = await adminDb().from('member_email_consent_events').select('id').eq('user_id', resident.id)
    const id = rows![0]!.id
    await board.client.from('member_email_consent_events').update({ granted: false }).eq('id', id)
    await board.client.from('member_email_consent_events').delete().eq('id', id)
    const { data: after } = await adminDb().from('member_email_consent_events').select('granted').eq('id', id)
    expect(after).toEqual([{ granted: true }])
    // Even the service role cannot rewrite evidence (trigger).
    const svc = await adminDb().from('member_email_consent_events').update({ granted: false }).eq('id', id)
    expect(svc.error?.code).toBe('42501')
  })
})

describe('B. BL-050 notice_posted_at', () => {
  it('the board records it; a resident cannot', async () => {
    const { data: m, error } = await adminDb()
      .from('hoa_meeting_minutes')
      .insert({ org_id: org.orgId, meeting_date: '2026-11-01', meeting_type: 'annual' })
      .select('id')
      .single()
    expect(error).toBeNull()
    const at = '2026-10-15T12:00:00+00:00'
    const ok = await board.client.from('hoa_meeting_minutes').update({ notice_posted_at: at }).eq('id', m!.id).select('id')
    expect(ok.data).toHaveLength(1)
    await resident.client.from('hoa_meeting_minutes').update({ notice_posted_at: null }).eq('id', m!.id)
    const { data: row } = await adminDb().from('hoa_meeting_minutes').select('notice_posted_at').eq('id', m!.id).single()
    expect(Date.parse(row!.notice_posted_at!)).toBe(Date.parse(at))
  })
})

describe('E. BL-063 alert attempt columns', () => {
  it('default to 0 / null and refuse a negative count', async () => {
    const { data, error } = await adminDb()
      .from('hoa_recurring_events')
      .insert({ organization_id: org.orgId, title: 'Pool opening', event_date: '2026-11-01', recurrence: 'annual' } as never)
      .select('alert_failed_attempts, alert_failed_for, id')
      .single()
    expect(error).toBeNull()
    const row = data as unknown as { id: string; alert_failed_attempts: number; alert_failed_for: string | null }
    expect([row.alert_failed_attempts, row.alert_failed_for]).toEqual([0, null])
    const neg = await adminDb().from('hoa_recurring_events').update({ alert_failed_attempts: -1 }).eq('id', row.id)
    expect(neg.error?.code).toBe('23514')
  })
})

describe('F. Stripe webhook ordering is per subscription', () => {
  const T1 = '2026-10-01T00:00:00Z'
  const T2 = '2026-10-10T00:00:00Z'
  const T3 = '2026-10-10T00:00:05Z'

  type Step = 'c1' | 'c2' | 'd1'
  async function run(step: Step) {
    const db = adminDb()
    if (step === 'd1') {
      const { data, error } = await db.rpc('stripe_webhook_subscription_deleted', {
        p_event_id: 'evt_d1',
        p_event_created: T3,
        p_sub_id: 'sub_1',
      })
      expect(error).toBeNull()
      return data
    }
    const one = step === 'c1'
    const { data, error } = await db.rpc('stripe_webhook_checkout_subscription', {
      p_event_id: one ? 'evt_c1' : 'evt_c2',
      p_event_created: one ? T1 : T2,
      p_org_id: org.orgId,
      p_customer_id: 'cus_1',
      p_sub_id: one ? 'sub_1' : 'sub_2',
      p_plan: one ? 'monthly' : 'annual',
    })
    expect(error).toBeNull()
    return data
  }
  async function billing() {
    const { data } = await adminDb().from('orgs').select('plan, stripe_sub_id').eq('id', org.orgId).single()
    return data
  }

  const orders: Step[][] = [
    ['c1', 'c2', 'd1'],
    ['c1', 'd1', 'c2'], // the refuted case: deletion of the old sub before the new checkout
    ['c2', 'c1', 'd1'],
    ['c2', 'd1', 'c1'],
    ['d1', 'c1', 'c2'],
    ['d1', 'c2', 'c1'],
  ]
  for (const order of orders) {
    it(`${order.join(' → ')} ends on sub_2 (annual)`, async () => {
      for (const step of order) await run(step)
      expect(await billing()).toEqual({ plan: 'annual', stripe_sub_id: 'sub_2' })
    })
  }

  it('cancelling the only subscription downgrades to free; a late checkout cannot revive it', async () => {
    expect(await run('c1')).toBe('subscription_started')
    expect(await billing()).toEqual({ plan: 'monthly', stripe_sub_id: 'sub_1' })
    expect(await run('d1')).toBe('subscription_deleted')
    expect(await billing()).toEqual({ plan: 'free', stripe_sub_id: null })
  })

  it('a deletion that arrives before its own checkout leaves the org free', async () => {
    expect(await run('d1')).toBe('ignored_not_current_subscription')
    expect(await run('c1')).toBe('ignored_subscription_deleted')
    expect(await billing()).toEqual({ plan: 'free', stripe_sub_id: null })
  })

  it('a redelivered event is a duplicate and changes nothing', async () => {
    await run('c1')
    expect(await run('c1')).toBe('duplicate')
    const { count } = await adminDb().from('stripe_webhook_events').select('event_id', { count: 'exact', head: true })
    expect(count).toBe(1)
  })

  it('a pre-M1 subscription (no row) is still cancelled by its deletion', async () => {
    await adminDb().from('orgs').update({ plan: 'monthly', stripe_sub_id: 'sub_legacy' }).eq('id', org.orgId)
    const { data } = await adminDb().rpc('stripe_webhook_subscription_deleted', {
      p_event_id: 'evt_legacy',
      p_event_created: T3,
      p_sub_id: 'sub_legacy',
    })
    expect(data).toBe('subscription_deleted')
    expect(await billing()).toEqual({ plan: 'free', stripe_sub_id: null })
  })

  it('an org member can neither read the stripe tables nor change billing through the functions', async () => {
    await run('c1')
    const { data: rows } = await board.client.from('stripe_subscriptions').select('sub_id')
    expect(rows ?? []).toEqual([])
    const { data: evts } = await board.client.from('stripe_webhook_events').select('event_id')
    expect(evts ?? []).toEqual([])
    // Local replay re-grants EXECUTE to everyone; SECURITY INVOKER + RLS
    // still leaves an authenticated caller unable to write.
    await board.client.rpc('stripe_webhook_subscription_deleted', {
      p_event_id: 'evt_forged',
      p_event_created: T3,
      p_sub_id: 'sub_1',
    })
    expect(await billing()).toEqual({ plan: 'monthly', stripe_sub_id: 'sub_1' })
  })
})
