/**
 * BL-175b (migrations/0070_tenant_isolation.sql): the cross-org foreign-key
 * planting attack from the security audit. CI only (no local database).
 *
 * THE ATTACK. Any user can create an org and become its admin. RLS checks
 * only a row's own org, so U, the admin of a self-made org A and an ordinary
 * resident of org B, inserts rows into A whose foreign key names one of B's
 * rows (a neighbour's unit, property, communication). Before 0070,
 * auth_resident_unit_ids() / auth_resident_property_ids() trusted those
 * rows, so U then read the neighbour's unit, property, assessments,
 * violations and communications.
 *
 * Two layers are proved:
 *   1. every planted FK is refused with 23503 at INSERT, from U's own JWT;
 *   2. a planted row that ALREADY exists (written with triggers off, as
 *      legacy data would be) grants nothing: the helpers join the linking
 *      row back to the same org.
 *
 * Fixture rule (fixtures/factory.ts): adminDb() seeds, every isolation
 * assertion runs through U's own client. Ids and counts only; no PII.
 */
import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { adminDb, makeAccounting, makeOrg, makeUnit, mintUser, type Db, type OrgFixture, type TestUser } from '../fixtures/factory'
import { psqlExec } from '../fixtures/psql'
import { truncateAll } from '../fixtures/truncate'

let orgA: OrgFixture // U's self-made org
let orgB: OrgFixture // the victim org, where U is an ordinary resident
let u: TestUser // admin of A, resident of B
let ownUnit: string // U's own home in B
let ownProp: string
let neighUnit: string
let neighProp: string
let neighComm: string
let neighAssessment: string
let neighViolation: string
let unitA: string // a home in A (same-org control)

async function seed(table: string, row: Record<string, unknown>): Promise<string> {
  const { data, error } = await adminDb().from(table as never).insert(row as never).select('id').single()
  if (error || !data) throw new Error(`seed ${table}: ${error?.code ?? 'no row'} ${error?.message ?? ''}`)
  return (data as { id: string }).id
}

const prop = (org: OrgFixture, label: string) =>
  seed('hoa_properties', { org_id: org.orgId, address: `${randomUUID().slice(0, 6)} ${label} Way` })

async function unitFor(org: OrgFixture, legacy: string): Promise<string> {
  return seed('units', {
    organization_id: org.orgId,
    association_id: org.associationId,
    address_line1: `${randomUUID().slice(0, 6)} Unit Way`,
    legacy_hoa_property_id: legacy,
  })
}

/** Ids U can see in `table` among the candidates. */
async function visible(client: Db, table: string, ids: string[]): Promise<string[]> {
  const { data, error } = await client.from(table as never).select('id').in('id' as never, ids as never)
  if (error) throw new Error(`select ${table}: ${error.message}`)
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id)
}

beforeEach(async () => {
  await truncateAll()
  orgA = await makeOrg()
  orgB = await makeOrg()
  u = await mintUser(orgB, 'resident')
  // U "creates" org A: the onboarding action inserts the org and an admin
  // membership with the service role.
  const { error } = await adminDb().from('org_members').insert({ org_id: orgA.orgId, user_id: u.id, role: 'admin' })
  if (error) throw new Error(`seed admin membership: ${error.code}`)

  ownProp = await prop(orgB, 'Own')
  ownUnit = await unitFor(orgB, ownProp)
  await seed('ownerships', { organization_id: orgB.orgId, unit_id: ownUnit, owner_user_id: u.id, valid_from: '2024-01-01' })

  neighProp = await prop(orgB, 'Neighbour')
  neighUnit = await unitFor(orgB, neighProp)
  const acct = await makeAccounting(orgB)
  neighAssessment = await seed('assessments', {
    organization_id: orgB.orgId,
    association_id: orgB.associationId,
    unit_id: neighUnit,
    fiscal_period_id: acct.fiscalPeriodId,
    assessment_type: 'regular',
    amount: 300,
    due_date: '2026-01-01',
    status: 'open',
  })
  neighViolation = await seed('hoa_violations', {
    org_id: orgB.orgId,
    property_id: neighProp,
    violation_type: 'parking',
    description: 'boat',
    status: 'open',
  })
  neighComm = await seed('communications', {
    organization_id: orgB.orgId,
    association_id: orgB.associationId,
    category: 'announcement',
    subject: 'Neighbour only',
    body_html: '<p>hi</p>',
    audience_definition: {},
    status: 'sent',
    sent_at: new Date().toISOString(),
  })
  await seed('communication_recipients', {
    organization_id: orgB.orgId,
    communication_id: neighComm,
    unit_id: neighUnit,
    channel: 'portal',
    delivery_status: 'sent',
    sent_at: new Date().toISOString(),
  })
  unitA = await makeUnit(orgA)
})

