/**
 * BL-096 — the resident assistant's tools cannot read another unit's
 * balance or tickets.
 *
 * The reads (apps/hoa/src/lib/resident-assistant/reads.ts) are called here
 * exactly as the assistant's tools call them: with the resident's own JWT
 * client. The scope handed in is deliberately FORGED to list the
 * neighbour's unit too, so the code-level unit filter is no help: what
 * keeps unit B's charges and tickets out is RLS (0061 for money, 0024/0063
 * for tickets) plus the reads' own submitted_by checks.
 *
 * Fixture rule (fixtures/factory.ts): adminDb() seeds; every assertion runs
 * through a real user JWT client. Fresh orgs, no truncateAll.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { readMyAccount, readMyRequests, type ResidentScope } from '../../../apps/hoa/src/lib/resident-assistant/reads'
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
}

let w: World

async function insertId(
  p: PromiseLike<{ data: { id: string } | null; error: { message: string } | null }>,
  label: string,
): Promise<string> {
  const { data, error } = await p
  if (error || !data) throw new Error(`seed ${label}: ${error?.message}`)
  return data.id
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

  w = { org, residentA, residentB, board, unitA, unitB, ticketA, ticketB }
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

  it('the seed is real: resident B reads their own balance and ticket through the same reads', async () => {
    const acct = await readMyAccount(scopeFor(w.residentB, [w.unitB]))
    expect(acct.balanceCents).toBe(987600)
    const req = await readMyRequests(scopeFor(w.residentB, [w.unitB]))
    expect(req.tickets.map((t) => t.id)).toEqual([w.ticketB])
  })
})
