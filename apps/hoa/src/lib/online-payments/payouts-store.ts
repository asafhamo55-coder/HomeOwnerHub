/**
 * Supabase adapter for payouts.ts (PR 8). Service-role client only: the web
 * roles cannot write stripe_payouts (migration 0073). Dark behind M8_APPLIED
 * through payouts.ts; ensureOnlinePaymentAccounts checks the flag itself.
 *
 * Stripe is injected (`listPayoutBalanceLines`) so this file never imports
 * the Stripe SDK; the Connect webhook owner supplies the real one.
 *
 * No integration test here on purpose: CI replays 0073 against an ephemeral
 * database, and this adapter is exercised there. Unit tests cover payouts.ts.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { postJournalEntry } from '@homeowner-portal/db'
import type { Database } from '@homeowner-portal/db'
import { M8_APPLIED } from '@homeowner-portal/db/m8'
import { readCurrentOpenPeriod } from '@homeowner-portal/jobs/fiscal-periods'
import type { BankLine, PayoutBalanceLine, PayoutPorts, PayoutRow } from './payouts'

export const CLEARING_ACCOUNT = { number: '1015', name: 'Online payments clearing', type: 'asset' } as const
export const PROCESSING_FEES_ACCOUNT = { number: '6150', name: 'Merchant processing fees', type: 'expense' } as const

type Db = SupabaseClient<Database>
// stripe_payouts is not in the generated types until the owner applies 0073
// and types are regenerated, so these reads go through a loose client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (t: string) => any }
const loose = (db: Db): Loose => db as unknown as Loose

/**
 * Creates 1015 and 6150 for one association if absent. Safe to call on every
 * enable (design 1.3 step 6). Returns false when the books are not set up
 * (no OPERATING fund), so the caller can say "set up your books first".
 */
export async function ensureOnlinePaymentAccounts(db: Db, organizationId: string, associationId: string): Promise<boolean> {
  if (!M8_APPLIED) return false
  const { data: fund } = await db
    .from('funds')
    .select('id')
    .eq('association_id', associationId)
    .eq('code', 'OPERATING')
    .maybeSingle()
  if (!fund) return false
  const { data: have, error } = await db
    .from('chart_of_accounts')
    .select('account_number')
    .eq('association_id', associationId)
    .in('account_number', [CLEARING_ACCOUNT.number, PROCESSING_FEES_ACCOUNT.number])
  if (error) throw new Error(`chart read failed: ${error.message}`)
  const present = new Set((have ?? []).map((r) => r.account_number))
  const missing = [CLEARING_ACCOUNT, PROCESSING_FEES_ACCOUNT].filter((a) => !present.has(a.number))
  if (missing.length === 0) return true
  const { error: insErr } = await db.from('chart_of_accounts').insert(
    missing.map((a) => ({
      organization_id: organizationId,
      association_id: associationId,
      account_number: a.number,
      account_name: a.name,
      account_type: a.type,
      fund_id: fund.id,
    })),
  )
  if (insErr) throw new Error(`chart insert failed: ${insErr.message}`)
  return true
}

interface PayoutDbRow {
  id: string
  organization_id: string
  association_id: string
  stripe_account_id: string
  stripe_payout_id: string
  amount_cents: number
  fee_cents: number
  arrival_date: string
  status: PayoutRow['status']
  bank_transaction_id: string | null
}

const toRow = (r: PayoutDbRow): PayoutRow => ({
  id: r.id,
  organizationId: r.organization_id,
  associationId: r.association_id,
  stripeAccountId: r.stripe_account_id,
  stripePayoutId: r.stripe_payout_id,
  amountCents: Number(r.amount_cents),
  feeCents: Number(r.fee_cents),
  arrivalDate: r.arrival_date,
  status: r.status,
  bankTransactionId: r.bank_transaction_id,
})

const PAYOUT_COLS =
  'id, organization_id, association_id, stripe_account_id, stripe_payout_id, amount_cents, fee_cents, arrival_date, status, bank_transaction_id'