/** U, as admin of A, tries to plant a row in A that points into B. */
const plants: Array<[string, () => Record<string, unknown>]> = [
  ['ownerships.unit_id', () => ({ organization_id: orgA.orgId, unit_id: neighUnit, owner_user_id: u.id, valid_from: '2024-01-01' })],
  ['tenancies.unit_id', () => ({ organization_id: orgA.orgId, unit_id: neighUnit, tenant_user_id: u.id, lease_start: '2024-01-01', status: 'active' })],
  [
    'property_residents.property_id',
    () => ({ organization_id: orgA.orgId, property_id: neighProp, full_name: 'Planted', email: u.email, role: 'owner' }),
  ],
  ['units.legacy_hoa_property_id', () => ({ organization_id: orgA.orgId, address_line1: '1 Planted Way', legacy_hoa_property_id: neighProp })],
  [
    'communication_recipients.communication_id',
    () => ({ organization_id: orgA.orgId, communication_id: neighComm, user_id: u.id, channel: 'portal', delivery_status: 'sent' }),
  ],
  [
    'tickets.unit_id',
    () => ({ organization_id: orgA.orgId, unit_id: neighUnit, submitted_by: u.id, subject: 'planted', category: 'general', description: 'planted' }),
  ],
]
const tableOf = (label: string) => label.split('.')[0]!

describe('0070: a planted foreign key into another org is refused (23503)', () => {
  for (const [label, row] of plants) {
    it(`${label}: refused on INSERT from the admin's own JWT`, async () => {
      const { error } = await u.client.from(tableOf(label) as never).insert(row() as never)
      expect(error?.code, `${label} planting was not refused`).toBe('23503')
    })
  }

  it('the same rows are refused for the service role too (triggers fire for every caller)', async () => {
    for (const [label, row] of plants) {
      const { error } = await adminDb().from(tableOf(label) as never).insert(row() as never)
      expect(error?.code, `${label} planting by service role was not refused`).toBe('23503')
    }
  })

  it('an UPDATE that re-points an existing row into B is refused as well', async () => {
    const own = await u.client
      .from('ownerships')
      .insert({ organization_id: orgA.orgId, unit_id: unitA, owner_user_id: u.id, valid_from: '2024-01-01' } as never)
      .select('id')
      .single()
    expect(own.error, 'same-org control insert failed: the trigger is too strict').toBeNull()
    const upd = await u.client
      .from('ownerships')
      .update({ unit_id: neighUnit } as never)
      .eq('id', (own.data as { id: string }).id)
      .select('id')
    expect(upd.error?.code).toBe('23503')
  })

  it('same-org rows still insert (positive control for every guarded table)', async () => {
    const propA = await prop(orgA, 'A')
    const commA = await seed('communications', {
      organization_id: orgA.orgId,
      association_id: orgA.associationId,
      category: 'announcement',
      subject: 'A',
      body_html: '<p>a</p>',
      audience_definition: {},
      status: 'sent',
    })
    const ok = [
      await u.client.from('ownerships').insert({ organization_id: orgA.orgId, unit_id: unitA, owner_user_id: u.id, valid_from: '2024-01-01' } as never),
      await u.client.from('tenancies').insert({ organization_id: orgA.orgId, unit_id: unitA, tenant_user_id: u.id, lease_start: '2024-01-01', status: 'active' } as never),
      await u.client.from('property_residents').insert({ organization_id: orgA.orgId, property_id: propA, full_name: 'Same org', role: 'owner' } as never),
      await u.client.from('units').insert({ organization_id: orgA.orgId, address_line1: '2 Same Way', legacy_hoa_property_id: propA } as never),
      await u.client.from('communication_recipients').insert({ organization_id: orgA.orgId, communication_id: commA, channel: 'portal', delivery_status: 'sent' } as never),
      await u.client.from('tickets').insert({ organization_id: orgA.orgId, unit_id: unitA, submitted_by: u.id, subject: 's', category: 'general', description: 'd' } as never),
    ]
    for (const r of ok) expect(r.error).toBeNull()
  })
})

