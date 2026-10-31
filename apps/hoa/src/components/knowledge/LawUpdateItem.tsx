import Link from 'next/link'
import { CheckSquare, ExternalLink } from 'lucide-react'
import { Badge, StatusPill } from '@homeowner-portal/ui'
import { lawCategoryLabel } from '@/lib/status/knowledge'
import { formatShortDate } from '@/lib/format-datetime'

export interface LawUpdateItemData {
  headline: string
  summary: string
  action_items: string[] | null
  category: string | null
  effective_date: string | null
  source_url: string | null
  related_statute_id: string | null
  posted_at: string
}

/** effective_date is a DATE; parse at UTC midnight so it never shifts a day. */
function dateOnly(d: string): Date {
  return new Date(`${d.slice(0, 10)}T00:00:00Z`)
}

const DAY = 86_400_000

/**
 * The effective date, in words and tone: upcoming changes are what a board
 * must prepare for, so they are amber; changes already in force are neutral.
 */
export function EffectivePill({ date }: { date: string | null }) {
  if (!date) return null
  const d = dateOnly(date)
  const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  const upcoming = d.getTime() > Date.now() - DAY
  return upcoming ? (
    <StatusPill tone="warning" label={`Effective ${label}`} />
  ) : (
    <StatusPill tone="neutral" label={`In effect since ${label}`} />
  )
}

/** One law update, full detail. Used by the State law landing feed. */
export function LawUpdateItem({ update, headingAs: H = 'h3' }: { update: LawUpdateItemData; headingAs?: 'h2' | 'h3' }) {
  const category = lawCategoryLabel(update.category)
  return (
    <article className="space-y-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 space-y-1">
          <H className="text-base font-semibold leading-snug text-foreground">{update.headline}</H>
          <p className="text-xs text-muted">
            Posted {formatShortDate(update.posted_at)}
            {category ? ` · ${category}` : ''}
          </p>
        </div>
        <EffectivePill date={update.effective_date} />
      </div>

      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground-secondary">{update.summary}</p>

      {update.action_items && update.action_items.length > 0 ? (
        <div className="rounded-lg bg-subtle p-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted">What to do</p>
          <ul className="space-y-1.5 text-sm text-foreground">
            {update.action_items.map((item, i) => (
              <li key={i} className="flex gap-2">
                <CheckSquare className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {update.source_url || update.related_statute_id ? (
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {update.source_url ? (
            <a
              href={update.source_url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              Source
              <ExternalLink className="size-3.5" aria-hidden />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : null}
          {update.related_statute_id ? (
            <Link
              href={`/legal/browse/${update.related_statute_id}`}
              className="font-medium text-primary hover:underline"
            >
              Related statute
            </Link>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}

export function CategoryBadge({ category }: { category: string | null }) {
  const label = lawCategoryLabel(category)
  return label ? <Badge variant="neutral">{label}</Badge> : null
}
