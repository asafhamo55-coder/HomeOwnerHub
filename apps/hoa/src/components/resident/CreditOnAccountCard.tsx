import { PiggyBank } from 'lucide-react'
import type { ResidentCredit } from '@/lib/resident-credit'
import { Panel } from '@/components/resident/screen'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

/**
 * "Credit on account: $X" for the resident Dues and Pay screens. Renders
 * nothing when there is no credit (zero, M7 off, or a failed read: the caller
 * passes null). Informational: it never changes the amount due.
 */
export function CreditOnAccountCard({ credit, variant = 'dues' }: { credit: ResidentCredit | null; variant?: 'dues' | 'pay' }) {
  if (!credit || credit.total <= 0) return null
  return (
    <Panel>
      <section aria-label="Credit on account" className="flex items-start gap-3">
        <PiggyBank className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">
            Credit on account: <span className="num">{usd.format(credit.total)}</span>
          </p>
          <p className="text-sm text-foreground-secondary">
            {variant === 'pay'
              ? 'You paid more than you owed. Your board applies this credit to a charge; it is not taken off the amount above automatically. You can pay the remaining balance, and ask your board to apply the credit first to pay less.'
              : 'You paid more than you owed. Your board applies this credit to a charge.'}
          </p>
        </div>
      </section>
    </Panel>
  )
}
