import Link from 'next/link'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import type { AtRiskItem } from '@/lib/dashboard/queries'

// Human-friendly relative-day phrasing. Mirrors the language we want on
// the card row: "in 3 days" / "2 days late" / "today".
function offsetLabel(daysOffset: number): string {
  if (daysOffset === 0) return 'today'
  if (daysOffset > 0) {
    return daysOffset === 1 ? 'in 1 day' : `in ${daysOffset} days`
  }
  const late = Math.abs(daysOffset)
  return late === 1 ? '1 day late' : `${late} days late`
}

// "What will hurt you this week if you don't act on it." Unioned across
// cure deadlines, dues, and COI expirations. Empty state celebrates green.
export function AtRiskThisWeek({
  items,
  totalCount,
  maxRows = 6,
}: {
  items: AtRiskItem[]
  totalCount: number
  maxRows?: number
}) {
  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden />
            At risk this week
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted">
          All deadlines green this week.
        </CardContent>
      </Card>
    )
  }

  const visible = items.slice(0, maxRows)
  const overflow = totalCount - visible.length

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">At risk this week</CardTitle>
        <span className="text-xs text-muted">
          {totalCount} {totalCount === 1 ? 'item' : 'items'}
        </span>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border">
          {visible.map((item) => (
            <li key={`${item.kind}:${item.id}`}>
              <Link
                href={item.href}
                className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-background/50"
              >
                <span
                  className={
                    'h-2.5 w-2.5 shrink-0 rounded-full ' +
                    (item.severity === 'red' ? 'bg-red-500' : 'bg-amber-500')
                  }
                  aria-hidden
                />
                <span className="flex-1 truncate text-sm text-foreground">
                  {item.title}
                </span>
                <span
                  className={
                    'text-xs ' +
                    (item.severity === 'red' ? 'text-red-600' : 'text-amber-600')
                  }
                >
                  {offsetLabel(item.daysOffset)}
                </span>
                <ArrowRight className="h-4 w-4 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
        {overflow > 0 ? (
          <div className="border-t border-border px-6 py-3 text-xs text-muted">
            + {overflow} more at risk. Drill into each section to review.
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
