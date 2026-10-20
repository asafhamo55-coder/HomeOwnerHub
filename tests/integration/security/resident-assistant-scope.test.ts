/**
 * BL-096 — the resident assistant's tools cannot read another unit's
 * balance, tickets, violations, ARC applications, reported concerns or
 * announcements.
 *
 * The reads (apps/hoa/src/lib/resident-assistant/reads.ts) are called here
 * exactly as the assistant's tools call them: with the resident's own JWT
 * client. The scope handed in is deliberately FORGED to list the
 * neighbour's unit too (and, where it matters, the neighbour's user id and
 * email), so the code-level unit filter is no help: what keeps unit B's
 * rows out is RLS (0061 for money, 0024/0063 for tickets, the resident
 * policies on units / hoa_violations / arc_requests /
 * resident_violation_reports / communication_recipients) plus the reads'
 * own submitted_by / reported_by checks.
 *
 * Fixture rule (fixtures/factory.ts): adminDb() seeds; every assertion runs
 * through a real user JWT client. Fresh orgs, no truncateAll.
 */
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  readCommunityUpdates,
  readMyAccount,
  readMyRequests,
  unitScope,
  type ResidentScope,
} from '../../../apps/hoa/src/lib/resident-assistant/reads'
import { adminDb, makeAccounting, makeOrg, makeUnit, mintUser, type OrgFixture, type TestUser } from '../fixtures/factory'

interface World {
  org: OrgFixture
  residentA: TestUser
  residentB: TestUser
  board: TestUser
  unitA: string
  unitB: string
  ticketA: string
  ticketB: string
  violationA: string
  violationB: string
  arcA: string
  arcB: string
  reportA: string
  reportB: string
  commA: string
  commB: string
}

let w: World

const NEIGHBOUR_ARC = 'Neighbour private ARC'
const NEIGHBOUR_COMM = 'Neighbour private collection letter'

async function insertId(
  p: PromiseLike<{ data: { id: string } | null; error: { message: string } | null }>,
  label: string,
): Promise<string> {
  const { data, error } = await p
  if (error || !data) throw new Error(`seed ${label}: ${error?.message}`)
  return data.id
}

/** Untyped insert for the tables the typed client is awkward about. */
async function insertAs(table: string, row: Record<string, unknown>, label: string): Promise<string> {
  const p = adminDb()
    .from(table as never)
    .insert(row as never)
    .select('id')
    .single()
  return insertId(p as unknown as PromiseLike<{ data: { id: string } | null; error: { message: string } | null }>, label)
}

