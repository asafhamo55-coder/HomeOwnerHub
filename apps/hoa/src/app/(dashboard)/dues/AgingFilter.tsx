import Link from 'next/link'
import { FilterChips } from '@homeowner-portal/ui'
import { usd } from '@/lib/money/format'
import {
  AGING_BUCKETS,
  AGING_LABELS,
  type AgingBucket,
  type AgingSummaryRow,
} from '@/lib/dues/aging'
import { ExportDownloadButton } from '@/components/export/ExportDownloadButton'
import { SendRemindersDialog } from './SendRemindersDialog'

/** Link for a bucket chip; "All" drops the param so /dues stays the clean URL. */
export function agingHref(bucket: AgingBucket | null): string {
  return bucket ? `/dues?aging=${encodeURIComponent(bucket)}` : '/dues'
}

/** The CSV for the current filter; "All" drops the param. */
export function exportHref(bucket: AgingBucket | null): string {
  return bucket ? `/dues/export?aging=${encodeURIComponent(bucket)}` : '/dues/export'
}

/**
 * Aging chips with owner counts and dollar totals, plus "Remind this group"
 * for the selected bucket. The button reuses SendRemindersDialog as is, so
 * send rules, quiet hours, consent and the outbound guard all still apply,
 * and nothing goes out until the manager confirms in the dialog's preview.
 */
export function AgingFilter({
  summary,
  selected,
  selectedEmails,
}: {
  summary: Record<AgingBucket, AgingSummaryRow>
  selected: AgingBucket | null
  /** Emails of the owners in the selected bucket (empty when none or "all"). */
  selectedEmails: string[]
}) {
  const allCount = AGING_BUCKETS.reduce((n, b) => n + summary[b].count, 0)
  const items = [
    { label: 'All', href: agingHref(null), active: selected === null, count: allCount },
    ...AGING_BUCKETS.map((b) => ({
      label: (
        <span>
          {AGING_LABELS[b]}
          <span className="num ml-1.5 text-xs text-muted">{usd(summary[b].total)}</span>
        </span>
      ),
      href: agingHref(b),
      active: selected === b,
      count: summary[b].count,
    })),
  ]

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4">
      <FilterChips items={items} label="Filter by how late" linkAs={Link} />
      <div className="flex flex-wrap items-center gap-2">
        {allCount > 0 ? (
          <ExportDownloadButton
            url={exportHref(selected)}
            label="Export CSV"
            fallbackName="who-owes.csv"
          />
        ) : null}
        {selected && selectedEmails.length > 0 ? (
          <SendRemindersDialog
            emails={selectedEmails}
            label={`Remind this group (${selectedEmails.length})`}
          />
        ) : null}
      </div>
    </div>
  )
}
