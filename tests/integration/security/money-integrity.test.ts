/**
 * Migration 0082 (migrations/0082_money_integrity.sql) against real Postgres.
 * CI only (no local database).
 *
 *   1. closed-period backstop: a journal entry or assessment dated inside a closed
 *      period is refused for everyone; closing entries (period 'closing') and the
 *      online payment functions (money that already moved) still work;
 *   2. posted journal entries and their lines cannot be edited or deleted through
 *      the REST API; the app's own posting and reversing steps still work;
 *   3. a buyer does not read the seller's unapplied credits;
 *   4. refund_failed credits the ledger back once.
 *
 * Fixture rule: adminDb() seeds; every web-role assertion runs through a user's
 * client. Fresh orgs per test, so nothing else is wiped. Ids and cents only.
 */
import { describe, expect, it } from 'vitest'
import { adminDb, makeAccounting, makeOrg, makeUnit, mintUser, type OrgFixture } from '../fixtures/factory'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any }
const admin = () => adminDb() as unknown as Loose
const today = () => new Date().toISOString().slice(0, 10)

let seq = 0
const entryNumber = () => `JE-9${String(++seq).padStart(3, '0')}-${Math.random().toString(36).slice(2, 8)}`

async function one<T>(p: PromiseLike<{ data: T | null; error: { message: string; code?: string } | null }>, label: string): Promise<T> {
  const { data, error } = await p
  if (error || !data) throw new Error(`seed ${label}: ${error?.code} ${error?.message}`)
  return data
}

async function period(org: OrgFixture, start: string, end: string, status: string) {
  return (await one<{ id: string }>(
    admin().from('fiscal_periods').insert({ organization_id: org.orgId, association_id: org.associationId, start_date: start, end_date: end, status }).select('id').single(),
    'period',
  )).id
}

interface Books {
  org: OrgFixture
  acct: Awaited<ReturnType<typeof makeAccounting>>
}
async function books(): Promise<Books> {
  const org = await makeOrg()
  const acct = await makeAccounting(org)
  return { org, acct }
}

/** A draft header, with balanced lines unless told otherwise. Not posted. */
async function draftEntry(b: Books, over: { date?: string; periodId?: string; source?: string; client?: Loose } = {}) {
  const db = over.client ?? admin()
  const header = await db
    .from('journal_entries')
    .insert({
      organization_id: b.org.orgId,
      association_id: b.org.associationId,
      fiscal_period_id: over.periodId ?? b.acct.fiscalPeriodId,
      entry_number: entryNumber(),
      entry_date: over.date ?? today(),
      memo: 'money integrity test',
      source: over.source ?? 'manual',
      status: 'draft',
    })
    .select('id')
    .single()
  return header as { data: { id: string } | null; error: { message: string; code?: string } | null }
}

async function addLines(b: Books, id: string, client?: Loose) {
  return (client ?? admin()).from('ledger_entries').insert([
    { organization_id: b.org.orgId, journal_entry_id: id, account_id: b.acct.accountIds['1010'], fund_id: b.acct.fundIds.OPERATING, debit_amount: 50, credit_amount: 0 },
    { organization_id: b.org.orgId, journal_entry_id: id, account_id: b.acct.accountIds['4900'], fund_id: b.acct.fundIds.OPERATING, debit_amount: 0, credit_amount: 50 },
  ])
}

async function postedEntry(b: Books, client?: Loose): Promise<string> {
  const h = await draftEntry(b, { client })
  if (h.error || !h.data) throw new Error(`seed entry: ${h.error?.code} ${h.error?.message}`)
  const l = await addLines(b, h.data.id, client)
  if (l.error) throw new Error(`seed lines: ${l.error.code} ${l.error.message}`)
  const p = await (client ?? admin()).from('journal_entries').update({ status: 'posted', posted_at: new Date().toISOString() }).eq('id', h.data.id)
  if (p.error) throw new Error(`seed post: ${p.error.code} ${p.error.message}`)
  return h.data.id
}

async function assessment(b: Books, unitId: string, over: { periodId?: string; dueDate?: string } = {}) {
  return admin()
    .from('assessments')
    .insert({
      organization_id: b.org.orgId,
      association_id: b.org.associationId,
      unit_id: unitId,
      fiscal_period_id: over.periodId ?? b.acct.fiscalPeriodId,
      assessment_type: 'regular',
      amount: 250,
      due_date: over.dueDate ?? today(),
      status: 'open',
    })
    .select('id')
    .single()
}

