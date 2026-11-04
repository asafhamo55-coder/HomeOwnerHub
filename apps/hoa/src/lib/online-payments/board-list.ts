/**
 * The board's list of a home's online payments, for the Refund button.
 * Read with the signed-in board member's own client (RLS: board and admin of
 * the org only), never the service role. A failed read throws so the panel
 * can say "could not load" instead of showing an empty list. Integer cents.
 *
 * Dark: returns null until M8_APPLIED, so the property page is unchanged.
 */
import { M8_APPLIED } from '@homeowner-portal/db/m8'
import { refundableCents } from './reversal-rules'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

export interface BoardOnlinePayment {
  id: string
  method: 'ach' | 'card'
  status: string
  /** Day the money posted, yyyy-mm-dd. */
  postedOn: string
  totalCents: number
  duesCents: number
  /** Dues still refundable (posted less everything already given back). */
  refundableCents: number
}

const fail = (what: string, e: { code?: string }) => new Error(`online-payments: ${what} failed (${e.code ?? 'unknown'})`)

type Row = {
  id: string
  method_type: 'ach' | 'card'
  status: string
  total_cents: number
  dues_cents: number
  posted_at: string
  settled_on: string | null
  posted_result: Array<{ cents?: number }> | null
}

export async function loadBoardOnlinePayments(db: Db, unitId: string): Promise<BoardOnlinePayment[] | null> {
  if (!M8_APPLIED) return null
  const { data, error } = await db
    .from('online_payments')
    .select('id, method_type, status, total_cents, dues_cents, posted_at, settled_on, posted_result')
    .eq('unit_id', unitId)
    .not('posted_at', 'is', null)
    .order('posted_at', { ascending: false })
    .limit(20)
  if (error) throw fail('payments read', error)
  const rows = (data ?? []) as Row[]
  if (rows.length === 0) return []

  const { data: adj, error: aerr } = await db
    .from('online_payment_adjustments')
    .select('online_payment_id, kind, amount_cents')
    .in('online_payment_id', rows.map((r) => r.id))
    .in('kind', ['failed', 'refund', 'dispute_lost', 'refund_failed'])
  if (aerr) throw fail('adjustments read', aerr)
  const reversed = new Map<string, number>()
  for (const a of (adj ?? []) as Array<{ online_payment_id: string; kind?: string; amount_cents: number }>) {
    const signed = a.kind === 'refund_failed' ? -Number(a.amount_cents) : Number(a.amount_cents)
    reversed.set(a.online_payment_id, (reversed.get(a.online_payment_id) ?? 0) + signed)
  }

  return rows.map((r) => {
    const posted = (r.posted_result ?? []).reduce((n, p) => n + (p.cents ?? 0), 0)
    return {
      id: r.id,
      method: r.method_type,
      status: r.status,
      postedOn: (r.settled_on ?? r.posted_at).slice(0, 10),
      totalCents: r.total_cents,
      duesCents: r.dues_cents,
      refundableCents: refundableCents(posted, reversed.get(r.id) ?? 0),
    }
  })
}

const STATUS_WORDS: Record<string, string> = {
  succeeded: 'Paid',
  partially_refunded: 'Partly given back',
  refunded: 'Given back',
  disputed: 'Disputed by the payer',
  dispute_lost: 'Dispute lost',
  failed: 'Did not go through',
}

/** Plain words for the status column. */
export function statusWords(status: string): string {
  return STATUS_WORDS[status] ?? 'In progress'
}

/** Only a payment that went through and still has money on it can be refunded. */
export function canRefund(p: Pick<BoardOnlinePayment, 'status' | 'refundableCents'>): boolean {
  return (p.status === 'succeeded' || p.status === 'partially_refunded') && p.refundableCents > 0
}
