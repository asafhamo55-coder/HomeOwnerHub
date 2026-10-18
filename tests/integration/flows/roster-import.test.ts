/**
 * The board's roster import against real Postgres + RLS (P4 / PR-02).
 *
 * Unit tests prove commit.ts → importLots sequencing over an in-memory
 * client; this proves the same path works through a BOARD user's
 * RLS-bound client (0063 policies, no service role), is idempotent on
 * re-import, honours Skip / Update, and that a foreign board user writes
 * nothing into the org.
 *
 * Fixtures are synthetic; no real addresses or people.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { commitRosterHomes } from '../../../apps/hoa/src/lib/properties/roster/commit'
import type { RosterRowInput } from '../../../apps/hoa/src/lib/properties/roster/rows'
import { adminDb, makeOrg, mintUser, type OrgFixture, type TestUser } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

let org: OrgFixture
let board: TestUser

beforeEach(async () => {
  await truncateAll()
  org = await makeOrg()
  board = await mintUser(org, 'board')
})

const row = (n: number, address: string, extra: Partial<RosterRowInput> = {}): RosterRowInput => ({
  row: n,
  address,
  unit: null,
  city: null,
  state: null,
  zip: null,
  ownerName: null,
  ownerEmail: null,
  ownerPhone: null,
  mailingAddress: null,
  tenure: null,
  ...extra,
})

const homes = () => [
  {
    rows: [
      row(2, '100 Fixture Lane', { city: 'Fixtureville', state: 'FL', zip: '32000', ownerName: 'Fixture Owner', ownerEmail: 'owner@example.test', tenure: 'leased' as const }),
      row(3, '100 Fixture Lane', { ownerName: 'Fixture Co-owner', ownerEmail: 'co@example.test' }),
    ],
  },
  { rows: [row(4, '200 Fixture Lane', { unit: '1' })] },
  { rows: [row(5, '200 Fixture Lane', { unit: '2' })] },
]

async function counts(orgId: string) {
  const db = adminDb()
  const c = async (t: 'hoa_properties' | 'units' | 'ownerships' | 'property_residents', col: string) =>
    (await db.from(t).select('id', { count: 'exact', head: true }).eq(col, orgId)).count
  return {
    properties: await c('hoa_properties', 'org_id'),
    units: await c('units', 'organization_id'),
    ownerships: await c('ownerships', 'organization_id'),
    residents: await c('property_residents', 'organization_id'),
  }
}

describe('roster import through a board user’s RLS client', () => {
  it('writes both sides of every home, several owners per lot, and condo units apart', async () => {
    const r = await commitRosterHomes(board.client as never, { orgId: org.orgId, associationId: org.associationId, mode: 'skip', homes: homes() })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.results.map((x) => x.status)).toEqual(['new', 'new', 'new', 'new'])
    expect(await counts(org.orgId)).toEqual({ properties: 3, units: 3, ownerships: 2, residents: 2 })

    const { data: unit } = await adminDb().from('units').select('*').eq('organization_id', org.orgId).eq('address_line1', '100 Fixture Lane').single()
    expect(unit).toMatchObject({ association_id: org.associationId, city: 'Fixtureville', postal_code: '32000' })
    const { data: prop } = await adminDb().from('hoa_properties').select('*').eq('id', unit!.legacy_hoa_property_id!).single()
    expect(prop).toMatchObject({ tenure: 'leased', owner_email: 'owner@example.test' })
  })

  it('re-importing the same file adds nothing (idempotent), in either mode', async () => {
    await commitRosterHomes(board.client as never, { orgId: org.orgId, associationId: org.associationId, mode: 'skip', homes: homes() })
    const before = await counts(org.orgId)
    const skip = await commitRosterHomes(board.client as never, { orgId: org.orgId, associationId: org.associationId, mode: 'skip', homes: homes() })
    expect(skip.ok && skip.results.map((x) => x.status)).toEqual(['duplicate', 'duplicate', 'duplicate', 'duplicate'])
    const upd = await commitRosterHomes(board.client as never, { orgId: org.orgId, associationId: org.associationId, mode: 'update', homes: homes() })
    expect(upd.ok && upd.results.map((x) => x.status)).toEqual(['update', 'update', 'update', 'update'])
    expect(await counts(org.orgId)).toEqual(before)
  })

  it("'update' corrects an existing home's details and the same owner's phone", async () => {
    await commitRosterHomes(board.client as never, { orgId: org.orgId, associationId: org.associationId, mode: 'skip', homes: homes() })
    await commitRosterHomes(board.client as never, {
      orgId: org.orgId,
      associationId: org.associationId,
      mode: 'update',
      homes: [{ rows: [row(2, '100 fixture lane', { city: 'Newtown', ownerEmail: 'OWNER@example.test', ownerPhone: '555-0100' })] }],
    })
    const db = adminDb()
    const { data: unit } = await db.from('units').select('city').eq('organization_id', org.orgId).eq('address_line1', '100 Fixture Lane').single()
    expect(unit?.city).toBe('Newtown')
    const { data: own } = await db.from('ownerships').select('owner_phone').eq('organization_id', org.orgId).eq('owner_email', 'owner@example.test').single()
    expect(own?.owner_phone).toBe('555-0100')
  })

  it('a board member of another org writes nothing into this one', async () => {
    const other = await makeOrg()
    const foreign = await mintUser(other, 'board')
    const r = await commitRosterHomes(foreign.client as never, { orgId: org.orgId, associationId: org.associationId, mode: 'skip', homes: homes() })
    // Either refused up front (the community isn't visible) or every row errors.
    if (r.ok) expect(r.results.every((x) => x.status === 'error')).toBe(true)
    expect(await counts(org.orgId)).toEqual({ properties: 0, units: 0, ownerships: 0, residents: 0 })
  })
})