const isClosedPeriod = (e: { message?: string; code?: string } | null) => e?.code === '55000' && /closed_period/.test(e?.message ?? '')
const isImmutable = (e: { message?: string; code?: string } | null) => e?.code === '55000' && /posted_immutable/.test(e?.message ?? '')

describe('0082 closed-period backstop', () => {
  it('refuses a journal entry dated in a closed period, by period or by date, for the service role too', async () => {
    const b = await books()
    const closed = await period(b.org, '2019-01-01', '2019-12-31', 'closed')

    const byPeriod = await draftEntry(b, { periodId: closed, date: '2019-06-15' })
    expect(isClosedPeriod(byPeriod.error)).toBe(true)

    // Open period id, but the date sits in the closed one.
    const byDate = await draftEntry(b, { date: '2019-06-15' })
    expect(isClosedPeriod(byDate.error)).toBe(true)

    // An open date still works.
    const ok = await draftEntry(b)
    expect(ok.error).toBeNull()
  })

  it('refuses to move or re-date an existing entry into a closed period, and a board user is refused as well', async () => {
    const b = await books()
    await period(b.org, '2019-01-01', '2019-12-31', 'closed')
    const board = await mintUser(b.org, 'board')

    const draft = await draftEntry(b, { client: board.client as unknown as Loose })
    expect(draft.error).toBeNull()
    const moved = await (board.client as unknown as Loose).from('journal_entries').update({ entry_date: '2019-03-03' }).eq('id', draft.data!.id)
    expect(isClosedPeriod(moved.error)).toBe(true)

    const viaBoard = await draftEntry(b, { date: '2019-04-04', client: board.client as unknown as Loose })
    expect(isClosedPeriod(viaBoard.error)).toBe(true)
  })

  it('lets closing entries through while the period is closing, and refuses them once it is closed', async () => {
    const b = await books()
    const p = await period(b.org, '2018-01-01', '2018-12-31', 'closing')

    const h = await draftEntry(b, { periodId: p, date: '2018-12-31', source: 'closing' })
    expect(h.error).toBeNull()
    expect((await addLines(b, h.data!.id)).error).toBeNull()
    const post = await admin().from('journal_entries').update({ status: 'posted', posted_at: new Date().toISOString() }).eq('id', h.data!.id)
    expect(post.error).toBeNull()

    await admin().from('fiscal_periods').update({ status: 'closed' }).eq('id', p)
    const again = await draftEntry(b, { periodId: p, date: '2018-12-31', source: 'closing' })
    expect(isClosedPeriod(again.error)).toBe(true)
  })

  it('refuses assessment inserts and due-date or amount edits in a closed period, but not a status change', async () => {
    const b = await books()
    const unit = await makeUnit(b.org)
    const closed = await period(b.org, '2019-01-01', '2019-12-31', 'closed')

    const ins = await assessment(b, unit, { periodId: closed, dueDate: '2019-03-01' })
    expect(isClosedPeriod(ins.error)).toBe(true)

    const a = await one<{ id: string }>(assessment(b, unit), 'assessment')
    expect((await admin().from('assessments').update({ status: 'partial' }).eq('id', a.id)).error).toBeNull()

    const redate = await admin().from('assessments').update({ due_date: '2019-03-01' }).eq('id', a.id)
    expect(isClosedPeriod(redate.error)).toBe(true)

    // Close the period the assessment belongs to: now its amount is frozen.
    await admin().from('fiscal_periods').update({ status: 'closed' }).eq('id', b.acct.fiscalPeriodId)
    const amount = await admin().from('assessments').update({ amount: 999 }).eq('id', a.id)
    expect(isClosedPeriod(amount.error)).toBe(true)
    const status = await admin().from('assessments').update({ status: 'paid' }).eq('id', a.id)
    expect(status.error).toBeNull()
  })

  it('keeps record_online_payment_success working for a payment dated in a closed month (money already moved)', async () => {
    const b = await books()
    const unit = await makeUnit(b.org)
    await admin().from('chart_of_accounts').insert({
      organization_id: b.org.orgId, association_id: b.org.associationId, account_number: '1015',
      account_name: 'Online payments clearing', account_type: 'asset', fund_id: b.acct.fundIds.OPERATING,
    })
    await period(b.org, '2019-01-01', '2019-12-31', 'closed')
    const a = await one<{ id: string }>(assessment(b, unit), 'assessment')
    const attempt = await one<{ id: string }>(
      admin().from('online_payments').insert({
        organization_id: b.org.orgId, association_id: b.org.associationId, unit_id: unit, method_type: 'card',
        dues_cents: 25000, fee_cents: 0, fee_payer: 'association', total_cents: 25000, application_fee_cents: 150,
        allocation: [{ assessment_id: a.id, cents: 25000 }], allocation_mode: 'oldest_first', status: 'processing',
        stripe_account_id: 'acct_moneyintegr1', stripe_payment_intent_id: `pi_mi${Math.random().toString(36).slice(2, 10)}`,
        idempotency_key: `mi-closed-${Math.random().toString(36).slice(2, 12)}-key`,
      }).select('id').single(),
      'attempt',
    )
    const posted = await admin().rpc('record_online_payment_success', { p_attempt: attempt.id, p_paid_on: '2019-06-15', p_charge: 'ch_mi_closed' })
    expect(posted.error).toBeNull()
    expect(posted.data?.already_posted).toBe(false)
  })
})

