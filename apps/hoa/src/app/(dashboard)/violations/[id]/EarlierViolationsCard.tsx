import Link from 'next/link'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  LoadFailed,
  StatusBadge,
  type DataTableColumn,
} from '@homeowner-portal/ui'
import type { LoadResult } from '@/lib/load-or-fail'
import { earlierPage, type EarlierViolation } from '@/lib/violations/earlier-core'
import { formatShortDate } from '@/lib/format-datetime'
import { usd } from '@/lib/money/format'
import { VIOLATION_STATUS } from '@/lib/status/community'

/**
 * Other violations at the same home. Same-category first, then newest, ten at
 * most, with a link to the home's full list. A failed read says so; it never
 * reads as "none".
 */
export function EarlierViolationsCard({
  result,
  category,
  allHref,
  retryHref,
}: {
  result: LoadResult<EarlierViolation[]> | null
  category: string | null
  /** The violations list scoped to this home. */
  allHref: string
  retryHref: string
}) {
  if (result === null) return null
  const columns: DataTableColumn<EarlierViolation>[] = [
    {
      key: 'category',
      header: 'Category',
      mobilePrimary: true,
      cell: (r) => (
        <Link href={`/violations/${r.id}`} className="font-medium capitalize text-foreground no-underline hover:text-primary hover:underline">
          {r.violation_type || 'General'}
        </Link>
      ),
    },
    {
      key: 'date',
      header: 'Reported',
      cell: (r) => (
        <time dateTime={r.created_at ?? undefined} className="whitespace-nowrap text-foreground-secondary">
          {formatShortDate(r.created_at)}
        </time>
      ),
    },
    {
      key: 'status',
      header: 'Outcome',
      cell: (r) => <StatusBadge status={r.status} tones={VIOLATION_STATUS.tones} labels={VIOLATION_STATUS.labels} size="sm" />,
    },
    {
      key: 'fine',
      header: 'Fine',
      cell: (r) => (r.fine_amount ? <span className="num">{usd(r.fine_amount)}/day</span> : <span className="text-muted">None</span>),
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Earlier violations at this home</CardTitle>
        <CardDescription>Other violations on this property. The same category comes first, then the most recent.</CardDescription>
      </CardHeader>
      <CardContent>
        {!result.ok ? (
          <LoadFailed what="earlier violations" retryHref={retryHref} />
        ) : result.data.length === 0 ? (
          <p className="text-sm text-muted">No other violations at this home.</p>
        ) : (
          <EarlierTable rows={result.data} category={category} columns={columns} allHref={allHref} />
        )}
      </CardContent>
    </Card>
  )
}

function EarlierTable({
  rows,
  category,
  columns,
  allHref,
}: {
  rows: EarlierViolation[]
  category: string | null
  columns: DataTableColumn<EarlierViolation>[]
  allHref: string
}) {
  const page = earlierPage(rows, category)
  return (
    <DataTable
      caption="Earlier violations at this home"
      density="compact"
      mobile="cards"
      columns={columns}
      rows={page.shown}
      rowKey={(r) => r.id}
      footer={
        <p className="px-3 py-2 text-xs text-muted">
          {page.hidden > 0 ? `${page.shown.length} of ${page.total} · ` : null}
          <Link href={allHref} className="text-primary">
            All violations at this home
          </Link>
        </p>
      }
    />
  )
}
