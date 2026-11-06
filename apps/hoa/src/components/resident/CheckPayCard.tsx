import { Mail } from 'lucide-react'
import type { CheckSettings } from '@/lib/pay-by-zelle'
import { Panel } from '@/components/resident/screen'

// "Pay by check" (round 29). Shared by the resident Pay screen and the
// board's preview in Settings. Presentational only: no server-only imports.

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function CheckPayCard({
  checks,
  amountDue,
  instructions,
}: {
  checks: CheckSettings
  /** Total the resident owes; omit to leave the line out. */
  amountDue?: number | null
  /** The board's free-text note, shown when there is no Zelle card to carry it. */
  instructions?: string | null
}) {
  return (
    <Panel title="Pay by check" icon={<Mail />}>
      <dl className="space-y-3 text-base">
        <Row label="Make checks payable to" value={checks.payableTo} />
        <Row label="Mail to" value={checks.mailTo} />
        {checks.dropOff ? <Row label="Or drop off at" value={checks.dropOff} /> : null}
        {amountDue != null && amountDue > 0 ? (
          <Row label="Amount due" value={<span className="num">{usd.format(amountDue)}</span>} />
        ) : null}
      </dl>
      <p className="mt-4 text-base text-foreground">Write your home address or account number on the check.</p>
      {instructions ? <p className="mt-3 whitespace-pre-line text-base text-foreground-secondary">{instructions}</p> : null}
    </Panel>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd className="whitespace-pre-line break-words font-medium text-foreground">{value}</dd>
    </div>
  )
}
