import Link from 'next/link'
import { StatusPill, type DataTableColumn } from '@homeowner-portal/ui'
import { entryTotal, type RecurringState } from '@/lib/accounting/recurring-edit'
import { formatDay, usd } from '@/lib/money/format'
import { humanize } from '@/lib/money/status'
import { RecurringEntryActions } from './RecurringEntryActions'
import type { RecurringOptions, RecurringRuleView } from './model'

const STATE: Record<RecurringState, { tone: 'success' | 'neutral' | 'warning'; label: string }> = {
  active: { tone: 'success', label: 'Active' },
  paused: { tone: 'warning', label: 'Paused' },
  stopped: { tone: 'neutral', label: 'Stopped' },
}

export function recurringColumns(options: RecurringOptions): DataTableColumn<RecurringRuleView>[] {
  return [
    {
      key: 'template',
      header: 'Entry',
      mobilePrimary: true,
      cell: (r) =>
        r.template ? (
          <Link href={`/accounting/ledger/${r.template.id}`} className="group block no-underline">
            <span className="block font-medium text-foreground group-hover:text-primary group-hover:underline">{r.template.memo}</span>
            <span className="num block text-xs text-muted">{r.template.edited ? 'Edited template' : `Copies ${r.template.entryNumber}`}</span>
          </Link>
        ) : (
          <span className="text-muted">Template entry missing</span>
        ),
    },
    { key: 'amount', header: 'Amount', numeric: true, cell: (r) => (r.template ? usd(entryTotal(r.template.lines)) : '—') },
    { key: 'cadence', header: 'Repeats', className: 'whitespace-nowrap', cell: (r) => humanize(r.cadence) },
    {
      key: 'next',
      header: 'Next run',
      className: 'whitespace-nowrap text-muted',
      cell: (r) => (r.state === 'active' ? formatDay(r.nextRunDate) : '—'),
    },
    { key: 'status', header: 'Status', cell: (r) => <StatusPill tone={STATE[r.state].tone} label={STATE[r.state].label} size="sm" /> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      cell: (r) => <RecurringEntryActions rule={r} options={options} />,
    },
  ]
}
