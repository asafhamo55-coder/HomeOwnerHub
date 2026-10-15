import Link from 'next/link'
import { ChevronRight, ShieldCheck } from 'lucide-react'
import { Badge, Card, CardContent, CardHeader, CardTitle, StatusPill } from '@homeowner-portal/ui'
import type { AtRiskItem } from '@/lib/dashboard/queries'
import { FailedNote } from './BreakdownList'

// Human-friendly relative-day phrasing: "in 3 days" / "2 days late" / "today".
function offsetLabel(daysOffset: number): string {
  if (daysOffset === 0) return 'Today'
  if (daysOffset > 0) return daysOffset === 1 ? 'In 1 day' : `In ${daysOffset} days`
  const late = Math.abs(daysOffset)
  return late === 1 ? '1 day late' : `${late} days late`
}

/** Split "Kind · rest" into a kind label and the row title. */
function splitTitle(title: string): { kind: string; rest: string } {
  const [kind, ...rest] = title.split(' · ')
  return rest.length > 0 ? { kind, rest: rest.join(' · ') } : { kind: '', rest: title }
}

// "What will hurt you this week if you don't act on it." Unioned across
// cure deadlines, dues, and COI expirations. "All green" is a claim, so a
// failed read never shows it.
export function AtRiskThisWeek({
  items,
  totalCount,
  failed = false,
  maxRows = 6,
}: {
  items: AtRiskItem[]
  totalCount: number
  failed?: boolean
  maxRows?: number
}) {
  const visible = items.slice(0, maxRows)
  const overflow = totalCount - visible.length

  return (
    <Card id="at-risk">
      <CardHeader
        className="pb-3"
        actions={
          totalCount > 0 ? (
            <Badge variant="neutral" className="num">
              {totalCount} {totalCount === 1 ? 'item' : 'items'}
            </Badge>
          ) : null
        }
      >
        <CardTitle as="h2">At risk this week</CardTitle>
        <p className="text-sm text-muted">Cure deadlines, overdue dues and expiring vendor insurance.</p>
      </CardHeader>
      {visible.length === 0 ? (
        <CardContent>
          {failed ? (
            <FailedNote what="deadlines at risk" />
          ) : (
            <p className="flex items-center gap-2 text-sm text-foreground-secondary">
              <ShieldCheck className="size-4 text-success" aria-hidden />
              All deadlines are on track this week.
            </p>
          )}
        </CardContent>
      ) : (
        <>
          {failed ? (
            <CardContent className="pb-3">
              <FailedNote what="every deadline source — this list may be incomplete" />
            </CardContent>
          ) : null}
          <ul className="divide-y divide-border border-t border-border">
            {visible.map((item) => {
              const { kind, rest } = splitTitle(item.title)
              return (
                <li key={`${item.kind}:${item.id}`}>
                  <Link
                    href={item.href}
                    className="group flex items-center gap-3 px-5 py-3 transition-colors duration-fast hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{rest}</span>
                      {kind ? <span className="block text-xs text-muted">{kind}</span> : null}
                    </span>
                    <StatusPill
                      tone={item.severity === 'red' ? 'danger' : 'warning'}
                      label={offsetLabel(item.daysOffset)}
                      className="num shrink-0"
                    />
                    <ChevronRight
                      className="size-4 shrink-0 text-muted transition-transform duration-fast group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </Link>
                </li>
              )
            })}
          </ul>
          {overflow > 0 ? (
            <p className="border-t border-border px-5 py-3 text-xs text-muted">
              {overflow} more at risk — see{' '}
              <Link href="/dues" className="font-medium text-primary hover:underline">
                Dues
              </Link>
              ,{' '}
              <Link href="/violations" className="font-medium text-primary hover:underline">
                Violations
              </Link>{' '}
              and{' '}
              <Link href="/vendors" className="font-medium text-primary hover:underline">
                Vendors
              </Link>
              .
            </p>
          ) : null}
        </>
      )}
    </Card>
  )
}
