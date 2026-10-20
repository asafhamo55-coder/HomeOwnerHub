import { Sparkles } from 'lucide-react'
import {
  DRAFT_METRICS_WINDOW_DAYS,
  LIGHT_EDIT_RATIO,
  formatApproveTime,
  formatPercent,
  type DraftQualitySummary,
} from '@/lib/inbox/draft/metrics'

/**
 * BL-101 A10: do AI reply drafts actually save the board work? A one-line
 * card in the inbox header with this HOA's last-30-days figures. Hidden
 * until at least one AI draft has been sent — "0 drafts" says nothing.
 */
export function DraftQualityCard({ summary }: { summary: DraftQualitySummary | null }) {
  if (!summary || summary.drafts === 0) return null
  const lightPct = Math.round(LIGHT_EDIT_RATIO * 100)
  return (
    <section
      aria-label={`AI reply drafts, last ${DRAFT_METRICS_WINDOW_DAYS} days`}
      className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-border bg-subtle px-3 py-2 text-xs text-foreground-secondary"
    >
      <span className="flex items-center gap-1.5 font-medium text-foreground">
        <Sparkles className="size-3.5 text-muted" aria-hidden />
        AI drafts, last {DRAFT_METRICS_WINDOW_DAYS} days
      </span>
      <span title={`At most ${lightPct}% of the words changed before sending`}>
        Drafts sent with light edits: <strong className="text-foreground">{formatPercent(summary.lightEditShare)}</strong>
      </span>
      <span>
        Median time to approve:{' '}
        <strong className="text-foreground">{formatApproveTime(summary.medianSecondsToApprove)}</strong>
      </span>
      {summary.citationsKeptShare !== null ? (
        <span>
          Citations kept: <strong className="text-foreground">{formatPercent(summary.citationsKeptShare)}</strong>
        </span>
      ) : null}
      <span className="text-muted">
        {summary.drafts} draft{summary.drafts === 1 ? '' : 's'} sent
      </span>
    </section>
  )
}
