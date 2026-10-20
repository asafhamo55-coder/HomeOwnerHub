/**
 * PR-10 owner self-service contact details, against real Postgres + RLS.
 *
 * Proves the design choice in apps/hoa/src/lib/contact-updates/model.ts:
 *
 *   - a resident's own client CANNOT update their own property_residents
 *     row or ownership (0041/0063 board-only writes) — which is why the
 *     portal files a request instead of writing directly;
 *   - it CAN insert the request ticket for its own unit, and nothing on
 *     file changes until the board decides;
 *   - the board's RLS client approving it updates exactly the resident's
 *     own rows (a neighbour's row on the same home is untouched), closes
 *     the ticket and writes an ids-only audit row the property page reads;
 *   - an email change is held when the resident's portal access rests on
 *     the email on file, so they are never locked out.
 *
 * Fixtures are synthetic; no real addresses or people.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { createLot } from '../../../apps/hoa/src/lib/properties/lot'
import { approveContactUpdate, type ContactDeps } from '../../../apps/hoa/src/lib/contact-updates/apply'
import { AUDIT_APPLIED, CONTACT_CATEGORY, CONTACT_SUBJECT, formatContactRequest } from '../../../apps/hoa/src/lib/contact-updates/model'
import { adminDb, makeOrg, mintUser, type OrgFixture, type TestUser } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

let org: OrgFixture
let board: TestUser
let owner: TestUser
let unitId: string
let propertyId: string
let ownershipId: string
let ownRowId: string
let neighbourRowId: string

// The submitter's auth sign-in email, read the way the app's
// submitter-email.ts does (auth.admin, by user id).
const deps: ContactDeps = {
  submitterEmails: async (ids) => {
    const out = new Map<string, string | null>()
    for (const id of ids) {
      const { data, error } = await adminDb().auth.admin.getUserById(id)
      if (error) return null
      out.set(id, data.user?.email?.toLowerCase() ?? null)
    }
    return out
  },
}

async function fileRequest(changes: Parameters<typeof formatContactRequest>[0], signedInAs?: string): Promise<string> {
  const { data, error } = await owner.client
    .from('tickets')
    .insert({
      organization_id: org.orgId,
      association_id: org.associationId,
      unit_id: unitId,
      submitted_by: owner.id,
      category: CONTACT_CATEGORY,
      subject: CONTACT_SUBJECT,
      description: formatContactRequest(changes, signedInAs ?? owner.email),
      status: 'open',
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`resident ticket insert: ${error?.message}`)
  return data.id
}

beforeEach(async () => {
  await truncateAll()
  org = await makeOrg()
  board = await mintUser(org, 'board')
  owner = await mintUser(org, 'resident')
  const lot = await createLot(board.client as never, {
    orgId: org.orgId,
    associationId: org.associationId,
    address: '300 Fixture Lane',
    unitNumber: null,
    owner: { name: 'Fixture Owner', email: owner.email, phone: '(555) 010-0128' },
    notes: null,
    today: '2024-01-01',
    userId: board.id,
  })
  if (!lot.ok) throw new Error(`seed lot: ${lot.error}`)
  unitId = lot.data.unitId
  propertyId = lot.data.propertyId
  ownershipId = lot.data.ownershipId!
  const db = adminDb()
  const { data: rows, error } = await db
    .from('property_residents')
    .insert([
      { organization_id: org.orgId, property_id: propertyId, full_name: 'Fixture Owner', email: owner.email, phone: '(555) 010-0128', role: 'owner', is_primary: true },
      { organization_id: org.orgId, property_id: propertyId, full_name: 'Fixture Neighbour', email: 'neighbour@example.test', phone: '(555) 010-0777', role: 'family_member', is_primary: false },
    ])
    .select('id, full_name')
  if (error || !rows) throw new Error(`seed residents: ${error?.message}`)
  ownRowId = rows.find((r) => r.full_name === 'Fixture Owner')!.id
  neighbourRowId = rows.find((r) => r.full_name === 'Fixture Neighbour')!.id
})

const linkPortal = async () => {
  const { error } = await adminDb().from('ownerships').update({ owner_user_id: owner.id }).eq('id', ownershipId)
  if (error) throw new Error(`link: ${error.message}`)
}

describe('PR-10 contact self-update', () => {
  it('RLS: a resident cannot write their own resident row or ownership', async () => {
    await linkPortal()
    const res = await owner.client.from('property_residents').update({ phone: '(555) 010-0199' }).eq('id', ownRowId).select('id')
    expect(res.data ?? []).toHaveLength(0)
    const own = await owner.client.from('ownerships').update({ owner_phone: '(555) 010-0199' }).eq('id', ownershipId).select('id')
    expect(own.data ?? []).toHaveLength(0)
    const { data } = await adminDb().from('property_residents').select('phone').eq('id', ownRowId).single()
    expect(data?.phone).toBe('(555) 010-0128')
  })

  it('a filed request changes nothing; the board’s approval changes only the owner’s rows', async () => {
    await linkPortal()
    const ticketId = await fileRequest([
      { field: 'phone', from: '(555) 010-0128', to: '(555) 010-0199' },
      { field: 'email', from: owner.email, to: 'notices@example.test' },
      { field: 'mailing', from: null, to: 'PO Box 12, Springfield, FL 32000' },
    ])
    const db = adminDb()
    expect((await db.from('property_residents').select('phone').eq('id', ownRowId).single()).data?.phone).toBe('(555) 010-0128')

    const r = await approveContactUpdate(board.client as never, { orgId: org.orgId, ticketId, deciderId: board.id, deciderRole: 'board' }, deps)
    expect(r).toMatchObject({ ok: true })

    const mine = (await db.from('property_residents').select('phone, email, notes').eq('id', ownRowId).single()).data
    expect(mine).toMatchObject({ phone: '(555) 010-0199', email: 'notices@example.test', notes: 'Mailing address: PO Box 12, Springfield, FL 32000' })
    const theirs = (await db.from('property_residents').select('phone, email').eq('id', neighbourRowId).single()).data
    expect(theirs).toMatchObject({ phone: '(555) 010-0777', email: 'neighbour@example.test' })
    const own = (await db.from('ownerships').select('owner_phone, owner_email, owner_user_id, valid_to').eq('id', ownershipId).single()).data
    expect(own).toMatchObject({ owner_phone: '(555) 010-0199', owner_email: 'notices@example.test', owner_user_id: owner.id, valid_to: null })
    const prop = (await db.from('hoa_properties').select('owner_email, owner_phone').eq('id', propertyId).single()).data
    expect(prop).toMatchObject({ owner_email: 'notices@example.test', owner_phone: '(555) 010-0199' })

    expect((await db.from('tickets').select('status').eq('id', ticketId).single()).data?.status).toBe('closed')
    const audit = (await board.client.from('audit_log').select('action, metadata').eq('entity_id', ticketId)).data ?? []
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ action: AUDIT_APPLIED, metadata: { propertyId, residentIds: [ownRowId], ownershipIds: [ownershipId] } })
    expect(JSON.stringify(audit)).not.toContain('notices@example.test')

    // Still in the portal after the email change: the linked ownership holds access.
    const units = (await owner.client.from('ownerships').select('unit_id').eq('owner_user_id', owner.id).is('valid_to', null)).data ?? []
    expect(units.map((u) => u.unit_id)).toEqual([unitId])
  })

  it('holds the email when access rests on the email on file', async () => {
    const ticketId = await fileRequest([
      { field: 'phone', from: '(555) 010-0128', to: '(555) 010-0199' },
      { field: 'email', from: owner.email, to: 'notices@example.test' },
    ])
    const r = await approveContactUpdate(board.client as never, { orgId: org.orgId, ticketId, deciderId: board.id, deciderRole: 'board' }, deps)
    expect(r).toMatchObject({ ok: true })
    const mine = (await adminDb().from('property_residents').select('phone, email').eq('id', ownRowId).single()).data
    expect(mine).toMatchObject({ phone: '(555) 010-0199', email: owner.email })
  })

  it('a typed "Signed in as" naming a neighbour is not a request: the neighbour’s row is untouched', async () => {
    await linkPortal()
    const ticketId = await fileRequest([{ field: 'phone', from: '(555) 010-0777', to: '(555) 010-0199' }], 'neighbour@example.test')
    const r = await approveContactUpdate(board.client as never, { orgId: org.orgId, ticketId, deciderId: board.id, deciderRole: 'board' }, deps)
    expect(r.ok).toBe(false)
    const db = adminDb()
    expect((await db.from('property_residents').select('phone').eq('id', neighbourRowId).single()).data?.phone).toBe('(555) 010-0777')
    expect((await db.from('property_residents').select('phone').eq('id', ownRowId).single()).data?.phone).toBe('(555) 010-0128')
    expect((await db.from('tickets').select('status').eq('id', ticketId).single()).data?.status).toBe('open')
  })

  it('a resident cannot approve their own request', async () => {
    await linkPortal()
    const ticketId = await fileRequest([{ field: 'phone', from: '(555) 010-0128', to: '(555) 010-0199' }])
    const r = await approveContactUpdate(owner.client as never, { orgId: org.orgId, ticketId, deciderId: owner.id, deciderRole: 'board' }, deps)
    expect(r.ok).toBe(false)
    const mine = (await adminDb().from('property_residents').select('phone').eq('id', ownRowId).single()).data
    expect(mine?.phone).toBe('(555) 010-0128')
  })
})
