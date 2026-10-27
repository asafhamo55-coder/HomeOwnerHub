/**
 * BL-175b M5 (0070): a member of a suspended or archived org reads and writes
 * nothing of the org's data. CI only (no local database).
 *
 * auth_org_ids / auth_is_admin / auth_is_board_or_admin exclude orgs with
 * suspended_at or archived_at set. Two deliberate exceptions keep billing and
 * the "your account is suspended" screen working, and they are asserted here
 * so nobody widens them by accident:
 *   - a member still reads THEIR OWN org_members row and the orgs row of an
 *     org they belong to (no co-members, no other org);
 *   - an admin may still UPDATE the orgs row, but the 0066 billing-columns
 *     guard refuses every plan / Stripe / suspension column (42501).
 * Reactivation is a service-role write; access returns the moment it lands.
 */
import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { adminDb, makeAccounting, makeOrg, mintUser, type OrgFixture, type TestUser } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'

let org: OrgFixture
let board: TestUser
let admin: TestUser
let resident: TestUser
const ids: Record<string, string> = {}

async function seed(table: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await adminDb().from(table as never).insert(row as never).select('id').single()
  if (error || !data) throw new Error(`seed ${table}: ${error?.code ?? 'no row'} ${error?.message ?? ''}`)
  return (data as { id: string }).id
}

/** table, the org column, a row the members of the org could normally read. */
const READS: Array<[string, string]> = [
  ['units', 'organization_id'],
  ['hoa_properties', 'org_id'],
  ['assessments', 'organization_id'],
  ['hoa_violations', 'org_id'],
  ['communications', 'organization_id'],
  ['tickets', 'organization_id'],
  ['hoa_documents', 'org_id'],
  ['associations', 'organization_id'],
]

beforeEach(async () => {
  await truncateAll()
  org = await makeOrg()
  board = await mintUser(org, 'board')
  admin = await mintUser(org, 'admin')
  resident = await mintUser(org, 'resident')

  const acct = await makeAccounting(org)
  ids.prop = await seed('hoa_properties', { org_id: org.orgId, address: '1 Quiet Way' })
  ids.unit = await seed('units', { organization_id: org.orgId, association_id: org.associationId, address_line1: '1 Quiet Way', legacy_hoa_property_id: ids.prop })
  await seed('ownerships', { organization_id: org.orgId, unit_id: ids.unit, owner_user_id: resident.id, valid_from: '2024-01-01' })
  ids.assessment = await seed('assessments', {
    organization_id: org.orgId,
    association_id: org.associationId,
    unit_id: ids.unit,
    fiscal_period_id: acct.fiscalPeriodId,
    assessment_type: 'regular',
    amount: 100,
    due_date: '2026-01-01',
    status: 'open',
  })
  ids.violation = await seed('hoa_violations', { org_id: org.orgId, property_id: ids.prop, violation_type: 'trash', description: 'bins', status: 'open' })
  ids.comm = await seed('communications', {
    organization_id: org.orgId,
    association_id: org.associationId,
    category: 'announcement',
    subject: 'Hello',
    body_html: '<p>hi</p>',
    audience_definition: {},
    status: 'sent',
    sent_at: new Date().toISOString(),
  })
  await seed('communication_recipients', { organization_id: org.orgId, communication_id: ids.comm, unit_id: ids.unit, user_id: resident.id, channel: 'portal', delivery_status: 'sent' })
  ids.ticket = await seed('tickets', { organization_id: org.orgId, submitted_by: resident.id, subject: 'Leak', category: 'general', description: 'drip' })
  ids.doc = await seed('hoa_documents', { org_id: org.orgId, name: 'CC&Rs', type: 'ccr', storage_path: `${org.orgId}/ccr-${randomUUID()}.pdf` })
})

async function countRows(client: TestUser['client'], table: string): Promise<number> {
  const { data, error } = await client.from(table as never).select('id')
  if (error) throw new Error(`select ${table}: ${error.code}`)
  return (data ?? []).length
}

