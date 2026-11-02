import { LoadFailed } from '@homeowner-portal/ui'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { tryLoad } from '@/lib/load-or-fail'
import { canRefund, loadBoardOnlinePayments, statusWords } from '@/lib/online-payments/board-list'
import { formatDay, usd as formatUsd } from '@/lib/money/format'
import { RefundOnlinePaymentButton } from './RefundOnlinePaymentButton'

const usd = (cents: number) => formatUsd(cents / 100)

/**
 * Card and bank payments made through the app for one home, with a button to
 * give money back. Board and admin only (the caller checks; the action and RLS
 * check again). Renders nothing until online payments are on and the home has
 * at least one payment, so every other home looks exactly as before.
 */
export async function OnlinePaymentsPanel({ unitId }: { unitId: string }) {
  const supabase = await getSupabaseServerClient()
  const res = await tryLoad('online payments', () => loadBoardOnlinePayments(supabase as never, unitId))
  if (!res.ok) return <LoadFailed what="online payments" />
  if (!res.data || res.data.length === 0) return null

  return (
    <section aria-labelledby="online-payments" className="space-y-3">
      <h3 id="online-payments" className="text-sm font-semibold text-foreground">
        Card and bank payments
      </h3>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {res.data.map((p) => (
          <li key={p.id} className="space-y-3 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-base font-medium text-foreground">
                {usd(p.totalCents)} by {p.method === 'ach' ? 'bank account' : 'card'}
              </span>
              <span className="text-base text-foreground-secondary">
                {formatDay(p.postedOn)} · {statusWords(p.status)}
              </span>
            </div>
            {canRefund(p) ? <RefundOnlinePaymentButton paymentId={p.id} refundableCents={p.refundableCents} /> : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
