import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'
import { isReceiptId, loadResidentReceipt, receiptNumber } from './resident-receipt'
import type { ResidentUnit } from './resident'

const MINE = '11111111-1111-4111-8111-111111111111'
const THEIRS = '22222222-2222-4222-8222-222222222222'
const A1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const A_THEIRS = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const P1 = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1'
const P_CREDIT = 'c2c2c2c2-c2c2-4c2c-8c2c-c2c2c2c2c2c2'
const P_THEIRS = 'c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3'

const unit = (over: Partial<ResidentUnit> = {}): ResidentUnit => ({
  unit_id: MINE,
  unit_number: '4',
  address: '12 Oak St',
  association_id: 'assoc',
  association_name: 'Oak Hollow HOA',
  association_time_zone: 'America/New_York',
  ownership_pct: 100,
  valid_from: '2020-01-01',
  ...over,
})

const assessments = [
  { id: A1, unit_id: MINE, amount: 100, due_date: '2026-09-01', status: 'open', assessment_type: 'regular', memo_code: null },
  { id: A_THEIRS, unit_id: THEIRS, amount: 500, due_date: '2026-09-01', status: 'open', assessment_type: 'regular', memo_code: null },
]
const payments = [
  { id: P1, unit_id: MINE, assessment_id: A1, amount: 60, paid_at: '2026-09-10T16:00:00Z', payment_method: 'check' },
  { id: P_CREDIT, unit_id: MINE, assessment_id: null, amount: 25, paid_at: '2026-09-20T16:00:00Z', payment_method: 'zelle_assisted' },
  // A neighbour's payment: RLS would hide it; the fake returns it anyway.
  { id: P_THEIRS, unit_id: THEIRS, assessment_id: A_THEIRS, amount: 500, paid_at: '2026-09-11T16:00:00Z', payment_method: 'card' },
]

/** A client that ignores every filter, as if RLS and the unit filter both failed. */
function leakyDb(opts: { fail?: boolean } = {}): SupabaseClient<Database> {
  const chain = (data: unknown): unknown => {
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'in', 'is', 'or', 'eq', 'gt', 'order']) q[m] = () => q
    q.limit = () => Promise.resolve(opts.fail ? { data: null, error: { code: 'x' } } : { data, error: null })
    return q
  }
  return { from: (t: string) => chain(t === 'assessments' ? assessments : t === 'payments' ? payments : []) } as unknown as SupabaseClient<Database>
}

describe('loadResidentReceipt', () => {
  it('renders the amount, date, method, property and the charge it was applied to', async () => {
    const r = await loadResidentReceipt(leakyDb(), [unit()], P1)
    if (r.status !== 'ok') throw new Error(r.status)
    expect(r.receipt).toMatchObject({
      receiptNumber: 'C1C1C1C1',
      associationName: 'Oak Hollow HOA',
      paidDay: '2026-09-10',
      amount: 60,
      methodLabel: 'Check',
      propertyLabel: '4 · 12 Oak St',
      credit: 0,
    })
    expect(r.receipt.allocations).toEqual([{ label: 'Regular dues', dueDate: '2026-09-01', applied: 60 }])
  })

  it('computes the balance after this payment from the ledger (single home)', async () => {
    const r = await loadResidentReceipt(leakyDb(), [unit()], P1)
    if (r.status !== 'ok') throw new Error(r.status)
    // $100 charge, then $60 paid.
    expect(r.receipt.balanceAfter).toBe(40)
  })

  it('a payment not tied to a charge is credit on the account', async () => {
    const r = await loadResidentReceipt(leakyDb(), [unit()], P_CREDIT)
    if (r.status !== 'ok') throw new Error(r.status)
    expect(r.receipt.allocations).toEqual([])
    expect(r.receipt.credit).toBe(25)
    expect(r.receipt.methodLabel).toBe('Zelle')
  })

  it('leaves the balance out when the resident has more than one home', async () => {
    const other = unit({ unit_id: '33333333-3333-4333-8333-333333333333' })
    const r = await loadResidentReceipt(leakyDb(), [unit(), other], P1)
    if (r.status !== 'ok') throw new Error(r.status)
    expect(r.receipt.balanceAfter).toBeNull()
  })

  it('another unit’s payment is not found, even if the client returned it', async () => {
    expect(await loadResidentReceipt(leakyDb(), [unit()], P_THEIRS)).toEqual({ status: 'not_found' })
  })

  it('a malformed id is not found and reads nothing', async () => {
    const db = { from: () => { throw new Error('should not query') } } as unknown as SupabaseClient<Database>
    for (const bad of ['', 'abc', "1' or '1'='1", 'not-a-uuid-at-all', `${P1}x`]) {
      expect(await loadResidentReceipt(db, [unit()], bad)).toEqual({ status: 'not_found' })
    }
  })

  it('an unknown well-formed id is not found', async () => {
    expect(await loadResidentReceipt(leakyDb(), [unit()], '99999999-9999-4999-8999-999999999999')).toEqual({ status: 'not_found' })
  })

  it('a resident with no home sees nothing', async () => {
    expect(await loadResidentReceipt(leakyDb(), [], P1)).toEqual({ status: 'not_found' })
  })

  it('a failed read is failed, not not found', async () => {
    expect(await loadResidentReceipt(leakyDb({ fail: true }), [unit()], P1)).toEqual({ status: 'failed' })
  })
})

describe('receipt ids', () => {
  it('validates uuids and shortens them', () => {
    expect(isReceiptId(P1)).toBe(true)
    expect(isReceiptId('nope')).toBe(false)
    expect(receiptNumber(P1)).toBe('C1C1C1C1')
  })
})