beforeAll(async () => {
  const db = adminDb()
  const org = await makeOrg()
  const acct = await makeAccounting(org)
  const unitA = await makeUnit(org)
  const unitB = await makeUnit(org)
  const residentA = await mintUser(org, 'resident')
  const residentB = await mintUser(org, 'resident')
  const board = await mintUser(org, 'board')
  const base = { organization_id: org.orgId }

  for (const [user, unit] of [
    [residentA, unitA],
    [residentB, unitB],
  ] as const) {
    const { error } = await db
      .from('ownerships')
      .insert({ organization_id: org.orgId, unit_id: unit, owner_user_id: user.id, valid_from: '2024-01-01' })
    if (error) throw new Error(`seed ownership: ${error.message}`)
  }

  const assessment = (unit_id: string, amount: number) =>
    db
      .from('assessments')
      .insert({
        organization_id: org.orgId,
        association_id: org.associationId,
        unit_id,
        fiscal_period_id: acct.fiscalPeriodId,
        assessment_type: 'regular',
        amount,
        due_date: '2026-10-01',
        status: 'open',
      })
      .select('id')
      .single()
  await insertId(assessment(unitA, 325), 'A open')
  await insertId(assessment(unitB, 9876), 'B open')

  const ticket = (unit_id: string, submitted_by: string, subject: string) =>
    db
      .from('tickets')
      .insert({
        organization_id: org.orgId,
        association_id: org.associationId,
        unit_id,
        submitted_by,
        category: 'maintenance',
        subject,
        description: 'A description long enough for the form.',
      })
      .select('id')
      .single()
  const ticketA = await insertId(ticket(unitA, residentA.id, 'Gutter on my house'), 'ticket A')
  const ticketB = await insertId(ticket(unitB, residentB.id, 'Neighbour private ticket'), 'ticket B')

  // Violations are keyed by hoa_properties.id; each unit bridges to its
  // property through units.legacy_hoa_property_id.
  const rand = () => randomUUID().slice(0, 8)
  const prop = (label: string) =>
    insertAs('hoa_properties', { org_id: org.orgId, address: `${rand()} ${label} Way`, owner_name: `Owner ${label}` }, `prop ${label}`)
  const propA = await prop('A')
  const propB = await prop('B')
  for (const [unit, property] of [
    [unitA, propA],
    [unitB, propB],
  ] as const) {
    const { error } = await db.from('units').update({ legacy_hoa_property_id: property } as never).eq('id', unit)
    if (error) throw new Error(`seed unit bridge: ${error.message}`)
  }
  const violationA = await insertAs(
    'hoa_violations',
    { org_id: org.orgId, property_id: propA, violation_type: 'trash', description: 'bins out', status: 'open' },
    'violation A',
  )
  const violationB = await insertAs(
    'hoa_violations',
    { org_id: org.orgId, property_id: propB, violation_type: 'parking', description: 'boat', status: 'open' },
    'violation B',
  )

  const arcA = await insertAs(
    'arc_requests',
    { ...base, association_id: org.associationId, unit_id: unitA, submitted_by: residentA.id, category: 'paint', summary: 'Paint my door', scope_description: 'blue' },
    'arc A',
  )
  const arcB = await insertAs(
    'arc_requests',
    { ...base, association_id: org.associationId, unit_id: unitB, submitted_by: residentB.id, category: 'fence', summary: NEIGHBOUR_ARC, scope_description: 'tall' },
    'arc B',
  )

  const reportA = await insertAs(
    'resident_violation_reports',
    { ...base, reported_by: residentA.id, category: 'noise', description: 'party' },
    'report A',
  )
  const reportB = await insertAs(
    'resident_violation_reports',
    { ...base, reported_by: residentB.id, category: 'pet', description: 'dog' },
    'report B',
  )

  const comm = (subject: string) =>
    insertAs(
      'communications',
      {
        ...base,
        association_id: org.associationId,
        category: 'announcement',
        subject,
        body_html: '<p>hi</p>',
        audience_definition: {},
        status: 'sent',
        sent_at: new Date().toISOString(),
      },
      `comm ${subject}`,
    )
  const commA = await comm('Pool opens Saturday')
  const commB = await comm(NEIGHBOUR_COMM)
  const sentAt = new Date().toISOString()
  await insertAs(
    'communication_recipients',
    { ...base, communication_id: commA, unit_id: unitA, user_id: residentA.id, email: residentA.email, channel: 'email', delivery_status: 'sent', sent_at: sentAt },
    'rec A',
  )
  await insertAs(
    'communication_recipients',
    { ...base, communication_id: commB, unit_id: unitB, user_id: residentB.id, email: residentB.email, channel: 'email', delivery_status: 'sent', sent_at: sentAt, rendered_subject: NEIGHBOUR_COMM },
    'rec B',
  )

  w = { org, residentA, residentB, board, unitA, unitB, ticketA, ticketB, violationA, violationB, arcA, arcB, reportA, reportB, commA, commB }
})

function scopeFor(user: TestUser, unitIds: string[]): ResidentScope {
  return {
    db: user.client,
    orgId: w.org.orgId,
    userId: user.id,
    email: user.email,
    units: unitIds.map((unit_id) => ({ unit_id, association_id: w.org.associationId })),
  }
}

/** A's own JWT client, with every scope field pointed at B as well. */
function forgedAsB(): ResidentScope {
  return { ...scopeFor(w.residentA, [w.unitA, w.unitB]), userId: w.residentB.id, email: w.residentB.email }
}