describe('0070: U reads none of the neighbour rows', () => {
  it('U sees their own home (positive control) and none of the neighbour rows', async () => {
    expect(await visible(u.client, 'units', [ownUnit])).toEqual([ownUnit])
    expect(await visible(u.client, 'hoa_properties', [ownProp])).toEqual([ownProp])

    expect(await visible(u.client, 'units', [neighUnit])).toEqual([])
    expect(await visible(u.client, 'hoa_properties', [neighProp])).toEqual([])
    expect(await visible(u.client, 'assessments', [neighAssessment])).toEqual([])
    expect(await visible(u.client, 'hoa_violations', [neighViolation])).toEqual([])
    expect(await visible(u.client, 'communications', [neighComm])).toEqual([])
  })

  it('a planted row that already exists (legacy data, written with triggers off) still grants nothing', async () => {
    // session_replication_role = replica skips the 0070 triggers (and FK
    // triggers), which is exactly how rows planted before the migration look.
    psqlExec(`
      set session_replication_role = replica;
      insert into public.ownerships (organization_id, unit_id, owner_user_id, valid_from)
        values ('${orgA.orgId}', '${neighUnit}', '${u.id}', '2024-01-01');
      insert into public.property_residents (organization_id, property_id, full_name, email, role)
        values ('${orgA.orgId}', '${neighProp}', 'Planted', '${u.email}', 'owner');
      insert into public.communication_recipients (organization_id, communication_id, user_id, channel, delivery_status)
        values ('${orgA.orgId}', '${neighComm}', '${u.id}', 'portal', 'sent');
    `)
    const { data: unitIds } = await u.client.rpc('auth_resident_unit_ids' as never)
    expect(unitIds as unknown as string[]).toContain(ownUnit)
    expect(unitIds as unknown as string[]).not.toContain(neighUnit)
    const { data: propIds } = await u.client.rpc('auth_resident_property_ids' as never)
    expect(propIds as unknown as string[]).not.toContain(neighProp)

    expect(await visible(u.client, 'units', [neighUnit])).toEqual([])
    expect(await visible(u.client, 'hoa_properties', [neighProp])).toEqual([])
    expect(await visible(u.client, 'assessments', [neighAssessment])).toEqual([])
    expect(await visible(u.client, 'hoa_violations', [neighViolation])).toEqual([])
    // The recipient row is in A but names B's communication: communications_select
    // now requires the recipient to be in the communication's own org.
    expect(await visible(u.client, 'communications', [neighComm])).toEqual([])
  })

  it('an unconfirmed email grants nothing through the email branch (M6)', async () => {
    const propId = await prop(orgB, 'Email')
    const unitId = await unitFor(orgB, propId)
    const emailUser = await mintUser(orgB, 'resident')
    await seed('property_residents', { organization_id: orgB.orgId, property_id: propId, full_name: 'Email res', email: emailUser.email, role: 'owner' })
    expect(await visible(emailUser.client, 'units', [unitId]), 'confirmed email: control').toEqual([unitId])
    // The session keeps working after the flag is cleared (m5-join-requests does the same).
    psqlExec(`update auth.users set email_confirmed_at = null where id = '${emailUser.id}'`)
    expect(await visible(emailUser.client, 'units', [unitId]), 'unconfirmed email still matched').toEqual([])
  })
})
