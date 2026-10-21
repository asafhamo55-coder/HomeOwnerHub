/**
 * Migration 0069 part 1 (migrations/0069_m5_batch.sql, batch M5, BL-137
 * dues_rates) against real Postgres. CI only (no local database).
 *
 *   - board and admin of the org read and write; created_by is always the
 *     caller (SEC-N6 shape, as 0067/0068);
 *   - a resident reads exactly one row: the rate in effect today for the
 *     association where they own a home — not an upcoming one, not a past
 *     one, not another association's — and writes nothing (42501);
 *   - another org's board sees nothing and writes nothing;
 *   - the association must be the row's org's, and the budget the row's
 *     association's (23503, even for the service role); deleting the
 *     budget nulls the link;
 *   - one rate per association per start day (23505); CHECKs (23514).
 *
 * Fixture rule (fixtures/factory.ts): adminDb() seeds; every RLS assertion
 * about a user runs through that user's own client. Ids and counts only;
 * no PII. The table is not in the generated Database types until gen:types
 * runs after prod has 0069 (CLAUDE.md footgun 3), hence the casts.
 */
import { createClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it } from 'vitest'
import { LOCAL_ANON_KEY, LOCAL_SUPABASE_URL } from '../setup/env'
import { adminDb, makeAccounting, makeOrg, makeUnit, mintUser, type OrgFixture, type TestUser } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

let org: OrgFixture
let other: OrgFixture
let board: TestUser
let admin: TestUser
let owner: TestUser
let tenantless: TestUser
let otherBoard: TestUser

const table = 'dues_rates' as never

