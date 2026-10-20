/**
 * Migration 0066 part 4 (orgs_billing_columns_guard) against real Postgres.
 * CI only (no local database).
 *
 * 0063's orgs_update policy lets an org admin UPDATE any column of their
 * own org. The guard refuses changes to the billing, entitlement and
 * lifecycle columns from any authenticated client with 42501, so an admin
 * cannot self-grant a plan, swap or clear the Stripe ids (a second trial),
 * change the billed door count, or lift a suspension. The admin can still
 * rename the org, and the service role (webhook, platform admin) can still
 * write every column.
 *
 * Fixture rule (fixtures/factory.ts): adminDb() seeds; every RLS assertion
 * about a user runs through that user's own client. Ids and counts only.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { adminDb, makeOrg, mintUser, type OrgFixture, type TestUser } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

let org: OrgFixture
let admin: TestUser

const SEEDED = {
  plan: 'starter',
  stripe_customer_id: 'cus_guard_seed',
  stripe_sub_id: 'sub_guard_seed',
  doors_count: 40,
}

type OrgRow = {
  name: string
  plan: string
  stripe_customer_id: string | null
  stripe_sub_id: string | null
  doors_count: number | null
  suspended_at: string | null
  archived_at: string | null
  hub_type: string
}

async function readOrg(): Promise<OrgRow> {
  const { data, error } = await adminDb()
    .from('orgs')
    .select('name, plan, stripe_customer_id, stripe_sub_id, doors_count, suspended_at, archived_at, hub_type')
    .eq('id', org.orgId)
    .single()
  if (error || !data) throw new Error(`readOrg failed: ${error?.code ?? 'no row'}`)
  return data as OrgRow
}

beforeEach(async () => {
  await truncateAll()
  org = await makeOrg()
  admin = await mintUser(org, 'admin')
  const { error } = await adminDb().from('orgs').update(SEEDED).eq('id', org.orgId)
  if (error) throw new Error(`seed failed: ${error.code}`)
})

describe('orgs_billing_columns_guard: admin own client', () => {
  const attempts: Array<[string, Record<string, unknown>]> = [
    ['plan', { plan: 'enterprise' }],
    ['stripe_customer_id (swap)', { stripe_customer_id: 'cus_attacker' }],
    ['stripe_customer_id (clear)', { stripe_customer_id: null }],
    ['stripe_sub_id (swap)', { stripe_sub_id: 'sub_attacker' }],
    ['stripe_sub_id (clear)', { stripe_sub_id: null }],
    ['doors_count', { doors_count: 1 }],
    ['hub_type', { hub_type: 'pm' }],
  ]

  for (const [label, patch] of attempts) {
    it(`cannot change ${label}`, async () => {
      const { error } = await admin.client.from('orgs').update(patch as never).eq('id', org.orgId)
      expect(error?.code).toBe('42501')
      expect(await readOrg()).toMatchObject({ ...SEEDED, hub_type: 'hoa' })
    })
  }

  it('cannot lift a platform suspension', async () => {
    const suspendedAt = new Date().toISOString()
    await adminDb().from('orgs').update({ suspended_at: suspendedAt }).eq('id', org.orgId)
    const { error } = await admin.client.from('orgs').update({ suspended_at: null } as never).eq('id', org.orgId)
    expect(error?.code).toBe('42501')
    expect((await readOrg()).suspended_at).not.toBeNull()
  })

  it('cannot sneak a billing column in alongside a rename', async () => {
    const { error } = await admin.client
      .from('orgs')
      .update({ name: 'Renamed HOA', plan: 'enterprise' } as never)
      .eq('id', org.orgId)
    expect(error?.code).toBe('42501')
    const row = await readOrg()
    expect(row.plan).toBe(SEEDED.plan)
    expect(row.name).not.toBe('Renamed HOA')
  })

  it('can still rename the org and touch updated_at', async () => {
    const { data, error } = await admin.client
      .from('orgs')
      .update({ name: 'Renamed HOA', updated_at: new Date().toISOString() } as never)
      .eq('id', org.orgId)
      .select('id')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(await readOrg()).toMatchObject({ ...SEEDED, name: 'Renamed HOA' })
  })

  it('writing a billing column to its current value is not a change', async () => {
    const { error } = await admin.client
      .from('orgs')
      .update({ name: 'Same plan HOA', plan: SEEDED.plan } as never)
      .eq('id', org.orgId)
    expect(error).toBeNull()
    expect((await readOrg()).name).toBe('Same plan HOA')
  })
})

describe('orgs_billing_columns_guard: service role', () => {
  it('can change every billing and lifecycle column', async () => {
    const now = new Date().toISOString()
    const { error } = await adminDb()
      .from('orgs')
      .update({
        plan: 'enterprise',
        stripe_customer_id: 'cus_server',
        stripe_sub_id: 'sub_server',
        doors_count: 120,
        suspended_at: now,
        archived_at: now,
      })
      .eq('id', org.orgId)
    expect(error).toBeNull()
    const row = await readOrg()
    expect(row).toMatchObject({
      plan: 'enterprise',
      stripe_customer_id: 'cus_server',
      stripe_sub_id: 'sub_server',
      doors_count: 120,
    })
    expect(row.suspended_at).not.toBeNull()
    expect(row.archived_at).not.toBeNull()

    const { error: downgradeError } = await adminDb()
      .from('orgs')
      .update({ plan: 'free', stripe_sub_id: null, suspended_at: null, archived_at: null })
      .eq('id', org.orgId)
    expect(downgradeError).toBeNull()
    expect(await readOrg()).toMatchObject({ plan: 'free', stripe_sub_id: null, suspended_at: null, archived_at: null })
  })
})