describe('0070 M5: a member of a suspended org reads and writes nothing', () => {
  it('control: before suspension the board reads every table and the resident reads their own rows', async () => {
    for (const [table] of READS) expect(await countRows(board.client, table), `board ${table}`).toBeGreaterThan(0)
    expect(await countRows(resident.client, 'units')).toBe(1)
    expect(await countRows(resident.client, 'communications')).toBe(1)
  })

  for (const column of ['suspended_at', 'archived_at'] as const) {
    describe(`org with ${column} set`, () => {
      beforeEach(async () => {
        const { error } = await adminDb().from('orgs').update({ [column]: new Date().toISOString() } as never).eq('id', org.orgId)
        if (error) throw new Error(`${column}: ${error.code}`)
      })

      it('board, admin and resident read none of the org’s data', async () => {
        for (const user of [board, admin, resident]) {
          for (const [table] of READS) {
            expect(await countRows(user.client, table), `${table} visible to a member of a ${column} org`).toBe(0)
          }
        }
      })

      it('board and admin write nothing (insert, update, delete)', async () => {
        for (const user of [board, admin]) {
          const ins = await user.client.from('units').insert({ organization_id: org.orgId, address_line1: '9 Planted Way' } as never)
          expect(ins.error, 'insert into a suspended org succeeded').not.toBeNull()
          const upd = await user.client.from('tickets').update({ status: 'closed' } as never).eq('id', ids.ticket!).select('id')
          expect(upd.data ?? []).toHaveLength(0)
          const del = await user.client.from('hoa_documents').delete().eq('id', ids.doc!).select('id')
          expect(del.data ?? []).toHaveLength(0)
          const rpcAdmin = await user.client.rpc('auth_is_board_or_admin' as never, { p_org_id: org.orgId } as never)
          expect(rpcAdmin.data).toBe(false)
        }
        const { data: ticket } = await adminDb().from('tickets').select('status').eq('id', ids.ticket!).single()
        expect(ticket?.status).toBe('open')
        const { count } = await adminDb().from('hoa_documents').select('id', { count: 'exact', head: true }).eq('id', ids.doc!)
        expect(count).toBe(1)
      })

      it('a resident cannot reach the unit helpers either', async () => {
        const { data } = await resident.client.rpc('auth_resident_unit_ids' as never)
        expect(data).toEqual([])
        const { data: orgIds } = await resident.client.rpc('auth_org_ids' as never)
        expect(orgIds).toEqual([])
      })

      it('the deliberate exceptions: own membership row and the org row stay readable, nobody else’s', async () => {
        const { data: seats } = await admin.client.from('org_members').select('user_id').eq('org_id', org.orgId)
        expect((seats ?? []).map((s) => s.user_id)).toEqual([admin.id])
        const { data: orgRow } = await admin.client.from('orgs').select('id').eq('id', org.orgId)
        expect(orgRow ?? []).toHaveLength(1)
      })

      it('billing columns stay locked to a suspended org’s admin (0066 guard)', async () => {
        const { error } = await admin.client.from('orgs').update({ plan: 'enterprise' } as never).eq('id', org.orgId)
        expect(error?.code).toBe('42501')
        const { error: lift } = await admin.client.from('orgs').update({ [column]: null } as never).eq('id', org.orgId)
        expect(lift?.code).toBe('42501')
        const { data } = await adminDb().from('orgs').select(column).eq('id', org.orgId).single()
        expect((data as unknown as Record<string, unknown>)[column]).not.toBeNull()
      })

      it('reactivation by the service role restores access at once', async () => {
        await adminDb().from('orgs').update({ [column]: null } as never).eq('id', org.orgId)
        expect(await countRows(board.client, 'units')).toBe(1)
        expect(await countRows(resident.client, 'units')).toBe(1)
        const ins = await admin.client.from('units').insert({ organization_id: org.orgId, address_line1: '2 Back Way' } as never)
        expect(ins.error).toBeNull()
      })
    })
  }
})
