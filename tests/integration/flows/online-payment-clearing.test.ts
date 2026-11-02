/**
 * BL-035 PR 8: the clearing account (1015) returns to zero.
 *
 * Against real Postgres (the ephemeral CI database, never production):
 *   1. a card payment posts through record_online_payment_success, which
 *      debits 1015 "Online payments clearing" and credits receivables;
 *   2. Stripe's payout arrives, the matcher finds the bank deposit, and the
 *      payout entry debits cash (the deposit) and 6150 (the fee the
 *      association bore) and credits 1015 for the gross;
 *   3. 1015 is then exactly zero, cash holds the deposit, a replay does
 *      nothing, and the bank line carries a match_method the table accepts.
 *
 * The flag stays false: these functions are called directly, the way the
 * webhook would after the flag is on. Service role only. Ids and cents.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { adminDb, makeAccounting, makeOrg, makeUnit } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'
import { matchOnePayout } from '../../../apps/hoa/src/lib/online-payments/payouts'
import { createSupabasePayoutPorts } from '../../../apps/hoa/src/lib/online-payments/payouts-store'

const ACCT = 'acct_clearingtest1'

// The M8 tables and functions are not in the generated types until the owner applies 0073.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any }
const loose = () => adminDb() as unknown as Loose
const today = () => new Date().toISOString().slice(0, 10)

/** Net debit minus credit for one chart account number, in cents, over posted entries. */
async function balanceCents(associationId: string, accountId: string): Promise<number> {
  const { data, error } = await loose()
    .from('ledger_entries')
    .select('debit_amount, credit_amount, journal_entries!inner(status, association_id)')
    .eq('account_id', accountId)
    .eq('journal_entries.status', 'posted')
    .eq('journal_entries.association_id', associationId)
  if (error) throw new Error(`ledger read failed: ${error.message}`)
  return ((data ?? []) as Array<{ debit_amount: number | string; credit_amount: number | string }>).reduce((s, l) => s + Math.round(Number(l.debit_amount) * 100) - Math.round(Number(l.credit_amount) * 100), 0)
}

async function seed() {
  const db = loose()
  const org = await makeOrg()
  const acct = await makeAccounting(org)
  const unitId = await makeUnit(org)

  // What ensureOnlinePaymentAccounts creates when the board turns payments on.
  const { data: extra, error: coaErr } = await db
    .from('chart_of_accounts')
    .insert([
      { organization_id: org.orgId, association_id: org.associationId, account_number: '1015', account_name: 'Online payments clearing', account_type: 'asset', fund_id: acct.fundIds.OPERATING },
      { organization_id: org.orgId, association_id: org.associationId, account_number: '6150', account_name: 'Merchant processing fees', account_type: 'expense', fund_id: acct.fundIds.OPERATING },
    ])
    .select('id, account_number')
  if (coaErr || !extra) throw new Error(`chart insert failed: ${coaErr?.message}`)
  const ids = { ...acct.accountIds, ...Object.fromEntries((extra as Array<{ id: string; account_number: string }>).map((r) => [r.account_number, r.id])) } as Record<string, string>

  const { data: assessment, error: aErr } = await db
    .from('assessments')
    .insert({
      organization_id: org.orgId,
      association_id: org.associationId,
      unit_id: unitId,
      fiscal_period_id: acct.fiscalPeriodId,
      assessment_type: 'regular',
      amount: 250,
      due_date: today(),
      status: 'open',
    })
    .select('id')
    .single()
  if (aErr || !assessment) throw new Error(`assessment insert failed: ${aErr?.message}`)

  const { data: attempt, error: opErr } = await db
    .from('online_payments')
    .insert({
      organization_id: org.orgId,
      association_id: org.associationId,
      unit_id: unitId,
      method_type: 'card',
      dues_cents: 25000,
      fee_cents: 0,
      fee_payer: 'association',
      total_cents: 25000,
      application_fee_cents: 150,
      allocation: [{ assessment_id: assessment.id, cents: 25000 }],
      allocation_mode: 'oldest_first',
      status: 'processing',
      stripe_account_id: ACCT,
      stripe_payment_intent_id: 'pi_clearingtest1',
      idempotency_key: 'clearing-test-key-0001',
    })
    .select('id')
    .single()
  if (opErr || !attempt) throw new Error(`attempt insert failed: ${opErr?.message}`)

  const { data: bank, error: bErr } = await db
    .from('bank_accounts')
    .insert({ organization_id: org.orgId, association_id: org.associationId, fund_id: acct.fundIds.OPERATING, account_name: 'Operating Checking' })
    .select('id')
    .single()
  if (bErr || !bank) throw new Error(`bank account insert failed: ${bErr?.message}`)

  return { org, acct, ids, unitId, assessmentId: assessment.id, attemptId: attempt.id, bankAccountId: bank.id }
}

