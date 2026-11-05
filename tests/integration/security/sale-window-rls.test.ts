/**
 * Resident sale window on assessments and payments (migration 0064 section G:
 * auth_resident_charges_from + assessments_select / payments_select). CI only
 * (no local database). Ids only, no row content.
 *
 * The window is the current source = 'sale' ownership's valid_from for the
 * caller; any other ownership keeps the whole unit history.
 *   assessments  : due_date >= window
 *   payments     : with an assessment, follow that assessment's due_date;
 *                  without one, (paid_at AT TIME ZONE 'America/New_York')::date >= window
 *
 * KNOWN GAP (timezone): the policy hardcodes America/New_York, while the app
 * (scopeLedgerRows -> paymentDay) uses the association's own time zone. For a
 * non-Eastern association an unapplied payment made within hours of midnight on
 * the window's start day can be one day apart between RLS and the app. GA, FL
 * and most launch states are Eastern, so it is low priority; fixing it needs a
 * migration (docs/backlog.md). The edge test below pins today's Eastern behaviour.
 */
import { describe, expect, it } from 'vitest'
import { adminDb, makeAccounting, makeOrg, makeUnit, mintUser } from '../fixtures/factory'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (t: string) => any }
const admin = () => adminDb() as unknown as Loose

async function world() {
  const org = await makeOrg()
  const acct = await makeAccounting(org)
  const board = await mintUser(org, 'board')
  const own = async (unit: string, user: string, from: string, source: string, to: string | null = null) => {
    const { error } = await admin().from('ownerships').insert({
      organization_id: org.orgId, unit_id: unit, owner_user_id: user, valid_from: from, valid_to: to, source,
    })
    if (error) throw new Error(`seed ownership: ${error.message}`)
  }
  const charge = async (unit: string, due: string): Promise<string> => {
    const { data, error } = await admin().from('assessments').insert({
      organization_id: org.orgId, association_id: org.associationId, unit_id: unit,
      fiscal_period_id: acct.fiscalPeriodId, assessment_type: 'regular', amount: 300, due_date: due, status: 'open',
    }).select('id').single()
    if (error || !data) throw new Error(`seed charge: ${error?.message}`)
    return data.id
  }
  const pay = async (unit: string | null, assessmentId: string | null, paidAt: string): Promise<string> => {
    const { data, error } = await admin().from('payments').insert({
      organization_id: org.orgId, unit_id: unit, assessment_id: assessmentId,
      amount: 100, payment_method: 'zelle_assisted', paid_at: paidAt,
    }).select('id').single()
    if (error || !data) throw new Error(`seed payment: ${error?.message}`)
    return data.id
  }
  return { org, board, own, charge, pay }
}

const ids = async (u: { client: unknown }, table: string) =>
  (((await (u.client as Loose).from(table).select('id')).data ?? []) as { id: string }[]).map((r) => r.id).sort()

describe('sale window on assessments and payments', () => {
  it('a sale buyer sees only post-sale charges and payments; the board sees all', async () => {
    const w = await world()
    const unit = await makeUnit(w.org)
    const buyer = await mintUser(w.org, 'resident')
    await w.own(unit, buyer.id, '2026-07-01', 'sale')
    const oldA = await w.charge(unit, '2026-06-01')
    const newA = await w.charge(unit, '2026-08-01')
    const oldP = await w.pay(unit, oldA, '2026-06-05T12:00:00Z')
    const newP = await w.pay(unit, newA, '2026-08-05T12:00:00Z')
    const oldLoose = await w.pay(unit, null, '2026-06-10T12:00:00Z')
    const newLoose = await w.pay(unit, null, '2026-09-10T12:00:00Z')

    expect(await ids(buyer, 'assessments')).toEqual([newA])
    expect(await ids(buyer, 'payments')).toEqual([newP, newLoose].sort())
    expect(await ids(w.board, 'assessments')).toEqual([oldA, newA].sort())
    expect(await ids(w.board, 'payments')).toEqual([oldP, newP, oldLoose, newLoose].sort())
  })

  it('a non-sale ownership keeps the full unit history', async () => {
    const w = await world()
    const unit = await makeUnit(w.org)
    const owner = await mintUser(w.org, 'resident')
    await w.own(unit, owner.id, '2026-07-01', 'csv_import')
    const oldA = await w.charge(unit, '2026-03-01')
    const newA = await w.charge(unit, '2026-08-01')
    const oldP = await w.pay(unit, null, '2026-03-05T12:00:00Z')
    const newP = await w.pay(unit, newA, '2026-08-05T12:00:00Z')
    expect(await ids(owner, 'assessments')).toEqual([oldA, newA].sort())
    expect(await ids(owner, 'payments')).toEqual([oldP, newP].sort())
  })

  it('the paid_at start-day edge is judged in America/New_York', async () => {
    const w = await world()
    const unit = await makeUnit(w.org)
    const buyer = await mintUser(w.org, 'resident')
    await w.own(unit, buyer.id, '2026-07-01', 'sale')
    // 2026-07-01T03:30Z is 2026-06-30 23:30 in New York: before the window (its UTC date would pass).
    const justBefore = await w.pay(unit, null, '2026-07-01T03:30:00Z')
    // 2026-07-02T03:30Z is 2026-07-01 23:30 in New York: the start day, inside.
    const startDay = await w.pay(unit, null, '2026-07-02T03:30:00Z')
    const seen = await ids(buyer, 'payments')
    expect(seen).toContain(startDay)
    expect(seen).not.toContain(justBefore)
  })

  it('the seller loses the unit once their ownership closes', async () => {
    const w = await world()
    const unit = await makeUnit(w.org)
    const seller = await mintUser(w.org, 'resident')
    await w.own(unit, seller.id, '2020-01-01', 'manual')
    const a = await w.charge(unit, '2026-03-01')
    const p = await w.pay(unit, a, '2026-03-05T12:00:00Z')
    expect(await ids(seller, 'assessments')).toEqual([a])
    expect(await ids(seller, 'payments')).toEqual([p])

    const { error } = await admin().from('ownerships').update({ valid_to: '2026-06-30' }).eq('owner_user_id', seller.id).eq('unit_id', unit)
    if (error) throw new Error(`close ownership: ${error.message}`)
    expect(await ids(seller, 'assessments')).toEqual([])
    expect(await ids(seller, 'payments')).toEqual([])
  })

  it('two current sale ownerships on one unit use the latest valid_from', async () => {
    const w = await world()
    const unit = await makeUnit(w.org)
    const buyer = await mintUser(w.org, 'resident')
    await w.own(unit, buyer.id, '2026-03-01', 'sale')
    await w.own(unit, buyer.id, '2026-07-01', 'sale')
    const march = await w.charge(unit, '2026-04-01')
    const august = await w.charge(unit, '2026-08-01')
    expect(await ids(buyer, 'assessments')).toEqual([august])
    expect(march).not.toBe(august)
  })

  it('a sale ownership beside a non-sale one on the same unit still applies the sale window', async () => {
    const w = await world()
    const unit = await makeUnit(w.org)
    const person = await mintUser(w.org, 'resident')
    await w.own(unit, person.id, '2026-01-01', 'csv_import')
    await w.own(unit, person.id, '2026-07-01', 'sale')
    await w.charge(unit, '2026-04-01')
    const august = await w.charge(unit, '2026-08-01')
    expect(await ids(person, 'assessments')).toEqual([august])
  })
})