export function createSupabasePayoutPorts(
  db: Db,
  stripe: { listPayoutBalanceLines(stripeAccountId: string, stripePayoutId: string): Promise<PayoutBalanceLine[]> },
): PayoutPorts {
  const l = loose(db)
  return {
    listPayoutBalanceLines: stripe.listPayoutBalanceLines,

    async resolveAssociation(stripeAccountId) {
      const { data, error } = await l
        .from('association_stripe_accounts')
        .select('association_id, organization_id')
        .eq('stripe_account_id', stripeAccountId)
        .maybeSingle()
      if (error) throw new Error(`account lookup failed: ${error.message}`)
      return data ? { associationId: data.association_id, organizationId: data.organization_id } : null
    },

    async feePayersByCharge(stripeAccountId, chargeIds) {
      const { data, error } = await l
        .from('online_payments')
        .select('stripe_charge_id, fee_payer')
        .eq('stripe_account_id', stripeAccountId)
        .in('stripe_charge_id', chargeIds)
      if (error) throw new Error(`fee payer lookup failed: ${error.message}`)
      return new Map(
        ((data ?? []) as Array<{ stripe_charge_id: string; fee_payer: 'association' | 'homeowner' }>).map((r) => [
          r.stripe_charge_id,
          r.fee_payer,
        ]),
      )
    },

    async upsertPayout(row) {
      // Not an upsert: a replay must never clear bank_transaction_id.
      const found = await l
        .from('stripe_payouts')
        .select(PAYOUT_COLS)
        .eq('stripe_account_id', row.stripeAccountId)
        .eq('stripe_payout_id', row.stripePayoutId)
        .maybeSingle()
      if (found.error) throw new Error(`payout read failed: ${found.error.message}`)
      const values = {
        amount_cents: row.amountCents,
        fee_cents: row.feeCents,
        arrival_date: row.arrivalDate,
        status: row.status,
      }
      if (found.data) {
        const upd = await l.from('stripe_payouts').update(values).eq('id', found.data.id).select(PAYOUT_COLS).single()
        if (upd.error) throw new Error(`payout update failed: ${upd.error.message}`)
        return toRow(upd.data)
      }
      const ins = await l
        .from('stripe_payouts')
        .insert({
          organization_id: row.organizationId,
          association_id: row.associationId,
          stripe_account_id: row.stripeAccountId,
          stripe_payout_id: row.stripePayoutId,
          ...values,
        })
        .select(PAYOUT_COLS)
        .single()
      if (ins.error) throw new Error(`payout insert failed: ${ins.error.message}`)
      return toRow(ins.data)
    },

    async findBankCandidates(associationId, amountCents, from, to): Promise<BankLine[]> {
      const { data, error } = await l
        .from('bank_transactions')
        .select('id, amount, posted_date, bank_account:bank_account_id!inner(association_id)')
        .eq('bank_account.association_id', associationId)
        .is('matched_journal_entry_id', null)
        .eq('amount', amountCents / 100)
        .gte('posted_date', from)
        .lte('posted_date', to)
      if (error) throw new Error(`bank read failed: ${error.message}`)
      return ((data ?? []) as Array<{ id: string; amount: number | string; posted_date: string }>).map((r) => ({
        id: r.id,
        amountCents: Math.round(Number(r.amount) * 100),
        postedDate: String(r.posted_date).slice(0, 10),
      }))
    },

    async claimPayout(payoutId, bankTransactionId) {
      const { data, error } = await l
        .from('stripe_payouts')
        .update({ bank_transaction_id: bankTransactionId })
        .eq('id', payoutId)
        .is('bank_transaction_id', null)
        .select('id')
      if (error) throw new Error(`payout claim failed: ${error.message}`)
      return (data ?? []).length === 1
    },

    async releasePayout(payoutId) {
      await l.from('stripe_payouts').update({ bank_transaction_id: null }).eq('id', payoutId)
    },

    async postMatch({ payout, bankTransactionId, bankPostedDate, clearingCents, feeCents }) {
      const { data: bankTxn } = await db
        .from('bank_transactions')
        .select('bank_account:bank_account_id(fund_id)')
        .eq('id', bankTransactionId)
        .single()
      const fundId = (bankTxn?.bank_account as { fund_id: string } | null)?.fund_id
      if (!fundId) return { ok: false, error: 'bank account has no fund' }

      const { data: fund } = await db.from('funds').select('code').eq('id', fundId).single()
      const cashNumber = fund?.code === 'RESERVE' ? '1020' : '1010'
      const { data: accts } = await db
        .from('chart_of_accounts')
        .select('id, account_number')
        .eq('association_id', payout.associationId)
        .in('account_number', [cashNumber, CLEARING_ACCOUNT.number, PROCESSING_FEES_ACCOUNT.number])
      const byNumber = new Map((accts ?? []).map((a) => [a.account_number, a.id]))
      const cash = byNumber.get(cashNumber)
      const clearing = byNumber.get(CLEARING_ACCOUNT.number)
      const fees = byNumber.get(PROCESSING_FEES_ACCOUNT.number)
      if (!cash || !clearing || (feeCents > 0 && !fees)) return { ok: false, error: 'books_not_open' }

      const { data: period } = await readCurrentOpenPeriod(db, payout.associationId, bankPostedDate)
      if (!period) return { ok: false, error: 'no_open_period' }

      const je = await postJournalEntry(db, {
        organizationId: payout.organizationId,
        associationId: payout.associationId,
        fiscalPeriodId: period.id,
        entryDate: bankPostedDate,
        memo: 'Stripe payout deposited',
        source: 'bank_rec',
        sourceId: bankTransactionId,
        lines: [
          { accountId: cash, fundId, debit: payout.amountCents / 100, credit: 0 },
          ...(feeCents > 0 ? [{ accountId: fees!, fundId, debit: feeCents / 100, credit: 0 }] : []),
          { accountId: clearing, fundId, debit: 0, credit: clearingCents / 100 },
        ],
      })
      if (!je.ok) return { ok: false, error: je.error }

      const bankUpd = await db
        .from('bank_transactions')
        .update({ matched_journal_entry_id: je.journalEntryId, match_method: 'stripe_payout', match_confidence: 1 })
        .eq('id', bankTransactionId)
      if (bankUpd.error) return { ok: false, error: bankUpd.error.message }
      const payUpd = await l
        .from('stripe_payouts')
        .update({ journal_entry_id: je.journalEntryId, matched_at: new Date().toISOString() })
        .eq('id', payout.id)
      if (payUpd.error) return { ok: false, error: payUpd.error.message }
      return { ok: true }
    },

    async listUnmatchedPaid(associationId) {
      const { data, error } = await l
        .from('stripe_payouts')
        .select(PAYOUT_COLS)
        .eq('association_id', associationId)
        .eq('status', 'paid')
        .is('bank_transaction_id', null)
        .order('arrival_date', { ascending: true })
        .limit(200)
      if (error) throw new Error(`unmatched read failed: ${error.message}`)
      return ((data ?? []) as PayoutDbRow[]).map(toRow)
    },
  }
}