describe('online payments clearing (BL-035 PR 8)', () => {
  beforeEach(async () => {
    await truncateAll()
  })

  it('1015 rises on the payment and returns to exactly zero once the payout is matched to the deposit', async () => {
    const db = loose()
    const s = await seed()

    // 1. The card payment posts: dues go into clearing, receivables fall.
    const posted = await db.rpc('record_online_payment_success', { p_attempt: s.attemptId, p_paid_on: today(), p_charge: 'ch_clearingtest1' })
    expect(posted.error).toBeNull()
    expect(await balanceCents(s.org.associationId, s.ids['1015'])).toBe(25000)

    // 2. Stripe pays out $250.00 less $2.45 of fees the association bore: $247.55 arrives.
    const { data: txn, error: tErr } = await db
      .from('bank_transactions')
      .insert({ organization_id: s.org.orgId, bank_account_id: s.bankAccountId, amount: 247.55, posted_date: today(), memo: 'STRIPE TRANSFER' })
      .select('id')
      .single()
    expect(tErr).toBeNull()

    const ports = createSupabasePayoutPorts(adminDb(), { listPayoutBalanceLines: async () => [] })
    const payout = await ports.upsertPayout({
      organizationId: s.org.orgId,
      associationId: s.org.associationId,
      stripeAccountId: ACCT,
      stripePayoutId: 'po_clearingtest1',
      amountCents: 24755,
      feeCents: 245,
      arrivalDate: today(),
      status: 'paid',
    })
    expect(await matchOnePayout(payout, ports)).toBe('matched')

    // 3. Clearing is zero. Cash holds the deposit. The fee is an expense.
    expect(await balanceCents(s.org.associationId, s.ids['1015'])).toBe(0)
    expect(await balanceCents(s.org.associationId, s.ids['1010'])).toBe(24755)
    expect(await balanceCents(s.org.associationId, s.ids['6150'])).toBe(245)

    // The bank line is matched with a method the table accepts, and the payout points at it.
    const { data: line } = await db.from('bank_transactions').select('matched_journal_entry_id, match_method').eq('id', txn!.id).single()
    expect(line?.matched_journal_entry_id).toBeTruthy()
    expect(line?.match_method).toBe('auto_exact')
    const { data: po } = await db.from('stripe_payouts').select('bank_transaction_id, journal_entry_id').eq('stripe_payout_id', 'po_clearingtest1').single()
    expect(po?.bank_transaction_id).toBe(txn!.id)
    expect(po?.journal_entry_id).toBe(line?.matched_journal_entry_id)

    // 4. A replay (the same event, or the board's Check again) posts nothing more.
    const again = await ports.upsertPayout({
      organizationId: s.org.orgId,
      associationId: s.org.associationId,
      stripeAccountId: ACCT,
      stripePayoutId: 'po_clearingtest1',
      amountCents: 24755,
      feeCents: 245,
      arrivalDate: today(),
      status: 'paid',
    })
    expect(await matchOnePayout(again, ports)).toBe('already_matched')
    expect(await balanceCents(s.org.associationId, s.ids['1015'])).toBe(0)
  })

  it('a payout with no deposit in the bank feed leaves clearing untouched and unmatched', async () => {
    const db = loose()
    const s = await seed()
    await db.rpc('record_online_payment_success', { p_attempt: s.attemptId, p_paid_on: today(), p_charge: 'ch_clearingtest1' })

    const ports = createSupabasePayoutPorts(adminDb(), { listPayoutBalanceLines: async () => [] })
    const payout = await ports.upsertPayout({
      organizationId: s.org.orgId,
      associationId: s.org.associationId,
      stripeAccountId: ACCT,
      stripePayoutId: 'po_clearingtest2',
      amountCents: 24755,
      feeCents: 245,
      arrivalDate: today(),
      status: 'paid',
    })
    expect(await matchOnePayout(payout, ports)).toBe('recorded_unmatched')
    expect(await balanceCents(s.org.associationId, s.ids['1015'])).toBe(25000)
    expect((await ports.listUnmatchedPaid(s.org.associationId)).map((p) => p.stripePayoutId)).toEqual(['po_clearingtest2'])
  })
})