describe('0082 posted ledger rows are immutable through the REST API', () => {
  it('a board user cannot edit or delete a posted entry or its lines', async () => {
    const b = await books()
    const board = await mintUser(b.org, 'board')
    const c = board.client as unknown as Loose
    const je = await postedEntry(b)
    const line = await one<{ id: string }>(admin().from('ledger_entries').select('id').eq('journal_entry_id', je).limit(1).single(), 'line')

    expect(isImmutable((await c.from('journal_entries').update({ memo: 'tampered' }).eq('id', je)).error)).toBe(true)
    expect(isImmutable((await c.from('journal_entries').update({ entry_date: '2026-01-02' }).eq('id', je)).error)).toBe(true)
    expect(isImmutable((await c.from('journal_entries').update({ status: 'draft' }).eq('id', je)).error)).toBe(true)
    expect(isImmutable((await c.from('journal_entries').delete().eq('id', je)).error)).toBe(true)
    expect(isImmutable((await c.from('ledger_entries').update({ debit_amount: 5000 }).eq('id', line.id)).error)).toBe(true)
    expect(isImmutable((await c.from('ledger_entries').delete().eq('id', line.id)).error)).toBe(true)
    expect(isImmutable((await addLines(b, je, c)).error)).toBe(true)
    const direct = await c.from('journal_entries').insert({
      organization_id: b.org.orgId, association_id: b.org.associationId, fiscal_period_id: b.acct.fiscalPeriodId,
      entry_number: entryNumber(), entry_date: today(), memo: 'pre-posted', source: 'manual', status: 'posted',
    })
    expect(isImmutable(direct.error)).toBe(true)

    const after = await one<{ memo: string; status: string }>(admin().from('journal_entries').select('memo, status').eq('id', je).single(), 'entry')
    expect(after).toEqual({ memo: 'money integrity test', status: 'posted' })
    const lines = await admin().from('ledger_entries').select('debit_amount, credit_amount').eq('journal_entry_id', je)
    expect(lines.data).toHaveLength(2)
  })

  it('the app steps still work: draft, lines, post, then reverse with the two link columns', async () => {
    const b = await books()
    const board = await mintUser(b.org, 'board')
    const c = board.client as unknown as Loose
    const original = await postedEntry(b, c)
    const reversal = await postedEntry(b, c)

    const link = await c.from('journal_entries').update({ reverses_id: original }).eq('id', reversal)
    expect(link.error).toBeNull()
    const mark = await c.from('journal_entries').update({ reversed_by_id: reversal, status: 'reversed' }).eq('id', original)
    expect(mark.error).toBeNull()

    // A reversed entry is frozen too, and the link cannot be re-pointed.
    expect(isImmutable((await c.from('journal_entries').update({ memo: 'x' }).eq('id', original)).error)).toBe(true)
    expect(isImmutable((await c.from('journal_entries').update({ reversed_by_id: original }).eq('id', original)).error)).toBe(true)
    // A draft (rolled-back post) can still be deleted.
    const d = await draftEntry(b, { client: c })
    expect((await c.from('journal_entries').delete().eq('id', d.data!.id)).error).toBeNull()
  })
})

