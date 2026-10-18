/**
 * Record a sale against real Postgres + RLS (Properties P3, PR-03).
 *
 * The unit tests prove lib/properties/sale.ts sequences and compensates
 * its writes on a fake. This proves, through a BOARD user's RLS-bound
 * client and real resident JWTs:
 *
 *   - the seller can no longer see the unit once the sale is recorded
 *     (0061 auth_resident_unit_ids reads only current ownerships and
 *     residents not moved out);
 *   - "Invite to portal" links the buyer's sale ownership instead of
 *     opening a second one, so the settlement date stays its start;
 *   - the buyer's portal reads start at the settlement date — in the
 *     database (0064's auth_resident_charges_from on assessments_select /
 *     payments_select: RLS alone no longer returns seller-era rows) and
 *     again in the app (resident-sale-window.ts, defence in depth);
 *   - a step Postgres rejects mid-way leaves the lot exactly as it was.
 *
 * Fixtures are synthetic; no real addresses or people.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createLot, linkOwnershipForMember } from '../../../apps/hoa/src/lib/properties/lot'
import { recordSale } from '../../../apps/hoa/src/lib/properties/sale'
import { asPropertyId, type PropertyId } from '../../../apps/hoa/src/lib/properties/resolve'
import { loadLedgerRows } from '../../../apps/hoa/src/lib/resident-ledger'
import { chargeWindow, chargesFromForOwnership, scopeLedgerRows } from '../../../apps/hoa/src/lib/resident-sale-window'
import { exactIlike } from '../../../apps/hoa/src/lib/impersonation-target'
import { adminDb, makeAccounting, makeOrg, mintUser, type OrgFixture, type TestUser } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

const SETTLED = '2026-09-15'
const ZONE = 'America/New_York'

let org: OrgFixture
let board: TestUser
let seller: TestUser
let buyer: TestUser
let propertyId: PropertyId
let unitId: string
let preSale: string
let postSale: string

beforeEach(async () => {
  await truncateAll()
  org = await makeOrg()
  const acct = await makeAccounting(org)
  board = await mintUser(org, 'board')
  seller = await mintUser(org, 'resident')
  buyer = await mintUser(org, 'resident')

  const lot = await createLot(board.client as never, {
    orgId: org.orgId,
    associationId: org.associationId,
    address: '200 Fixture Lane',
    unitNumber: null,
    owner: { name: 'Fixture Seller', email: seller.email, phone: null },
    notes: null,
    today: '2024-01-01',
    userId: board.id,
  })
  if (!lot.ok) throw new Error(`seed lot: ${lot.error}`)
  propertyId = lot.data.propertyId
  unitId = lot.data.unitId

  const db = adminDb()
  // The seller is a portal owner: linked ownership and an owner resident row.
  const { error: linkErr } = await db.from('ownerships').update({ owner_user_id: seller.id }).eq('id', lot.data.ownershipId!)
  if (linkErr) throw new Error(`seed link: ${linkErr.message}`)
  const { error: resErr } = await db.from('property_residents').insert({
    organization_id: org.orgId,
    property_id: propertyId,
    full_name: 'Fixture Seller',
    email: seller.email,
    role: 'owner',
    is_primary: true,
    moved_in_at: '2024-01-01',
  })
  if (resErr) throw new Error(`seed resident: ${resErr.message}`)

  const charge = async (due_date: string) => {
    const { data, error } = await db
      .from('assessments')
      .insert({
        organization_id: org.orgId,
        association_id: org.associationId,
        unit_id: unitId,
        fiscal_period_id: acct.fiscalPeriodId,
        assessment_type: 'regular',
        amount: 300,
        due_date,
        status: 'open',
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`seed charge: ${error?.message}`)
    return data.id
  }
  preSale = await charge('2026-09-01')
  postSale = await charge('2026-10-01')
})

const record = (over: Partial<Parameters<typeof recordSale>[1]> = {}) =>
  recordSale(board.client as never, {
    orgId: org.orgId,
    propertyId: asPropertyId(propertyId),
    userId: board.id,
    settlementDate: SETTLED,
    buyers: [{ name: 'Fixture Buyer', email: buyer.email, phone: null, mailingAddress: null, pct: 100 }],
    carryTenants: true,
    addBuyersAsResidents: true,
    ...over,
  })

describe('record a sale through a board user’s RLS client', () => {
  it('the seller can see the unit before, and not after', async () => {
    const before = await loadLedgerRows(seller.client, [unitId])
    expect(before.ok && before.assessments.map((a) => a.id).sort()).toEqual([preSale, postSale].sort())

    const r = await record()
    expect(r.ok).toBe(true)

    const after = await loadLedgerRows(seller.client, [unitId])
    expect(after).toEqual({ ok: true, assessments: [], payments: [], truncated: false })
    const { data: units } = await seller.client.from('units').select('id').eq('id', unitId)
    expect(units ?? []).toEqual([])
  })

  it('writes the ownership periods, the owner fields and one ownership_changed event', async () => {
    const r = await record()
    expect(r.ok).toBe(true)
    const db = adminDb()
    const { data: owns } = await db.from('ownerships').select('*').eq('unit_id', unitId).order('valid_from')
    expect(owns?.map((o) => [o.owner_user_id, o.valid_from, o.valid_to, o.source])).toEqual([
      [seller.id, '2024-01-01', SETTLED, 'manual'],
      [null, SETTLED, null, 'sale'],
    ])
    const { data: prop } = await db.from('hoa_properties').select('owner_email, owner_name').eq('id', propertyId).single()
    expect(prop).toEqual({ owner_email: buyer.email, owner_name: 'Fixture Buyer' })
    const { data: events } = await db.from('property_events').select('kind, payload').eq('property_id', propertyId)
    expect(events).toHaveLength(1)
    expect(events?.[0]).toMatchObject({ kind: 'ownership_changed', payload: { reason: 'sale', settlement_date: SETTLED, buyers: 1 } })
  })

  it('invite links the buyer’s sale ownership; the buyer’s portal starts at settlement', async () => {
    expect((await record()).ok).toBe(true)
    const linked = await linkOwnershipForMember(adminDb() as never, {
      orgId: org.orgId,
      unitId,
      userId: buyer.id,
      email: buyer.email,
      escapedEmail: exactIlike(buyer.email),
      fullName: 'Fixture Buyer',
      today: '2026-10-17',
    })
    expect(linked).toEqual({ ok: true, data: { outcome: 'linked' } })

    // What resident.ts reads for the buyer.
    const { data: mine } = await buyer.client.from('ownerships').select('unit_id, valid_from, source').eq('owner_user_id', buyer.id).is('valid_to', null)
    expect(mine).toHaveLength(1)
    const window = chargeWindow([{ unit_id: unitId, charges_from: chargesFromForOwnership(mine![0]!) }])

    const raw = await loadLedgerRows(buyer.client, [unitId])
    expect(raw.ok).toBe(true)
    if (!raw.ok) return
    // 0064: RLS alone no longer returns the seller-era charge…
    expect(raw.assessments.map((a) => a.id)).toEqual([postSale])
    // …and the app's narrowing agrees (it stays as defence in depth).
    const scoped = scopeLedgerRows(raw.assessments, raw.payments, window, ZONE)
    expect(scoped.assessments.map((a) => a.id)).toEqual([postSale])
    // The buyer cannot reach it by id either.
    const { data: direct } = await buyer.client.from('assessments').select('id').eq('id', preSale)
    expect(direct ?? []).toEqual([])
    // The board still sees the whole unit history.
    const { data: boardRows } = await board.client.from('assessments').select('id').eq('unit_id', unitId)
    expect((boardRows ?? []).map((a) => a.id).sort()).toEqual([preSale, postSale].sort())
  })

  it('a step Postgres rejects mid-way leaves the lot as it was', async () => {
    // ownership_pct is numeric(5,2): 1000 overflows, AFTER the seller was closed.
    const r = await record({ buyers: [{ name: 'Fixture Buyer', email: buyer.email, phone: null, mailingAddress: null, pct: 1000 }] })
    expect(r.ok).toBe(false)
    const db = adminDb()
    const { data: owns } = await db.from('ownerships').select('owner_user_id, valid_to').eq('unit_id', unitId)
    expect(owns).toEqual([{ owner_user_id: seller.id, valid_to: null }])
    const { data: prop } = await db.from('hoa_properties').select('owner_email').eq('id', propertyId).single()
    expect(prop?.owner_email).toBe(seller.email)
    const after = await loadLedgerRows(seller.client, [unitId])
    expect(after.ok && after.assessments).toHaveLength(2)
  })

  it('a foreign board user cannot record a sale on this lot', async () => {
    const other = await makeOrg()
    const foreign = await mintUser(other, 'board')
    const r = await recordSale(foreign.client as never, {
      orgId: other.orgId,
      propertyId: asPropertyId(propertyId),
      userId: foreign.id,
      settlementDate: SETTLED,
      buyers: [{ name: 'X', email: null, phone: null, mailingAddress: null, pct: 100 }],
      carryTenants: true,
      addBuyersAsResidents: false,
    })
    expect(r).toEqual({ ok: false, error: 'Property not found.' })
    const { data: owns } = await adminDb().from('ownerships').select('valid_to').eq('unit_id', unitId)
    expect(owns).toEqual([{ valid_to: null }])
  })
})
