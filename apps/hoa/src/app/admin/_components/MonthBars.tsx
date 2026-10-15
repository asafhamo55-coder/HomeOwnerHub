/**
 * Monthly count columns (tenants created per month). Server-rendered and
 * token-coloured. The chart is decorative for sighted users; the same
 * numbers are in a visually hidden list for screen readers, and each
 * non-zero month prints its count above the column.
 */
export function MonthBars({
  months,
  label,
}: {
  months: Array<{ month: string; count: number }>
  /** What is counted, for the accessible summary ("tenants created"). */
  label: string
}) {
  const max = Math.max(...months.map((m) => m.count), 1)
  const total = months.reduce((n, m) => n + m.count, 0)
  return (
    <figure className="space-y-2">
      <div className="flex h-36 items-end gap-1 sm:gap-2" aria-hidden>
        {months.map((m) => {
          const pct = (m.count / max) * 100
          return (
            <div key={m.month} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
              {m.count > 0 ? <span className="num text-2xs font-medium text-foreground-secondary">{m.count}</span> : null}
              <div
                className={m.count > 0 ? 'w-full max-w-10 rounded-t-md bg-primary' : 'h-px w-full max-w-10 bg-border'}
                style={m.count > 0 ? { height: `${Math.max(pct, 4)}%` } : undefined}
              />
            </div>
          )
        })}
      </div>
      <div className="flex gap-1 border-t border-border pt-1.5 sm:gap-2" aria-hidden>
        {months.map((m) => (
          <span key={m.month} className="num min-w-0 flex-1 text-center text-2xs text-muted">
            {monthShort(m.month)}
          </span>
        ))}
      </div>
      <figcaption className="sr-only">
        {total} {label} in the last {months.length} months:{' '}
        {months.map((m) => `${monthShort(m.month)} ${m.count}`).join(', ')}.
      </figcaption>
    </figure>
  )
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-03" → "Mar" (falls back to the raw key). */
function monthShort(key: string): string {
  const idx = Number(key.slice(5, 7)) - 1
  return MONTHS[idx] ?? key
}
