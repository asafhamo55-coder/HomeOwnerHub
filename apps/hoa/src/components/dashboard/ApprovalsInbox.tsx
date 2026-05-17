import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  FileSpreadsheet,
  Receipt,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import type { ApprovalItem, ApprovalKind } from '@/lib/dashboard/queries'

const KIND_ICON: Record<ApprovalKind, React.ReactNode> = {
  violation: <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />,
  meeting: <CalendarDays className="h-4 w-4 text-sky-600" aria-hidden />,
  invoice: <Receipt className="h-4 w-4 text-emerald-600" aria-hidden />,
  rfp: <FileSpreadsheet className="h-4 w-4 text-violet-600" aria-hidden />,
}

const MS_DAY = 86_400_000

function age(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 0) return 'just now'
  const days = Math.floor(ms / MS_DAY)
  if (days === 0) return 'today'
  if (days === 1) return '1d'
  if (days < 30) return `${days}d`
  const months = Math.floor(days / 30)
  return `${months}mo`
}

// Foreground tile on the Monday-morning dashboard: a unified list of
// every item that's waiting on the manager — violation letters drafted
// by AI, meeting minutes not yet approved, AI-coded invoices, AI-drafted
// RFP drafts. Empty state = inbox zero.
export function ApprovalsInbox({
  items,
  maxRows = 6,
}: {
  items: ApprovalItem[]
  maxRows?: number
}) {
  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
            Waiting on you
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted">
          Inbox zero. Nothing waiting on your approval.
        </CardContent>
      </Card>
    )
  }

  const visible = items.slice(0, maxRows)
  const overflow = items.length - visible.length

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">Waiting on you</CardTitle>
        <span className="text-xs text-muted">
          {items.length} {items.length === 1 ? 'item' : 'items'}
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
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/10">
                  {KIND_ICON[item.kind]}
                </span>
                <span className="flex-1 truncate text-sm text-foreground">
                  {item.title}
                </span>
                <span className="text-xs text-muted">{age(item.pendingSince)}</span>
                <ArrowRight className="h-4 w-4 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
        {overflow > 0 ? (
          <div className="border-t border-border px-6 py-3 text-xs text-muted">
            + {overflow} more pending. Open each section to review.
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