describe('0082 a buyer does not read the seller\'s unapplied credits', () => {
  it('a sale-sourced ownership hides credits received before it began; other ownerships keep the history', async () => {
    const b = await books()
    const saleUnit = await makeUnit(b.org)
    const importedUnit = await makeUnit(b.org)
    const buyer = await mintUser(b.org, 'resident')
    const importedOwner = await mintUser(b.org, 'resident')
    const board = await mintUser(b.org, 'board')

    const own = async (unit: string, user: string, from: string, source: string) =>
      one(admin().from('ownerships').insert({ organization_id: b.org.orgId, unit_id: unit, owner_user_id: user, valid_from: from, source }).select('id').single(), 'ownership')
    await own(saleUnit, buyer.id, '2026-07-01', 'sale')
    await own(importedUnit, importedOwner.id, '2026-07-01', 'csv_import')

    const credit = async (unit: string, receivedOn: string) =>
      (await one<{ id: string }>(
        admin().from('unapplied_credits').insert({
          organization_id: b.org.orgId, association_id: b.org.associationId, unit_id: unit,
          amount: 100, remaining: 100, payment_method: 'check', received_on: receivedOn,
        }).select('id').single(),
        'credit',
      )).id
    const sellerCredit = await credit(saleUnit, '2026-03-01')
    const buyerCredit = await credit(saleUnit, '2026-08-01')
    const startDayCredit = await credit(saleUnit, '2026-07-01')
    const importedOld = await credit(importedUnit, '2026-03-01')

    const read = async (u: { client: unknown }) =>
      ((await (u.client as Loose).from('unapplied_credits').select('id')).data ?? []).map((r: { id: string }) => r.id).sort()

    expect(await read(buyer)).toEqual([buyerCredit, startDayCredit].sort())
    expect(await read(importedOwner)).toEqual([importedOld])
    // The board still reads everything.
    expect(await read(board)).toEqual([sellerCredit, buyerCredit, startDayCredit, importedOld].sort())
  })
})

