import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FileText, MessageSquare, Users } from 'lucide-react'
import { format } from 'date-fns'
import { Button, EmptyState, LoadFailed, Page, StatusPill, type StatusTone } from '@homeowner-portal/ui'
import { loadRecordsRequests, type RecordsRequestRow } from '@/lib/records-requests/queries'
import { HOLIDAY_NOTE, KIND_SHORT, NOT_LEGAL_ADVICE, RECORDS_FORMATS, type RecordsChip } from '@/lib/records-requests/law'
import { MarkFulfilledButton } from './MarkFulfilledButton'

export const metadata = { title: 'Records requests' }
export const dynamic = 'force-dynamic'

const TONE: Record<RecordsChip, StatusTone> = {
  overdue: 'danger',
  due_soon: 'warning',
  on_track: 'neutral',
  none: 'info',
  done: 'success',
}

function day(d: string): string {
  return format(new Date(`${d}T12:00:00Z`), 'MMM d, yyyy')
}

/**
 * BL-123 (3): owner records requests with the statutory deadline per state.
 * 404 until RECORDS_REQUESTS_LIVE (packages/db/src/records-requests.ts).
 * Board and admin only (loadRecordsRequests → requireBoardOrAdmin; RLS
 * from 0024 refuses anyone else).
 */
export default async function RecordsRequestsPage() {
  const result = await loadRecordsRequests()
  if (result === null) notFound()

  const header = {
    title: 'Records requests',
    description:
      'Owners’ requests to see association records, with the deadline your state sets for answering. Reply in the request’s conversation, then mark it fulfilled.',
    actions: (
      <Button asChild variant="secondary">
        <Link href="/tickets">
          <MessageSquare className="size-4" aria-hidden />
          All tickets
        </Link>
      </Button>
    ),
  }

  if (!result.ok) {
    return (
      <Page {...header}>
        <LoadFailed what="records requests" retryHref="/tickets/records" />
      </Page>
    )
  }

  if (result.rows.length === 0) {
    return (
      <Page {...header}>
        <EmptyState
          icon={<FileText aria-hidden />}
          title="No records requests yet"
          description="When an owner asks to see association records from the portal, the request lands here with its deadline."
        />
      </Page>
    )
  }

  return (
    <Page {...header}>
      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {result.rows.map((r) => (
          <RecordsRequestItem key={r.id} row={r} />
        ))}
      </ul>
      <p className="text-xs text-muted">
        {HOLIDAY_NOTE} {NOT_LEGAL_ADVICE}
      </p>
    </Page>
  )
}

function RecordsRequestItem({ row }: { row: RecordsRequestRow }) {
  const open = row.status !== 'closed'
  const formatLabel = RECORDS_FORMATS.find((f) => f.value === row.format)?.label ?? null
  return (
    <li className="space-y-3 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <Link
            href={`/tickets/${row.id}`}
            className="font-medium text-foreground no-underline hover:text-primary hover:underline"
          >
            {row.kind ? KIND_SHORT[row.kind] : row.subject}
          </Link>
          <p className="text-xs text-muted">
            {row.submitterName ?? 'Owner'}
            {row.unitNumber ? ` · Unit ${row.unitNumber}` : ''} · Received {day(row.receivedDay)}
            {formatLabel ? ` · ${formatLabel}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={TONE[row.chip]} label={row.chipLabel} />
          {row.dueDate && open ? <span className="num text-sm text-foreground-secondary">Due {day(row.dueDate)}</span> : null}
        </div>
      </div>

      {open ? (
        <div className="space-y-2 text-sm">
          <p className="text-foreground-secondary">{row.message}</p>
          {row.citations.length > 0 ? (
            <details>
              <summary className="cursor-pointer text-xs font-medium">What the statute says</summary>
              <ul className="mt-1 space-y-1.5 text-xs">
                {row.citations.map((c) => (
                  <li key={`${c.cite}|${c.quote.slice(0, 24)}`}>
                    <span className="font-semibold">{c.cite}:</span> “{c.quote}”
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="secondary" size="sm">
          <Link href={`/tickets/${row.id}`}>
            <MessageSquare className="size-4" aria-hidden />
            Open conversation
          </Link>
        </Button>
        {row.kind === 'owner_list' ? (
          <Button asChild variant="secondary" size="sm">
            <Link href="/properties/roster?kind=records">
              <Users className="size-4" aria-hidden />
              Records-request roster
            </Link>
          </Button>
        ) : null}
        {open ? <MarkFulfilledButton ticketId={row.id} /> : null}
      </div>
    </li>
  )
}
