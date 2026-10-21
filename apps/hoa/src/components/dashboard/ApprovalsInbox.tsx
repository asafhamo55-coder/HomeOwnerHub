import Link from 'next/link'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  FileSpreadsheet,
  Receipt,
} from 'lucide-react'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import type { ApprovalItem, ApprovalKind } from '@/lib/dashboard/queries'
import { FailedNote } from './BreakdownList'
import { waitingLabel } from '@/lib/dashboard/row-labels'

// Kind glyph + word: the row's kind is named in text ("Invoice"), the
// icon is only a scanning aid.
const KIND: Record<ApprovalKind, { icon: React.ReactNode; label: string }> = {
  violation: { icon: <AlertTriangle className="size-4" aria-hidden />, label: 'Violation letter' },
  meeting: { icon: <CalendarDays className="size-4" aria-hidden />, label: 'Minutes' },
  invoice: { icon: <Receipt className="size-4" aria-hidden />, label: 'Invoice' },
  rfp: { icon: <FileSpreadsheet className="size-4" aria-hidden />, label: 'RFP draft' },
}

/** Strip the "Kind · " prefix the query puts on titles; the kind is shown separately. */
function rowTitle(item: ApprovalItem): string {
  const parts = item.title.split(' · ')
  return parts.length > 1 ? parts.slice(1).join(' · ') : item.title
}

// The manager's queue: violation letters drafted by AI, minutes not yet
// approved, AI-coded invoices, AI-drafted RFPs. Empty = inbox zero — but
// only when every source loaded.
export function ApprovalsInbox({
  items,
  failed = false,
  maxRows = 6,
}: {
  items: ApprovalItem[]
  failed?: boolean
  maxRows?: number
}) {
  const visible = items.slice(0, maxRows)
  const overflow = items.length - visible.length

  return (
    <Card id="approvals">
      <CardHeader
        className="pb-3"
        actions={
          items.length > 0 ? (
            <Badge variant="neutral" className="num">
              {items.length} pending
            </Badge>
          ) : null
        }
      >
        <CardTitle as="h2">Waiting on your approval</CardTitle>
        <p className="text-sm text-muted">Oldest first. Nothing goes out until you sign off.</p>
      </CardHeader>
      {items.length === 0 ? (
        <CardContent>
          {failed ? (
            <FailedNote what="your approvals" />
          ) : (
            <p className="flex items-center gap-2 text-sm text-foreground-secondary">
              <CheckCircle2 className="size-4 text-success" aria-hidden />
              Inbox zero — nothing is waiting on your approval.
            </p>
          )}
        </CardContent>
      ) : (
        <>
          {failed ? (
            <CardContent className="pb-3">
              <FailedNote what="every approval source — this list may be incomplete" />
            </CardContent>
          ) : null}
          <ul className="divide-y divide-border border-t border-border">
            {visible.map((item) => {
              const kind = KIND[item.kind]
              return (
                <li key={`${item.kind}:${item.id}`}>
                  <Link
                    href={item.href}
                    className="group flex items-center gap-3 px-5 py-3 transition-colors duration-fast hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-subtle text-muted">
                      {kind.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{rowTitle(item)}</span>
                      <span className="block text-xs text-muted">
                        {kind.label}
                        {item.pendingSince ? (
                          <span className="sm:hidden"> · {waitingLabel(item.pendingSince)}</span>
                        ) : null}
                      </span>
                    </span>
                    <span className="num hidden shrink-0 text-xs text-muted sm:inline">
                      {item.pendingSince ? waitingLabel(item.pendingSince) : null}
                    </span>
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
              {overflow} more pending — open Violations, Meetings, Accounting or Vendors to review them.
            </p>
          ) : null}
        </>
      )}
    </Card>
  )
}