/** A day relative to the database's today (the helper compares with current_date). */
function day(offsetDays: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

const rate = (f: OrgFixture, extra: Record<string, unknown> = {}) => ({
  organization_id: f.orgId,
  association_id: f.associationId,
  effective_from: day(-400),
  amount_cents: 25_000,
  frequency: 'monthly',
  ...extra,
})

async function insertOne(t: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await adminDb().from(t as never).insert(row as never).select('id').single()
  if (error || !data) throw new Error(`seed ${t}: ${error?.code ?? 'no row'}`)
  return (data as { id: string }).id
}

beforeEach(async () => {
  await truncateAll()
  org = await makeOrg()
  other = await makeOrg()
  board = await mintUser(org, 'board')
  admin = await mintUser(org, 'admin')
  owner = await mintUser(org, 'resident')
  tenantless = await mintUser(org, 'resident')
  otherBoard = await mintUser(other, 'board')
  const unit = await makeUnit(org)
  await insertOne('ownerships', { organization_id: org.orgId, unit_id: unit, owner_user_id: owner.id, valid_from: '2024-01-01' })
})

describe('0069 part 1: dues_rates (BL-137)', () => {
  it('board and admin write and read their org’s rates; created_by is the caller whatever the row says', async () => {
    const asBoard = await board.client.from(table).insert(rate(org, { created_by: admin.id }) as never)
    expect(asBoard.error).toBeNull()
    const asAdmin = await admin.client.from(table).insert(rate(org, { effective_from: day(60), amount_cents: 27_500 }) as never)
    expect(asAdmin.error).toBeNull()
    const { data } = await admin.client.from(table).select('amount_cents, created_by').order('effective_from' as never)
    expect(data).toEqual([
      { amount_cents: 25_000, created_by: board.id },
      { amount_cents: 27_500, created_by: admin.id },
    ])
    const upd = await admin.client.from(table).update({ created_by: admin.id, notes: 'Adopted' } as never).eq('amount_cents' as never, 25_000).select('id')
    expect(upd.error).toBeNull()
    expect(upd.data ?? []).toHaveLength(1)
    const { data: after } = await adminDb().from(table).select('created_by, notes').eq('amount_cents' as never, 25_000)
    expect(after).toEqual([{ created_by: board.id, notes: 'Adopted' }])
  })

  it('a resident reads only the rate in effect today for their own home’s association, and writes nothing', async () => {
    const past = await insertOne('dues_rates', rate(org, { effective_from: day(-400), amount_cents: 20_000 }))
    const current = await insertOne('dues_rates', rate(org, { effective_from: day(-10), amount_cents: 25_000 }))
    await insertOne('dues_rates', rate(org, { effective_from: day(30), amount_cents: 27_500 }))
    await insertOne('dues_rates', rate(other, { effective_from: day(-10) }))
    expect(past).not.toBe(current)

    const { data } = await owner.client.from(table).select('id, amount_cents')
    expect(data).toEqual([{ id: current, amount_cents: 25_000 }])

    // A resident with no home in the association sees nothing.
    const none = await tenantless.client.from(table).select('id')
    expect(none.data ?? []).toHaveLength(0)

    const ins = await owner.client.from(table).insert(rate(org, { effective_from: day(90) }) as never)
    expect(ins.error?.code).toBe('42501')
    const upd = await owner.client.from(table).update({ amount_cents: 1 } as never).eq('id' as never, current).select('id')
    expect(upd.data ?? []).toHaveLength(0)
    const del = await owner.client.from(table).delete().eq('id' as never, current).select('id')
    expect(del.data ?? []).toHaveLength(0)
    const { count } = await adminDb().from(table).select('id', { count: 'exact', head: true })
    expect(count).toBe(4)
  })

  it('another org’s board sees nothing, writes nothing and deletes nothing', async () => {
    await insertOne('dues_rates', rate(org))
    const { data } = await otherBoard.client.from(table).select('id')
    expect(data ?? []).toHaveLength(0)
    const ins = await otherBoard.client.from(table).insert(rate(org, { effective_from: day(5) }) as never)
    expect(ins.error?.code).toBe('42501')
    const del = await otherBoard.client.from(table).delete().eq('organization_id' as never, org.orgId).select('id')
    expect(del.data ?? []).toHaveLength(0)
  })

  it('the association must be the row’s org’s (23503, even for the service role and a board of both orgs)', async () => {
    await adminDb().from('org_members').insert({ org_id: other.orgId, user_id: board.id, role: 'board' })
    const asBoard = await board.client.from(table).insert(rate(org, { association_id: other.associationId }) as never)
    expect(asBoard.error?.code).toBe('23503')
    const asService = await adminDb().from(table).insert(rate(org, { association_id: other.associationId }) as never)
    expect(asService.error?.code).toBe('23503')
  })

  it('the budget must be the association’s; deleting the budget nulls the link', async () => {
    const mine = await makeAccounting(org)
    const theirs = await makeAccounting(other)
    const budget = (f: OrgFixture, refs: typeof mine) =>
      insertOne('budgets', { organization_id: f.orgId, association_id: f.associationId, fiscal_period_id: refs.fiscalPeriodId, fund_id: refs.fundIds.OPERATING })
    const myBudget = await budget(org, mine)
    const theirBudget = await budget(other, theirs)

    const foreign = await adminDb().from(table).insert(rate(org, { budget_id: theirBudget }) as never)
    expect(foreign.error?.code).toBe('23503')
    const { data, error } = await board.client.from(table).insert(rate(org, { budget_id: myBudget }) as never).select('id').single()
    expect(error).toBeNull()
    const id = (data as unknown as { id: string }).id
    await adminDb().from('budgets').delete().eq('id', myBudget)
    const { data: after } = await adminDb().from(table).select('budget_id').eq('id' as never, id).single()
    expect((after as unknown as { budget_id: string | null }).budget_id).toBeNull()
  })

  it('one rate per start day (23505); CHECKs refuse bad amounts, frequencies and shapes (23514)', async () => {
    await insertOne('dues_rates', rate(org))
    const dup = await board.client.from(table).insert(rate(org, { amount_cents: 1 }) as never)
    expect(dup.error?.code).toBe('23505')
    for (const bad of [
      rate(org, { effective_from: day(1), amount_cents: 0 }),
      rate(org, { effective_from: day(2), amount_cents: 10_000_001 }),
      rate(org, { effective_from: day(3), frequency: 'weekly' }),
      rate(org, { effective_from: day(4), basis: 'per_lot' }),
      rate(org, { effective_from: day(5), basis: 'per_unit_type' }),
      rate(org, { effective_from: day(6), unit_type_amounts: { townhome: 30_000 } }),
      rate(org, { effective_from: day(7), notes: 'x'.repeat(501) }),
    ]) {
      const { error } = await adminDb().from(table).insert(bad as never)
      expect(error?.code).toBe('23514')
    }
    const typed = await adminDb().from(table).insert(rate(org, { effective_from: day(8), basis: 'per_unit_type', unit_type_amounts: { townhome: 30_000 } }) as never)
    expect(typed.error).toBeNull()
  })

  it('anon cannot call the resident helper', async () => {
    const anon = createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error } = await anon.rpc('dues_rates_resident_current_ids' as never)
    expect(error).not.toBeNull()
  })
})
