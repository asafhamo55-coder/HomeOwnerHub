/**
 * Resident ledger + Pay-by-Zelle isolation (backlog BL-010, BL-006).
 *
 * The ledger loader filters by the unit ids it is handed. That filter is a
 * convenience, not the boundary: these tests hand resident A's client a
 * NEIGHBOUR's unit id and assert that 0061's resident read policies
 * (auth_resident_unit_ids) still return nothing of theirs.
 *
 * Fixture rule (fixtures/factory.ts): adminDb() seeds; every assertion runs
 * through a real user JWT client. No truncateAll: each test world lives in
 * fresh orgs, so this file never wipes rows other local runs depend on.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { buildLedger, loadLedgerRows } from '../../../apps/hoa/src/lib/resident-ledger'
import {
  readZelleSettings,
  signZelleSettings,
  withZelleSettings,
  ZELLE_SETTINGS_KEY,
} from '../../../apps/hoa/src/lib/pay-by-zelle'
import {
  adminDb,
  makeAccounting,
  makeOrg,
  makeUnit,
  mintUser,
  type OrgFixture,
  type TestUser,
} from '../fixtures/factory'

interface World {
  org: OrgFixture
  residentA: TestUser
  residentB: TestUser
  board: TestUser
  unitA: string
  unitB: string
  ids: Record<string, string>
}

async function insertId(
  p: PromiseLike<{ data: { id: string } | null; error: { message: string } | null }>,
  label: string,
): Promise<string> {
  const { data, error } = await p
  if (error || !data) throw new Error(`seed ${label}: ${error?.message}`)
  return data.id
}

let w: World

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

  const assessment = (unit_id: string, due_date: string, status: string) =>
    db
      .from('assessments')
      .insert({
        organization_id: org.orgId,
        association_id: org.associationId,
        unit_id,
        fiscal_period_id: acct.fiscalPeriodId,
        assessment_type: 'regular',
        amount: 325,
        due_date,
        status,
      })
      .select('id')
      .single()
  const ids: Record<string, string> = {}
  ids.aPaid = await insertId(assessment(unitA, '2026-09-01', 'paid'), 'A paid')
  ids.aOpen = await insertId(assessment(unitA, '2026-10-01', 'open'), 'A open')
  ids.bPaid = await insertId(assessment(unitB, '2026-09-01', 'paid'), 'B paid')
  ids.bOpen = await insertId(assessment(unitB, '2026-10-01', 'open'), 'B open')

  const payment = (unit_id: string | null, assessment_id: string | null) =>
    db
      .from('payments')
      .insert({
        organization_id: org.orgId,
        unit_id,
        assessment_id,
        amount: 325,
        payment_method: 'zelle_assisted',
        paid_at: '2026-09-02T12:00:00Z',
      })
      .select('id')
      .single()
  ids.pA = await insertId(payment(unitA, ids.aPaid), 'A payment')
  ids.pB = await insertId(payment(unitB, ids.bPaid), 'B payment')
  // Linked to B only through its assessment (unit_id null): the policy's
  // second branch must not leak it either.
  ids.pBViaAssessment = await insertId(payment(null, ids.bOpen), 'B payment via assessment')

  w = { org, residentA, residentB, board, unitA, unitB, ids }
})

describe('resident ledger (0061 resident read scope)', () => {
  it('resident A sees their own charges and payments with a true running balance', async () => {
    const rows = await loadLedgerRows(w.residentA.client, [w.unitA])
    expect(rows.ok).toBe(true)
    if (!rows.ok) return
    expect(rows.assessments.map((a) => a.id).sort()).toEqual([w.ids.aOpen, w.ids.aPaid].sort())
    expect(rows.payments.map((p) => p.id)).toEqual([w.ids.pA])
    expect(buildLedger(rows.assessments, rows.payments).totals.balance).toBe(325)
  })

  it('resident A asking for unit B gets nothing — RLS, not the filter, is the boundary', async () => {
    const rows = await loadLedgerRows(w.residentA.client, [w.unitB])
    expect(rows).toEqual({ ok: true, assessments: [], payments: [], truncated: false })
  })

  it('resident A asking for both units still sees only unit A rows', async () => {
    const rows = await loadLedgerRows(w.residentA.client, [w.unitA, w.unitB])
    expect(rows.ok).toBe(true)
    if (!rows.ok) return
    expect(rows.assessments.every((a) => a.unit_id === w.unitA)).toBe(true)
    const paymentIds = rows.payments.map((p) => p.id)
    expect(paymentIds).toEqual([w.ids.pA])
    expect(paymentIds).not.toContain(w.ids.pB)
    expect(paymentIds).not.toContain(w.ids.pBViaAssessment)
  })

  it('resident B sees their own rows, including a payment linked only by assessment', async () => {
    const rows = await loadLedgerRows(w.residentB.client, [w.unitB])
    expect(rows.ok).toBe(true)
    if (!rows.ok) return
    expect(rows.payments.map((p) => p.id).sort()).toEqual([w.ids.pB, w.ids.pBViaAssessment].sort())
  })

  it('the seed is real: the board reads both units through the same loader', async () => {
    const rows = await loadLedgerRows(w.board.client, [w.unitA, w.unitB])
    expect(rows.ok).toBe(true)
    if (!rows.ok) return
    expect(rows.assessments).toHaveLength(4)
    expect(rows.payments).toHaveLength(3)
  })
})

describe('Pay-by-Zelle settings tampering', () => {
  const SECRET = 'integration-test-secret'

  // associations keeps 0004's FOR ALL org_access policy, so this write may
  // well SUCCEED today. Whatever a resident manages to store, the resident
  // Pay screen must never present it as the board's recipient.
  it('a resident-written recipient never reads back as configured', async () => {
    const db = adminDb()
    const signed = signZelleSettings(
      w.org.associationId,
      { recipient: 'pay@board.example.test', recipientName: 'Test HOA', instructions: null },
      SECRET,
    )
    const { data: before, error: readErr } = await db
      .from('associations')
      .select('compliance_settings')
      .eq('id', w.org.associationId)
      .single()
    if (readErr || !before) throw new Error(`read association: ${readErr?.message}`)
    const { error: seedErr } = await db
      .from('associations')
      .update({ compliance_settings: withZelleSettings(before.compliance_settings, signed) as never })
      .eq('id', w.org.associationId)
    if (seedErr) throw new Error(`seed settings: ${seedErr.message}`)

    // The resident rewrites the recipient but cannot recompute the signature.
    const forged = withZelleSettings(before.compliance_settings, {
      ...signed,
      recipient: 'attacker@example.test',
    })
    await w.residentA.client
      .from('associations')
      .update({ compliance_settings: forged as never })
      .eq('id', w.org.associationId)

    const { data: after, error: afterErr } = await db
      .from('associations')
      .select('compliance_settings')
      .eq('id', w.org.associationId)
      .single()
    if (afterErr || !after) throw new Error(`re-read association: ${afterErr?.message}`)
    const stored = (after.compliance_settings as Record<string, { recipient?: string }>)[ZELLE_SETTINGS_KEY]

    const read = readZelleSettings(w.org.associationId, after.compliance_settings, SECRET)
    if (stored?.recipient === 'attacker@example.test') {
      // The write went through (policy hole still open): the signature check holds the line.
      expect(read).toEqual({ state: 'unverified' })
    } else {
      // The write was refused (policy closed): the board's value survives intact.
      expect(read).toMatchObject({ state: 'configured', settings: { recipient: 'pay@board.example.test' } })
    }
  })
})
