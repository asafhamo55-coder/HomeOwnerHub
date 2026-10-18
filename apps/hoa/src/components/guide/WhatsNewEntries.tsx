import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Badge } from '@homeowner-portal/ui'
import { formatShortDate } from '@/lib/format-datetime'
import { WHATS_NEW_LABEL } from '@/lib/guide/whats-new'
import type { WhatsNewEntry } from '@/lib/guide/types'

/**
 * What's new entries (spec §6.5), Linear style: label pill, title, one to
 * three sentences, and "Learn how" to the guide article when there is one.
 * Used on /whats-new (per release) and on the /help home (latest three).
 */
export function WhatsNewEntries({ entries, showDate = false }: { entries: readonly WhatsNewEntry[]; showDate?: boolean }) {
  return (
    <ul className="space-y-3">
      {entries.map((e) => (
        <li key={e.id} className="space-y-1">
          <p className="flex flex-wrap items-center gap-2">
            <Badge variant={e.label === 'new' ? 'default' : e.label === 'fix' ? 'success' : 'info'}>{WHATS_NEW_LABEL[e.label]}</Badge>
            <span className="text-sm font-medium text-foreground">{e.title}</span>
            {showDate ? (
              <time dateTime={e.date} className="num text-xs text-muted">
                {formatShortDate(`${e.date}T12:00:00Z`)}
              </time>
            ) : null}
          </p>
          <p className="text-sm text-foreground-secondary">{e.body}</p>
          {e.article ? (
            <Link href={`/help/${e.article}`} className="inline-flex items-center gap-1 text-sm font-medium text-primary">
              Learn how <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  )
}
