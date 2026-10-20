/**
 * Migration 0065 (migrations/0065_m2_prep.sql, BL-123) against real Postgres.
 *
 *   1. orgs_plan_check accepts the BL-104 plans (essentials, complete,
 *      pilot, legacy_per_door) and still every 0064 plan; anything else
 *      is refused with 23514.
 *   2. resident_meeting_notices(): see resident-meetings.test.ts.
 *   3. SMS consent guard (BL-110): a board member cannot turn texts ON
 *      for someone else (insert or update), nor can anyone on a unit-only
 *      row; the resident can for themselves; the service role can for a
 *      named user; turning texts OFF stays open to the board.
 *   4. inbox_messages.sender_auth exists (nothing writes it until
 *      SENDER_AUTH_COLUMN_LIVE flips).
 *
 * Fixture rule (fixtures/factory.ts): adminDb() seeds; every RLS/trigger
 * assertion about a user runs through that user's own client. Ids and
 * counts only; no PII.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { adminDb, makeOrg, makeUnit, mintUser, type OrgFixture, type TestUser } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

let org: OrgFixture
let board: TestUser
let resident: TestUser

beforeEach(async () => {
  await truncateAll()
  org = await makeOrg()
  board = await mintUser(org, 'board')
  resident = await mintUser(org, 'resident')
})

describe('1. orgs_plan_check (BL-104 plans)', () => {
  async function setPlan(plan: string) {
    const { error } = await adminDb().from('orgs').update({ plan }).eq('id', org.orgId)
    return error?.code ?? null
  }

  for (const plan of ['essentials', 'complete', 'pilot', 'legacy_per_door']) {
    it(`accepts '${plan}'`, async () => {
      expect(await setPlan(plan)).toBeNull()
      const { data } = await adminDb().from('orgs').select('plan').eq('id', org.orgId).single()
      expect(data?.plan).toBe(plan)
    })
  }

  it('keeps every plan 0064 allowed', async () => {
    for (const plan of ['free', 'starter', 'standard', 'pro', 'enterprise', 'per_case', 'unlimited', 'monthly', 'annual']) {
      expect(await setPlan(plan), plan).toBeNull()
    }
  })

  it('still refuses an unknown plan with 23514', async () => {
    expect(await setPlan('platinum')).toBe('23514')
  })
})

describe('3. SMS consent guard (resident_sms_opt_in_self_only)', () => {
  const prefs = 'resident_communication_preferences'

  async function seedPref(userId: string | null, smsOn: boolean, unitId?: string): Promise<string> {
    const { data, error } = await adminDb()
      .from(prefs)
      .insert({ organization_id: org.orgId, user_id: userId, unit_id: unitId ?? null, sms_opt_in: smsOn })
      .select('id')
      .single()
    if (error || !data) throw new Error(`seed ${prefs}: ${error?.code}`)
    return data.id
  }

  async function smsOn(id: string): Promise<boolean | undefined> {
    const { data } = await adminDb().from(prefs).select('sms_opt_in').eq('id', id).single()
    return data?.sms_opt_in
  }

  it("a board member cannot insert a resident's row with texts on", async () => {
    const { error } = await board.client
      .from(prefs)
      .insert({ organization_id: org.orgId, user_id: resident.id, sms_opt_in: true })
    expect(error?.code).toBe('42501')
    const { count } = await adminDb().from(prefs).select('id', { count: 'exact', head: true }).eq('user_id', resident.id)
    expect(count).toBe(0)
  })

  it("a board member cannot turn a resident's texts on", async () => {
    const id = await seedPref(resident.id, false)
    const { error } = await board.client.from(prefs).update({ sms_opt_in: true }).eq('id', id)
    expect(error?.code).toBe('42501')
    expect(await smsOn(id)).toBe(false)
  })

  it("a board member can still turn a resident's texts off", async () => {
    const id = await seedPref(resident.id, true)
    const { error } = await board.client.from(prefs).update({ sms_opt_in: false }).eq('id', id)
    expect(error).toBeNull()
    expect(await smsOn(id)).toBe(false)
  })

  it('a board member can edit other fields of a row whose texts are already on', async () => {
    const id = await seedPref(resident.id, true)
    const { error } = await board.client.from(prefs).update({ email_opt_in: false }).eq('id', id)
    expect(error).toBeNull()
    expect(await smsOn(id)).toBe(true)
  })

  it('a resident can turn their own texts on (insert and update)', async () => {
    const ins = await resident.client
      .from(prefs)
      .insert({ organization_id: org.orgId, user_id: resident.id, sms_opt_in: true })
      .select('id')
      .single()
    expect(ins.error).toBeNull()
    expect(await smsOn(ins.data!.id)).toBe(true)

    const other = await mintUser(org, 'resident')
    const id = await seedPref(other.id, false)
    const { error } = await other.client.from(prefs).update({ sms_opt_in: true }).eq('id', id)
    expect(error).toBeNull()
    expect(await smsOn(id)).toBe(true)
  })

  it('the service role can turn texts on for a named resident', async () => {
    const id = await seedPref(resident.id, false)
    const { error } = await adminDb().from(prefs).update({ sms_opt_in: true }).eq('id', id)
    expect(error).toBeNull()
    expect(await smsOn(id)).toBe(true)
  })

  it('nobody, not even the service role, can turn texts on for a unit-only row', async () => {
    const unitId = await makeUnit(org)
    const id = await seedPref(null, false, unitId)
    const asBoard = await board.client.from(prefs).update({ sms_opt_in: true }).eq('id', id)
    expect(asBoard.error?.code).toBe('42501')
    const asService = await adminDb().from(prefs).update({ sms_opt_in: true }).eq('id', id)
    expect(asService.error?.code).toBe('42501')
    expect(await smsOn(id)).toBe(false)
  })
})

describe('4. inbox_messages.sender_auth', () => {
  it('the column exists and is readable through PostgREST', async () => {
    // Not in the generated Database types until gen:types runs after prod
    // has 0065 (CLAUDE.md footgun 3), hence the cast.
    const { error } = await adminDb()
      .from('inbox_messages')
      .select('sender_auth' as never)
      .limit(1)
    expect(error).toBeNull()
  })
})
