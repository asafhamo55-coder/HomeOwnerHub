import type { PollResultRow } from '@homeowner-portal/db/polls-types'
import { buildTally, homesLabel } from '@/lib/polls/rules'

/** Tally bars. Counts homes, never names. */
export function PollResults({ rows, allowMultiple }: { rows: PollResultRow[]; allowMultiple: boolean }) {
  const t = buildTally(rows)
  return (
    <div className="space-y-4">
      <p className="text-base font-medium text-foreground">{homesLabel(t.homesAnswered)}</p>
      <ul className="space-y-4">
        {t.rows.map((r) => (
          <li key={r.optionId}>
            <div className="flex items-baseline justify-between gap-3 text-base">
              <span className={r.leading ? 'font-semibold text-foreground' : 'text-foreground'}>{r.label}</span>
              <span className="shrink-0 text-foreground-secondary">
                {r.votes} {r.votes === 1 ? 'home' : 'homes'} ({r.percent}%)
              </span>
            </div>
            <div
              className="mt-1 h-3 w-full overflow-hidden rounded-full bg-subtle"
              role="img"
              aria-label={`${r.label}: ${r.percent} percent`}
            >
              <div className="h-full rounded-full bg-primary" style={{ width: `${r.percent}%` }} />
            </div>
          </li>
        ))}
      </ul>
      {allowMultiple ? (
        <p className="text-sm text-foreground-secondary">
          Homes could pick more than one answer, so the percents can add up to more than 100.
        </p>
      ) : null}
    </div>
  )
}