describe('resident assistant reads (RLS-bound, forged scope)', () => {
  it('resident A sees their own balance and ticket', async () => {
    const acct = await readMyAccount(scopeFor(w.residentA, [w.unitA]))
    expect(acct.balanceCents).toBe(32500)
    const req = await readMyRequests(scopeFor(w.residentA, [w.unitA]))
    expect(req.tickets.map((t) => t.id)).toEqual([w.ticketA])
  })

  it('a scope forged to include unit B still returns none of unit B’s balance', async () => {
    const acct = await readMyAccount(scopeFor(w.residentA, [w.unitA, w.unitB]))
    expect(acct.balanceCents).toBe(32500)
    expect(acct.openChargeCount).toBe(1)
    const onlyB = await readMyAccount(scopeFor(w.residentA, [w.unitB]))
    expect(onlyB.balanceCents).toBe(0)
    expect(onlyB.openChargeCount).toBe(0)
  })

  it('a scope forged to include unit B still returns none of resident B’s tickets', async () => {
    const req = await readMyRequests(scopeFor(w.residentA, [w.unitA, w.unitB]))
    const ids = req.tickets.map((t) => t.id)
    expect(ids).toEqual([w.ticketA])
    expect(ids).not.toContain(w.ticketB)
    expect(JSON.stringify(req)).not.toContain('Neighbour private ticket')
  })

  it('a forged user id on A’s client does not reach B’s tickets either', async () => {
    const forged: ResidentScope = { ...scopeFor(w.residentA, [w.unitB]), userId: w.residentB.id }
    const req = await readMyRequests(forged)
    expect(req.tickets.map((t) => t.id)).not.toContain(w.ticketB)
  })

  it('violations: A sees the one on their home; a scope forged to unit B adds none of B’s', async () => {
    const own = await readMyRequests(scopeFor(w.residentA, [w.unitA]))
    expect(own.violationsOnMyHome.map((v) => v.id)).toEqual([w.violationA])

    const forged = await readMyRequests(scopeFor(w.residentA, [w.unitA, w.unitB]))
    expect(forged.violationsOnMyHome.map((v) => v.id)).toEqual([w.violationA])
    const onlyB = await readMyRequests(scopeFor(w.residentA, [w.unitB]))
    expect(onlyB.violationsOnMyHome).toEqual([])
    expect(forged.violationsOnMyHome.map((v) => v.id)).not.toContain(w.violationB)
  })

  it('ARC applications: a scope forged with B’s unit and user id returns none of B’s', async () => {
    const own = await readMyRequests(scopeFor(w.residentA, [w.unitA]))
    expect(own.arcApplications.map((a) => a.id)).toEqual([w.arcA])

    const forged = await readMyRequests(forgedAsB())
    expect(forged.arcApplications.map((a) => a.id)).not.toContain(w.arcB)
    expect(JSON.stringify(forged)).not.toContain(NEIGHBOUR_ARC)
  })

  it('reported concerns: a scope forged with B’s user id returns none of B’s reports', async () => {
    const own = await readMyRequests(scopeFor(w.residentA, [w.unitA]))
    expect(own.reportedConcerns.map((r) => r.id)).toEqual([w.reportA])

    const forged = await readMyRequests(forgedAsB())
    expect(forged.reportedConcerns.map((r) => r.id)).not.toContain(w.reportB)
    expect(forged.reportedConcerns.map((r) => r.category)).not.toContain('pet')
  })

  it('announcements: a scope forged with B’s unit, user id and email returns none addressed only to B', async () => {
    const own = await readCommunityUpdates(scopeFor(w.residentA, [w.unitA]))
    expect(own.announcements.map((a) => a.subject)).toEqual(['Pool opens Saturday'])

    const forged = await readCommunityUpdates(forgedAsB())
    expect(forged.announcements.map((a) => a.subject)).not.toContain(NEIGHBOUR_COMM)
    expect(JSON.stringify(forged)).not.toContain(NEIGHBOUR_COMM)
  })

  it('the seed is real: resident B reads their own rows through the same reads', async () => {
    const acct = await readMyAccount(scopeFor(w.residentB, [w.unitB]))
    expect(acct.balanceCents).toBe(987600)
    const req = await readMyRequests(scopeFor(w.residentB, [w.unitB]))
    expect(req.tickets.map((t) => t.id)).toEqual([w.ticketB])
    expect(req.violationsOnMyHome.map((v) => v.id)).toEqual([w.violationB])
    expect(req.arcApplications.map((a) => a.id)).toEqual([w.arcB])
    expect(req.reportedConcerns.map((r) => r.id)).toEqual([w.reportB])
    const updates = await readCommunityUpdates(scopeFor(w.residentB, [w.unitB]))
    expect(updates.announcements.map((a) => a.subject)).toEqual([NEIGHBOUR_COMM])
  })
})

// BL-101 A2 — the inbox drafter reads one home's record on the BOARD's own
// RLS client through unitScope (tickets and ARC keyed on unit_id, not on
// who submitted them). Same seed as above.
describe('board-side unitScope (inbox drafter)', () => {
  const tz = 'America/New_York'

  it('the board reads unit A’s whole record, and none of unit B’s', async () => {
    const scope = unitScope({ db: w.board.client, orgId: w.org.orgId, unitIds: [w.unitA], timeZone: tz })
    const acct = await readMyAccount(scope)
    expect(acct.balanceCents).toBe(32500)
    const req = await readMyRequests(scope)
    expect(req.tickets.map((t) => t.id)).toEqual([w.ticketA])
    expect(req.arcApplications.map((a) => a.id)).toEqual([w.arcA])
    expect(req.violationsOnMyHome.map((v) => v.id)).toEqual([w.violationA])
    expect(req.reportedConcerns).toEqual([])
    expect(JSON.stringify(req)).not.toContain('Neighbour private')
    expect(JSON.stringify(req)).not.toContain(NEIGHBOUR_ARC)
  })

  it('a unit scope does not widen a RESIDENT client: A’s JWT pointed at unit B sees nothing of B', async () => {
    const scope = unitScope({ db: w.residentA.client, orgId: w.org.orgId, unitIds: [w.unitB], timeZone: tz })
    const acct = await readMyAccount(scope)
    expect(acct.balanceCents).toBe(0)
    const req = await readMyRequests(scope)
    expect(req.tickets.map((t) => t.id)).not.toContain(w.ticketB)
    expect(req.arcApplications.map((a) => a.id)).not.toContain(w.arcB)
    expect(req.violationsOnMyHome).toEqual([])
  })
})