describe('0082 refund_failed', () => {
  async function seedPaid() {
    const b = await books()
    const unit = await makeUnit(b.org)
    const { data: extra } = await admin()
      .from('chart_of_accounts')
      .insert({ organization_id: b.org.orgId, association_id: b.org.associationId, account_number: '1015', account_name: 'Online payments clearing', account_type: 'asset', fund_id: b.acct.fundIds.OPERATING })
      .select('id')
      .single()
    const clearing: string = extra.id
    const a = await one<{ id: string }>(assessment(b, unit), 'assessment')
    const attempt = await one<{ id: string }>(
      admin().from('online_payments').insert({
        organization_id: b.org.orgId, association_id: b.org.associationId, unit_id: unit, method_type: 'card',
        dues_cents: 25000, fee_cents: 0, fee_payer: 'association', total_cents: 25000, application_fee_cents: 150,
        allocation: [{ assessment_id: a.id, cents: 25000 }], allocation_mode: 'oldest_first', status: 'processing',
        stripe_account_id: 'acct_moneyintegr2', stripe_payment_intent_id: `pi_mf${Math.random().toString(36).slice(2, 10)}`,
        idempotency_key: `mi-refund-${Math.random().toString(36).slice(2, 12)}-key`,
      }).select('id').single(),
      'attempt',
    )
    const posted = await admin().rpc('record_online_payment_success', { p_attempt: attempt.id, p_paid_on: today(), p_charge: 'ch_mi_refund' })
    expect(posted.error).toBeNull()
    return { b, attemptId: attempt.id, assessmentId: a.id, clearing, ar: b.acct.accountIds['1100'] }
  }

  async function balanceCents(b: Books, accountId: string): Promise<number> {
    const { data, error } = await admin()
      .from('ledger_entries')
      .select('debit_amount, credit_amount, journal_entries!inner(status, association_id)')
      .eq('account_id', accountId)
      .eq('journal_entries.status', 'posted')
      .eq('journal_entries.association_id', b.org.associationId)
    if (error) throw new Error(`ledger read failed: ${error.message}`)
    return (data as Array<{ debit_amount: number | string; credit_amount: number | string }>).reduce(
      (s, l) => s + Math.round(Number(l.debit_amount) * 100) - Math.round(Number(l.credit_amount) * 100), 0)
  }

  async function paidCents(assessmentId: string): Promise<number> {
    const { data } = await admin().from('payments').select('amount').eq('assessment_id', assessmentId)
    return (data as Array<{ amount: number | string }>).reduce((s, p) => s + Math.round(Number(p.amount) * 100), 0)
  }

  it('credits the refunded amount back to the books exactly once, and a replay changes nothing', async () => {
    const s = await seedPaid()
    expect(await balanceCents(s.b, s.clearing)).toBe(25000)
    expect(await balanceCents(s.b, s.ar)).toBe(-25000)

    const refund = await admin().rpc('reverse_online_payment', { p_attempt: s.attemptId, p_kind: 'refund', p_ref: 're_mi_1', p_cents: 10000, p_reason: 'Refund' })
    expect(refund.error).toBeNull()
    expect(await balanceCents(s.b, s.clearing)).toBe(15000)
    expect(await balanceCents(s.b, s.ar)).toBe(-15000)
    expect(await paidCents(s.assessmentId)).toBe(15000)

    const failed = await admin().rpc('reverse_online_payment', { p_attempt: s.attemptId, p_kind: 'refund_failed', p_ref: 're_mi_1', p_reason: 'Refund failed at the bank' })
    expect(failed.error).toBeNull()
    expect(failed.data?.already_applied).toBe(false)
    expect(failed.data?.restored_cents).toBe(10000)
    expect(await balanceCents(s.b, s.clearing)).toBe(25000)
    expect(await balanceCents(s.b, s.ar)).toBe(-25000)
    expect(await paidCents(s.assessmentId)).toBe(25000)

    const assessment = await admin().from('assessments').select('status').eq('id', s.assessmentId).single()
    expect(assessment.data.status).toBe('paid')
    const op = await admin().from('online_payments').select('status').eq('id', s.attemptId).single()
    expect(op.data.status).toBe('succeeded')

    // Replay: same event again.
    const again = await admin().rpc('reverse_online_payment', { p_attempt: s.attemptId, p_kind: 'refund_failed', p_ref: 're_mi_1' })
    expect(again.error).toBeNull()
    expect(again.data?.already_applied).toBe(true)
    expect(await balanceCents(s.b, s.clearing)).toBe(25000)
    expect(await paidCents(s.assessmentId)).toBe(25000)
    const rows = await admin().from('online_payment_adjustments').select('kind').eq('online_payment_id', s.attemptId).eq('kind', 'refund_failed')
    expect(rows.data).toHaveLength(1)

    // The remaining balance can be refunded in full again (net reversed is back to zero).
    const second = await admin().rpc('reverse_online_payment', { p_attempt: s.attemptId, p_kind: 'refund', p_ref: 're_mi_2', p_cents: 25000, p_reason: 'Refund' })
    expect(second.error).toBeNull()
    expect(second.data?.reversed_cents).toBe(25000)
  })

  it('refuses a refund_failed for a refund the books never took', async () => {
    const s = await seedPaid()
    const r = await admin().rpc('reverse_online_payment', { p_attempt: s.attemptId, p_kind: 'refund_failed', p_ref: 're_never_booked' })
    expect(r.error?.code).toBe('55000')
    expect(await balanceCents(s.b, s.clearing)).toBe(25000)
  })

  it('a fully refunded payment goes back to succeeded when the refund fails', async () => {
    const s = await seedPaid()
    expect((await admin().rpc('reverse_online_payment', { p_attempt: s.attemptId, p_kind: 'refund', p_ref: 're_mi_full', p_cents: 25000 })).error).toBeNull()
    expect((await admin().from('online_payments').select('status').eq('id', s.attemptId).single()).data.status).toBe('refunded')
    expect((await admin().rpc('reverse_online_payment', { p_attempt: s.attemptId, p_kind: 'refund_failed', p_ref: 're_mi_full' })).error).toBeNull()
    expect((await admin().from('online_payments').select('status').eq('id', s.attemptId).single()).data.status).toBe('succeeded')
    expect(await balanceCents(s.b, s.clearing)).toBe(25000)
  })
})
