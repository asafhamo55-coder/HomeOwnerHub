import { checksOf, type PayLine, type ZelleReadResult } from '@/lib/pay-by-zelle'
import { formatDay } from '@/lib/money/format'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

/**
 * The "How to pay" block at the foot of the printed statement. Check details
 * print whenever the board saved them; the Zelle block only when Zelle is set
 * up and there are charges to pay. Renders nothing otherwise.
 */
export function StatementHowToPay({ read, payLines }: { read: ZelleReadResult | null; payLines: PayLine[] }) {
  if (!read) return null
  const checks = checksOf(read)
  const showZelle = read.state === 'configured' && payLines.length > 0
  if (!checks && !showZelle) return null
  return (
    <section className="space-y-1.5 border-t border-border pt-4 text-sm">
      <h3 className="font-semibold text-foreground">How to pay</h3>
      {checks ? (
        <div className="space-y-0.5 text-foreground-secondary">
          <p>
            Pay by check. Make checks payable to <span className="font-medium text-foreground">{checks.payableTo}</span>.
          </p>
          <p className="whitespace-pre-line">
            Mail to: <span className="font-medium text-foreground">{checks.mailTo}</span>
          </p>
          {checks.dropOff ? (
            <p className="whitespace-pre-line">
              Or drop off at: <span className="font-medium text-foreground">{checks.dropOff}</span>
            </p>
          ) : null}
          <p>Write your home address or account number on the check.</p>
        </div>
      ) : null}
      {read.state === 'configured' && showZelle ? (
        <>
          <p className="text-foreground-secondary">
            Send each charge by Zelle to <span className="font-medium text-foreground">{read.settings.recipient}</span>
            {read.settings.recipientName ? ` (${read.settings.recipientName})` : ''}, with its memo code:
          </p>
          <ul className="space-y-0.5">
            {payLines.map((l) => (
              <li key={l.assessmentId} className="text-foreground">
                <span className="num">{usd.format(l.amount)}</span> · {l.label}, due {formatDay(l.dueDate)}:{' '}
                {l.memoCode ? <span className="font-mono font-semibold">{l.memoCode}</span> : 'put your address in the memo'}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  )
}
