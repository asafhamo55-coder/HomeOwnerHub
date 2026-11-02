/**
 * Reads for the books of an association that takes online payments: what is
 * still in 1015 "Online payments clearing" and which Stripe payouts have no
 * matching deposit in the bank feed (design 3.8 steps 5 and 6).
 *
 * An association that does NOT use online payments gets `null` from every
 * function here, and the callers show nothing: the flag is off, or it has no
 * association_stripe_accounts row. Reads go through the signed-in board
 * member's own client (RLS), never the service role. A failed read throws,
 * so a caller can say "could not check" instead of reporting zero.
 *
 * Integer cents throughout; the ledger stores numeric dollars, converted at
 * the edge.
 */
import { M8_APPLIED } from '@homeowner-portal/db/m8'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { readAll } from '@/lib/supabase/read-all'
import { payoutsMissingFromBank, type PayoutRow } from './payouts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LooseDb = { from: (table: string) => any }

const fail = (what: string, error: { code?: string; message?: string }) =>
  new Error(`online-payments: ${what} failed (${error.code ?? 'unknown'})`)

const toCents = (n: number | string) => Math.round(Number(n) * 100)

/** True when this association takes online payments at all (so the books carry 1015). */
export async function usesOnlinePayments(db: LooseDb, associationId: string): Promise<boolean> {
  if (!M8_APPLIED) return false
  const { data, error } = await db
    .from('association_stripe_accounts')
    .select('id')
    .eq('association_id', associationId)
    .maybeSingle()
  if (error) throw fail('account read', error)
  return Boolean(data)
}

/** Balance of account 1015 through `throughDate` (debits minus credits; it is an asset). */
export async function clearingBalanceCents(db: LooseDb, associationId: string, throughDate: string): Promise<number> {
  const { data: acct, error } = await db
    .from('chart_of_accounts')
    .select('id')
    .eq('association_id', associationId)
    .eq('account_number', '1015')
    .maybeSingle()
  if (error) throw fail('clearing account read', error)
  if (!acct) return 0
  const lines = await readAll<{ debit_amount: number | string; credit_amount: number | string }>(
    (from, to) =>
      db
        .from('ledger_entries')
        .select('id, debit_amount, credit_amount, je:journal_entry_id!inner(status, entry_date, association_id)')
        .eq('account_id', acct.id)
        .eq('je.association_id', associationId)
        .eq('je.status', 'posted')
        .lte('je.entry_date', throughDate)
        .order('id', { ascending: true })
        .range(from, to),
    (e) => fail('clearing lines read', e),
  )
  return lines.reduce((s, l) => s + toCents(l.debit_amount) - toCents(l.credit_amount), 0)
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

/** Paid payouts with no bank line yet, arrived on or before `throughDate`. */
export async function unmatchedPaidPayouts(db: LooseDb, associationId: string, throughDate: string): Promise<PayoutRow[]> {
  const rows = await readAll<PayoutDbRow>(
    (from, to) =>
      db
        .from('stripe_payouts')
        .select('id, organization_id, association_id, stripe_account_id, stripe_payout_id, amount_cents, fee_cents, arrival_date, status, bank_transaction_id')
        .eq('association_id', associationId)
        .eq('status', 'paid')
        .is('bank_transaction_id', null)
        .lte('arrival_date', throughDate)
        .order('id', { ascending: true })
        .range(from, to),
    (e) => fail('payouts read', e),
  )
  return rows.map((r) => ({
    id: r.id,
    organizationId: r.organization_id,
    associationId: r.association_id,
    stripeAccountId: r.stripe_account_id,
    stripePayoutId: r.stripe_payout_id,
    amountCents: Number(r.amount_cents),
    feeCents: Number(r.fee_cents),
    arrivalDate: String(r.arrival_date).slice(0, 10),
    status: r.status,
    bankTransactionId: r.bank_transaction_id,
  }))
}

export interface ClearingForClose {
  balanceCents: number
  /** Paid payouts not yet matched to a deposit, as of the period end. */
  unmatchedPayouts: number
  unmatchedPayoutCents: number
}

/** For the period-close dialog. Null when the association does not take online payments. */
export async function loadClearingForClose(associationId: string, endDate: string, db?: LooseDb): Promise<ClearingForClose | null> {
  const d = db ?? ((await getSupabaseServerClient()) as unknown as LooseDb)
  if (!(await usesOnlinePayments(d, associationId))) return null
  const [balanceCents, unmatched] = await Promise.all([
    clearingBalanceCents(d, associationId, endDate),
    unmatchedPaidPayouts(d, associationId, endDate),
  ])
  return {
    balanceCents,
    unmatchedPayouts: unmatched.length,
    unmatchedPayoutCents: unmatched.reduce((s, p) => s + p.amountCents, 0),
  }
}

/** For the reconciliation screen: payouts Stripe says it paid that the bank feed does not show. Null when not applicable. */
export async function loadPayoutsMissingFromBank(associationId: string, today: string, db?: LooseDb): Promise<PayoutRow[] | null> {
  const d = db ?? ((await getSupabaseServerClient()) as unknown as LooseDb)
  if (!(await usesOnlinePayments(d, associationId))) return null
  return payoutsMissingFromBank(await unmatchedPaidPayouts(d, associationId, today), today)
}
